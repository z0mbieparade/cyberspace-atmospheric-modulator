/**
 * GM storage wiring tests
 *
 * The shim itself is tested in tests/shared/gm-storage.test.js. These check this
 * script's side of it: header.js reads debugMode/featureConfig at load, and
 * onGMStorageReady re-reads them once the async cache is populated. They load
 * script-config.js, the shared gm-storage.js and header.js with hand-built GM
 * mocks rather than the shared setup.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const CONFIG_SOURCE = readFileSync(join(process.cwd(), 'src', 'script-config.js'), 'utf8');
const GM_STORAGE_SOURCE = readFileSync(
	join(process.cwd(), 'src', 'shared', 'gm-storage.js'), 'utf8');
// header.js reads debugMode/featureConfig through the shim at load and re-reads
// them after the async hydration chain completes.
const HEADER_SOURCE = readFileSync(join(process.cwd(), 'src', 'header.js'), 'utf8');
// header.js's storage hook passes the event on to the features
const FEATURES_SOURCE = readFileSync(join(process.cwd(), 'src', 'features.js'), 'utf8');

/**
 * Evaluates script-config.js, gm-storage.js and header.js with the given GM API mocks injected.
 * @param {Object} mocks - { GM_getValue, GM_setValue, GM, localStorage, console }
 * @returns {Object} The storage shim's internals plus live getters for the header's config
 */
function loadStorageShim({ GM_getValue, GM_setValue, GM, localStorage, console: consoleMock } = {}) {
	const factory = new Function(
		'GM_getValue', 'GM_setValue', 'GM', 'localStorage', 'console',
		`${CONFIG_SOURCE}
		${GM_STORAGE_SOURCE}
		${HEADER_SOURCE}
		${FEATURES_SOURCE}
		return { _GM_getValue, _GM_setValue, _hasSyncGM, _hasAsyncGM, _initGMCache, _gmCache,
			getDebug: () => DEBUG,
			getFeatureConfig: () => featureConfig };`
	);
	return factory(GM_getValue, GM_setValue, GM, localStorage, consoleMock ?? console);
}

// Flush the floating microtask chain the shim starts at load (hydrate -> migrate -> re-read)
const flushHydration = () => new Promise((resolve) => setImmediate(resolve));

function createMemoryLocalStorage() {
	const store = new Map();
	return {
		getItem: (key) => (store.has(key) ? store.get(key) : null),
		setItem: (key, value) => store.set(key, String(value)),
		removeItem: (key) => store.delete(key),
	};
}

describe('GM storage wiring', () => {
	let localStorage;

	beforeEach(() => {
		localStorage = createMemoryLocalStorage();
	});

	describe('async hydration chain (cache -> migrate -> config re-read)', () => {
		it('re-reads debugMode and featureConfig once the async cache is populated', async () => {
			const store = { featureConfig: '{"unditherImages":false,"holdDuration":250}' };
			// Present only in localStorage: the migration must carry it into the GM store
			localStorage.setItem('atmosphericModulator_debugMode', 'true');
			const shim = loadStorageShim({
				GM: {
					getValue: async (key) => store[key],
					setValue: (key, value) => { store[key] = value; },
				},
				localStorage,
			});

			expect(shim.getDebug(), 'before hydration').toBe(false);
			expect(shim.getFeatureConfig().unditherImages, 'before hydration').toBe(true);

			await flushHydration();

			expect(shim.getDebug(), 're-read after hydration').toBe(true);
			expect(shim.getFeatureConfig(), 're-read after hydration')
				.toEqual({ unditherImages: false, holdDuration: 250, nickColors: true, nickNotes: true });
			expect(store.debugMode, 'migrated from localStorage').toBe('true');
		});

		it('still re-reads config when GM.setValue rejects during migration', async () => {
			const store = { featureConfig: '{"unditherImages":false}' };
			const errors = [];
			localStorage.setItem('atmosphericModulator_debugMode', 'true');
			const shim = loadStorageShim({
				GM: {
					getValue: async (key) => store[key],
					setValue: async () => { throw new Error('disk full'); },
				},
				localStorage,
				console: { log: () => {}, warn: () => {}, error: (...a) => errors.push(a) },
			});

			await flushHydration();

			expect(shim.getFeatureConfig(), 're-read ran despite the failed migration')
				.toEqual({ unditherImages: false, holdDuration: 500, nickColors: true, nickNotes: true });
			expect(errors.some(([msg]) => String(msg).includes('migrate'))).toBe(true);
		});
	});

	describe('localStorage migration with the sync GM_* API', () => {
		it('copies localStorage only once per install, so a value planted there later is not taken', () => {
			const store = {};
			const gm = {
				GM_getValue: (key, defaultValue) => (key in store ? store[key] : defaultValue),
				GM_setValue: (key, value) => { store[key] = value; },
				localStorage,
			};
			loadStorageShim(gm);
			localStorage.setItem('atmosphericModulator_siteConfig', '{"planted":true}');
			loadStorageShim(gm);
			expect(store.siteConfig).toBeUndefined();
			localStorage.removeItem('atmosphericModulator_siteConfig');
		});

		it('copies atmosphericModulator_* values into GM storage at load', () => {
			const store = {};
			localStorage.setItem('atmosphericModulator_featureConfig', '{"unditherImages":true}');
			const shim = loadStorageShim({
				GM_getValue: (key, defaultValue) => (key in store ? store[key] : defaultValue),
				GM_setValue: (key, value) => { store[key] = value; },
				localStorage,
			});

			expect(store.featureConfig).toBe('{"unditherImages":true}');
			expect(shim.getFeatureConfig()).toEqual({ unditherImages: true, holdDuration: 500, nickColors: true, nickNotes: true });
		});
	});
});

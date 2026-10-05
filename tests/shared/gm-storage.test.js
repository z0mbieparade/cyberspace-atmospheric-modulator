/**
 * GM storage shim tests
 *
 * gm-storage.js picks between the sync GM_* API, the async GM.* API, and a
 * localStorage fallback. It has to get this right without a manager present,
 * so these tests evaluate it with hand-built GM mocks and the globals a script
 * declares before it (LOG_PREFIX, STORAGE_PREFIX, GM_STORAGE_KEYS).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const GM_STORAGE_SOURCE = readFileSync(join(__dirname, '..', '..', 'src', 'shared', 'gm-storage.js'), 'utf8');

/**
 * Evaluate gm-storage.js with the given GM API mocks injected.
 * @param {Object} mocks - { GM_getValue, GM_setValue, GM, localStorage, console }
 * @returns {Object} the shim's internals, plus readyCalls: how often
 *   onGMStorageReady ran
 */
function loadStorageShim({ GM_getValue, GM_setValue, GM, localStorage, console: consoleMock } = {}) {
	const factory = new Function(
		'GM_getValue', 'GM_setValue', 'GM', 'localStorage', 'console',
		`const LOG_PREFIX = '[Test]';
		const STORAGE_PREFIX = 'test_';
		const GM_STORAGE_KEYS = ['debugMode', 'config'];
		let readyCalls = 0;
		function onGMStorageReady() { readyCalls++; }
		${GM_STORAGE_SOURCE}
		return { _GM_getValue, _GM_setValue, _hasSyncGM, _hasAsyncGM, _initGMCache, _gmCache,
			readyCalls: () => readyCalls };`
	);
	return factory(GM_getValue, GM_setValue, GM, localStorage, consoleMock ?? console);
}

// Flush the floating microtask chain the shim starts at load (hydrate -> migrate -> ready)
const flushHydration = () => new Promise((resolve) => setImmediate(resolve));

// For cases that are expected to log a failure - keeps the run output readable
const silentConsole = { log: () => {}, warn: () => {}, error: () => {} };

function createMemoryLocalStorage() {
	const store = new Map();
	return {
		getItem: (key) => (store.has(key) ? store.get(key) : null),
		setItem: (key, value) => store.set(key, String(value)),
		removeItem: (key) => store.delete(key),
	};
}

describe('GM storage shim', () => {
	let localStorage;

	beforeEach(() => {
		localStorage = createMemoryLocalStorage();
	});

	describe('synchronous GM_* API', () => {
		it('uses GM_getValue directly', () => {
			const store = { config: '{"a":1}' };
			const shim = loadStorageShim({
				GM_getValue: (key, defaultValue) => (key in store ? store[key] : defaultValue),
				GM_setValue: (key, value) => { store[key] = value; },
				localStorage,
			});

			expect(shim._hasSyncGM).toBe(true);
			expect(shim._hasAsyncGM).toBe(false);
			expect(shim._GM_getValue('config', null)).toBe('{"a":1}');
		});
	});

	describe('async GM.* API (Greasemonkey 4 style)', () => {
		it('reads through the cache instead of returning a Promise', async () => {
			const store = { config: '{"a":2}' };
			const shim = loadStorageShim({
				GM: {
					getValue: async (key) => store[key],
					setValue: async (key, value) => { store[key] = value; },
				},
				localStorage,
			});

			expect(shim._hasSyncGM).toBe(false);
			expect(shim._hasAsyncGM).toBe(true);

			// Before hydration: the default, never a Promise
			expect(shim._GM_getValue('config', null)).toBeNull();

			await shim._initGMCache();
			expect(shim._GM_getValue('config', null)).toBe('{"a":2}');
		});
	});

	// The bug this guards: a manager that exposes the GM_* names but implements them
	// async. Detecting by name alone handed callers a Promise, which JSON.parse turned
	// into 'Unexpected token o, "[object Promise]" is not valid JSON'.
	describe('async GM_* API (names of the sync API, async behavior)', () => {
		const makeAsyncOldStyleMocks = (store) => ({
			GM_getValue: async (key) => store[key],
			GM_setValue: async (key, value) => { store[key] = value; },
		});

		it('is not treated as the synchronous API', () => {
			const shim = loadStorageShim({ ...makeAsyncOldStyleMocks({}), localStorage });

			expect(shim._hasSyncGM).toBe(false);
			expect(shim._hasAsyncGM).toBe(true);
		});

		it('never returns a Promise from _GM_getValue', async () => {
			const store = { config: '{"a":3}' };
			const shim = loadStorageShim({ ...makeAsyncOldStyleMocks(store), localStorage });

			expect(shim._GM_getValue('config', null)).toBeNull();

			await shim._initGMCache();

			const afterHydration = shim._GM_getValue('config', null);
			expect(afterHydration).toBe('{"a":3}');
			expect(() => JSON.parse(afterHydration)).not.toThrow();
		});
	});

	describe('no GM API at all', () => {
		it('falls back to localStorage under STORAGE_PREFIX', () => {
			const shim = loadStorageShim({ localStorage });

			expect(shim._hasSyncGM).toBe(false);
			expect(shim._hasAsyncGM).toBe(false);

			shim._GM_setValue('config', '{"a":4}');
			expect(shim._GM_getValue('config', null)).toBe('{"a":4}');
			expect(localStorage.getItem('test_config')).toBe('{"a":4}');
		});

		it('returns the default for an unset key', () => {
			const shim = loadStorageShim({ localStorage });
			expect(shim._GM_getValue('config', null)).toBeNull();
		});
	});

	describe('async hydration chain (cache -> migrate -> onGMStorageReady)', () => {
		it('migrates localStorage values and then calls onGMStorageReady once', async () => {
			const store = {};
			// Present only in localStorage: the migration must carry it into the GM store
			localStorage.setItem('test_debugMode', 'true');
			const shim = loadStorageShim({
				GM: {
					getValue: async (key) => store[key],
					setValue: (key, value) => { store[key] = value; },
				},
				localStorage,
			});

			expect(shim.readyCalls(), 'before hydration').toBe(0);
			await flushHydration();

			expect(shim.readyCalls()).toBe(1);
			expect(store.debugMode, 'migrated from localStorage').toBe('true');
			expect(shim._GM_getValue('debugMode', null), 'readable through the cache').toBe('true');
		});

		it('still calls onGMStorageReady when GM.setValue rejects during migration', async () => {
			const errors = [];
			localStorage.setItem('test_debugMode', 'true');
			const shim = loadStorageShim({
				GM: {
					getValue: async () => undefined,
					setValue: async () => { throw new Error('disk full'); },
				},
				localStorage,
				console: { log: () => {}, warn: () => {}, error: (...a) => errors.push(a) },
			});

			await flushHydration();

			expect(shim.readyCalls(), 'ready ran despite the failed migration').toBe(1);
			expect(errors.some(([msg]) => String(msg) === '[Test] Failed to migrate storage:')).toBe(true);
		});
	});

	describe('localStorage migration with the sync GM_* API', () => {
		it('copies prefixed values into GM storage at load', () => {
			const store = {};
			localStorage.setItem('test_config', '{"a":5}');
			loadStorageShim({
				GM_getValue: (key, defaultValue) => (key in store ? store[key] : defaultValue),
				GM_setValue: (key, value) => { store[key] = value; },
				localStorage,
			});

			expect(store.config).toBe('{"a":5}');
		});

		it('does not overwrite a value GM storage already has', () => {
			const store = { config: '{"gm":true}' };
			localStorage.setItem('test_config', '{"ls":true}');
			loadStorageShim({
				GM_getValue: (key, defaultValue) => (key in store ? store[key] : defaultValue),
				GM_setValue: (key, value) => { store[key] = value; },
				localStorage,
			});

			expect(store.config).toBe('{"gm":true}');
		});

		it('survives a throwing GM_setValue during migration', async () => {
			let setValueCalls = 0;
			const errors = [];
			localStorage.setItem('test_config', '{"a":6}');
			loadStorageShim({
				GM_getValue: (key, defaultValue) => defaultValue,
				GM_setValue: () => { setValueCalls++; throw new Error('quota exceeded'); },
				localStorage,
				console: { log: () => {}, warn: () => {}, error: (...a) => errors.push(a) },
			});

			// The migration runs in a microtask despite the sync GM calls
			await flushHydration();

			expect(setValueCalls).toBe(1);
			expect(errors.some(([msg]) => String(msg).includes('migrate'))).toBe(true);
		});
	});

	describe('a GM_getValue that throws', () => {
		it('falls back rather than crashing the script', () => {
			const shim = loadStorageShim({
				GM_getValue: () => { throw new Error('not permitted'); },
				GM_setValue: () => {},
				localStorage,
				console: silentConsole,
			});

			expect(shim._hasSyncGM).toBe(false);
			expect(() => shim._GM_getValue('config', null)).not.toThrow();
		});
	});
});

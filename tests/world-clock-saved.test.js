/**
 * World clock settings saved before the page loads (src/world-clock/):
 * with sync storage, as in Tampermonkey, no storage-ready event comes, so
 * the feature must read them as it loads.
 */

import { it, expect, vi } from 'vitest';
import './setup.js';

// Before ./setup.js runs the bundle: stored as Tampermonkey's sync storage
// has it. localStorage is looked up when setup.js calls this, so it is the
// test page's
const saved = vi.hoisted(() => {
	const settings = {
		cities: ['tokyo'], hour24: false, showOffsets: true,
		custom: [{ label: 'Denver', timeZone: 'America/Denver' }],
	};
	globalThis.beforeBundleLoads = () => localStorage.setItem('atmosphericModulator_worldClock', JSON.stringify(settings));
	return settings;
});

it('reads its saved settings as it loads, with no storage-ready event', () => {
	expect(FEATURES.find(f => f.key === 'worldClock').exportBackup()).toEqual(saved);
});

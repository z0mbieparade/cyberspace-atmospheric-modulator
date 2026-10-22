/**
 * Whose nicks get colored, with async storage as in Greasemonkey 4: every
 * read before the cache loads gives the default, and nothing may be saved
 * over the choice still to load.
 */

import { it, expect, vi } from 'vitest';
import './setup.js';

// Before ./setup.js runs the bundle: GM.getValue and GM.setValue only, as
// Greasemonkey 4 has them, with a choice saved
const storage = vi.hoisted(() => {
	const saved = { nickColorFor: 'best', nickFriends: JSON.stringify({ users: ['pat'], besties: ['pat'] }) };
	const written = [];
	globalThis.beforeBundleLoads = () => {
		delete globalThis.GM_getValue;
		delete globalThis.GM_setValue;
		globalThis.GM = {
			getValue: async (key) => saved[key],
			setValue: async (key, value) => {
				written.push([key, value]);
				saved[key] = value;
			},
		};
	};
	return { saved, written };
});

it('keeps the saved choice through the load, and colors by it once storage has loaded', async () => {
	await vi.waitFor(() => expect(FEATURES.find(f => f.key === 'nickColors').exportBackup().nf?.colorFor).toBe('best'));
	expect(storage.written.filter(([key]) => key === 'nickColorFor')).toEqual([]);
	expect(storage.saved.nickColorFor).toBe('best');
});

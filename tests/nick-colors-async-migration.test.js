/**
 * Whose nicks get colored saved before the choice, as the choom list's
 * switch, read with async storage as in Greasemonkey 4: moved to its own
 * key once the cache has loaded, not before.
 */

import { it, expect, vi } from 'vitest';
import './setup.js';

const storage = vi.hoisted(() => {
	const saved = { nickFriends: JSON.stringify({ enabled: true, users: ['pat'] }) };
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

it('moves the old switch to its own key as every choom, once, after the load', async () => {
	await vi.waitFor(() => expect(storage.saved.nickColorFor).toBe('all'));
	expect(storage.written.filter(([key]) => key === 'nickColorFor')).toEqual([['nickColorFor', 'all']]);
	expect(choomList().users).toEqual(['pat']);
	// The old switch is gone from the list's key, so no later load migrates it again
	expect(JSON.parse(storage.saved.nickFriends)).toEqual({ users: ['pat'], besties: [] });
});

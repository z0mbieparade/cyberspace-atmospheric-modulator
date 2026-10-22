/**
 * Whose nicks get colored when async storage fails to load, as Greasemonkey
 * 4 may: the script runs on its defaults for that page, and must not save
 * one over the choice it could not read.
 */

import { it, expect, vi } from 'vitest';
import './setup.js';

const storage = vi.hoisted(() => {
	const saved = { nickColorFor: 'best' };
	const written = [];
	globalThis.beforeBundleLoads = () => {
		// The load is meant to fail: its logged errors are expected
		console.error = () => {};
		delete globalThis.GM_getValue;
		delete globalThis.GM_setValue;
		globalThis.GM = {
			getValue: async () => {
				throw new Error('storage unavailable');
			},
			setValue: async (key, value) => {
				written.push([key, value]);
				saved[key] = value;
			},
		};
	};
	return { saved, written };
});

it('leaves the saved choice alone when storage could not be read', async () => {
	await vi.waitFor(() => expect(isGMStorageReady()).toBe(true));
	expect(storage.written.filter(([key]) => key === 'nickColorFor')).toEqual([]);
	expect(storage.saved.nickColorFor).toBe('best');
});

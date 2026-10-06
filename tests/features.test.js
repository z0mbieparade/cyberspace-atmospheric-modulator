/**
 * Feature registry tests (src/features.js): which features boot, when, and
 * how late-loading storage and a failing feature are handled.
 */

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const SOURCE = readFileSync(join(process.cwd(), 'src', 'features.js'), 'utf8');

/**
 * Evaluate features.js against a stand-in featureConfig.
 * @param {object} featureConfig
 * @param {{started?: boolean, storage?: {ready: boolean}}} [options] - started: run
 *   startFeatures, as the core does once it boots; storage: whether async storage
 *   has loaded, changeable later
 * @returns {object} the registry's functions, and the config to change
 */
function load(featureConfig, { started = true, storage = { ready: true } } = {}) {
	const errors = [];
	const api = new Function('console', 'featureConfig', 'isGMStorageReady', `
		'use strict';
		const LOG_PREFIX = '[Test]';
		${SOURCE}
		return { registerFeature, startFeatures, bootFeatures, featuresStorageReady, featuresSwitched, FEATURES };
	`)({ error: (...a) => errors.push(a) }, featureConfig, () => storage.ready);
	if (started) api.startFeatures();
	return { ...api, featureConfig, errors, storage };
}

describe('bootFeatures', () => {
	it('boots enabled features once, and skips disabled ones', () => {
		const r = load({ on: true, off: false });
		const on = vi.fn();
		const off = vi.fn();
		r.registerFeature({ key: 'on', boot: on });
		r.registerFeature({ key: 'off', boot: off });
		r.bootFeatures();
		r.bootFeatures();
		expect(on).toHaveBeenCalledTimes(1);
		expect(off).not.toHaveBeenCalled();
	});

	it('waits for the core to start: storage loading first must not boot anything', () => {
		const r = load({ on: true }, { started: false });
		const boot = vi.fn();
		r.registerFeature({ key: 'on', boot });
		r.featuresStorageReady();
		r.bootFeatures();
		expect(boot).not.toHaveBeenCalled();
		r.startFeatures();
		expect(boot).toHaveBeenCalledTimes(1);
	});

	it('keeps booting the rest when one feature throws', () => {
		const r = load({ bad: true, good: true });
		const good = vi.fn();
		r.registerFeature({ key: 'bad', boot: () => { throw new Error('boom'); } });
		r.registerFeature({ key: 'good', boot: good });
		r.bootFeatures();
		expect(good).toHaveBeenCalled();
		expect(r.errors[0][0]).toBe('[Test] Failed to start bad:');
	});
});

describe('featuresStorageReady', () => {
	it('boots the rest when one feature fails to reload', () => {
		const r = load({ a: true, b: true });
		const boot = vi.fn();
		r.registerFeature({ key: 'a', boot: () => {}, onStorageReady: () => { throw new Error('bad'); } });
		r.registerFeature({ key: 'b', boot });
		r.featuresStorageReady();
		expect(boot).toHaveBeenCalled();
		expect(r.errors.length).toBe(1);
	});

	it('tells every feature, then boots one that storage turned on', () => {
		// The config object as it was before async storage loaded
		const config = { late: false };
		const r = load(config);
		const ready = vi.fn();
		const boot = vi.fn();
		r.registerFeature({ key: 'late', boot, onStorageReady: ready });
		r.bootFeatures();
		expect(boot).not.toHaveBeenCalled();

		config.late = true;
		r.featuresStorageReady();
		expect(ready).toHaveBeenCalledWith(false);
		expect(boot).toHaveBeenCalledTimes(1);
		r.featuresStorageReady();
		expect(ready).toHaveBeenLastCalledWith(true);
	});
});

describe('async storage', () => {
	it('boots nothing until storage loads, so a feature switched off never starts', () => {
		const storage = { ready: false };
		// The defaults, as read before async storage answers
		const r = load({ colors: true }, { storage });
		const boot = vi.fn();
		r.registerFeature({ key: 'colors', boot });
		r.bootFeatures();
		expect(boot).not.toHaveBeenCalled();

		// The stored value arrives: switched off
		r.featureConfig.colors = false;
		storage.ready = true;
		r.featuresStorageReady();
		expect(boot).not.toHaveBeenCalled();
	});
});

describe('featuresSwitched', () => {
	it('tells a booted feature its switch changed, and no other', () => {
		const r = load({ a: true, b: false });
		const switchA = vi.fn();
		const switchB = vi.fn();
		r.registerFeature({ key: 'a', boot: () => {}, onSwitch: switchA });
		r.registerFeature({ key: 'b', boot: () => {}, onSwitch: switchB });
		r.bootFeatures();
		const previous = { ...r.featureConfig };
		r.featureConfig.a = false;
		r.featureConfig.b = true;
		r.featuresSwitched(previous);
		expect(switchA).toHaveBeenCalledWith(false);
		expect(switchB).not.toHaveBeenCalled();
	});
});

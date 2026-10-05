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
 * @param {{started?: boolean}} [options] - started: run startFeatures, as the core does once it boots
 * @returns {object} the registry's functions, and the config to change
 */
function load(featureConfig, { started = true } = {}) {
	const errors = [];
	const api = new Function('console', 'featureConfig', `
		'use strict';
		const LOG_PREFIX = '[Test]';
		${SOURCE}
		return { registerFeature, startFeatures, bootFeatures, featuresStorageReady, FEATURES };
	`)({ error: (...a) => errors.push(a) }, featureConfig);
	if (started) api.startFeatures();
	return { ...api, featureConfig, errors };
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

/**
 * Sanitizing tests (src/nick-colors/sanitize.js): a shared settings file,
 * pasted settings, overrides.json or planted storage must not run script on
 * the page, nor style a name beyond its own look.
 */

import { describe, it, expect, afterEach } from 'vitest';
import './setup.js';

const PAYLOAD = '<img src=x onerror="window.__pwned = true">';

afterEach(() => {
	delete window.__pwned;
	Object.assign(siteConfig, DEFAULT_SITE_CONFIG);
	Object.keys(customNickColors).forEach(k => delete customNickColors[k]);
});

describe('sanitizeSiteConfig', () => {
	it('keeps known settings of the right type, clamped, and drops the rest', () => {
		const clean = sanitizeSiteConfig(JSON.parse(`{
			"minHue": "${PAYLOAD.replace(/"/g, '\\"')}",
			"maxHue": 999, "minSaturation": -5, "useSingleColor": "yes",
			"iconSet": "★ ☆", "somethingElse": 1, "__proto__": { "polluted": true }
		}`));
		expect(clean).toEqual({ maxHue: 360, minSaturation: 0, iconSet: '★ ☆' });
		expect(Object.getPrototypeOf(clean)).toBe(Object.prototype);
	});

	it('protects an import: a string where a number belongs never reaches the page', () => {
		const result = importSettings({ version: 2, siteConfig: { minHue: PAYLOAD } });
		expect(result.success).toBe(true);
		expect(siteConfig.minHue).toBe(DEFAULT_SITE_CONFIG.minHue);
	});
});

describe('sanitizeNickStyle', () => {
	it('lets an imported style set only a name\'s look', () => {
		expect(sanitizeNickStyle({
			color: '#ff0000', fontFamily: 'Comic Sans MS, cursive', letterSpacing: '.05rem',
			position: 'fixed', zIndex: '9999', backgroundImage: 'url(https://evil.example/t.gif)',
			data: { atmoUser: 'someone' }, textShadow: '0 0 2px red',
		}, 'imported')).toEqual({ color: '#ff0000', fontFamily: 'Comic Sans MS, cursive', letterSpacing: '.05rem' });
	});

	it('lets a typed style be free, except what lifts it out of the name or loads anything', () => {
		expect(sanitizeNickStyle({
			textShadow: '0 0 2px red', position: 'fixed', inset: '0', zIndex: '9999', translate: '0 -50vh', scale: '40',
			background: 'url(https://evil.example/t.gif)', color: 'red;position:fixed',
		}, 'typed')).toEqual({ textShadow: '0 0 2px red' });
	});

	it('reads overrides.json\'s short form, a color string', () => {
		expect(sanitizeNickStyles({ alice: '#00ff00', bob: { color: PAYLOAD }, '__proto__': {} }, 'imported'))
			.toEqual({ alice: { color: '#00ff00' } });
	});
});

describe('importing per-user styles', () => {
	it('keeps the safe styles and the notes, and drops the rest', () => {
		importSettings({ version: 2, customNickColors: { alice: { color: '#ff0000', position: 'fixed', userNotes: 'a note' } } });
		expect(JSON.parse(localStorage.getItem('atmosphericModulator_customNickColors')))
			.toEqual({ alice: { color: '#ff0000', userNotes: 'a note' } });
		// The notes go to nick notes from storage; nick colors keeps only styles
		expect(customNickColors.alice).toEqual({ color: '#ff0000' });
	});
});

describe('loading from storage', () => {
	afterEach(() => {
		localStorage.removeItem('atmosphericModulator_siteConfig');
		localStorage.removeItem('atmosphericModulator_customNickColors');
		loadSiteConfig();
		loadCustomNickColors();
	});

	it('checks values another script on the site could have planted', () => {
		localStorage.setItem('atmosphericModulator_siteConfig', JSON.stringify({ minHue: PAYLOAD, maxHue: 200 }));
		localStorage.setItem('atmosphericModulator_customNickColors', JSON.stringify({ alice: { color: 'red', position: 'fixed' } }));
		loadSiteConfig();
		loadCustomNickColors();
		// loadSiteConfig replaces siteConfig, so read it as the code does
		const config = getEffectiveSiteConfig();
		expect(config.minHue).toBe(DEFAULT_SITE_CONFIG.minHue);
		expect(config.maxHue).toBe(200);
		expect(getRawStylesForPicker('alice').position).toBeUndefined();
	});
});

describe('icons', () => {
	it('are text, so any characters stay, typed or imported', () => {
		expect(sanitizeNickStyle({ prependIcon: '<3', appendIcon: '¯\\_(ツ)_/¯' }, 'typed'))
			.toEqual({ prependIcon: '<3', appendIcon: '¯\\_(ツ)_/¯' });
		expect(sanitizeNickStyle({ prependIcon: '<3' }, 'imported')).toEqual({ prependIcon: '<3' });
	});
});

describe('telling the user what an import left out', () => {
	it('counts the left-out styles in the message, notes aside', () => {
		const result = importSettings({ version: 2, customNickColors: {
			alice: { color: '#ff0000', textShadow: '0 0 2px red', padding: '0 2px', userNotes: 'a note' },
		} });
		expect(result.dropped).toBe(2);
		expect(result.message).toContain('2 styles were left out');
	});

	it('says nothing when everything came through', () => {
		const result = importSettings({ version: 2, customNickColors: { alice: { color: '#ff0000' } } });
		expect(result.dropped).toBe(0);
		expect(result.message).not.toContain('left out');
	});
});

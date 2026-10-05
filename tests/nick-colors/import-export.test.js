import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { dom } from './setup.js';

// Reset state before each test
beforeEach(() => {
	// Reset siteConfig to defaults
	for (const key in siteConfig) {
		delete siteConfig[key];
	}
	Object.assign(siteConfig, DEFAULT_SITE_CONFIG);

	// Clear custom nick colors
	for (const key in customNickColors) {
		delete customNickColors[key];
	}
});

describe('minifyKeys', () => {
	it('minifies known keys', () => {
		const input = { minSaturation: 50, maxLightness: 80 };
		const result = minifyKeys(input);
		expect(result).toEqual({ mS: 50, xL: 80 });
	});

	it('preserves unknown keys', () => {
		const input = { unknownKey: 'value' };
		const result = minifyKeys(input);
		expect(result).toEqual({ unknownKey: 'value' });
	});

	it('handles nested objects', () => {
		const input = { siteConfig: { minHue: 0, maxHue: 360 } };
		const result = minifyKeys(input);
		expect(result).toEqual({ sc: { mH: 0, xH: 360 } });
	});

	it('handles arrays', () => {
		const input = { items: [[50, 100], [200, 250]] };
		const result = minifyKeys(input);
		expect(result).toEqual({ items: [[50, 100], [200, 250]] });
	});

	it('handles null and primitives', () => {
		expect(minifyKeys(null)).toBeNull();
		expect(minifyKeys(42)).toBe(42);
		expect(minifyKeys('string')).toBe('string');
	});
});

describe('maxifyKeys', () => {
	it('expands minified keys', () => {
		const input = { mS: 50, xL: 80 };
		const result = maxifyKeys(input);
		expect(result).toEqual({ minSaturation: 50, maxLightness: 80 });
	});

	it('preserves unknown keys', () => {
		const input = { unknownKey: 'value' };
		const result = maxifyKeys(input);
		expect(result).toEqual({ unknownKey: 'value' });
	});

	it('handles nested objects', () => {
		const input = { sc: { mH: 0, xH: 360 } };
		const result = maxifyKeys(input);
		expect(result).toEqual({ siteConfig: { minHue: 0, maxHue: 360 } });
	});

	it('handles arrays', () => {
		const input = { items: [[50, 100], [200, 250]] };
		const result = maxifyKeys(input);
		expect(result).toEqual({ items: [[50, 100], [200, 250]] });
	});

	it('is inverse of minifyKeys', () => {
		const original = {
			siteConfig: { minSaturation: 30, maxLightness: 70 },
			customNickColors: { user1: { color: 'hsl(180, 50%, 50%)' } }
		};
		const minified = minifyKeys(original);
		const restored = maxifyKeys(minified);
		expect(restored).toEqual(original);
	});
});

describe('getNonDefaultValues', () => {
	it('returns only changed values', () => {
		const current = { a: 1, b: 2, c: 3 };
		const defaults = { a: 1, b: 5, c: 3 };
		const result = getNonDefaultValues(current, defaults);
		expect(result).toEqual({ b: 2 });
	});

	it('returns null when all values match defaults', () => {
		const current = { a: 1, b: 2 };
		const defaults = { a: 1, b: 2 };
		const result = getNonDefaultValues(current, defaults);
		expect(result).toBeNull();
	});

	it('handles nested objects', () => {
		const current = { arr: [1, 2, 3] };
		const defaults = { arr: [1, 2, 4] };
		const result = getNonDefaultValues(current, defaults);
		expect(result).toEqual({ arr: [1, 2, 3] });
	});
});

describe('exportSettings', () => {
	it('includes version and exportedAt', () => {
		const result = exportSettings();
		expect(result.version).toBeDefined();
		expect(result.exportedAt).toBeDefined();
	});

	it('only includes non-default values', () => {
		// Reset to defaults
		Object.assign(siteConfig, DEFAULT_SITE_CONFIG);

		const result = exportSettings();
		// With all defaults, only version/exportedAt should be present
		expect(result.siteConfig).toBeUndefined();
	});
});

describe('importSettings', () => {
	it('returns error for invalid data', () => {
		expect(importSettings(null).success).toBe(false);
		expect(importSettings('string').success).toBe(false);
		expect(importSettings(123).success).toBe(false);
	});

	it('returns error for unsupported version', () => {
		const result = importSettings({ version: 999 });
		expect(result.success).toBe(false);
	});

	it('returns success for valid color config data', () => {
		const data = { siteConfig: { minSaturation: 40 } };
		const result = importSettings(data);
		expect(result.success).toBe(true);
	});

	it('returns success for minified keys', () => {
		const data = { sc: { mS: 35 } }; // minified siteConfig.minSaturation
		const result = importSettings(data);
		expect(result.success).toBe(true);
	});

	it('returns success for custom nick colors', () => {
		const data = { customNickColors: { testuser: { color: 'hsl(180, 50%, 50%)' } } };
		const result = importSettings(data);
		expect(result.success).toBe(true);
	});
});

describe('v1 to v2 migration', () => {
	it('migrates v1 format with separate configs', () => {
		// Example v1 export format
		const v1Data = {
			v: 1,
			at: '2025-12-16T02:53:34.271Z',
			cc: { mL: 40, xL: 60 },           // colorConfig
			stc: { hS: 5 },                    // siteThemeConfig
			sc: { vW: true, vI: true, vC: true }, // styleConfig (v1)
			cnc: {}                            // customNickColors
		};

		const result = importSettings(v1Data);
		expect(result.success).toBe(true);

		// Verify merged config values
		expect(siteConfig.minLightness).toBe(40);
		expect(siteConfig.maxLightness).toBe(60);
		expect(siteConfig.hueSpread).toBe(5);
		expect(siteConfig.varyWeight).toBe(true);
		expect(siteConfig.varyItalic).toBe(true);
		expect(siteConfig.varyCase).toBe(true);
	});

	it('migrates v1 format with only colorConfig', () => {
		const v1Data = {
			v: 1,
			cc: { mS: 30, xS: 90 }
		};

		const result = importSettings(v1Data);
		expect(result.success).toBe(true);
		expect(siteConfig.minSaturation).toBe(30);
		expect(siteConfig.maxSaturation).toBe(90);
	});

	it('migrates v1 format with customNickColors', () => {
		const v1Data = {
			v: 1,
			cnc: {
				testuser: { c: 'hsl(180, 50%, 50%)', fW: 'bold' }
			}
		};

		const result = importSettings(v1Data);
		expect(result.success).toBe(true);
		expect(customNickColors.testuser.color).toBe('hsl(180, 50%, 50%)');
		expect(customNickColors.testuser.fontWeight).toBe('bold');
	});

	it('detects v1 by presence of cc key even without version', () => {
		const v1Data = {
			cc: { mH: 100, xH: 200 }
		};

		const result = importSettings(v1Data);
		expect(result.success).toBe(true);
		expect(siteConfig.minHue).toBe(100);
		expect(siteConfig.maxHue).toBe(200);
	});

	it('detects v1 by presence of stc key', () => {
		const v1Data = {
			stc: { uH: true, hS: 15 }
		};

		const result = importSettings(v1Data);
		expect(result.success).toBe(true);
		expect(siteConfig.useSiteThemeHue).toBe(true);
		expect(siteConfig.hueSpread).toBe(15);
	});

	it('handles unminified v1 format with colorConfig', () => {
		const v1Data = {
			version: 1,
			colorConfig: { minLightness: 45, maxLightness: 75 }
		};

		const result = importSettings(v1Data);
		expect(result.success).toBe(true);
		expect(siteConfig.minLightness).toBe(45);
		expect(siteConfig.maxLightness).toBe(75);
	});

	it('handles unminified v1 format with siteThemeConfig key renames', () => {
		const v1Data = {
			version: 1,
			siteThemeConfig: {
				useHueRange: true,       // renamed to useSiteThemeHue
				useSaturation: true,     // renamed to useSiteThemeSat
				useLightness: true,      // renamed to useSiteThemeLit
				saturationSpread: 20,    // renamed to satSpread
				lightnessSpread: 15      // renamed to litSpread
			}
		};

		const result = importSettings(v1Data);
		expect(result.success).toBe(true);
		expect(siteConfig.useSiteThemeHue).toBe(true);
		expect(siteConfig.useSiteThemeSat).toBe(true);
		expect(siteConfig.useSiteThemeLit).toBe(true);
		expect(siteConfig.satSpread).toBe(20);
		expect(siteConfig.litSpread).toBe(15);
	});

	it('handles unminified v1 format with styleConfig', () => {
		const v1Data = {
			version: 1,
			styleConfig: { varyWeight: true, prependIcon: true, iconSet: '★ ◆' }
		};

		const result = importSettings(v1Data);
		expect(result.success).toBe(true);
		expect(siteConfig.varyWeight).toBe(true);
		expect(siteConfig.prependIcon).toBe(true);
		expect(siteConfig.iconSet).toBe('★ ◆');
	});

	it('ignores excludeRanges from v1 (removed in v1.1)', () => {
		const v1Data = {
			version: 1,
			colorConfig: { minHue: 50, excludeRanges: [[100, 150]] }
		};

		const result = importSettings(v1Data);
		expect(result.success).toBe(true);
		expect(siteConfig.minHue).toBe(50);
		expect(siteConfig.excludeRanges).toBeUndefined();
	});

	it('detects v1 by presence of colorConfig key', () => {
		const v1Data = {
			colorConfig: { contrastThreshold: 5 }
		};

		const result = importSettings(v1Data);
		expect(result.success).toBe(true);
		expect(siteConfig.contrastThreshold).toBe(5);
	});
});

describe('parseSettingsText', () => {
	it('expands short keys, for the per-user paste that reads them directly', () => {
		// A user's Copy to Clipboard: one user, minified
		expect(parseSettingsText('{"alice":{"c":"#ff0000","fW":"bold"}}'))
			.toEqual({ alice: { color: '#ff0000', fontWeight: 'bold' } });
	});

	it('names the problem when the text is not JSON', () => {
		expect(() => parseSettingsText('not json')).toThrow(/^Failed to parse/);
	});
});

describe('showNickColorsImportDialog', () => {
	const doc = dom.window.document;
	const overlay = () => doc.querySelector('.atmo-dialog-overlay');
	const textarea = () => overlay().querySelector('textarea');
	// By the button's role class, not its text, which is free to change
	const clickButton = (role) => overlay().querySelector(`.atmo-dialog-footer button.${role}`).click();

	let alertSpy;
	beforeEach(() => {
		alertSpy = vi.spyOn(dom.window, 'alert').mockImplementation(() => {});
		global.alert = dom.window.alert;
	});
	afterEach(() => {
		alertSpy.mockRestore();
		doc.querySelectorAll('.atmo-dialog-overlay').forEach(o => o.remove());
	});

	it('imports what Nick Colors copied to the clipboard', () => {
		// What the standalone's Copy to Clipboard produces: short keys
		customNickColors.alice = { color: '#ff0000' };
		const exported = JSON.stringify(minifyKeys(exportSettings()));
		expect(exported).toContain('"cnc"');
		delete customNickColors.alice;

		const onImported = vi.fn();
		showNickColorsImportDialog(onImported);
		textarea().value = exported;
		clickButton('nc-import-btn');

		expect(customNickColors.alice).toEqual({ color: '#ff0000' });
		expect(onImported).toHaveBeenCalledTimes(1);
		expect(overlay()).toBeNull();
	});

	it('lets other features read what it stored, and keeps no notes itself', () => {
		// Nick notes moves the notes out of storage on this signal
		const onStorageReady = vi.fn();
		registerFeature({ key: 'listener', boot: () => {}, onStorageReady });
		const exported = JSON.stringify({ v: 2, cnc: { alice: { c: '#ff0000', un: 'a note' } } });

		showNickColorsImportDialog(() => {});
		textarea().value = exported;
		clickButton('nc-import-btn');

		expect(onStorageReady).toHaveBeenCalledTimes(1);
		expect(JSON.parse(localStorage.getItem('atmosphericModulator_customNickColors')).alice.userNotes).toBe('a note');
		expect(customNickColors.alice).toEqual({ color: '#ff0000' });
	});

	it('keeps the dialog open and announces the problem when the text is not settings', () => {
		const onImported = vi.fn();
		showNickColorsImportDialog(onImported);
		textarea().value = 'not json';
		clickButton('nc-import-btn');

		const status = overlay().querySelector('[role="status"]');
		const parseError = status.textContent.trim();
		expect(parseError).not.toBe('');
		expect(onImported).not.toHaveBeenCalled();

		// Empty: its own message, not the parse error an empty string would give
		let emptyParseError = '';
		try {
			parseSettingsText('');
		} catch (e) {
			emptyParseError = e.message;
		}
		textarea().value = '';
		clickButton('nc-import-btn');
		expect(status.textContent.trim()).not.toBe('');
		expect(status.textContent.trim()).not.toBe(emptyParseError);
	});

	it('labels its text box', () => {
		showNickColorsImportDialog(() => {});
		const label = doc.querySelector(`label[for="${textarea().id}"]`);
		expect(label.textContent.trim()).not.toBe('');
	});
});

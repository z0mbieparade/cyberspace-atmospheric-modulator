/**
 * Backup & Troubleshooting tests (src/backup.js): the settings file round
 * trip through every feature, what an import refuses or ignores, and the
 * debug log and issue report each feature feeds.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { dom } from './setup.js';

const doc = dom.window.document;
const stored = (key) => localStorage.getItem('atmosphericModulator_' + key);
const nickFeature = () => FEATURES.find(feature => feature.key === 'nickColors');

afterEach(() => {
	doc.querySelectorAll('.atmo-dialog-overlay').forEach(o => o.remove());
	doc.body.innerHTML = '';
	localStorage.removeItem('atmosphericModulator_featureConfig');
	localStorage.removeItem('atmosphericModulator_debugMode');
	sessionStorage.clear();
	Object.assign(featureConfig, DEFAULT_FEATURE_CONFIG);
	// What an export with nothing changed holds: restores the defaults
	nickFeature().importBackup({ v: 2 }, false);
	vi.restoreAllMocks();
});

describe('exportBackup and importBackup', () => {
	it('carries the feature switches and nick colors\' custom colors through a file', () => {
		const file = {
			app: 'cyberspace-atmospheric-modulator',
			version: 1,
			featureConfig: { unditherImages: false, holdDuration: 900, nickColors: true, nickNotes: true, worldClock: false, nickEffects: false },
			features: { nickColors: { cnc: { alice: { c: '#ff0000' } } } },
		};
		const result = importBackup(JSON.parse(JSON.stringify(file)));
		expect(result).toMatchObject({ success: true, changed: true });
		expect(JSON.parse(stored('featureConfig'))).toEqual(file.featureConfig);
		expect(JSON.parse(stored('customNickColors'))).toEqual({ alice: { color: '#ff0000' } });

		const exported = exportBackup();
		expect(exported.featureConfig).toEqual(file.featureConfig);
		expect(exported.features.nickColors.cnc).toEqual({ alice: { c: '#ff0000' } });
		expect(exported).not.toHaveProperty('debugMode');
	});

	it('restores nick colors\' defaults that the file leaves out', () => {
		nickFeature().importBackup({ cnc: { alice: { c: '#ff0000' } }, sc: { mH: 90 } }, false);
		const defaultsOnly = { app: 'cyberspace-atmospheric-modulator', version: 1, features: { nickColors: { v: 2 } } };
		expect(importBackup(defaultsOnly).success).toBe(true);
		expect(JSON.parse(stored('customNickColors'))).toEqual({});
		expect(stored('siteConfig')).not.toContain('"minHue":90');
	});

	it('clamps a number to the range its slider takes', () => {
		importBackup({ app: 'cyberspace-atmospheric-modulator', version: 1, featureConfig: { holdDuration: 99999 } });
		expect(featureConfig.holdDuration).toBe(2000);
	});

	it('keeps going past a feature that throws, and says the import was partial', () => {
		FEATURES.unshift({ key: 'broken', booted: false, importBackup: () => { throw new Error('boom'); } });
		try {
			const result = importBackup({ app: 'cyberspace-atmospheric-modulator', version: 1, featureConfig: { holdDuration: 700 }, features: { broken: {} } });
			expect(result).toMatchObject({ success: false, changed: true });
			expect(result.message).toContain('broken: boom');
			expect(featureConfig.holdDuration).toBe(700);
		} finally {
			FEATURES.shift();
		}
	});

	it('still says nick colors left styles out when another part fails', () => {
		const result = importBackup({ app: 'cyberspace-atmospheric-modulator', version: 1,
			features: { nickColors: { cnc: { alice: { c: '#ff0000', textShadow: '0 0 2px red' } } }, nickNotes: 'not notes' } });
		expect(result.success).toBe(false);
		expect(result.message).toContain('nickNotes');
		expect(result.message).toContain('1 style was left out');
	});

	it('says when nick colors left styles out of a restore', () => {
		const result = importBackup({ app: 'cyberspace-atmospheric-modulator', version: 1,
			features: { nickColors: { cnc: { alice: { c: '#ff0000', textShadow: '0 0 2px red' } } } } });
		expect(result.success).toBe(true);
		expect(result.message).toContain('1 style was left out');
	});

	it('turns away a Nick Colors export, and changes nothing', () => {
		const result = importBackup({ v: 2, cnc: { alice: { c: '#ff0000' } } });
		expect(result.success).toBe(false);
		expect(stored('featureConfig')).toBeNull();
		expect(stored('customNickColors') ?? '{}').not.toContain('alice');
	});

	it('turns away a file from a newer version', () => {
		const result = importBackup({ app: 'cyberspace-atmospheric-modulator', version: 99, featureConfig: { unditherImages: false } });
		expect(result.success).toBe(false);
		expect(featureConfig.unditherImages).toBe(true);
	});

	it('keeps only the switches this version has, of the expected type', () => {
		importBackup({
			app: 'cyberspace-atmospheric-modulator',
			version: 1,
			featureConfig: { unditherImages: 'no', holdDuration: 700, somethingNew: true },
		});
		expect(JSON.parse(stored('featureConfig'))).toEqual({ unditherImages: true, holdDuration: 700, nickColors: true, nickNotes: true, worldClock: false, nickEffects: false });
	});

	it('leaves names uncolored when nick colors has not started', () => {
		expect(nickFeature().booted).toBe(false);
		doc.body.innerHTML = '<div class="chat-main-content"><a href="/user1">user1</a></div>';
		importBackup({ app: 'cyberspace-atmospheric-modulator', version: 1, features: { nickColors: { cnc: { user1: { c: '#ff0000' } } } } });
		expect(doc.querySelector('a').dataset.nickColored).toBeUndefined();
	});

	it('re-renders the settings tab\'s main section, so it never writes back older values', () => {
		const section = doc.createElement('section');
		section.setAttribute('data-atmo-settings-section', SETTINGS_SECTION_KEY);
		doc.body.appendChild(section);
		importBackup({ app: 'cyberspace-atmospheric-modulator', version: 1, featureConfig: { holdDuration: 900 } });
		expect(section.isConnected).toBe(false);
	});
});

describe('the site\'s custom theme', () => {
	const THEME = { fg: '#91ff00', bg: '#060f04', fgDim: '#12892d', border: '#12892d', code: '#51ff46', codeBg: '#0c1c08',
		disableTextGlow: false, enableNoise: false, softness: 'off', fontSize: 'normal' };
	const file = (siteCustomTheme) => ({ app: 'cyberspace-atmospheric-modulator', version: 1, siteCustomTheme });
	const siteTheme = () => JSON.parse(localStorage.getItem('custom_theme'));

	afterEach(() => {
		localStorage.removeItem('custom_theme');
	});

	it('goes out with the backup as the site stores it now, and comes back', () => {
		expect(exportBackup().siteCustomTheme).toBeNull();
		localStorage.setItem('custom_theme', JSON.stringify(THEME));
		const exported = JSON.parse(JSON.stringify(exportBackup()));
		expect(exported.siteCustomTheme).toEqual(THEME);

		localStorage.removeItem('custom_theme');
		expect(importBackup(exported)).toMatchObject({ success: true, siteThemeChanged: true });
		expect(siteTheme()).toEqual(THEME);
		// The same theme again needs no reload
		expect(importBackup(exported).siteThemeChanged).toBe(false);
	});

	it('leaves this browser\'s theme alone when the file has none', () => {
		localStorage.setItem('custom_theme', JSON.stringify(THEME));
		expect(importBackup(file(null))).toMatchObject({ success: true, siteThemeChanged: false });
		expect(importBackup({ app: 'cyberspace-atmospheric-modulator', version: 1 }).siteThemeChanged).toBe(false);
		expect(siteTheme()).toEqual(THEME);
	});

	it('turns away a theme carrying CSS the site\'s form cannot make, and imports the rest', () => {
		localStorage.setItem('custom_theme', JSON.stringify(THEME));
		const result = importBackup({ ...file({ ...THEME, bg: 'url(https://example.com/x)' }), featureConfig: { holdDuration: 900 } });
		expect(result).toMatchObject({ success: false, changed: true, siteThemeChanged: false });
		expect(result.message).toContain('"bg"');
		expect(siteTheme()).toEqual(THEME);
		expect(featureConfig.holdDuration).toBe(900);
	});

	it('offers a reload after an import changes it, and only alerts when it did not', () => {
		const alert = vi.spyOn(globalThis, 'alert').mockImplementation(() => {});
		finishImport(file(THEME), () => {});
		expect(alert).not.toHaveBeenCalled();
		expect(doc.querySelector('.atmo-dialog').textContent).toContain('Reload');
		doc.querySelector('.atmo-dialog-footer button.cancel').click();
		expect(doc.querySelector('.atmo-dialog')).toBeNull();

		finishImport(file(THEME), () => {});
		expect(alert).toHaveBeenCalledWith('Settings imported.');
		expect(doc.querySelector('.atmo-dialog')).toBeNull();
	});

	it('pastes alone: the site\'s own custom_theme text, but not a whole backup', () => {
		expect(parseSiteThemeText(JSON.stringify(THEME))).toEqual(THEME);
		expect(() => parseSiteThemeText(JSON.stringify(exportBackup()))).toThrow('not a Cyberspace custom theme');
		expect(() => parseSiteThemeText(JSON.stringify({ ...THEME, softness: { nested: true } }))).toThrow('"softness"');
		expect(() => parseSiteThemeText('{')).toThrow('not a Cyberspace custom theme');
	});
});

describe('exportDebugLog', () => {
	it('has every feature\'s part, even when one of them fails', () => {
		FEATURES.push({ key: 'broken', booted: false, debugLog: () => { throw new Error('boom'); } });
		try {
			const log = exportDebugLog();
			expect(log).toContain('ATMOSPHERIC MODULATOR DEBUG LOG');
			expect(log).toContain('nickColors (not running)');
			expect(log).toContain('SAVED SITE CONFIG');
			expect(log).toContain('Could not read: boom');
			expect(log).toContain('END OF DEBUG LOG');
		} finally {
			FEATURES.pop();
		}
	});
});

describe('showReportIssueDialog', () => {
	// By id (uiId('report-issue') and so on), not label, which is free to change
	const field = (name) => doc.querySelector(`.atmo-dialog [id*="report-${name}"]`);
	const send = () => doc.querySelector('.atmo-dialog-footer button.save').click();

	it('will not send without the steps', () => {
		vi.spyOn(dom.window, 'alert').mockImplementation(() => {});
		showReportIssueDialog();
		field('issue').value = 'Names flicker';
		send();
		expect(doc.querySelector('.atmo-dialog')).not.toBeNull();
		expect(sessionStorage.getItem(COMPOSE_MESSAGE_KEY)).toBeNull();
	});

	it('sends the report with every feature\'s summary, shown before it is sent', async () => {
		// Signed out here, so it falls back to the compose box. jsdom cannot
		// navigate; the message is stored for the next page first
		vi.spyOn(console, 'error').mockImplementation(() => {});
		showReportIssueDialog();
		expect(doc.querySelector('.atmo-dialog details pre').textContent).toContain('nickColors: 0 custom');
		field('issue').value = 'Names flicker';
		field('steps').value = 'Open chat';
		send();
		const message = await vi.waitFor(() => sessionStorage.getItem(COMPOSE_MESSAGE_KEY) ?? Promise.reject(new Error('not yet')));
		expect(message).toContain('[Atmospheric Modulator Issue Report] | Issue: Names flicker | Steps: Open chat');
		expect(message).toContain('nickColors: 0 custom');
		expect(message).toContain('"unditherImages":true');
	});
});

describe('renderBackupSection (Settings > AtmoMod)', () => {
	it('saves debug mode as it changes', () => {
		const body = doc.createElement('div');
		doc.body.appendChild(body);
		renderBackupSection(body);
		body.querySelector('[data-field-key="debugMode"] input').click();
		expect(stored('debugMode')).toBe('true');
		expect(stored('featureConfig')).toBeNull();
	});
});

describe('Erase All Settings', () => {
	afterEach(() => {
		FEATURES.find(f => f.key === 'nickNotes').importBackup({}, true);
		delete global.alert;
	});

	/**
	 * Fill the backup section and choose Erase All Settings.
	 * @returns {HTMLElement} the section body
	 */
	function chooseErase() {
		const body = doc.createElement('div');
		doc.body.appendChild(body);
		renderBackupSection(body);
		const erase = body.querySelector('button[id*="settings-erase-all"]');
		expect(erase.closest('.atmo-danger')).not.toBeNull();
		erase.click();
		return body;
	}

	/**
	 * Settings and data that differ from the defaults, in every feature.
	 */
	function changeEverything() {
		importBackup({
			app: 'cyberspace-atmospheric-modulator',
			version: 1,
			featureConfig: { unditherImages: false, holdDuration: 900 },
			features: { nickColors: { cnc: { alice: { c: '#ff0000' } }, sc: { mH: 90 } }, nickNotes: { alice: 'a note' } },
		});
		localStorage.setItem('atmosphericModulator_debugMode', 'true');
	}

	it('asks first, and erases every setting, per-name style and note', () => {
		global.alert = vi.fn();
		changeEverything();
		chooseErase();
		expect(stored('nickNotes')).toContain('a note');
		doc.querySelector('.atmo-dialog-footer button.atmo-danger').click();

		expect(JSON.parse(stored('featureConfig'))).toEqual(DEFAULT_FEATURE_CONFIG);
		expect(JSON.parse(stored('customNickColors'))).toEqual({});
		expect(stored('siteConfig')).not.toContain('"minHue":90');
		expect(JSON.parse(stored('nickNotes'))).toEqual({});
		expect(stored('debugMode')).toBe('false');
		expect(global.alert).toHaveBeenCalledTimes(1);
	});

	it('says so when nick colors could not save its erased settings', () => {
		changeEverything();
		const setItem = dom.window.localStorage.setItem.bind(dom.window.localStorage);
		const spy = vi.spyOn(dom.window.Storage.prototype, 'setItem').mockImplementation(function (key, value) {
			if (key.endsWith('siteConfig')) throw new Error('quota');
			return setItem(key, value);
		});
		try {
			const result = eraseAllSettings();
			expect(result.success).toBe(false);
			expect(result.message).toContain('nickColors');
		} finally {
			spy.mockRestore();
		}
	});

	it('says so when a feature could not be erased, and erases the rest', () => {
		changeEverything();
		FEATURES.unshift({ key: 'broken', booted: false, resetSettings: () => { throw new Error('boom'); } });
		try {
			const result = eraseAllSettings();
			expect(result.success).toBe(false);
			expect(result.message).toContain('broken: boom');
			expect(JSON.parse(stored('nickNotes'))).toEqual({});
		} finally {
			FEATURES.shift();
		}
	});

	it('changes nothing on Cancel', () => {
		changeEverything();
		chooseErase();
		doc.querySelector('.atmo-dialog-footer button.cancel').click();

		expect(JSON.parse(stored('featureConfig')).holdDuration).toBe(900);
		expect(stored('nickNotes')).toContain('a note');
		expect(stored('debugMode')).toBe('true');
	});
});

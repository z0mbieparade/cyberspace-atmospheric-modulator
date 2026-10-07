/**
 * Settings panel tests: the dialog opens with the stored values, Save writes
 * them to storage, Cancel does not, and the form is reachable by its labels.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { dom } from './setup.js';

const doc = dom.window.document;
const stored = (key) => localStorage.getItem('atmosphericModulator_' + key);
// Ids are generated, so find inputs through their field wrapper
const field = (key) => doc.querySelector(`[data-field-key="${key}"] input`);
// By the button's role class, not its text, which is free to change
const clickButton = (role) => doc.querySelector(`.atmo-dialog-footer button.${role}`).click();

afterEach(() => {
	doc.querySelectorAll('.atmo-dialog-overlay').forEach(o => o.remove());
	localStorage.removeItem('atmosphericModulator_featureConfig');
	localStorage.removeItem('atmosphericModulator_debugMode');
	Object.assign(featureConfig, DEFAULT_FEATURE_CONFIG);
	loadDebugMode();
});

describe('openSettingsPanel', () => {
	it('shows the shared warning and attribution', () => {
		openSettingsPanel();
		expect(doc.querySelector('.atmo-dialog-warning').textContent.trim()).not.toBe('');
		expect(doc.querySelector('.atmo-dialog-attribution').textContent).toContain('@z0ylent');
	});

	it('opens a labelled dialog with the current values', () => {
		openSettingsPanel();
		const dialog = doc.querySelector('.atmo-dialog[role="dialog"]');
		expect(doc.getElementById(dialog.getAttribute('aria-labelledby')).textContent).toBe(SETTINGS_TITLE);
		expect(field('unditherImages').checked).toBe(true);
		expect(field('holdDuration').value).toBe('500');
		// Labelled, whatever the label says
		expect(doc.querySelector(`label[for="${field('unditherImages').id}"]`).textContent.trim()).not.toBe('');
	});

	it('saves changed values on Save', () => {
		openSettingsPanel();
		field('unditherImages').click();
		const hold = field('holdDuration');
		hold.value = '800';
		hold.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
		field('debugMode').click();
		clickButton('save');

		expect(JSON.parse(stored('featureConfig'))).toEqual({ unditherImages: false, holdDuration: 800, nickColors: true, nickNotes: true, worldClock: false });
		expect(stored('debugMode')).toBe('true');
		expect(doc.querySelector('.atmo-dialog-overlay')).toBeNull();
	});

	it('writes nothing on Cancel', () => {
		openSettingsPanel();
		field('unditherImages').click();
		clickButton('cancel');
		expect(stored('featureConfig')).toBeNull();
	});

	it('hides the hold time while reveal is off', () => {
		openSettingsPanel();
		field('unditherImages').click();
		expect(field('holdDuration').closest('.atmo-settings-field').style.display).toBe('none');
	});
});

describe('renderSettingsSection (Settings > AtmoMod)', () => {
	const mount = () => {
		const body = doc.createElement('div');
		doc.body.appendChild(body);
		renderSettingsSection(body);
		return body;
	};
	const sectionField = (body, key) => body.querySelector(`[data-field-key="${key}"] input`);

	afterEach(() => doc.body.querySelectorAll('div').forEach(d => d.remove()));

	it('saves each change as it is made', () => {
		const body = mount();
		sectionField(body, 'unditherImages').click();
		expect(JSON.parse(stored('featureConfig')).unditherImages).toBe(false);
		// Debug mode is in Backup & Troubleshooting (backup.test.js): a change here leaves it alone
		expect(sectionField(body, 'debugMode')).toBeNull();
		expect(stored('debugMode')).toBeNull();
	});

	it('is replaced when the dialog saves, so its older values are never written back', () => {
		// Stand in the section wrapper settings-page.js puts around the body
		const section = doc.createElement('section');
		section.setAttribute('data-atmo-settings-section', SETTINGS_SECTION_KEY);
		doc.body.appendChild(section);
		const body = doc.createElement('div');
		section.appendChild(body);
		renderSettingsSection(body);

		openSettingsPanel();
		const hold = doc.querySelector('.atmo-dialog [data-field-key="holdDuration"] input');
		hold.value = '1000';
		hold.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
		clickButton('save');

		expect(section.isConnected, 'the stale section is gone').toBe(false);
		expect(JSON.parse(stored('featureConfig')).holdDuration).toBe(1000);
	});

	it('starts nick colors as soon as it is turned on', () => {
		featureConfig.nickColors = false;
		// As the core does once it has booted
		startFeatures();
		const body = mount();
		sectionField(body, 'nickColors').click();
		expect(JSON.parse(stored('featureConfig')).nickColors).toBe(true);
		expect(FEATURES.find(feature => feature.key === 'nickColors').booted).toBe(true);
	});

	it('warns when the separate Nick Colors userscript is running too', () => {
		const standalone = doc.createElement('style');
		standalone.id = 'nc-styles';
		doc.head.appendChild(standalone);
		try {
			expect(mount().querySelector('.atmo-dialog-warning')).not.toBeNull();
		} finally {
			standalone.remove();
		}
		expect(mount().querySelector('.atmo-dialog-warning')).toBeNull();
	});
});

describe('the Nick Colors section, on the settings tab', () => {
	// Just enough of the site's settings page for the tab: a bar of settings links
	const goToSettingsTab = () => {
		dom.reconfigure({ url: 'https://cyberspace.online/settings/account#userscripts' });
		doc.body.innerHTML = '<main><div><nav><a href="/settings/account">Account</a></nav><div class="mb-6">site settings</div></div></main>';
	};
	const nickSection = () => doc.querySelector('[data-atmo-settings-section="atmospheric-modulator-nick-colors"]');
	const usersSection = () => doc.querySelector('[data-atmo-settings-section="atmospheric-modulator-users"]');

	afterEach(() => {
		dom.reconfigure({ url: 'https://cyberspace.online/' });
		doc.body.innerHTML = '';
	});

	it('has a described reset button in the warning color, that asks first and resets contrast too', async () => {
		goToSettingsTab();
		startFeatures();
		await new Promise(resolve => setTimeout(resolve, 20));
		const reset = nickSection().querySelector('button[id*="nick-colors-reset"]');
		expect(reset.classList.contains('atmo-inline-btn')).toBe(true);
		expect(doc.getElementById(reset.getAttribute('aria-describedby')).textContent.trim()).not.toBe('');

		// Contrast switched off, then reset: back on, as every preset has it
		const contrast = nickSection().querySelector('[data-field-key="contrastEnabled"] input');
		if (contrast.checked) contrast.click();
		expect(JSON.parse(localStorage.getItem('atmosphericModulator_siteConfig')).contrastThreshold).toBe(0);

		// In the warning color, and asks first: Cancel changes nothing
		expect(reset.closest('.atmo-caution')).not.toBeNull();
		reset.click();
		doc.querySelector('.atmo-dialog-footer button.cancel').click();
		expect(JSON.parse(localStorage.getItem('atmosphericModulator_siteConfig')).contrastThreshold).toBe(0);

		reset.click();
		doc.querySelector('.atmo-dialog-footer button.atmo-caution').click();
		expect(JSON.parse(localStorage.getItem('atmosphericModulator_siteConfig')).contrastThreshold).toBeGreaterThan(0);
	});

	it('resets every per-user style from below the Chooms list, in red, after asking, and keeps notes', async () => {
		// The core registers the Chooms section at boot; init.js is left out of the setup
		registerUserListSection();
		goToSettingsTab();
		startFeatures();
		await new Promise(resolve => setTimeout(resolve, 20));
		const nickColors = FEATURES.find(f => f.key === 'nickColors');
		nickColors.importBackup({ cnc: { alice: { c: '#ff0000' } } }, true);
		FEATURES.find(f => f.key === 'nickNotes').importBackup({ alice: 'a note' }, true);
		await new Promise(resolve => setTimeout(resolve, 20));

		const clear = () => usersSection().querySelector('button[id*="nick-colors-clear-custom"]');
		expect(clear().closest('.atmo-danger')).not.toBeNull();
		expect(clear().closest('.atmo-user-list')).toBeNull();
		clear().click();
		doc.querySelector('.atmo-dialog-footer button.cancel').click();
		expect(localStorage.getItem('atmosphericModulator_customNickColors')).toContain('alice');

		// A mention on the page, in alice's custom color
		const line = doc.createElement('p');
		line.textContent = 'hi @alice';
		doc.querySelector('main').appendChild(line);
		// The username finder marks it, and nick colors styles it
		await new Promise(resolve => setTimeout(resolve, 20));
		const name = line.querySelector('[data-atmo-user="alice"]');
		// Her custom red, as contrast leaves it
		const custom = name.style.color;
		expect(custom).toMatch(/^rgb\(255, /);

		clear().focus();
		clear().click();
		doc.querySelector('.atmo-dialog-footer button.atmo-danger').click();
		// The list redraws without her color; focus stays on the button
		expect(doc.activeElement).toBe(clear());
		expect(JSON.parse(localStorage.getItem('atmosphericModulator_customNickColors'))).toEqual({});
		// Restyled at once, back to its own color
		expect(name.style.color).not.toBe(custom);
		expect(localStorage.getItem('atmosphericModulator_nickNotes')).toContain('a note');
		FEATURES.find(f => f.key === 'nickNotes').importBackup({}, true);
	});

	it('hides as nick colors is switched off, and comes back on, without a reload', async () => {
		goToSettingsTab();
		startFeatures();
		// The tab syncs when the page changes, as the site renders it
		await new Promise(resolve => setTimeout(resolve, 20));
		expect(nickSection()).not.toBeNull();

		const body = doc.createElement('div');
		doc.body.appendChild(body);
		renderSettingsSection(body);
		const toggle = body.querySelector('[data-field-key="nickColors"] input');
		toggle.click();
		expect(nickSection()).toBeNull();
		toggle.click();
		expect(nickSection()).not.toBeNull();
	});
});

describe('applySettings', () => {
	it('tells a running feature at once when its switch is turned off', () => {
		const calls = [];
		featureConfig.switchProbe = true;
		registerFeature({ key: 'switchProbe', boot: () => {}, onSwitch: on => calls.push(on) });
		startFeatures();
		try {
			applySettings({ ...featureConfig, switchProbe: false });
			expect(calls).toEqual([false]);
		} finally {
			FEATURES.splice(FEATURES.findIndex(f => f.key === 'switchProbe'), 1);
			delete featureConfig.switchProbe;
		}
	});
});

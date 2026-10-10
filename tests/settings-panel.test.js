/**
 * Settings panel tests: the settings tab's sections and the settings dialog,
 * which shows the same sections, saving each change as it is made.
 */

import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
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
	beforeAll(() => {
		// As the core registers them at boot; init.js is left out of the setup
		registerSettingsSection({ key: SETTINGS_SECTION_KEY, title: SETTINGS_TITLE, startsOpen: true, render: renderSettingsSection });
		registerSettingsSection({ key: BACKUP_SECTION_KEY, title: BACKUP_SECTION_TITLE, order: 1, render: renderBackupSection });
	});
	const dialogSections = () => Array.from(doc.querySelectorAll('.atmo-dialog [data-atmo-settings-section]'), el => el.dataset.atmoSettingsSection);

	it('shows the shared warning and attribution', () => {
		openSettingsPanel();
		expect(doc.querySelector('.atmo-dialog-warning').textContent.trim()).not.toBe('');
		expect(doc.querySelector('.atmo-dialog-attribution').textContent).toContain('@z0ylent');
	});

	it('opens a labelled dialog holding the settings tab\'s sections, in its order, with the current values', () => {
		openSettingsPanel();
		const dialog = doc.querySelector('.atmo-dialog[role="dialog"]');
		expect(doc.getElementById(dialog.getAttribute('aria-labelledby')).textContent).toBe(SETTINGS_TITLE);
		expect(dialogSections()).toEqual([SETTINGS_SECTION_KEY, BACKUP_SECTION_KEY]);
		expect(field('unditherImages').checked).toBe(true);
		expect(field('holdDuration').value).toBe('500');
		// Labelled, whatever the label says
		expect(doc.querySelector(`label[for="${field('unditherImages').id}"]`).textContent.trim()).not.toBe('');
	});

	it('saves each change as it is made, as the settings tab does, and only offers to close', () => {
		openSettingsPanel();
		field('unditherImages').click();
		expect(JSON.parse(stored('featureConfig')).unditherImages).toBe(false);
		const hold = field('holdDuration');
		hold.value = '800';
		hold.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
		expect(JSON.parse(stored('featureConfig')).holdDuration).toBe(800);
		field('debugMode').click();
		expect(stored('debugMode')).toBe('true');

		// No Save, Reset or Cancel to wait on: Close, the footer's one action
		expect(doc.querySelectorAll('.atmo-dialog-footer button.save, .atmo-dialog-footer button.reset')).toHaveLength(0);
		expect(doc.querySelectorAll('.atmo-dialog-footer button.cancel')).toHaveLength(1);
		clickButton('cancel');
		expect(doc.querySelector('.atmo-dialog-overlay')).toBeNull();
	});

	it('hides the hold time while reveal is off', () => {
		openSettingsPanel();
		field('unditherImages').click();
		expect(field('holdDuration').closest('.atmo-settings-field').style.display).toBe('none');
	});

	it('opens at the section it is asked for, unfolded and focused, in the dialog', () => {
		// The settings tab's copy comes first on the page: focus must not land there
		const tabCopy = doc.createElement('section');
		tabCopy.setAttribute('data-atmo-settings-section', BACKUP_SECTION_KEY);
		tabCopy.innerHTML = '<h3><button type="button" aria-expanded="false"></button></h3><div hidden></div>';
		doc.body.prepend(tabCopy);
		openSettingsPanel(BACKUP_SECTION_KEY);
		tabCopy.remove();
		const heading = doc.querySelector(`.atmo-dialog [data-atmo-settings-section="${BACKUP_SECTION_KEY}"] > h3`);
		expect(doc.activeElement).toBe(heading);
		expect(heading.querySelector('button').getAttribute('aria-expanded')).toBe('true');
	});

	it('redraws the settings tab\'s copy when it closes, so it never writes older values back', () => {
		// The tab's copy of the main section, in the tab's panel
		const panel = doc.createElement('div');
		panel.id = 'atmo-settings-panel';
		const section = doc.createElement('section');
		section.setAttribute('data-atmo-settings-section', SETTINGS_SECTION_KEY);
		panel.appendChild(section);
		doc.body.appendChild(panel);
		const body = doc.createElement('div');
		section.appendChild(body);
		renderSettingsSection(body);

		openSettingsPanel();
		const hold = doc.querySelector('.atmo-dialog [data-field-key="holdDuration"] input');
		hold.value = '1000';
		hold.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
		expect(JSON.parse(stored('featureConfig')).holdDuration).toBe(1000);
		// Out of reach behind the dialog meanwhile, and left alone
		expect(section.isConnected).toBe(true);
		clickButton('cancel');
		// Gone once it closes: the tab draws its sections again from what was saved
		expect(section.isConnected).toBe(false);
		panel.remove();
	});

	it('puts focus back on the same field of the redrawn tab section when it closes', () => {
		dom.reconfigure({ url: 'https://cyberspace.online/settings/account#userscripts' });
		doc.body.innerHTML = '<main><div><nav><a href="/settings/account">Account</a></nav><div class="mb-6">site settings</div></div></main>';
		try {
			syncSettingsPage();
			const tabField = () => doc.querySelector(`#atmo-settings-panel [data-field-key="unditherImages"] input`);
			const before = tabField();
			before.focus();
			openSettingsPanel();
			clickButton('cancel');
			// Redrawn, and focus on its new copy of the same switch, not on <body>
			expect(before.isConnected).toBe(false);
			expect(doc.activeElement).toBe(tabField());
		} finally {
			dom.reconfigure({ url: 'https://cyberspace.online/' });
			doc.body.innerHTML = '';
		}
	});

	it('keeps focus in the dialog after Erase All Settings there', () => {
		global.alert = vi.fn();
		// On the settings tab, whose copy the erase redraws and which comes
		// first on the page: focus must not land there, behind the dialog
		dom.reconfigure({ url: 'https://cyberspace.online/settings/account#userscripts' });
		doc.body.innerHTML = '<main><div><nav><a href="/settings/account">Account</a></nav><div class="mb-6">site settings</div></div></main>';
		syncSettingsPage();
		expect(doc.querySelector(`#atmo-settings-panel [data-atmo-settings-section="${BACKUP_SECTION_KEY}"]`)).not.toBeNull();
		try {
			openSettingsPanel();
			doc.querySelector('.atmo-dialog button[id*="erase-all"]').click();
			doc.querySelector('.atmo-dialog-footer button.atmo-danger').click();
			const heading = doc.activeElement;
			expect(heading.matches(`[data-atmo-settings-section="${BACKUP_SECTION_KEY}"] > h3`)).toBe(true);
			expect(heading.closest('.atmo-dialog')).not.toBeNull();
		} finally {
			dom.reconfigure({ url: 'https://cyberspace.online/' });
			doc.body.innerHTML = '';
			delete global.alert;
		}
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

	it('puts Only my chooms under the nick colors switch, shown while that is on', () => {
		const body = mount();
		const nickColors = body.querySelector('[data-field-key="nickColors"]');
		const chooms = body.querySelector('[data-field-key="nickColorsDetail"]');
		// After the switch's own description, which stays under it
		expect(nickColors.nextElementSibling.querySelector('.hint')).not.toBeNull();
		expect(nickColors.compareDocumentPosition(chooms) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		expect(chooms.parentElement.lastElementChild).toBe(chooms);
		expect(chooms.querySelector('[data-field-key="onlyColorFriends"] input')).not.toBeNull();
		// Both sub-settings are set in under their switch
		expect(chooms.querySelector('.atmo-sub-setting')).not.toBeNull();
		expect(body.querySelector('[data-field-key="holdDuration"]').classList.contains('atmo-sub-setting')).toBe(true);
		expect(body.querySelector('[data-field-key="unditherImages"]').classList.contains('atmo-sub-setting')).toBe(false);
		const on = sectionField(body, 'nickColors');
		if (!on.checked) on.click();
		expect(chooms.style.display).not.toBe('none');
		on.click();
		expect(chooms.style.display).toBe('none');
		on.click();
		// It is not saved as a feature switch
		expect(JSON.parse(stored('featureConfig'))).not.toHaveProperty('nickColorsDetail');
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

	it('picks a preset from a row of buttons, as the site picks its theme, and Reset keeps it', async () => {
		goToSettingsTab();
		startFeatures();
		await new Promise(resolve => setTimeout(resolve, 20));
		const group = nickSection().querySelector('.nc-settings-preset [role="group"]');
		// Named by the visible label beside it
		expect(doc.getElementById(group.getAttribute('aria-labelledby')).textContent.trim()).not.toBe('');
		// Above the example names, and the line that says what they are
		const preview = nickSection().querySelector('[data-settings-preview]');
		const label = nickSection().querySelector('[data-settings-preview-label]');
		const follows = (a, b) => !!(a.compareDocumentPosition(b) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING);
		expect(follows(group, label) && follows(label, preview)).toBe(true);
		expect(label.textContent.trim()).not.toBe('');
		const button = (name) => Array.from(group.querySelectorAll('button')).find(b => b.textContent.includes(name));
		const pressed = () => Array.from(group.querySelectorAll('[aria-pressed="true"]'), b => b.dataset.preset);
		// None chosen until one is
		expect(pressed()).toEqual([]);

		button('Light').click();
		expect(pressed()).toEqual(['light']);
		const saved = () => JSON.parse(localStorage.getItem('atmosphericModulator_siteConfig'));
		expect(saved()).toMatchObject({ minHue: 344, maxHue: 44, minLightness: 30, maxLightness: 45 });

		nickSection().querySelector('button[id*="nick-colors-reset"]').click();
		doc.querySelector('.atmo-dialog-footer button.atmo-caution').click();
		expect(pressed()).toEqual(['light']);
		expect(saved()).toMatchObject({ minHue: 344, maxHue: 44 });
	});

	it('follows the site theme\'s preset while Follow site theme is on, and stops when a preset is picked', async () => {
		doc.documentElement.dataset.theme = 'light';
		goToSettingsTab();
		startFeatures();
		await new Promise(resolve => setTimeout(resolve, 20));
		const saved = () => JSON.parse(localStorage.getItem('atmosphericModulator_siteConfig') || '{}');
		const follow = () => nickSection().querySelector('.nc-settings-follow-theme input');
		const pressed = () => Array.from(nickSection().querySelectorAll('.nc-settings-preset [aria-pressed="true"]'), b => b.dataset.preset);
		// Beside the preset buttons' label, off at first
		expect(follow().closest('.nc-settings-preset')).not.toBeNull();
		expect(doc.querySelector(`label[for="${follow().id}"]`).textContent.trim()).not.toBe('');
		expect(follow().checked).toBe(false);

		follow().click();
		expect(saved().followSiteTheme).toBe(true);
		expect(pressed()).toEqual(['light']);
		expect(saved()).toMatchObject({ minHue: 344, maxHue: 44, minLightness: 30 });

		// The site's theme changes: its preset follows, and the section shows it
		doc.documentElement.dataset.theme = 'dark';
		await vi.waitFor(() => expect(saved()).toMatchObject({ minHue: 0, maxHue: 70, minLightness: 65, maxLightness: 80 }));
		await vi.waitFor(() => expect(pressed()).toEqual(['dark']));
		expect(follow().checked).toBe(true);

		// Picked by hand: no longer following
		Array.from(nickSection().querySelectorAll('.nc-settings-preset [data-preset]')).find(b => b.dataset.preset === 'c64').click();
		expect(follow().checked).toBe(false);
		expect(saved().followSiteTheme).toBe(false);
		expect(pressed()).toEqual(['c64']);
		// Off: a theme change leaves the picked preset alone
		doc.documentElement.dataset.theme = 'light';
		await new Promise(resolve => setTimeout(resolve, 20));
		expect(saved()).toMatchObject({ minHue: 180, maxHue: 280 });
		delete doc.documentElement.dataset.theme;
	});

	it('keeps a range edited by hand while following, until the theme really changes', async () => {
		doc.documentElement.dataset.theme = 'light';
		goToSettingsTab();
		startFeatures();
		await new Promise(resolve => setTimeout(resolve, 20));
		const saved = () => JSON.parse(localStorage.getItem('atmosphericModulator_siteConfig') || '{}');
		const follow = nickSection().querySelector('.nc-settings-follow-theme input');
		if (!follow.checked) follow.click();
		const contrast = nickSection().querySelector('[data-field-key="contrastEnabled"] input');
		if (contrast.checked) contrast.click();
		expect(saved().contrastThreshold).toBe(0);
		// The same theme again, as a page load reads it: the edit stays
		doc.documentElement.dataset.theme = 'light';
		await new Promise(resolve => setTimeout(resolve, 20));
		expect(saved().contrastThreshold).toBe(0);
		delete doc.documentElement.dataset.theme;
	});

	it('saves the new theme\'s ranges from a Reset answered after the theme changed', async () => {
		doc.documentElement.dataset.theme = 'light';
		goToSettingsTab();
		startFeatures();
		await new Promise(resolve => setTimeout(resolve, 20));
		const saved = () => JSON.parse(localStorage.getItem('atmosphericModulator_siteConfig') || '{}');
		const follow = nickSection().querySelector('.nc-settings-follow-theme input');
		if (!follow.checked) follow.click();
		// A setting outside the ranges, which the reset puts back
		const varyWeight = () => nickSection().querySelector('[data-field-key="varyWeight"] input');
		if (!varyWeight().checked) varyWeight().click();
		nickSection().querySelector('button[id*="nick-colors-reset"]').click();
		// The theme changes while the confirm is open: the section redraws
		doc.documentElement.dataset.theme = 'dark';
		await vi.waitFor(() => expect(saved()).toMatchObject({ minHue: 0, maxHue: 70 }));
		doc.querySelector('.atmo-dialog-footer button.atmo-caution').click();
		expect(saved()).toMatchObject({ minHue: 0, maxHue: 70, minLightness: 65, followSiteTheme: true, followedTheme: 'dark' });
		// The section on the page shows what the reset saved
		expect(saved().varyWeight).toBe(false);
		expect(varyWeight().checked).toBe(false);
		delete doc.documentElement.dataset.theme;
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

	it('starts monochrome on the site theme\'s text color, and keeps one chosen', async () => {
		// VT320's text is #ff9a10
		doc.documentElement.dataset.theme = 'vt320';
		goToSettingsTab();
		startFeatures();
		await new Promise(resolve => setTimeout(resolve, 20));
		const saved = () => JSON.parse(localStorage.getItem('atmosphericModulator_siteConfig') || '{}');
		const mono = () => nickSection().querySelector('[data-field-key="useSingleColor"] input');
		try {
			mono().click();
			expect(saved()).toMatchObject({ useSingleColor: true, singleColorHue: 35, singleColorSat: 100, singleColorLit: 53 });

			// Chosen, then switched off and on: still the chosen color
			const hue = nickSection().querySelector('[data-field-key="singleColorHue"] input');
			hue.value = '300';
			hue.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
			hue.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
			expect(saved().singleColorHue).toBe(300);
			mono().click();
			mono().click();
			expect(saved()).toMatchObject({ useSingleColor: true, singleColorHue: 300 });
		} finally {
			// Off again, so later tests color as before
			if (mono()?.checked) mono().click();
			localStorage.removeItem('atmosphericModulator_siteConfig');
			delete doc.documentElement.dataset.theme;
		}
	});

	it('scrolls a control focused under the stuck examples out from under them', async () => {
		goToSettingsTab();
		startFeatures();
		await new Promise(resolve => setTimeout(resolve, 20));
		const preview = nickSection().querySelector('.nc-settings-preview');
		// jsdom lays nothing out: the page's main column scrolls, and the
		// examples end at 100
		const scroller = doc.querySelector('main');
		scroller.style.overflowY = 'auto';
		Object.defineProperty(scroller, 'scrollHeight', { value: 2000, configurable: true });
		Object.defineProperty(scroller, 'clientHeight', { value: 400, configurable: true });
		let scrollTop = 500;
		Object.defineProperty(scroller, 'scrollTop', { get: () => scrollTop, set: (value) => { scrollTop = value; }, configurable: true });
		preview.getBoundingClientRect = () => ({ top: 0, bottom: 100 });
		const at = (element, top, height = 20) => { element.getBoundingClientRect = () => ({ top, bottom: top + height }); };
		// The handler measures on the next frame, once the browser has scrolled
		const nextFrame = () => new Promise(resolve => setTimeout(resolve, 10));

		// A toggle under the examples: its whole field, and the ring its
		// track draws, scrolled to just below them
		const toggle = nickSection().querySelector('[data-field-key="useSingleColor"] input');
		const field = toggle.closest('[data-field-key]');
		const track = field.querySelector('.atmo-toggle-track');
		at(toggle, 70, 1);
		at(field, 60, 30);
		at(track, 60, 20);
		Object.assign(track.style, { outlineStyle: 'solid', outlineWidth: '2px', outlineOffset: '2px' });
		toggle.focus();
		await nextFrame();
		expect(scrollTop).toBe(456);

		// Clear of them: left alone
		toggle.blur();
		at(field, 150, 30);
		at(track, 150, 20);
		toggle.focus();
		await nextFrame();
		expect(scrollTop).toBe(456);

		// Refocused far above them, as on coming back to the window after
		// scrolling away: left alone, not jumped back to
		toggle.blur();
		at(field, -1900, 30);
		at(track, -1900, 20);
		toggle.focus();
		await nextFrame();
		expect(scrollTop).toBe(456);

		// Above the examples in the section: left alone
		const preset = nickSection().querySelector('.nc-settings-preset button');
		at(preset, 40);
		preset.focus();
		await nextFrame();
		expect(scrollTop).toBe(456);
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

/**
 * Settings page tests: the Userscripts tab on the site's /settings pages,
 * against the site's own markup (tests/fixtures/settings-page.html), with two
 * scripts sharing the tab the way both bundles would.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { JSDOM, VirtualConsole } from 'jsdom';

const FIXTURE = readFileSync(join(__dirname, 'fixtures', 'settings-page.html'), 'utf8');
const SOURCE = ['ui-dialog.js', 'settings-page.js']
	.map(name => readFileSync(join(__dirname, '..', '..', 'src', 'shared', name), 'utf8'))
	.join('\n\n');

let window;
let document;

/**
 * Evaluate the settings page code as one script would have it, in its own scope.
 * @returns {{registerSettingsSection: Function}}
 */
function loadScript(name = 'script') {
	return window.eval(`(function () {
		// update-check.js's, which the bundle has; marks which script bound it
		function bindVersionLink(el) { el.dataset.boundBy = '${name}'; }
		${SOURCE}
		return { registerSettingsSection, refreshSettingsSection, configureSettingsTab, openSettingsSection, settingsTabUrl, syncSettingsPage };
	})()`);
}

const settle = () => new Promise(resolve => setTimeout(resolve, 20));
const [mobileBar, desktopBar] = [0, 1].map(i => () => document.querySelector('main > div').children[i]);
const siteTab = (bar, name) => bar.querySelector(`a[href="/settings/${name}"]`);
const ourTab = (bar) => bar.querySelector('a[data-atmo-settings-tab]');
const content = () => document.querySelector('main > div > .mb-6:not(#atmo-settings-panel)');
const isHidden = (el) => el.style.getPropertyValue('display') === 'none';
const panel = () => document.getElementById('atmo-settings-panel');

/**
 * Open the Userscripts tab the way a click does.
 */
async function openTab() {
	ourTab(desktopBar()).click();
	await settle();
}

beforeEach(() => {
	window = new JSDOM(FIXTURE, { url: 'https://cyberspace.online/settings/keyboard', runScripts: 'outside-only' }).window;
	document = window.document;
});

describe('the Userscripts tab', () => {
	it('is added to both tab bars after the site tabs, looking like an idle tab', () => {
		loadScript().registerSettingsSection({ key: 'a', title: 'A', render: () => {} });

		for (const bar of [mobileBar(), desktopBar()]) {
			const tab = ourTab(bar);
			expect(tab.textContent).toBe('Userscripts');
			expect(tab.getAttribute('href')).toBe('/settings/keyboard#userscripts');
			expect(tab.className).toBe(siteTab(bar, 'account').className);
			expect(tab.previousElementSibling).toBe(siteTab(bar, 'keyboard'));
		}
		// The mobile grid's filler cell stays last
		expect(mobileBar().lastElementChild.tagName).toBe('DIV');
		expect(panel().hidden).toBe(true);
	});

	it('can be named by a script, with a hover title that is also in its accessible name', () => {
		const script = loadScript();
		script.registerSettingsSection({ key: 'a', title: 'A', render: () => {} });
		script.configureSettingsTab({ label: 'AtmoMod', title: 'Atmospheric Modulator (Userscript settings)' });
		for (const bar of [mobileBar(), desktopBar()]) {
			const tab = ourTab(bar);
			expect(tab.textContent).toBe('AtmoMod');
			expect(tab.title).toBe('Atmospheric Modulator (Userscript settings)');
			expect(tab.getAttribute('aria-label')).toBe('AtmoMod, Atmospheric Modulator (Userscript settings)');
		}
	});

	it('opens at the hash a script names', async () => {
		const script = loadScript();
		script.registerSettingsSection({ key: 'a', title: 'A', render: () => {} });
		script.configureSettingsTab({ label: 'AtmoMod', hash: 'atmomod' });
		expect(ourTab(desktopBar()).getAttribute('href')).toBe('/settings/keyboard#atmomod');
		await openTab();
		expect(window.location.hash).toBe('#atmomod');
		expect(panel().hidden).toBe(false);
		expect(script.settingsTabUrl()).toBe('/settings/account#atmomod');
	});

	it('shows a script\'s warning and attribution at the top of the panel, above sections added later too', async () => {
		const script = loadScript();
		// A section first, so the notice must move above it
		script.registerSettingsSection({ key: 'b', title: 'B', render: () => {} });
		script.configureSettingsTab({
			label: 'AtmoMod',
			warning: 'Report problems to <a href="/z0ylent">@z0ylent</a>.',
			attribution: ['created by me', '<button type="button" class="atmo-version-link">v1</button>'],
		});
		loadScript().registerSettingsSection({ key: 'a', title: 'A', render: () => {} });
		await settle();
		const first = panel().firstElementChild;
		expect(first.className).toBe('atmo-settings-notice atmo-panel mb-3');
		expect(first.querySelector('.atmo-dialog-warning a').getAttribute('href')).toBe('/z0ylent');
		expect(Array.from(first.querySelectorAll('.atmo-dialog-attribution > span'), s => s.textContent)).toEqual(['created by me', 'v1']);
		expect(first.querySelector('.atmo-version-link').dataset.boundBy, 'the version button works as in a dialog').toBe('script');
		expect(Array.from(panel().querySelectorAll('section > h3'), h => h.textContent)).toEqual(['A', 'B']);
	});

	it('binds the notice\'s version button by the script that configured the tab, whichever script redraws it', async () => {
		const other = loadScript('other');
		other.registerSettingsSection({ key: 'b', title: 'B', render: () => {} });
		// The owner names the tab but has no section of its own
		const owner = loadScript('owner');
		owner.configureSettingsTab({ label: 'X', attribution: ['<button type="button" class="atmo-version-link">v1</button>'] });
		await settle();
		expect(panel().querySelector('.atmo-version-link').dataset.boundBy).toBe('owner');

		// The site re-renders: both scripts rebuild, and either may write the notice
		panel().querySelector('.atmo-settings-notice').remove();
		await settle();
		const versionLinks = panel().querySelectorAll('.atmo-version-link');
		expect(versionLinks.length).toBe(1);
		expect(versionLinks[0].dataset.boundBy).toBe('owner');
	});

	it('goes quiet once set up: a sync with nothing to do changes nothing', async () => {
		const script = loadScript();
		script.registerSettingsSection({ key: 'a', title: 'A', render: () => {} });
		script.configureSettingsTab({ label: 'AtmoMod', title: 'T', warning: 'W', attribution: ['x'] });
		await settle();
		let mutations = 0;
		new window.MutationObserver((records) => { mutations += records.length; })
			.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
		await settle();
		await settle();
		expect(mutations).toBe(0);
	});

	it('lets the last script to name the tab name it, and two scripts do not fight over it', async () => {
		const modulator = loadScript();
		const other = loadScript();
		modulator.registerSettingsSection({ key: 'a', title: 'A', render: () => {} });
		other.registerSettingsSection({ key: 'b', title: 'B', render: () => {} });
		other.configureSettingsTab({ label: 'Other' });
		modulator.configureSettingsTab({ label: 'AtmoMod', title: 'T' });
		await settle();
		let mutations = 0;
		new window.MutationObserver((records) => { mutations += records.length; })
			.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
		await settle();
		expect(mutations).toBe(0);
		expect(ourTab(desktopBar()).textContent).toBe('AtmoMod');
		expect(ourTab(desktopBar()).getAttribute('aria-label')).toBe('AtmoMod, T');
	});

	it('opens in place of the tab content and takes the active look', async () => {
		loadScript().registerSettingsSection({ key: 'a', title: 'A', render: (body) => { body.textContent = 'form'; } });
		const activeClass = siteTab(desktopBar(), 'keyboard').className.replace(/router-link\S*\s*/g, '').trim();
		await openTab();

		expect(window.location.hash).toBe('#userscripts');
		expect(panel().hidden).toBe(false);
		expect(isHidden(content())).toBe(true);
		const tab = ourTab(desktopBar());
		expect(tab.className).toBe(activeClass);
		expect(tab.getAttribute('aria-current')).toBe('page');
		const keyboard = siteTab(desktopBar(), 'keyboard');
		expect(keyboard.hasAttribute('aria-current')).toBe(false);
		expect(keyboard.className).toBe(siteTab(desktopBar(), 'account').className);
		expect(panel().textContent).toContain('form');
	});

	it('gives both scripts one tab and one panel, with sections in key order', async () => {
		loadScript().registerSettingsSection({ key: 'atmospheric-modulator', title: 'Atmospheric Modulator', render: () => {} });
		loadScript().registerSettingsSection({ key: 'nick-colors', title: 'Nick Colors', render: () => {} });
		await settle();

		expect(desktopBar().querySelectorAll('a[data-atmo-settings-tab]').length).toBe(1);
		expect(document.querySelectorAll('#atmo-settings-panel').length).toBe(1);
		const titles = Array.from(panel().querySelectorAll('section > h3'), h => h.textContent);
		expect(titles).toEqual(['Atmospheric Modulator', 'Nick Colors']);
	});

	it('puts a section with a higher order after the rest, whichever script registers first', async () => {
		loadScript('one').registerSettingsSection({ key: 'a-backup', title: 'Backup', order: 1, render: () => {} });
		loadScript('two').registerSettingsSection({ key: 'z-other', title: 'Other', render: () => {} });
		const one = loadScript('one');
		one.registerSettingsSection({ key: 'b-main', title: 'Main', render: () => {} });
		await settle();

		const titles = Array.from(panel().querySelectorAll('section > h3'), h => h.textContent);
		expect(titles).toEqual(['Main', 'Other', 'Backup']);
	});

	it('shows a section only while its isShown says so, checked on every sync', () => {
		let shown = false;
		const script = loadScript();
		script.registerSettingsSection({ key: 'a', title: 'A', isShown: () => shown, render: () => {} });
		const titles = () => Array.from(panel().querySelectorAll('section > h3'), h => h.textContent);
		expect(titles()).toEqual([]);
		shown = true;
		script.syncSettingsPage();
		expect(titles()).toEqual(['A']);
		shown = false;
		script.syncSettingsPage();
		expect(titles()).toEqual([]);
	});

	it('puts each section\'s controls in a .atmo-panel body under the site\'s own heading', () => {
		let body = null;
		loadScript().registerSettingsSection({ key: 'a', title: 'A', render: (el) => { body = el; } });
		expect(body.className).toBe('atmo-panel');
		expect(body.parentElement.className).toBe('terminal-box p-4 mb-3');
		expect(body.previousElementSibling.className).toBe('text-xs mb-3 uppercase tracking-wider');
	});

	it('puts a section\'s icon before its title, as given, leaving the title as the heading\'s text', () => {
		loadScript().registerSettingsSection({ key: 'a', title: 'A', icon: '<svg aria-hidden="true"></svg>', render: () => {} });
		const heading = panel().querySelector('section > h3');
		expect(heading.firstElementChild.tagName.toLowerCase()).toBe('svg');
		expect(heading.textContent).toBe('A');
	});

	it('shows a section\'s description under its heading, as plain text', () => {
		loadScript().registerSettingsSection({ key: 'a', title: 'A', description: 'What these are <b>for</b>', render: () => {} });
		const heading = panel().querySelector('section > h3');
		const description = heading.nextElementSibling;
		expect(description.tagName).toBe('P');
		expect(description.className).toBe('text-fg-dim text-sm mb-3');
		// The site's tighter heading gap when a description follows
		expect(heading.className).toBe('text-xs mb-2 uppercase tracking-wider');
		expect(description.textContent).toBe('What these are <b>for</b>');
		expect(description.nextElementSibling.className).toBe('atmo-panel');
	});

	it('restores the site tab when another site tab is clicked', async () => {
		loadScript().registerSettingsSection({ key: 'a', title: 'A', render: () => {} });
		const keyboardClass = siteTab(desktopBar(), 'keyboard').className;
		await openTab();

		// The site navigates with pushState, which fires no event; the click is the cue
		const content = siteTab(desktopBar(), 'content');
		content.addEventListener('click', e => e.preventDefault());
		content.click();

		expect(siteTab(desktopBar(), 'keyboard').className).toBe(keyboardClass);
		expect(siteTab(desktopBar(), 'keyboard').getAttribute('aria-current')).toBe('page');
		expect(panel().hidden).toBe(true);
		expect(isHidden(document.querySelector('main > div > .mb-6:not(#atmo-settings-panel)'))).toBe(false);
	});

	it('stays open when a site tab is modifier-clicked into a new browser tab', async () => {
		loadScript().registerSettingsSection({ key: 'a', title: 'A', render: () => {} });
		await openTab();

		const content = siteTab(desktopBar(), 'content');
		content.addEventListener('click', e => e.preventDefault());
		content.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }));
		expect(panel().hidden).toBe(false);
		expect(ourTab(desktopBar()).getAttribute('aria-current')).toBe('page');
	});

	it('reopens on a click even when the hash is already #userscripts', async () => {
		loadScript().registerSettingsSection({ key: 'a', title: 'A', render: () => {} });
		await openTab();
		// Something left the panel closed with the hash still set
		const content = siteTab(desktopBar(), 'content');
		content.addEventListener('click', e => e.preventDefault());
		content.click();
		expect(panel().hidden).toBe(true);

		ourTab(desktopBar()).click();
		expect(panel().hidden).toBe(false);
	});

	it('keeps the site content hidden even when it has a display class', async () => {
		loadScript().registerSettingsSection({ key: 'a', title: 'A', render: () => {} });
		content().style.display = 'flex';
		await openTab();
		expect(content().style.getPropertyPriority('display')).toBe('important');
		siteTab(desktopBar(), 'content').addEventListener('click', e => e.preventDefault());
		siteTab(desktopBar(), 'content').click();
		expect(content().style.display, 'its own inline value is put back').toBe('flex');
	});

	it('re-renders a section on refreshSettingsSection', async () => {
		let renders = 0;
		const script = loadScript();
		script.registerSettingsSection({ key: 'a', title: 'A', render: () => { renders++; } });
		script.refreshSettingsSection('a');
		expect(renders).toBe(2);
		expect(panel().querySelectorAll('section').length).toBe(1);
	});

	it('does not restore a tab the router has already moved on from (Back)', async () => {
		loadScript().registerSettingsSection({ key: 'a', title: 'A', render: () => {} });
		await openTab();

		// The router makes Content current and restyles both links, then the hash goes
		const keyboard = siteTab(desktopBar(), 'keyboard');
		const content = siteTab(desktopBar(), 'content');
		const idleClass = content.className;
		content.className = keyboard.getAttribute('data-atmo-settings-class');
		content.setAttribute('aria-current', 'page');
		keyboard.className = idleClass;
		window.history.pushState(null, '', '/settings/content');
		window.dispatchEvent(new window.PopStateEvent('popstate'));
		await settle();

		expect(keyboard.className).toBe(idleClass);
		expect(keyboard.hasAttribute('aria-current')).toBe(false);
		expect(keyboard.hasAttribute('data-atmo-settings-class')).toBe(false);
	});

	it('comes back after the site re-renders the page', async () => {
		loadScript().registerSettingsSection({ key: 'a', title: 'A', render: () => {} });
		const wrapper = document.querySelector('main > div');
		const fresh = new JSDOM(FIXTURE).window.document.querySelector('main > div').innerHTML;
		wrapper.innerHTML = fresh;
		expect(ourTab(desktopBar())).toBeNull();
		await settle();
		expect(ourTab(desktopBar())).not.toBeNull();
		expect(panel()).not.toBeNull();
	});

	it('opens straight away when the page loads with #userscripts', () => {
		window = new JSDOM(FIXTURE, { url: 'https://cyberspace.online/settings/keyboard#userscripts', runScripts: 'outside-only' }).window;
		document = window.document;
		loadScript().registerSettingsSection({ key: 'a', title: 'A', render: () => {} });
		expect(panel().hidden).toBe(false);
		expect(isHidden(content())).toBe(true);
	});

	describe('openSettingsSection', () => {
		it('on a settings page, opens the tab in place and focuses the section', () => {
			const script = loadScript();
			script.registerSettingsSection({ key: 'a', title: 'A', render: () => {} });
			script.openSettingsSection('a');
			expect(window.location.hash).toBe('#userscripts');
			expect(panel().hidden).toBe(false);
			expect(document.activeElement).toBe(panel().querySelector('[data-atmo-settings-section="a"] > h3'));
		});

		it('elsewhere, records the section and loads the last-used settings tab', () => {
			window = new JSDOM('<!DOCTYPE html><body><main></main></body>', {
				url: 'https://cyberspace.online/chat/general', runScripts: 'outside-only',
				// jsdom cannot navigate; the attempt is all this test needs
				virtualConsole: new VirtualConsole(),
			}).window;
			document = window.document;
			window.localStorage.setItem('lastSettingsTab', '/settings/appearance');
			loadScript().openSettingsSection('a');
			expect(JSON.parse(window.sessionStorage.getItem('atmo-settings-focus')).key).toBe('a');
		});

		it('loads the last-used settings tab with the hash, or account when that is missing or odd', () => {
			const script = loadScript();
			window.localStorage.setItem('lastSettingsTab', '/settings/appearance');
			expect(script.settingsTabUrl()).toBe('/settings/appearance#userscripts');
			window.localStorage.setItem('lastSettingsTab', 'https://evil.example/settings/x');
			expect(script.settingsTabUrl()).toBe('/settings/account#userscripts');
			window.localStorage.removeItem('lastSettingsTab');
			expect(script.settingsTabUrl()).toBe('/settings/account#userscripts');
		});

		it('stays out of the way on a page that only links to settings', () => {
			window = new JSDOM('<!DOCTYPE html><body><main><p><a href="/settings/account">Account settings</a></p></main></body>', {
				url: 'https://cyberspace.online/chat/general', runScripts: 'outside-only', virtualConsole: new VirtualConsole(),
			}).window;
			document = window.document;
			loadScript().openSettingsSection('a');
			// Navigates to the settings page instead of opening a tab here
			expect(window.sessionStorage.getItem('atmo-settings-focus')).not.toBeNull();
			expect(document.getElementById('atmo-settings-panel')).toBeNull();
		});

		it('after that load, focuses the section once it renders, and only once', () => {
			window = new JSDOM(FIXTURE, { url: 'https://cyberspace.online/settings/appearance#userscripts', runScripts: 'outside-only' }).window;
			document = window.document;
			window.sessionStorage.setItem('atmo-settings-focus', JSON.stringify({ key: 'a', expires: Date.now() + 10000 }));
			loadScript().registerSettingsSection({ key: 'a', title: 'A', render: () => {} });
			expect(document.activeElement).toBe(panel().querySelector('[data-atmo-settings-section="a"] > h3'));
			expect(window.sessionStorage.getItem('atmo-settings-focus')).toBeNull();
		});

		it('ignores and drops an abandoned request', () => {
			window = new JSDOM(FIXTURE, { url: 'https://cyberspace.online/settings/appearance#userscripts', runScripts: 'outside-only' }).window;
			document = window.document;
			window.sessionStorage.setItem('atmo-settings-focus', JSON.stringify({ key: 'a', expires: Date.now() - 1 }));
			loadScript().registerSettingsSection({ key: 'a', title: 'A', render: () => {} });
			expect(document.activeElement).not.toBe(panel().querySelector('[data-atmo-settings-section="a"] > h3'));
			expect(window.sessionStorage.getItem('atmo-settings-focus')).toBeNull();
		});
	});
});

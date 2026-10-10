/**
 * Users section tests (src/user-list.js, with nick colors' and nick notes'
 * parts): one row per customized user, with a star that makes them a choom
 * or not, the name that opens the Color dialog, the note that opens the
 * Notes dialog, and a trash button for the note. The name is drawn as the
 * page draws it, so a non-choom in choom mode is uncolored.
 */

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { dom } from './setup.js';

const doc = dom.window.document;
const feature = (key) => FEATURES.find(f => f.key === key);
const stored = (key) => JSON.parse(localStorage.getItem('atmosphericModulator_' + key) || 'null');

/**
 * Store nick colors' and nick notes' data, as a backup restore does.
 * @param {{colors?: Object, friends?: Object, notes?: Object, site?: Object}} data
 *   site: the settings for every name
 */
function restore({ colors = {}, friends = { enabled: false, users: [] }, notes = {}, site = {} }) {
	feature('nickColors').importBackup({ v: 2, sc: site, cnc: colors, nf: friends }, true);
	feature('nickNotes').importBackup(notes, true);
}

/**
 * The site's settings page, with the Users section rendered.
 * @returns {HTMLElement} the section
 */
function openUsers() {
	const html = readFileSync(join(__dirname, 'shared', 'fixtures', 'settings-page.html'), 'utf8');
	const main = new dom.window.DOMParser().parseFromString(html, 'text/html').querySelector('main');
	doc.body.appendChild(doc.importNode(main, true));
	syncSettingsPage();
	return doc.querySelector('[data-atmo-settings-section="atmospheric-modulator-users"]');
}

const rows = (section) => Array.from(section.querySelectorAll('li[data-entry-key]'));
// The open dialog's label that starts with text, with its default
const dialogLabel = (text) => Array.from(doc.querySelectorAll('.atmo-dialog label')).find(l => l.textContent.startsWith(text)).textContent;
const confirm = () => doc.querySelector('.atmo-dialog-footer button.atmo-danger').click();

beforeAll(async () => {
	// overrides.json gives dee an icon of her own
	global.gmRequestHandler = (details) => setTimeout(() => details.onload({
		status: 200,
		responseText: details.url.endsWith('overrides.json') ? JSON.stringify({ dee: { prependIcon: '♦' } }) : '{}',
	}), 0);
	// The core registers the section at boot; init.js is left out of the setup
	registerUserListSection();
	startFeatures();
	await new Promise(resolve => setTimeout(resolve, 30));
	delete global.gmRequestHandler;
});

afterEach(() => {
	doc.querySelectorAll('body > main, .atmo-dialog-overlay').forEach(el => el.remove());
	restore({});
});

describe('the Users section', () => {
	it('lists each customized user once, by name, with the name drawn in its color and the note', () => {
		restore({ colors: { bob: { c: '#00ff00' } }, notes: { alice: 'met at the meetup', bob: 'second' } });
		const section = openUsers();
		expect(rows(section).map(row => row.dataset.entryKey)).toEqual(['alice', 'bob']);
		const bob = rows(section)[1];
		expect(bob.querySelector('.atmo-color-preview').dataset.nickColored).toBe('true');
		// The style is on the name, not on the button filling its cell, so a
		// background covers only the name
		expect(bob.querySelector('.atmo-color-name').style.cssText).toBe('');
		expect(bob.querySelector('.atmo-color-name > .atmo-color-preview').style.color).not.toBe('');
		expect(bob.querySelector('.atmo-note-text').textContent).toBe('second');
	});

	it('opens the Color dialog from the name, and the Notes dialog from the note', () => {
		restore({ notes: { alice: 'old' } });
		const section = openUsers();
		section.querySelector('.atmo-color-preview').click();
		expect(doc.querySelector('.atmo-dialog').textContent).toContain('alice');
		doc.querySelector('.atmo-dialog-overlay').remove();

		section.querySelector('.atmo-note-text').click();
		doc.querySelector('.atmo-dialog textarea').value = 'new';
		doc.querySelector('.atmo-dialog-footer button.save').click();
		expect(section.querySelector('li[data-entry-key="alice"] .atmo-note-text').textContent).toBe('new');
	});

	it('deletes a note after asking, keeping focus in the list', () => {
		restore({ notes: { alice: 'one', bob: 'two' } });
		const section = openUsers();
		const trash = section.querySelector('button[aria-label="Delete notes on @alice"]');
		trash.focus();
		trash.click();
		confirm();
		expect(stored('nickNotes')).toEqual({ bob: 'two' });
		expect(rows(section).map(row => row.dataset.entryKey)).toEqual(['bob']);
		expect(section.contains(doc.activeElement)).toBe(true);
	});

	it('offers to add a note to a user with only a color', () => {
		restore({ colors: { carol: { c: '#0000ff' } } });
		const section = openUsers();
		const add = section.querySelector('button[aria-label="add note on @carol"]');
		expect(add.textContent).toBe('add note');
	});

	it('marks chooms with a bright star and others with a dim one, and flips it on click', () => {
		restore({ colors: { bob: { c: '#00ff00' } }, friends: { enabled: false, users: ['alice'] } });
		const section = openUsers();
		const star = (name) => section.querySelector(`button[aria-label="Choom @${name}"]`);
		expect(star('alice').getAttribute('aria-pressed')).toBe('true');
		expect(star('alice').textContent).toBe('★');
		expect(star('bob').getAttribute('aria-pressed')).toBe('false');
		expect(star('bob').textContent).toBe('☆');

		star('bob').click();
		expect(star('bob').getAttribute('aria-pressed')).toBe('true');
		expect(exportBackup().features.nickColors.nf.users).toContain('bob');
	});

	it('lists a friend under the case their note is saved in, and shows the note', () => {
		restore({ friends: { enabled: false, users: ['zed'] }, notes: { Zed: 'met at the meetup' } });
		const section = openUsers();
		expect(rows(section).map(row => row.dataset.entryKey)).toEqual(['Zed']);
		expect(section.querySelector('.atmo-note-text').textContent).toBe('met at the meetup');
	});

	it('takes a friend\'s spelling from the site\'s link to them, not from a mention someone typed', async () => {
		restore({ friends: { enabled: true, users: ['zed'] } });
		const line = doc.createElement('main');
		line.innerHTML = '<p>@ZED hi</p>';
		doc.body.appendChild(line);
		await new Promise(resolve => setTimeout(resolve, 20));
		expect(exportBackup().features.nickColors.nf.users).toEqual(['zed']);

		line.innerHTML = '<div class="chat-main-content"><a href="/Zed">Zed</a></div>';
		await new Promise(resolve => setTimeout(resolve, 20));
		expect(exportBackup().features.nickColors.nf.users).toEqual(['Zed']);
	});

	it('finds the note when the color is saved under another capitalization', () => {
		restore({ colors: { ZeD: { c: '#00ff00' } }, notes: { Zed: 'met at the meetup' } });
		const section = openUsers();
		expect(rows(section).length).toBe(1);
		expect(section.querySelector('.atmo-note-text').textContent).toBe('met at the meetup');
	});

	it('puts focus back on the note after saving it, and on the star after flipping it', () => {
		restore({ colors: { bob: { c: '#00ff00' } }, friends: { enabled: true, users: [] }, notes: { bob: 'old' } });
		const section = openUsers();
		const pencil = section.querySelector('button[aria-label="Edit notes on @bob"]');
		pencil.focus();
		pencil.click();
		doc.querySelector('.atmo-dialog textarea').value = 'new';
		doc.querySelector('.atmo-dialog-footer button.save').click();
		expect(doc.activeElement.getAttribute('aria-label')).toBe('Edit notes on @bob');
		expect(section.querySelector('.atmo-note-text').textContent).toBe('new');

		const star = section.querySelector('button[aria-label="Choom @bob"]');
		star.focus();
		star.click();
		expect(doc.activeElement.getAttribute('aria-label')).toBe('Choom @bob');
		expect(doc.activeElement.getAttribute('aria-pressed')).toBe('true');
	});

	it('saves a note added on a friend-only row under the name the page uses', () => {
		// Added with Add Color from the menu, on the page's spelling
		restore({ friends: { enabled: true, users: ['Zed'] } });
		const section = openUsers();
		section.querySelector('button[aria-label="add note on @Zed"]').click();
		doc.querySelector('.atmo-dialog textarea').value = 'met at the meetup';
		doc.querySelector('.atmo-dialog-footer button.save').click();
		expect(stored('nickNotes')).toEqual({ Zed: 'met at the meetup' });
	});

	it('puts every part of a row in its column, star first', () => {
		restore({ colors: { bob: { c: '#00ff00' } }, notes: { bob: 'hi' } });
		const row = openUsers().querySelector('li[data-entry-key="bob"]');
		const columns = Array.from(row.children, part => [...part.classList].find(c => c.startsWith('atmo-user-col-')));
		expect(columns).toEqual(['atmo-user-col-mark', 'atmo-user-col-name', 'atmo-user-col-text', 'atmo-user-col-edit', 'atmo-user-col-delete']);
	});

	it('draws a non-choom uncolored while only chooms are colored, and colored again when their star lights', () => {
		restore({ colors: { bob: { c: '#00ff00' } }, friends: { enabled: true, users: [] } });
		const section = openUsers();
		const preview = () => section.querySelector('li[data-entry-key="bob"] .atmo-color-preview');
		expect(preview().style.color).toBe('');
		section.querySelector('button[aria-label="Choom @bob"]').click();
		expect(preview().style.color).not.toBe('');
	});

	it('redraws its names when choom mode is switched on', () => {
		restore({ colors: { bob: { c: '#00ff00' } }, friends: { enabled: false, users: [] } });
		const section = openUsers();
		const preview = () => section.querySelector('li[data-entry-key="bob"] .atmo-color-preview');
		expect(preview().style.color).not.toBe('');
		const title = () => section.querySelector('li[data-entry-key="bob"] .atmo-color-name').title;
		const colorTitle = title();
		// The switch under nick colors' own, in the script's main settings
		const main = doc.createElement('div');
		section.after(main);
		renderSettingsSection(main);
		main.querySelector('[data-field-key="onlyColorFriends"] input').click();
		main.remove();
		expect(preview().style.color).toBe('');
		// Its tooltip says why the name is plain now
		expect(title()).not.toBe(colorTitle);
	});

	it('promises a hashed icon in the Color dialog only on the side whose switch is on', () => {
		restore({ colors: { bob: { c: '#00ff00' } }, site: { prependIcon: true, appendIcon: false, iconSet: '★' } });
		openUsers().querySelector('.atmo-color-preview').click();
		expect(dialogLabel('Prepend icon')).toContain('(default: ★)');
		expect(dialogLabel('Append icon')).not.toContain('default');
	});

	it('promises a site-wide override\'s icon in the Color dialog over the hashed one', () => {
		restore({ colors: { dee: { c: '#00ff00' } }, site: { prependIcon: false, appendIcon: true, iconSet: '★' } });
		openUsers().querySelector('.atmo-color-preview').click();
		expect(dialogLabel('Prepend icon')).toContain('(default: ♦)');
		expect(dialogLabel('Append icon')).toContain('(default: ★)');
	});

	it('keeps every copy of the list in step, as on the settings tab and in a dialog', () => {
		restore({ notes: { alice: 'one' } });
		const section = openUsers();
		const copy = doc.createElement('div');
		doc.body.append(copy);
		renderUserList(copy);
		feature('nickNotes').importBackup({ alice: 'one', bob: 'two' }, true);
		expect(rows(section).map(row => row.dataset.entryKey)).toEqual(['alice', 'bob']);
		expect(rows(copy).map(row => row.dataset.entryKey)).toEqual(['alice', 'bob']);
		copy.remove();
	});

	it('says so when nobody is customized', () => {
		const section = openUsers();
		expect(rows(section)).toEqual([]);
		expect(section.querySelector('.hint').textContent.trim()).not.toBe('');
	});
});

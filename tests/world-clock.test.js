/**
 * World clock tests (src/world-clock/): the row of city times under cIRC's
 * room header, its settings section, and its part of the backup.
 */

import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { dom } from './setup.js';

const doc = dom.window.document;
const feature = () => FEATURES.find(f => f.key === 'worldClock');
// The MutationObserver reports after the current task
const settle = () => new Promise(resolve => dom.window.setTimeout(resolve, 0));

/**
 * The site's cIRC room header.
 * @returns {HTMLElement}
 */
function addHeader() {
	const header = doc.createElement('div');
	header.id = 'circ-room-header';
	doc.querySelector('#__nuxt').appendChild(header);
	return header;
}

const row = () => doc.querySelector('.atmo-world-clock');

/**
 * The site's settings page, with the World Clock section rendered.
 * @returns {HTMLElement} the section
 */
function openSection() {
	const html = readFileSync(join(__dirname, 'shared', 'fixtures', 'settings-page.html'), 'utf8');
	const main = new dom.window.DOMParser().parseFromString(html, 'text/html').querySelector('main');
	doc.body.appendChild(doc.importNode(main, true));
	syncSettingsPage();
	return doc.querySelector('[data-atmo-settings-section="atmospheric-modulator-world-clock"]');
}
const cities = () => Array.from(row().querySelectorAll('.atmo-world-clock-city'), city => city.textContent);

beforeAll(() => {
	applySettings({ ...featureConfig, worldClock: true });
	startFeatures();
});

afterEach(() => {
	vi.useRealTimers();
	doc.querySelectorAll('#circ-room-header, .circ-rail, body > main').forEach(el => el.remove());
	feature().resetSettings(true);
	applySettings({ ...featureConfig, worldClock: true });
});

describe('the world clock row', () => {
	it('shows the chosen cities under the room header, west to east, in 24-hour time', async () => {
		const header = addHeader();
		await vi.waitFor(() => expect(row()).not.toBeNull());
		expect(header.nextElementSibling).toBe(row());
		// A fixed time, drawn again with the default cities
		vi.useFakeTimers({ now: new Date('2026-01-15T12:00:00Z'), toFake: ['Date', 'setTimeout', 'clearTimeout'] });
		feature().resetSettings(true);
		expect(row().getAttribute('role')).toBe('group');
		expect(row().getAttribute('aria-label')).toBe('World clock');
		// Ruled off from the chat below, in the site's border color
		expect([...row().classList]).toEqual(expect.arrayContaining(['border-b', 'border-border']));
		expect(cities()).toEqual(['NYC 07:00', 'London 12:00', 'Sydney 23:00']);
		// The dividers are drawing, not text
		expect(Array.from(row().querySelectorAll('.atmo-world-clock-divider'), d => d.getAttribute('aria-hidden'))).toEqual(['true', 'true']);
	});

	it('shows 12-hour times and UTC offsets, following daylight saving', () => {
		vi.useFakeTimers({ now: new Date('2026-07-15T12:00:00Z'), toFake: ['Date', 'setTimeout', 'clearTimeout'] });
		addHeader();
		feature().importBackup({ cities: ['mumbai', 'new-york', 'utc'], hour24: false, showOffsets: true }, true);
		expect(cities()).toEqual(['UTC 12:00 PM', 'NYC 8:00 AM (UTC-4)', 'Mumbai 5:30 PM (UTC+5:30)']);

		vi.setSystemTime(new Date('2026-01-15T12:00:00Z'));
		feature().importBackup({ cities: ['new-york'], hour24: false, showOffsets: true }, true);
		expect(cities()).toEqual(['NYC 7:00 AM (UTC-5)']);
	});

	it('turns over at the start of each minute', () => {
		vi.useFakeTimers({ now: new Date('2026-01-15T12:00:30Z'), toFake: ['Date', 'setTimeout', 'clearTimeout'] });
		addHeader();
		feature().importBackup({ cities: ['utc'] }, true);
		expect(cities()).toEqual(['UTC 12:00']);
		vi.advanceTimersByTime(29999);
		expect(cities()).toEqual(['UTC 12:00']);
		vi.advanceTimersByTime(1);
		expect(cities()).toEqual(['UTC 12:01']);
	});

	it('follows the header as the site redraws it, and leaves with it', async () => {
		addHeader();
		await vi.waitFor(() => expect(row()).not.toBeNull());
		doc.getElementById('circ-room-header').remove();
		const header = addHeader();
		await vi.waitFor(() => expect(header.nextElementSibling).toBe(row()));

		header.remove();
		await vi.waitFor(() => expect(row()).toBeNull());
	});

	it('shows under cIRC in the sidebar too, beside the page\'s own, and leaves with it', async () => {
		const page = addHeader();
		const rail = doc.createElement('div');
		rail.className = 'circ-rail';
		rail.innerHTML = '<div data-debug="header">cIRC</div><div>chat</div>';
		doc.querySelector('#__nuxt').appendChild(rail);
		const railHeader = rail.querySelector('[data-debug="header"]');
		await vi.waitFor(() => expect(railHeader.nextElementSibling.classList.contains('atmo-world-clock')).toBe(true));
		expect(page.nextElementSibling.classList.contains('atmo-world-clock')).toBe(true);
		expect(doc.querySelectorAll('.atmo-world-clock').length).toBe(2);

		page.remove();
		await vi.waitFor(() => expect(doc.querySelectorAll('.atmo-world-clock').length).toBe(1));
		expect(railHeader.nextElementSibling.classList.contains('atmo-world-clock')).toBe(true);
	});

	it('goes away when switched off or with no city chosen, and comes back', async () => {
		addHeader();
		await vi.waitFor(() => expect(row()).not.toBeNull());
		applySettings({ ...featureConfig, worldClock: false });
		expect(row()).toBeNull();
		await settle();
		expect(row()).toBeNull();

		applySettings({ ...featureConfig, worldClock: true });
		expect(row()).not.toBeNull();
		feature().importBackup({ cities: [] }, true);
		expect(row()).toBeNull();
	});
});

describe('world clock settings', () => {
	it('keeps only known cities, once each, and the defaults for the rest', () => {
		feature().importBackup({ cities: ['tokyo', 'atlantis', 'tokyo', 7], hour24: 'yes' }, true);
		expect(feature().exportBackup()).toEqual({ cities: ['tokyo'], hour24: true, showOffsets: false, custom: [] });
		expect(JSON.parse(localStorage.getItem('atmosphericModulator_worldClock'))).toEqual({ cities: ['tokyo'], hour24: true, showOffsets: false, custom: [] });
	});

	it('adds a city from its button on the settings tab, and shows it at once', async () => {
		vi.useFakeTimers({ now: new Date('2026-01-15T12:00:00Z'), toFake: ['Date', 'setTimeout', 'clearTimeout'] });
		addHeader();
		const picker = openSection().querySelector('fieldset');
		expect(picker.querySelector('legend').textContent.trim()).not.toBe('');

		const tokyo = picker.querySelector('button[data-city="tokyo"]');
		expect(tokyo.textContent).toBe('Tokyo');
		expect(tokyo.getAttribute('aria-pressed')).toBe('false');
		expect(picker.querySelector('button[data-city="london"]').getAttribute('aria-pressed')).toBe('true');

		tokyo.focus();
		tokyo.click();
		expect(cities()).toEqual(['NYC 07:00', 'London 12:00', 'Tokyo 21:00', 'Sydney 23:00']);
		expect(tokyo.getAttribute('aria-pressed')).toBe('true');
		expect(doc.activeElement).toBe(tokyo);

		tokyo.click();
		expect(cities()).toEqual(['NYC 07:00', 'London 12:00', 'Sydney 23:00']);
		expect(tokyo.getAttribute('aria-pressed')).toBe('false');
	});

	it('keeps a custom city only with a time zone the browser knows, in its spelling, once', () => {
		feature().importBackup({ custom: [
			{ label: ' Home\nbase ', timeZone: 'america/denver' },
			{ label: 'Home base', timeZone: 'America/Denver' },
			{ label: 'Nowhere', timeZone: 'Mars/Olympus' },
			{ label: '', timeZone: 'Asia/Tokyo' },
			{ label: 'x'.repeat(60), timeZone: 'Asia/Tokyo' },
			{ label: 'Zulu', timeZone: 'utc' },
		] }, true);
		expect(feature().exportBackup().custom).toEqual([
			{ label: 'Home base', timeZone: 'America/Denver' },
			{ label: 'x'.repeat(40), timeZone: 'Asia/Tokyo' },
			{ label: 'Zulu', timeZone: 'UTC' },
		]);
	});

	it('puts a custom city among the others by its offset, after UTC', () => {
		vi.useFakeTimers({ now: new Date('2026-01-15T12:00:00Z'), toFake: ['Date', 'setTimeout', 'clearTimeout'] });
		addHeader();
		feature().importBackup({ cities: ['london', 'utc'], custom: [{ label: 'Denver', timeZone: 'America/Denver' }] }, true);
		expect(cities()).toEqual(['UTC 12:00', 'Denver 05:00', 'London 12:00']);
		// UTC of your own goes first too
		feature().importBackup({ cities: ['london'], custom: [{ label: 'Zulu', timeZone: 'UTC' }] }, true);
		expect(cities()).toEqual(['Zulu 12:00', 'London 12:00']);
	});
});

describe('your own cities, on the settings tab', () => {
	const editor = () => doc.querySelector('.atmo-world-clock-custom');
	const field = (label) => editor().querySelector(`#${Array.from(editor().querySelectorAll('label')).find(l => l.textContent === label).htmlFor}`);
	const addButton = () => Array.from(editor().querySelectorAll('button')).find(b => b.textContent === 'Add');

	it('adds a city by the city part of its time zone, named after it, and goes back to the name field', () => {
		vi.useFakeTimers({ now: new Date('2026-01-15T12:00:00Z'), toFake: ['Date', 'setTimeout', 'clearTimeout'] });
		addHeader();
		openSection();
		// Looks like the site's own buttons, not bare text
		expect(addButton().classList.contains('atmo-inline-btn')).toBe(true);
		field('Time zone').value = 'denver';
		addButton().click();
		expect(feature().exportBackup().custom).toEqual([{ label: 'Denver', timeZone: 'America/Denver' }]);
		expect(cities()).toEqual(['Denver 05:00', 'NYC 07:00', 'London 12:00', 'Sydney 23:00']);
		expect(editor().querySelector('li').textContent).toBe('Denver (America/Denver)');
		expect(field('Time zone').value).toBe('');
		expect(doc.activeElement).toBe(field('Name'));
	});

	it('takes an old zone name as the zone it stands for, in the list\'s spelling', () => {
		openSection();
		for (const typed of ['singapore', 'jamaica', 'us/eastern']) {
			field('Time zone').value = typed;
			addButton().click();
		}
		expect(feature().exportBackup().custom).toEqual([
			{ label: 'Singapore', timeZone: 'Asia/Singapore' },
			{ label: 'Jamaica', timeZone: 'America/Jamaica' },
			{ label: 'New York', timeZone: 'America/New_York' },
		]);
	});

	it('refuses a time zone it does not know, saying so on the field', () => {
		openSection();
		field('Name').value = 'Home';
		field('Time zone').value = 'Atlantis';
		field('Time zone').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
		expect(feature().exportBackup().custom).toEqual([]);
		const zone = field('Time zone');
		expect(zone.getAttribute('aria-invalid')).toBe('true');
		const message = doc.getElementById(zone.getAttribute('aria-describedby'));
		expect(message.textContent).toContain('Pick a time zone');
		// Announced, though focus was on the field already
		expect(message.getAttribute('role')).toBe('status');
		expect(doc.activeElement).toBe(zone);
	});

	it('removes a city with its trash button, keeping focus in the list', () => {
		feature().importBackup({ custom: [{ label: 'Denver', timeZone: 'America/Denver' }, { label: 'Tokyo', timeZone: 'Asia/Tokyo' }] }, true);
		openSection();
		const trash = editor().querySelector('button[aria-label="Remove Denver"]');
		trash.focus();
		trash.click();
		expect(feature().exportBackup().custom).toEqual([{ label: 'Tokyo', timeZone: 'Asia/Tokyo' }]);
		expect(doc.activeElement.getAttribute('aria-label')).toBe('Remove Tokyo');
		doc.activeElement.click();
		expect(doc.activeElement).toBe(field('Name'));
	});
});

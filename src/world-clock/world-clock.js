// =====================================================
// WORLD CLOCK
// =====================================================
// A row of city times under cIRC's header, on its page and in the sidebar:
// NYC 07:00 | London 12:00 | Sydney 23:00. Switched by
// featureConfig.worldClock. Each city keeps its own time zone, so daylight
// saving moves its time and its offset.

const WORLD_CLOCK_LOG_PREFIX = featureLogPrefix('world-clock');

// The site's headers a row goes under: cIRC's own page, and cIRC popped
// out into the sidebar rail. Both can be on the page at once
const CIRC_HEADER_SELECTOR = '#circ-room-header, .circ-rail div[data-debug="header"]';

// UTC, then west to east: the settings' button order, and the row's order
// between cities at the same offset. The ids are saved in users' settings:
// never change one
const WORLD_CLOCK_CITIES = [
	{ id: 'utc', label: 'UTC', timeZone: 'UTC' },
	{ id: 'los-angeles', label: 'LA', timeZone: 'America/Los_Angeles' },
	{ id: 'chicago', label: 'Chicago', timeZone: 'America/Chicago' },
	{ id: 'new-york', label: 'NYC', timeZone: 'America/New_York' },
	{ id: 'sao-paulo', label: 'São Paulo', timeZone: 'America/Sao_Paulo' },
	{ id: 'london', label: 'London', timeZone: 'Europe/London' },
	{ id: 'paris', label: 'Paris', timeZone: 'Europe/Paris' },
	{ id: 'berlin', label: 'Berlin', timeZone: 'Europe/Berlin' },
	{ id: 'moscow', label: 'Moscow', timeZone: 'Europe/Moscow' },
	{ id: 'dubai', label: 'Dubai', timeZone: 'Asia/Dubai' },
	{ id: 'mumbai', label: 'Mumbai', timeZone: 'Asia/Kolkata' },
	{ id: 'singapore', label: 'Singapore', timeZone: 'Asia/Singapore' },
	{ id: 'hong-kong', label: 'Hong Kong', timeZone: 'Asia/Hong_Kong' },
	{ id: 'tokyo', label: 'Tokyo', timeZone: 'Asia/Tokyo' },
	{ id: 'sydney', label: 'Sydney', timeZone: 'Australia/Sydney' },
	{ id: 'auckland', label: 'Auckland', timeZone: 'Pacific/Auckland' },
];

const DEFAULT_WORLD_CLOCK = {
	cities: ['new-york', 'london', 'sydney'],
	hour24: true,
	// After each city: (UTC-4)
	showOffsets: false,
	// The user's own: [{ label, timeZone }], shown until removed
	custom: [],
};

// Enough for anyone's friends, few enough that the row still fits
const MAX_CUSTOM_CITIES = 20;
const MAX_CITY_LABEL_LENGTH = 40;

let worldClock = { ...DEFAULT_WORLD_CLOCK };

/**
 * World clock settings with anything unknown or malformed dropped, and
 * defaults for what is missing.
 * @param {*} data - as saved, or from a backup
 * @returns {{cities: string[], hour24: boolean, showOffsets: boolean, custom: {label: string, timeZone: string}[]}}
 */
function sanitizeWorldClock(data) {
	if (!data || typeof data !== 'object') return { ...DEFAULT_WORLD_CLOCK, custom: [] };
	const known = new Set(WORLD_CLOCK_CITIES.map(city => city.id));
	return {
		cities: Array.isArray(data.cities)
			? [...new Set(data.cities.filter(id => known.has(id)))]
			: [...DEFAULT_WORLD_CLOCK.cities],
		hour24: typeof data.hour24 === 'boolean' ? data.hour24 : DEFAULT_WORLD_CLOCK.hour24,
		showOffsets: typeof data.showOffsets === 'boolean' ? data.showOffsets : DEFAULT_WORLD_CLOCK.showOffsets,
		custom: sanitizeCustomCities(data.custom),
	};
}

/**
 * The user's own cities, each with a time zone the browser knows and a
 * plain one-line name, once each, up to MAX_CUSTOM_CITIES.
 * @param {*} custom - as saved, or from a backup
 * @returns {{label: string, timeZone: string}[]}
 */
function sanitizeCustomCities(custom) {
	if (!Array.isArray(custom)) return [];
	const seen = new Set();
	const cities = [];
	for (const city of custom) {
		const timeZone = canonicalTimeZone(city?.timeZone);
		const label = cleanCityLabel(city?.label);
		const key = customCityKey({ label, timeZone });
		if (!timeZone || !label || seen.has(key)) continue;
		seen.add(key);
		cities.push({ label, timeZone });
		if (cities.length === MAX_CUSTOM_CITIES) break;
	}
	return cities;
}

/**
 * A city name as the row shows it: one line, trimmed, at most
 * MAX_CITY_LABEL_LENGTH characters.
 * @param {*} label
 * @returns {string} '' when there is nothing usable
 */
function cleanCityLabel(label) {
	if (typeof label !== 'string') return '';
	return label.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, MAX_CITY_LABEL_LENGTH).trim();
}

/**
 * One custom city's key: its row in the settings list, and how duplicates
 * are found.
 * @param {{label: string, timeZone: string}} city
 * @returns {string}
 */
function customCityKey(city) {
	return `${city.timeZone}|${city.label}`;
}

/**
 * A time zone's name as the browser's list spells it: America/Denver for
 * america/denver. A name the list leaves out, such as an old one
 * (singapore, US/Eastern) or UTC in some browsers, becomes the browser's
 * own name for that zone (Asia/Singapore, America/New_York, UTC). A listed
 * name stays as listed, even where the browser's own name for it is older:
 * the user picked it from that list.
 * @param {*} name - IANA name
 * @returns {string|null} null when the browser does not know it
 */
function canonicalTimeZone(name) {
	if (typeof name !== 'string' || !name) return null;
	let resolved;
	try {
		resolved = new Intl.DateTimeFormat('en-US', { timeZone: name }).resolvedOptions().timeZone;
	} catch (e) {
		// RangeError: not a time zone
		return null;
	}
	return listedTimeZone(name) ?? resolved;
}

/**
 * The browser's list's spelling of a time zone name, whatever its capitals.
 * @param {string} name
 * @returns {string|undefined} undefined when the list does not have it
 */
function listedTimeZone(name) {
	const lower = name.toLowerCase();
	return availableTimeZones().find(zone => zone.toLowerCase() === lower);
}

/**
 * Every time zone the browser knows, for the suggestions. Empty in browsers
 * too old to list them, where the field takes a typed name only.
 * @returns {string[]}
 */
function availableTimeZones() {
	return typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
}

/**
 * The time zone a user typed: a full name (America/Denver, any case), or
 * the city part of one (Denver, new york).
 * @param {string} typed
 * @returns {string|null} null when nothing matches
 */
function findTimeZone(typed) {
	const name = typed.trim().replace(/ +/g, '_');
	if (!name) return null;
	// The list before the browser's old names, so jamaica is America/Jamaica
	// rather than the old Jamaica zone
	const city = name.toLowerCase();
	return listedTimeZone(name)
		?? availableTimeZones().find(zone => zone.toLowerCase().split('/').pop() === city)
		?? canonicalTimeZone(name);
}

/**
 * The name a time zone gives its city: Denver for America/Denver.
 * @param {string} timeZone
 * @returns {string}
 */
function timeZoneCityName(timeZone) {
	return timeZone.split('/').pop().replace(/_/g, ' ');
}

/**
 * Whether the row has anything to show.
 * @returns {boolean}
 */
function hasWorldClockCities() {
	return worldClock.cities.length > 0 || worldClock.custom.length > 0;
}

/**
 * Read the settings from storage.
 * Side effects: replaces worldClock.
 */
function loadWorldClock() {
	try {
		worldClock = sanitizeWorldClock(JSON.parse(_GM_getValue('worldClock', 'null')));
	} catch (e) {
		worldClock = sanitizeWorldClock(null);
	}
}
// At load, as every feature reads its settings: onStorageReady runs only
// once async storage loads (Greasemonkey 4), never with sync storage
// (Tampermonkey), which would leave the defaults on every page
loadWorldClock();

/**
 * Replace the settings, save them, and redraw the row.
 * Side effects: replaces worldClock; writes storage; redraws the row.
 * @param {*} data - checked here; null for the defaults
 */
function replaceWorldClock(data) {
	worldClock = sanitizeWorldClock(data);
	_GM_setValue('worldClock', JSON.stringify(worldClock));
	drawWorldClock();
}

/**
 * Minutes a time zone is ahead of UTC at date: -240 for New York in summer.
 * @param {string} timeZone - IANA name
 * @param {Date} date
 * @returns {number}
 */
function timeZoneOffsetMinutes(timeZone, date) {
	const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
		timeZone, hourCycle: 'h23',
		year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric',
	}).formatToParts(date).map(part => [part.type, Number(part.value)]));
	const wallClock = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
	const minuteStart = Math.floor(date.getTime() / 60000) * 60000;
	return Math.round((wallClock - minuteStart) / 60000);
}

/**
 * An offset as the row shows it: UTC+0, UTC-4, UTC+5:30.
 * @param {number} minutes - from timeZoneOffsetMinutes
 * @returns {string}
 */
function formatUtcOffset(minutes) {
	const sign = minutes < 0 ? '-' : '+';
	const hours = Math.floor(Math.abs(minutes) / 60);
	const rest = Math.abs(minutes) % 60;
	return `UTC${sign}${hours}${rest ? ':' + String(rest).padStart(2, '0') : ''}`;
}

/**
 * A city's time at date, in the chosen clock: 07:00, or 7:00 AM.
 * @param {string} timeZone - IANA name
 * @param {Date} date
 * @param {boolean} hour24
 * @returns {string}
 */
function formatCityTime(timeZone, date, hour24) {
	return new Intl.DateTimeFormat('en-US', hour24
		? { timeZone, hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }
		: { timeZone, hour12: true, hour: 'numeric', minute: '2-digit' }).format(date);
}

/**
 * The row's text for each chosen city and each of the user's own at date:
 * UTC first, then west to east by their offsets at date.
 * @param {Date} date
 * @returns {{label: string, time: string}[]} time: with its offset, when shown
 */
function worldClockEntries(date) {
	const shown = [...WORLD_CLOCK_CITIES.filter(city => worldClock.cities.includes(city.id)), ...worldClock.custom]
		.map(city => ({ city, offset: timeZoneOffsetMinutes(city.timeZone, date) }));
	// UTC first, then west to east by today's offsets, so a user's own city
	// falls in among the others. Ties keep the list's order (a stable sort)
	// One test for UTC, so a user's own UTC city is first too
	const sortOffset = ({ city, offset }) => city.timeZone === 'UTC' ? -Infinity : offset;
	shown.sort((a, b) => sortOffset(a) - sortOffset(b));
	return shown.map(({ city, offset }) => {
		let time = formatCityTime(city.timeZone, date, worldClock.hour24);
		// UTC's own offset says nothing
		if (worldClock.showOffsets && city.timeZone !== 'UTC') time += ` (${formatUtcOffset(offset)})`;
		return { label: city.label, time };
	});
}

// The timer that turns the rows' minutes
let worldClockTimer = null;
// Set by boot: until then, as on an excluded page, nothing is drawn
let worldClockBooted = false;
const WORLD_CLOCK_ROW_CLASS = uiClass('world-clock');

/**
 * The cIRC headers on the page now.
 * @returns {Element[]}
 */
function circHeaders() {
	return Array.from(document.querySelectorAll(CIRC_HEADER_SELECTOR));
}

/**
 * Whether el is one of the rows this feature draws.
 * @param {Element|null} el
 * @returns {boolean}
 */
function isWorldClockRow(el) {
	return !!el?.classList.contains(WORLD_CLOCK_ROW_CLASS);
}

/**
 * Put a row under each cIRC header, or take them away: while the feature
 * is on and has a city to show. The site redraws the headers on
 * navigation and as cIRC moves in and out of the sidebar, so this runs on
 * every such change, and each minute.
 * Side effects: adds, fills or removes rows; starts or stops the timer.
 */
function drawWorldClock() {
	const headers = worldClockBooted && featureConfig.worldClock && hasWorldClockCities() ? circHeaders() : [];
	// A row whose header the site removed or moved, or every row when off
	document.querySelectorAll('.' + WORLD_CLOCK_ROW_CLASS).forEach(row => {
		if (!headers.includes(row.previousElementSibling)) row.remove();
	});
	if (!headers.length) {
		clearTimeout(worldClockTimer);
		worldClockTimer = null;
		return;
	}
	const entries = worldClockEntries(new Date());
	for (const header of headers) {
		let row = header.nextElementSibling;
		if (!isWorldClockRow(row)) {
			row = document.createElement('div');
			// The site's own bottom rule (Tailwind), as under its other headers
			row.className = `${WORLD_CLOCK_ROW_CLASS} border-b border-border`;
			row.setAttribute('role', 'group');
			row.setAttribute('aria-label', 'World clock');
			header.after(row);
		}
		fillWorldClockRow(row, entries);
	}
	scheduleWorldClockTick();
}

/**
 * Write the times into a row. No live region: a screen reader announcing
 * every minute would drown out the chat.
 * Side effects: replaces the row's contents.
 * @param {HTMLElement} row
 * @param {{label: string, time: string}[]} entries - from worldClockEntries
 */
function fillWorldClockRow(row, entries) {
	row.textContent = '';
	entries.forEach((entry, i) => {
		if (i) {
			const divider = document.createElement('span');
			divider.className = uiClass('world-clock-divider');
			divider.setAttribute('aria-hidden', 'true');
			divider.textContent = '|';
			row.append(divider);
		}
		const city = document.createElement('span');
		city.className = uiClass('world-clock-city');
		city.textContent = `${entry.label} ${entry.time}`;
		row.append(city);
	});
}

/**
 * Redraw at the start of the next minute, so the rows turn over with the
 * clock rather than up to a minute late.
 * Side effects: replaces the pending timer.
 */
function scheduleWorldClockTick() {
	clearTimeout(worldClockTimer);
	worldClockTimer = setTimeout(drawWorldClock, 60000 - (Date.now() % 60000));
}

/**
 * Let the rows be drawn, and keep one under each header as the site
 * redraws the page. Called once, by boot.
 * Side effects: observes the document for as long as the page lives.
 */
function watchCircHeaders() {
	worldClockBooted = true;
	new MutationObserver(() => {
		if (!featureConfig.worldClock || !hasWorldClockCities()) return;
		// Most changes are chat lines: only a header without its row, or a
		// row whose header went, needs a redraw
		const headers = circHeaders();
		const unplaced = headers.some(header => !isWorldClockRow(header.nextElementSibling));
		const stray = Array.from(document.querySelectorAll('.' + WORLD_CLOCK_ROW_CLASS)).some(row => !headers.includes(row.previousElementSibling));
		if (unplaced || stray) drawWorldClock();
	}).observe(document.documentElement, { childList: true, subtree: true });
	logDebug(WORLD_CLOCK_LOG_PREFIX + ' Watching for cIRC headers');
}

/**
 * The World Clock section of the settings tab: the clock, the offsets, a
 * toggle button per city, and the user's own cities.
 * Side effects: renders into body; every change saves and redraws the row.
 * @param {HTMLElement} body - the section body from registerSettingsSection
 */
function renderWorldClockSettings(body) {
	body.textContent = '';
	const form = document.createElement('div');
	body.append(form);
	createSettingsEngine({
		container: form,
		values: { hour24: worldClock.hour24, showOffsets: worldClock.showOffsets },
		schema: [{ type: 'section', label: 'Clock', noHr: true, fields: [
			{ key: 'hour24', type: 'toggle', label: '24-hour time', default: DEFAULT_WORLD_CLOCK.hour24 },
			{ key: 'showOffsets', type: 'toggle', label: 'Show each city\'s UTC offset, as (UTC-4)', default: DEFAULT_WORLD_CLOCK.showOffsets },
		] }],
		onChange: (key, value) => replaceWorldClock({ ...worldClock, [key]: value }),
	}).render();
	body.append(worldClockCityPicker(), customCityEditor());
}

/**
 * A toggle button for each city, in a fieldset its legend names. A chosen
 * one is pressed and filled: its text and fill swap light and dark, which
 * does not rest on telling hues apart.
 * Side effects: each button saves the list and redraws the row.
 * @returns {HTMLFieldSetElement}
 */
function worldClockCityPicker() {
	const fieldset = document.createElement('fieldset');
	fieldset.className = uiClass('world-clock-cities', 'chip-row');
	const legend = document.createElement('legend');
	legend.textContent = 'Cities';
	fieldset.append(legend);
	for (const city of WORLD_CLOCK_CITIES) {
		const button = document.createElement('button');
		button.type = 'button';
		button.className = uiClass('chip');
		button.dataset.city = city.id;
		button.textContent = city.label;
		const show = () => button.setAttribute('aria-pressed', String(worldClock.cities.includes(city.id)));
		show();
		button.addEventListener('click', () => {
			const cities = worldClock.cities.includes(city.id)
				? worldClock.cities.filter(id => id !== city.id)
				: [...worldClock.cities, city.id];
			replaceWorldClock({ ...worldClock, cities });
			show();
		});
		fieldset.append(button);
	}
	return fieldset;
}

/**
 * The user's own cities: a list with a remove button on each, and a name
 * and a time zone to add one by. The time zone field suggests every zone
 * the browser knows.
 * Side effects: adding or removing saves and redraws the row and the list.
 * @returns {HTMLFieldSetElement}
 */
function customCityEditor() {
	const fieldset = document.createElement('fieldset');
	fieldset.className = uiClass('world-clock-custom');
	const legend = document.createElement('legend');
	legend.textContent = 'Your cities';
	const list = document.createElement('div');

	const nameId = uiId('world-clock-name');
	const zoneId = uiId('world-clock-zone');
	const errorId = uiId('world-clock-error');
	const suggestionsId = uiId('world-clock-zones');
	const form = document.createElement('div');
	form.className = uiClass('world-clock-add');
	form.innerHTML = `
		<label for="${nameId}">Name</label>
		<input type="text" id="${nameId}" maxlength="${MAX_CITY_LABEL_LENGTH}" placeholder="Denver">
		<label for="${zoneId}">Time zone</label>
		<input type="text" id="${zoneId}" list="${suggestionsId}" placeholder="America/Denver" aria-describedby="${errorId}">
		<div class="${uiClass('world-clock-add-action')}">
			<button type="button" class="${uiClass('inline-btn')}">Add</button>
		</div>
		<datalist id="${suggestionsId}"></datalist>
		<div id="${errorId}" class="hint" role="status" aria-live="polite"></div>`;
	const nameInput = form.querySelector('#' + nameId);
	const zoneInput = form.querySelector('#' + zoneId);
	const error = form.querySelector('#' + errorId);
	form.querySelector('datalist').append(...availableTimeZones().map(zone => {
		const option = document.createElement('option');
		option.value = zone;
		return option;
	}));

	const drawList = () => {
		list.textContent = '';
		list.append(entryList(worldClock.custom.map(city => {
			const text = document.createElement('span');
			text.textContent = `${city.label} (${city.timeZone})`;
			const remove = iconButton(TRASH_ICON_SVG, `Remove ${city.label}`, () => {
				replaceWorldClock({ ...worldClock, custom: worldClock.custom.filter(other => customCityKey(other) !== customCityKey(city)) });
				redrawEntryList(list, drawList, customCityKey(city), nameInput);
			}, 'danger');
			remove.dataset.entryControl = 'remove';
			return { key: customCityKey(city), parts: [text, remove] };
		}), 'None yet. Add any city by its time zone.'));
	};

	/**
	 * Say why a city was not added, on the time zone field, and go back to it.
	 * The message is a status: focus is often on the field already, so moving
	 * it there announces nothing.
	 * Side effects: sets the message and aria-invalid; moves focus.
	 * @param {string} message
	 */
	const refuse = (message) => {
		error.textContent = message;
		zoneInput.setAttribute('aria-invalid', 'true');
		zoneInput.focus();
	};

	const add = () => {
		const timeZone = findTimeZone(zoneInput.value);
		if (!timeZone) return refuse('Pick a time zone from the suggestions, such as America/Denver.');
		if (worldClock.custom.length >= MAX_CUSTOM_CITIES) return refuse(`You can add up to ${MAX_CUSTOM_CITIES} cities. Remove one first.`);
		const city = { label: cleanCityLabel(nameInput.value) || timeZoneCityName(timeZone), timeZone };
		if (worldClock.custom.some(other => customCityKey(other) === customCityKey(city))) return refuse(`${city.label} is already on the list.`);
		replaceWorldClock({ ...worldClock, custom: [...worldClock.custom, city] });
		drawList();
		error.textContent = '';
		zoneInput.removeAttribute('aria-invalid');
		nameInput.value = '';
		zoneInput.value = '';
		nameInput.focus();
	};
	form.querySelector('button').addEventListener('click', add);
	for (const input of [nameInput, zoneInput]) {
		input.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				add();
			}
		});
	}

	drawList();
	fieldset.append(legend, list, form);
	return fieldset;
}

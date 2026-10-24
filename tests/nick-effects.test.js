/**
 * Nick effects tests (src/nick-effects/): which changes to cIRC's user
 * list count as a choom arriving, which effect plays, and what a backup
 * may store.
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join as joinPath } from 'path';
import { dom } from './setup.js';
import { signedIn, answerRequests } from './api-helpers.js';

const doc = dom.window.document;
const feature = () => FEATURES.find(f => f.key === 'nickEffects');
// The MutationObserver reports after the current task, the check runs a
// task later, and the effect after asking who is signed in
const tick = () => new Promise(resolve => dom.window.setTimeout(resolve, 0));
const settle = async () => {
	for (let i = 0; i < 4; i++) await tick();
};
// The page's clock. An hour on for each test, past the gap between effects
// and every 10-minute rule; a test moves it on itself to pass one
let clock = Date.now();
const overlays = () => doc.querySelectorAll('.atmo-effect');
const CHOOMS = ['jingles', 'pat', 'sam', 'rio', 'kai', 'lou', 'max', 'ivy', 'ada', 'bo', 'cy', 'dee', 'eve', 'fox', 'gus', 'hal', 'jo', 'kit', 'lee', 'mo', 'nia', 'oz', 'pia', 'rex', 'sid', 'tam', 'uma', 'vic', 'wes', 'xan', 'yan', 'zed', 'abe', 'bea', 'cal', 'dan', 'eli', 'fay', 'gil', 'hux', 'ida', 'jay', 'kim', 'uli', 'vee', 'wyn', 'lyn', 'ned', 'ola', 'pam', 'quy', 'aa1', 'aa2', 'aa3', 'aa4', 'ab1', 'ab2', 'ab3', 'ab4', 'ac1', 'ac2', 'ac3', 'ac4', 'ad1', 'ad2', 'ad3', 'ad4'];

/**
 * cIRC's user list on /chat, as the site draws it.
 * @param {string[]} usernames - who is on it
 * @returns {HTMLElement} the element holding the names
 */
function addOnlineList(usernames) {
	const sidebar = doc.createElement('div');
	sidebar.className = 'atmo-test-sidebar';
	sidebar.innerHTML = `<div class="text-xs text-fg-dim mb-3 uppercase tracking-wider flex-shrink-0"> Online (${usernames.length}) </div><div class="space-y-1"></div>`;
	doc.querySelector('#__nuxt').appendChild(sidebar);
	const list = sidebar.lastElementChild;
	usernames.forEach(name => join(list, name));
	return list;
}

/**
 * Put a name on the list, as the site does when someone joins.
 * @param {HTMLElement} list - from addOnlineList
 * @param {string} username
 * @returns {HTMLAnchorElement}
 */
function join(list, username) {
	const row = doc.createElement('div');
	row.innerHTML = `<a href="/${username}" class="text-sm text-fg block truncate">${username}</a>`;
	list.appendChild(row);
	return row.firstElementChild;
}

/**
 * Take a name off the list, as the site does when someone leaves.
 * @param {HTMLElement} list
 * @param {string} username
 */
function leave(list, username) {
	list.querySelector(`a[href="/${username}"]`).parentElement.remove();
}

beforeAll(() => {
	vi.spyOn(Date, 'now').mockImplementation(() => clock);
	// Best chooms, as arrivals play for them by default
	replaceChooms({ users: [...CHOOMS, 'acquaintance'], besties: CHOOMS });
	applySettings({ ...featureConfig, nickEffects: true });
	startFeatures();
	initUserMenu();
	initChooms();
});

beforeEach(() => {
	clock += 60 * 60 * 1000;
});

afterEach(() => {
	vi.unstubAllGlobals();
	doc.querySelectorAll('.atmo-test-sidebar, .atmo-test-log, .atmo-effect, .atmo-dialog-overlay, body > main').forEach(el => el.remove());
	feature().resetSettings(true);
	applySettings({ ...featureConfig, nickEffects: true });
});

/**
 * The site's settings page, with the section rendered.
 * @returns {HTMLElement} the section
 */
function openSection() {
	const html = readFileSync(joinPath(__dirname, 'shared', 'fixtures', 'settings-page.html'), 'utf8');
	const main = new dom.window.DOMParser().parseFromString(html, 'text/html').querySelector('main');
	doc.body.appendChild(doc.importNode(main, true));
	syncSettingsPage();
	return doc.querySelector('[data-atmo-settings-section="atmospheric-modulator-nick-effects"]');
}

describe('a choom arriving', () => {
	it('knows the chooms from the core\'s list', () => {
		expect(choomLevel('Jingles')).toBe(2);
		expect(choomLevel('acquaintance')).toBe(1);
		expect(choomLevel('stranger')).toBe(0);
	});

	it('plays for anyone at all while it plays for everyone', async () => {
		feature().importBackup({ playFor: 'everyone' }, true);
		const list = addOnlineList(['z0ylent']);
		await settle();
		join(list, 'passerby');
		await settle();
		expect(overlays()).toHaveLength(1);
	});

	it('waits between effects, whoever arrives', async () => {
		const list = addOnlineList(['z0ylent']);
		await settle();
		join(list, 'nia');
		await settle();
		clock += 4000;
		join(list, 'oz');
		await settle();
		expect(overlays()).toHaveLength(1);
		clock += 11 * 1000;
		join(list, 'pia');
		await settle();
		expect(overlays()).toHaveLength(2);
	});

	it('plays nothing for your own join, and leaves the gap for whoever is next', async () => {
		signedIn();
		const requests = answerRequests(() => ({ status: 200, body: { data: { username: 'Quinn' } } }));
		try {
			feature().importBackup({ playFor: 'everyone' }, true);
			const list = addOnlineList(['z0ylent']);
			await settle();
			// An arrival never asks the API who you are: the terms ban bots
			join(list, 'passerby2');
			for (let i = 0; i < 5; i++) await settle();
			expect([overlays().length, requests.length]).toEqual([1, 0]);

			// Nor does the settings page drawing the section: a click in it does,
			// and the answer is kept for later pages
			const section = openSection();
			for (let i = 0; i < 5; i++) await settle();
			expect(requests).toHaveLength(0);
			section.querySelector('.atmo-effect-presets').dispatchEvent(new dom.window.Event('pointerdown', { bubbles: true }));
			for (let i = 0; i < 5; i++) await settle();
			expect(requests.map(request => request.url)).toEqual(['https://api.cyberspace.online/v1/users/me']);
			doc.querySelector('body > main').remove();
			feature().onStorageReady(true);
			clock += 11 * 1000;
			join(list, 'quinn');
			await settle();
			expect(overlays()).toHaveLength(1);
			clock += 1000;
			join(list, 'sid');
			await settle();
			expect(overlays()).toHaveLength(2);
		} finally {
			_GM_setValue('nickEffectsOwnUsername', null);
			feature().onStorageReady(true);
			delete global.gmRequestHandler;
			delete global.indexedDB;
		}
	});


	/**
	 * Press Preview in the Nick Effects section of the settings tab.
	 */
	function pressPreview() {
		const html = readFileSync(joinPath(__dirname, 'shared', 'fixtures', 'settings-page.html'), 'utf8');
		const main = new dom.window.DOMParser().parseFromString(html, 'text/html').querySelector('main');
		doc.body.appendChild(doc.importNode(main, true));
		syncSettingsPage();
		doc.querySelector('[data-atmo-settings-section="atmospheric-modulator-nick-effects"] .atmo-effect-preview').click();
	}
	const overlayBox = () => {
		const { left, top, width, height } = overlays()[0].style;
		return { left, top, width, height };
	};
	// Where addChat's chat sits, as the overlay's style gives it
	const CHAT_BOX = { left: '100px', top: '50px', width: '300px', height: '400px' };

	/**
	 * cIRC's messages, on the page with a size, as in the sidebar.
	 */
	function addChat() {
		const scroller = doc.createElement('div');
		scroller.className = 'messages-scroller atmo-test-sidebar';
		scroller.getBoundingClientRect = () => ({ left: 100, top: 50, width: 300, height: 400, right: 400, bottom: 450 });
		doc.querySelector('#__nuxt').appendChild(scroller);
	}

	it('plays Preview in the chat, as an arrival would, with cIRC open in the sidebar', () => {
		addChat();
		pressPreview();
		expect(overlayBox()).toEqual(CHAT_BOX);
		// Over a dialog Preview is pressed in
		expect(overlays()[0].classList.contains('atmo-effect-over-dialogs')).toBe(true);
	});

	it('plays Preview over the whole window with no chat open', () => {
		pressPreview();
		expect(overlayBox()).toEqual({ left: '0px', top: '0px', width: `${dom.window.innerWidth}px`, height: `${dom.window.innerHeight}px` });
	});

	it('plays over cIRC\'s messages, not the whole window', async () => {
		addChat();
		const list = addOnlineList(['z0ylent']);
		await settle();
		join(list, 'rex');
		await settle();
		expect(overlayBox()).toEqual(CHAT_BOX);
		// Under any open dialog
		expect(overlays()[0].classList.contains('atmo-effect-over-dialogs')).toBe(false);
	});

	it('plays for a ★ choom only while it plays for every choom', async () => {
		const list = addOnlineList(['z0ylent']);
		await settle();
		join(list, 'acquaintance');
		await settle();
		expect(overlays()).toHaveLength(0);
		leave(list, 'acquaintance');
		await settle();

		feature().importBackup({ playFor: 'all' }, true);
		clock += 11 * 60 * 1000;
		join(list, 'acquaintance');
		await settle();
		expect(overlays()).toHaveLength(1);
	});

	it('plays for a choom who joins, but not for who was already there', async () => {
		const list = addOnlineList(['z0ylent', 'pat']);
		await settle();
		expect(overlays()).toHaveLength(0);

		join(list, 'stranger');
		await settle();
		expect(overlays()).toHaveLength(0);

		join(list, 'jingles');
		await settle();
		expect(overlays()).toHaveLength(1);
		expect(overlays()[0].getAttribute('aria-hidden')).toBe('true');
		expect(overlays()[0].children).toHaveLength(80);
	});

	it('plays once for a choom whose name flickers off the list and back', async () => {
		const list = addOnlineList(['z0ylent']);
		await settle();
		join(list, 'sam');
		await settle();
		leave(list, 'sam');
		await settle();
		join(list, 'sam');
		await settle();
		expect(overlays()).toHaveLength(1);
	});

	it('plays nothing for a choom who was there at first and flickers', async () => {
		const list = addOnlineList(['z0ylent', 'ada']);
		await settle();
		leave(list, 'ada');
		await settle();
		join(list, 'ada');
		await settle();
		expect(overlays()).toHaveLength(0);
	});

	it('plays again for a choom back after a real absence', async () => {
		const list = addOnlineList(['z0ylent', 'bo']);
		await settle();
		leave(list, 'bo');
		await settle();
		clock += 11 * 60 * 1000;
		join(list, 'bo');
		await settle();
		expect(overlays()).toHaveLength(1);
	});

	it('takes a list refilled all at once for a reload, not arrivals', async () => {
		const list = addOnlineList(['z0ylent']);
		await settle();
		['rio', 'kai', 'lou', 'max'].forEach(name => join(list, name));
		await settle();
		expect(overlays()).toHaveLength(0);
	});

	it('plays nothing while the switch is off', async () => {
		const list = addOnlineList(['z0ylent']);
		await settle();
		applySettings({ ...featureConfig, nickEffects: false });
		join(list, 'ivy');
		await settle();
		expect(overlays()).toHaveLength(0);
	});

	it('draws in the theme\'s colors while matching it, else in the effect\'s own', async () => {
		const themed = getThemeColors();
		const theme = new Set([themed.fg, themed.fgDim, themed.border].map(color => {
			const probe = doc.createElement('span');
			probe.style.color = color;
			return probe.style.color;
		}));
		feature().importBackup({ users: {
			ada: { colors: ['#123456'], amount: 20 },
			bo: { colors: ['#123456'], colorSource: 'custom', amount: 20 },
		} }, true);
		const list = addOnlineList(['z0ylent']);
		await settle();
		join(list, 'ada');
		await settle();
		const colors = () => new Set(Array.from(Array.from(overlays()).at(-1).children, glyph => glyph.style.color));
		expect([...colors()].every(color => theme.has(color))).toBe(true);
		clock += 11 * 1000;
		join(list, 'bo');
		await settle();
		expect(colors()).toEqual(new Set(['rgb(18, 52, 86)']));
	});

	it('draws their name\'s letters, as the page spells it, with Use their name on', async () => {
		feature().importBackup({ users: { ola: { useNickname: true, glyphs: '★', amount: 60 } } }, true);
		const list = addOnlineList(['z0ylent']);
		await settle();
		const link = join(list, 'Ola');
		link.setAttribute('data-atmo-user', 'Ola');
		await settle();
		const letters = Array.from(overlays()[0].children, glyph => glyph.textContent);
		expect(letters.every(letter => ['O', 'l', 'a'].includes(letter))).toBe(true);
		// One of each, picked at random: 60 picks miss one of three about never
		expect(new Set(letters)).toEqual(new Set(['O', 'l', 'a']));
	});

	it('draws in nick colors\' own colors for Nick colors theme, and the site theme\'s with nick colors off', async () => {
		const drawn = async (name) => {
			// One list on the page: the watcher keeps to the first it finds
			doc.querySelectorAll('.atmo-test-sidebar').forEach(el => el.remove());
			await settle();
			const list = addOnlineList(['z0ylent']);
			await settle();
			join(list, name);
			await settle();
			clock += 11 * 1000;
			return Array.from(Array.from(overlays()).at(-1).children, glyph => glyph.style.color);
		};
		feature().importBackup({ users: { ivy: { colorSource: 'nickTheme', amount: 30 }, lou: { colorSource: 'nickTheme', amount: 30 } } }, true);
		const themed = getThemeColors();
		const theme = new Set([themed.fg, themed.fgDim, themed.border].map(color => {
			const probe = doc.createElement('span');
			probe.style.color = color;
			return probe.style.color;
		}));
		// Many colors, not the theme's three
		const sampled = await drawn('ivy');
		expect(new Set(sampled).size).toBeGreaterThan(3);
		featureConfig.nickColors = false;
		try {
			expect((await drawn('lou')).every(color => theme.has(color))).toBe(true);
		} finally {
			featureConfig.nickColors = true;
		}
	});

	it('plays a choom\'s own effect, and the default for one saved as no effect', async () => {
		// null was "no effect", before Custom nick effect was a switch
		feature().importBackup({ users: { RIO: { glyphs: '☃', amount: 10 }, kai: null } }, true);
		expect(Object.keys(feature().exportBackup().users)).toEqual(['rio']);
		const list = addOnlineList(['z0ylent']);
		await settle();
		join(list, 'rio');
		await settle();
		const glyphs = Array.from(overlays()[0].children, glyph => glyph.textContent);
		expect(glyphs).toHaveLength(10);
		expect(new Set(glyphs)).toEqual(new Set(['☃']));
	});

	it('moves each glyph with the chosen easing, stagger and fade', async () => {
		const timings = [];
		const frames = [];
		dom.window.HTMLElement.prototype.animate = function (keyframes, timing) {
			frames.push(keyframes);
			timings.push(timing);
		};
		try {
			feature().importBackup({ users: { cy: { motion: 'fall', amount: 20, duration: 2, easing: 'overshoot', stagger: 0, fadeOut: true } } }, true);
			const list = addOnlineList(['z0ylent']);
			await settle();
			join(list, 'cy');
			await settle();
		} finally {
			delete dom.window.HTMLElement.prototype.animate;
		}
		expect(timings).toHaveLength(20);
		expect(new Set(timings.map(t => t.easing))).toEqual(new Set(['cubic-bezier(0.34, 1.56, 0.64, 1)']));
		// No stagger: every one starts at once, and ends by the effect's end
		expect(timings.every(t => t.delay === 0 && t.duration <= 2000 && t.duration >= 2000 * 0.55)).toBe(true);
		// But not all at the same moment
		expect(new Set(timings.map(t => t.delay + t.duration)).size).toBeGreaterThan(1);
		expect(frames.every(f => f.at(-1).opacity === 0)).toBe(true);
	});

	it('ends every glyph within the effect\'s duration, however spread out the starts', async () => {
		const timings = [];
		const frames = [];
		const animations = [];
		dom.window.HTMLElement.prototype.animate = function (keyframes, timing) {
			frames.push(keyframes);
			timings.push(timing);
			animations.push({});
			return animations.at(-1);
		};
		try {
			feature().importBackup({ users: { dee: { motion: 'burst', amount: 150, duration: 5, stagger: 80, spin: 720 } } }, true);
			const list = addOnlineList(['z0ylent']);
			await settle();
			join(list, 'dee');
			await settle();
		} finally {
			delete dom.window.HTMLElement.prototype.animate;
		}
		expect(timings).toHaveLength(150);
		expect(timings.some(t => t.delay > 0)).toBe(true);
		expect(timings.every(t => t.delay + t.duration <= 5000)).toBe(true);
		// The same transform functions in every frame, so a spin past 180°
		// turns the way it should
		const functions = (frame) => frame.transform.match(/[a-z]+(?=\()/g).join(' ');
		expect(frames.every(f => f.every(frame => functions(frame) === 'translate rotate scale'))).toBe(true);

		// Each goes as it finishes, not with the last
		animations[0].onfinish();
		expect(overlays()[0].children).toHaveLength(149);
	});

	it('gives each rocket one color, its sparks a little off it, and rockets colors of their own', async () => {
		const glyphs = [];
		dom.window.HTMLElement.prototype.animate = function (keyframes) {
			glyphs.push({ color: this.style.color, launch: keyframes[0].transform.match(/translate\(([-\d.]+)px/)[1] });
			return {};
		};
		try {
			feature().importBackup({ users: { ned: { motion: 'firework', rockets: 3, amount: 60, colorSource: 'custom', colors: ['#ff0000', '#00ff00', '#0000ff'] } } }, true);
			const list = addOnlineList(['z0ylent']);
			await settle();
			join(list, 'ned');
			await settle();
		} finally {
			delete dom.window.HTMLElement.prototype.animate;
		}
		expect(glyphs).toHaveLength(60);
		/**
		 * A color's hue, in degrees.
		 * @param {string} color - rgb(), as the page reads a style back
		 * @returns {number}
		 */
		const hue = (color) => {
			const [r, g, b] = color.match(/\d+(\.\d+)?/g).map(Number).map(c => c / 255);
			const max = Math.max(r, g, b);
			const d = max - Math.min(r, g, b);
			const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
			return (h * 60 + 360) % 360;
		};
		const apart = (a, b) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
		const byRocket = new Map();
		glyphs.forEach(({ color, launch }) => byRocket.set(launch, [...(byRocket.get(launch) ?? []), hue(color)]));
		expect(byRocket.size).toBe(3);
		const centers = [...byRocket.values()].map(hues => {
			const center = [0, 120, 240].reduce((best, base) => apart(hues[0], base) < apart(hues[0], best) ? base : best);
			// Every spark within the variation of its rocket's color
			expect(hues.every(h => apart(h, center) <= 10 + 1)).toBe(true);
			return center;
		});
		expect(new Set(centers).size).toBe(3);
	});

	it('keeps a see-through color see-through in sparks, and varies a short hex color', async () => {
		const colorsFor = async (name, effect, nameStyle) => {
			const seen = [];
			dom.window.HTMLElement.prototype.animate = function () {
				seen.push(this.style.color);
				return {};
			};
			try {
				feature().importBackup({ users: { [name]: { motion: 'firework', rockets: 1, amount: 20, ...effect } } }, true);
				doc.querySelectorAll('.atmo-test-sidebar').forEach(el => el.remove());
				await settle();
				const list = addOnlineList(['z0ylent']);
				await settle();
				const link = join(list, name);
				link.setAttribute('data-atmo-user', name);
				if (nameStyle) link.style.color = nameStyle;
				await settle();
			} finally {
				delete dom.window.HTMLElement.prototype.animate;
			}
			clock += 11 * 1000;
			return seen;
		};
		const clear = await colorsFor('pam', { colorSource: 'nick' }, 'rgba(255, 0, 0, 0.5)');
		expect(clear).toHaveLength(20);
		expect(clear.every(color => /^rgba\(.*, 0\.5\)$/.test(color))).toBe(true);
		const short = await colorsFor('quy', { colorSource: 'custom', colors: ['#f00'] });
		expect(new Set(short).size).toBeGreaterThan(1);
	});

	it('launches rockets in no set order along the edge, each within the stagger', async () => {
		const orders = new Set();
		for (let round = 0; round < 12; round++) {
			const frames = [];
			const timings = [];
			dom.window.HTMLElement.prototype.animate = function (keyframes, timing) {
				frames.push(keyframes);
				timings.push(timing);
				return {};
			};
			try {
				feature().importBackup({ users: { mo: { motion: 'firework', amount: 20, rockets: 4, duration: 4, stagger: 60 } } }, true);
				doc.querySelectorAll('.atmo-test-sidebar').forEach(el => el.remove());
				await settle();
				const list = addOnlineList(['z0ylent']);
				await settle();
				join(list, 'mo');
				await settle();
			} finally {
				delete dom.window.HTMLElement.prototype.animate;
			}
			// Each rocket's launch place and time, left to right
			const rockets = new Map();
			frames.forEach((f, i) => rockets.set(Number(f[0].transform.match(/translate\(([-\d.]+)px/)[1]), timings[i].delay));
			const delays = [...rockets.entries()].sort((a, b) => a[0] - b[0]).map(([, delay]) => delay);
			expect(delays).toHaveLength(4);
			expect(delays.every(delay => delay >= 0 && delay <= 0.6 * 4000)).toBe(true);
			orders.add(delays.map(delay => [...delays].sort((a, b) => a - b).indexOf(delay)).join());
			clock += 60 * 60 * 1000;
		}
		// Left to right every time would be one order
		expect(orders.size).toBeGreaterThan(1);
	});

	it('flies a spark out in an arc: fast then slowing, falling more and more', async () => {
		const frames = [];
		dom.window.HTMLElement.prototype.animate = function (keyframes) {
			frames.push(keyframes);
			return {};
		};
		try {
			feature().importBackup({ users: { lyn: { motion: 'firework', amount: 20, rockets: 1, drift: 0, spin: 0 } } }, true);
			const list = addOnlineList(['z0ylent']);
			await settle();
			join(list, 'lyn');
			await settle();
		} finally {
			delete dom.window.HTMLElement.prototype.animate;
		}
		expect(frames).toHaveLength(20);
		const at = (frame) => frame.transform.match(/translate\(([-\d.]+)px, ([-\d.]+)px\)/).slice(1).map(Number);
		for (const f of frames) {
			const arc = f.slice(1).map(at);
			// More than two legs, so it curves
			expect(arc.length).toBeGreaterThan(5);
			// Out fast, then slower: the first step is longer than one midway
			const step = (i) => Math.hypot(arc[i + 1][0] - arc[i][0], arc[i + 1][1] - arc[i][1]);
			expect(step(0)).toBeGreaterThan(step(5));
			// And by the end, gravity has it: the last step goes down
			expect(arc.at(-1)[1]).toBeGreaterThan(arc.at(-2)[1]);
		}
	});

	it('launches a firework\'s glyphs from the bottom, a rocket at a time, and ends them in time', async () => {
		const frames = [];
		const timings = [];
		dom.window.HTMLElement.prototype.animate = function (keyframes, timing) {
			frames.push(keyframes);
			timings.push(timing);
			return {};
		};
		try {
			feature().importBackup({ users: { uma: { motion: 'firework', rockets: 3, amount: 120, duration: 4, stagger: 50 } } }, true);
			const list = addOnlineList(['z0ylent']);
			await settle();
			join(list, 'uma');
			await settle();
		} finally {
			delete dom.window.HTMLElement.prototype.animate;
		}
		const start = (f) => f[0].transform.match(/translate\(([-\d.]+)px, ([-\d.]+)px\)/).slice(1).map(Number);
		// Three rockets: three places along the bottom, below it
		const launches = new Set(frames.map(f => start(f)[0]));
		expect(launches.size).toBe(3);
		expect(frames.every(f => start(f)[1] > dom.window.innerHeight)).toBe(true);
		// Each rocket's glyphs launch together, and burst at one moment
		expect(new Set(timings.map(t => t.delay)).size).toBe(3);
		// The arc starts, at the rocket's peak, at one moment for all of its glyphs
		const burstAt = (f, t) => Math.round(t.delay + f[1].offset * t.duration);
		const byRocket = new Map();
		frames.forEach((f, i) => byRocket.set(timings[i].delay, [...(byRocket.get(timings[i].delay) ?? []), burstAt(f, timings[i])]));
		expect([...byRocket.values()].every(bursts => new Set(bursts).size === 1)).toBe(true);
		// But each showers for its own time, within the duration
		expect(new Set(timings.map(t => t.delay + t.duration)).size).toBeGreaterThan(3);
		expect(timings.every(t => t.delay + t.duration <= 4000)).toBe(true);
		const functions = (frame) => frame.transform.match(/[a-z]+(?=\()/g).join(' ');
		expect(frames.every(f => f.every(frame => functions(frame) === 'translate rotate scale'))).toBe(true);
	});

	it('sends a fall with its gravity, and a firework up its launch direction', async () => {
		const frames = [];
		dom.window.HTMLElement.prototype.animate = function (keyframes) {
			frames.push(keyframes);
			return {};
		};
		try {
			feature().importBackup({ users: {
				vic: { motion: 'fall', gravity: 'right', amount: 10 },
				wes: { motion: 'firework', direction: 'down', amount: 10, rockets: 1 },
				xan: { motion: 'fall', gravity: 'up', amount: 10, size: 40 },
			} }, true);
			const list = addOnlineList(['z0ylent']);
			await settle();
			for (const name of ['vic', 'wes', 'xan']) {
				join(list, name);
				await settle();
				clock += 11 * 1000;
			}
		} finally {
			delete dom.window.HTMLElement.prototype.animate;
		}
		const point = (frame) => frame.transform.match(/translate\(([-\d.]+)px, ([-\d.]+)px\)/).slice(1).map(Number);
		const falls = frames.slice(0, 10);
		const rockets = frames.slice(10, 20);
		const rises = frames.slice(20);
		// Up: from below the bottom to wholly above the top, a 1.3-size glyph included
		expect(rises.every(f => point(f[0])[1] > dom.window.innerHeight && point(f.at(-1))[1] + 40 * 1.3 < 0)).toBe(true);
		// Right: in past the left edge, out past the right
		expect(falls.every(f => point(f[0])[0] < 0 && point(f.at(-1))[0] > dom.window.innerWidth)).toBe(true);
		// Down: launched from above the top, climbing down to burst
		expect(rockets.every(f => point(f[0])[1] < 0 && point(f[1])[1] > 0)).toBe(true);
	});

	describe('bubbles, rain, fountain and zoom', () => {
		/**
		 * Play one user's effect, and catch each glyph's animation.
		 * @param {string} name - a choom in CHOOMS
		 * @param {Object} effect - their own effect
		 * @returns {Promise<{frames: Object[][], timings: Object[]}>}
		 */
		async function playFor(name, effect) {
			const frames = [];
			const timings = [];
			dom.window.HTMLElement.prototype.animate = function (keyframes, timing) {
				frames.push(keyframes);
				timings.push(timing);
				return {};
			};
			try {
				feature().importBackup({ users: { [name]: { amount: 20, duration: 4, ...effect } } }, true);
				// One list on the page: the watcher keeps to the first it finds
				doc.querySelectorAll('.atmo-test-sidebar').forEach(el => el.remove());
				await settle();
				const list = addOnlineList(['z0ylent']);
				await settle();
				join(list, name);
				await settle();
			} finally {
				delete dom.window.HTMLElement.prototype.animate;
			}
			// Every glyph moved: a path that throws animates none, and every
			// check below would pass on none
			expect(frames).toHaveLength(effect.amount ?? 20);
			// Offsets rising from 0 to 1, as a browser's animate requires: the mock
			// takes any
			expect(frames.every(f => f.every((frame, i) => frame.offset === undefined
				|| (frame.offset >= 0 && frame.offset <= 1 && (i === 0 || frame.offset >= (f[i - 1].offset ?? 0)))))).toBe(true);
			// Every motion: within the duration, one list of functions in every frame
			const functions = (frame) => frame.transform.match(/[a-z]+(?=\()/g).join(' ');
			expect(timings.every(t => t.delay + t.duration <= 4000)).toBe(true);
			expect(frames.every(f => f.every(frame => functions(frame) === 'translate rotate scale'))).toBe(true);
			return { frames, timings };
		}
		const point = (frame) => frame.transform.match(/translate\(([-\d.]+)px, ([-\d.]+)px\)/).slice(1).map(Number);
		const scaleOf = (frame) => frame.transform.match(/scale\(([^)]+)\)/)[1];
		const height = () => dom.window.innerHeight;
		const width = () => dom.window.innerWidth;

		it('floats bubbles up from below, swaying, and pops them: bigger, and gone', async () => {
			const { frames } = await playFor('yan', { motion: 'bubbles', wobble: 40, drift: 0 });
			for (const f of frames) {
				expect(point(f[0])[1]).toBeGreaterThan(height());
				expect([scaleOf(f.at(-1)), f.at(-1).opacity]).toEqual(['1.6', 0]);
				const xs = f.map(frame => point(frame)[0]);
				expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0);
			}
		});

		it('rains down, and splashes on the bottom only with splash on', async () => {
			const splashing = (await playFor('zed', { motion: 'rain', splash: true })).frames;
			expect(splashing.every(f => point(f[0])[1] < 0 && scaleOf(f.at(-1)) === '2, 0.2' && f.at(-1).opacity === 0)).toBe(true);
			expect(splashing.every(f => point(f.at(-1))[1] < height())).toBe(true);
			clock += 11 * 1000;
			const falling = (await playFor('abe', { motion: 'rain', splash: false })).frames;
			expect(falling.every(f => f.length === 2 && point(f.at(-1))[1] > height())).toBe(true);
		});

		it('sprays a fountain from the bottom\'s middle, over a top, and back down past the bottom', async () => {
			const { frames } = await playFor('bea', { motion: 'fountain', spread: 20, drift: 0 });
			for (const f of frames) {
				const ys = f.map(frame => point(frame)[1]);
				expect(point(f[0])).toEqual([width() / 2, ys[0]]);
				expect(ys[0]).toBeGreaterThan(height());
				expect(Math.min(...ys)).toBeLessThan(height() * 0.7);
				expect(ys.at(-1)).toBeGreaterThan(height());
			}
		});

		it('sprays a fountain out to the angle Spread says', async () => {
			const { frames } = await playFor('dan', { motion: 'fountain', spread: 90, drift: 0, amount: 40 });
			// The first step's slope, a little over the launch's own as the curve bends
			const angles = frames.map(f => {
				const [x0, y0] = point(f[0]);
				const [x1, y1] = point(f[1]);
				return Math.abs(Math.atan2(x1 - x0, y0 - y1)) * 180 / Math.PI;
			});
			expect(Math.max(...angles)).toBeGreaterThan(30);
			expect(Math.max(...angles)).toBeLessThan(50);
		});

		it('fades a fountain while it can be seen, not past the bottom', async () => {
			const { frames } = await playFor('eli', { motion: 'fountain', fadeOut: true });
			for (const f of frames) {
				const gone = f.find(frame => frame.opacity === 0);
				expect(gone.offset).toBeLessThanOrEqual(0.8);
				// Gone by the time it is back past where it started: 2 sizes past the edge
				expect(point(gone)[1]).toBeLessThanOrEqual(height() + 14 * 2 + 1);
			}
		});

		it('pulls rain, bubbles and a fountain with gravity', async () => {
			const rain = (await playFor('fay', { motion: 'rain', gravity: 'left', splash: false })).frames;
			expect(rain.every(f => point(f[0])[0] > width() && point(f.at(-1))[0] < 0)).toBe(true);
			clock += 11 * 1000;
			const bubbles = (await playFor('gil', { motion: 'bubbles', gravity: 'up' })).frames;
			expect(bubbles.every(f => point(f[0])[1] < 0 && point(f.at(-1))[1] > 0)).toBe(true);
			clock += 11 * 1000;
			const fountain = (await playFor('hux', { motion: 'fountain', direction: 'down', gravity: 'up', drift: 0 })).frames;
			expect(fountain.every(f => point(f[0])[1] < 0 && Math.max(...f.map(frame => point(frame)[1])) > 0)).toBe(true);
		});

		it('climbs each rocket about as far as Rocket distance says', async () => {
			const { frames } = await playFor('kim', { motion: 'firework', rocketDistance: 80, rockets: 3 });
			// Launched up: the climb ends 70–90% of the way up the chat
			expect(frames.every(f => {
				const climbed = 1 - point(f[1])[1] / height();
				return climbed >= 0.7 - 1e-9 && climbed <= 0.9 + 1e-9;
			})).toBe(true);
		});

		it('drops a burst and showers a firework with gravity', async () => {
			const burst = (await playFor('ida', { motion: 'burst', gravity: 'up', drift: 0 })).frames;
			expect(burst.every(f => point(f.at(-1))[1] < point(f[1])[1])).toBe(true);
			clock += 11 * 1000;
			const firework = (await playFor('jay', { motion: 'firework', direction: 'up', gravity: 'left', drift: 0, rockets: 1 })).frames;
			// Gravity outpulls how far it flew out: past the peak, the way it pulls
			expect(firework.every(f => point(f.at(-1))[0] < point(f[1])[0])).toBe(true);
		});

		it('sprays a fountain its spray direction, as far as its spray distance, while gravity pulls its own way', async () => {
			// Sprayed right with gravity down: out of the left edge's middle, then down
			const sideways = (await playFor('uli', { motion: 'fountain', direction: 'right', gravity: 'down', drift: 0, spread: 10 })).frames;
			expect(sideways.every(f => {
				const [x0, y0] = point(f[0]);
				const [x1, y1] = point(f.at(-1));
				return x0 < 0 && Math.abs(y0 - height() / 2) < 1 && x1 > x0 && y1 > y0;
			})).toBe(true);
			clock += 11 * 1000;
			// Sprayed up against gravity: its highest point near its spray distance
			const far = (await playFor('vee', { motion: 'fountain', sprayDistance: 80, spread: 10, drift: 0 })).frames;
			const near = (clock += 11 * 1000, await playFor('wyn', { motion: 'fountain', sprayDistance: 20, spread: 10, drift: 0 })).frames;
			const highest = (frames) => Math.max(...frames.map(f => 1 - Math.min(...f.map(frame => point(frame)[1])) / height()));
			expect(highest(far)).toBeGreaterThan(0.6);
			expect(highest(near)).toBeLessThan(0.4);
		});

		it('takes every fountain drop out of the chat by the end, whichever way it sprays and gravity pulls', async () => {
			const ways = ['up', 'down', 'left', 'right'];
			const names = ['aa1', 'aa2', 'aa3', 'aa4', 'ab1', 'ab2', 'ab3', 'ab4', 'ac1', 'ac2', 'ac3', 'ac4', 'ad1', 'ad2', 'ad3', 'ad4'];
			const margin = 14 * 2;
			// Out of sight as the path reckons it: wholly past an edge
			const out = ([x, y]) => x <= -margin || y <= -margin || x >= width() + margin || y >= height() + margin;
			let i = 0;
			for (const direction of ways) {
				for (const gravity of ways) {
					const { frames } = await playFor(names[i++], { motion: 'fountain', direction, gravity, sprayDistance: 20, spread: 40, fadeOut: true });
					for (const f of frames) {
						// Gone by the end, never vanishing in sight
						expect([direction, gravity, out(point(f.at(-1)))]).toEqual([direction, gravity, true]);
						// Faded out before it left: the first frame out of sight is no sooner
						// than the first fully faded one, and some fading frame is in sight
						// It starts just past its edge: out of sight once more after it came in
						const came = f.findIndex(frame => !out(point(frame)));
						const left = f.findIndex((frame, at) => at > came && out(point(frame)));
						const faded = f.findIndex(frame => frame.opacity === 0);
						expect(faded).toBeLessThanOrEqual(left);
						expect(f.some(frame => frame.opacity > 0 && frame.opacity < 1 && !out(point(frame)))).toBe(true);
					}
					clock += 11 * 1000;
				}
			}
		});

		it('zooms out of the middle, small and unseen, to past the edges and big', async () => {
			const { frames } = await playFor('cal', { motion: 'zoom' });
			const reach = Math.hypot(width(), height()) / 2;
			for (const f of frames) {
				const [x0, y0] = point(f[0]);
				const [x1, y1] = point(f.at(-1));
				expect(Math.hypot(x0 - width() / 2, y0 - height() / 2)).toBeLessThan(reach * 0.2);
				expect(Math.hypot(x1 - width() / 2, y1 - height() / 2)).toBeGreaterThan(reach);
				expect([f[0].opacity, Number(scaleOf(f[0])) < Number(scaleOf(f.at(-1)))]).toEqual([0, true]);
			}
		});
	});

	it('outlines the name instead with reduced motion', async () => {
		vi.stubGlobal('matchMedia', query => ({ matches: query === '(prefers-reduced-motion: reduce)' }));
		dom.window.matchMedia = globalThis.matchMedia;
		const list = addOnlineList(['z0ylent']);
		await settle();
		const name = join(list, 'lou');
		await settle();
		delete dom.window.matchMedia;
		expect(overlays()).toHaveLength(0);
		expect(name.classList.contains('atmo-effect-highlight')).toBe(true);
	});
});

describe('a choom\'s join line in the chat', () => {

	/**
	 * A chat line, as cIRC draws one.
	 * @param {string} text
	 * @param {{at?: Date, from?: string, stamped?: boolean}} [opts] - at: its
	 *   local time stamp, default now; from: a sender, for a message someone
	 *   typed; stamped: false for a row without a time
	 * @returns {HTMLElement}
	 */
	function line(text, { at = new Date(clock), from = null, stamped = true } = {}) {
		const time = [at.getHours(), at.getMinutes(), at.getSeconds()].map(n => String(n).padStart(2, '0')).join(':');
		const row = doc.createElement('div');
		row.className = 'chat-message';
		const stamp = stamped ? `<div class="group/ts text-xs text-fg-dim whitespace-nowrap opacity-60 md:order-2 md:flex-shrink-0"><!----><!----><span class="">${time}</span></div>` : '';
		const sender = from ? `<a href="/${from}">${from}</a> ` : '';
		row.innerHTML = `<!----><div class="italic text-fg-dim flex flex-col md:flex-row md:items-start md:justify-between gap-0 md:gap-4 py-1 text-sm">${stamp}<div class="flex-1 min-w-0 md:order-1">${sender}<span class="opacity-60 whitespace-pre-line">${text}</span></div></div>`;
		return row;
	}

	/**
	 * cIRC's chat, as in the sidebar: no user list, only lines. Drawn with a
	 * line in it, then left to settle.
	 * @returns {Promise<HTMLElement>}
	 */
	async function addLog() {
		const log = doc.createElement('div');
		log.className = 'atmo-test-log';
		log.append(line('hello', { from: 'bob' }));
		doc.querySelector('#__nuxt').appendChild(log);
		await settle();
		clock += 5000;
		return log;
	}

	it('plays for a choom\'s join line as it comes in, and not for anyone else\'s', async () => {
		const log = await addLog();
		log.append(line('→ stranger joined'));
		await settle();
		expect(overlays()).toHaveLength(0);
		log.append(line('→ eve joined'));
		await settle();
		expect(overlays()).toHaveLength(1);
	});

	it('plays nothing for join lines in history as it loads', async () => {
		const log = await addLog();
		const history = doc.createDocumentFragment();
		for (let i = 0; i < 20; i++) history.append(line(`hello ${i}`, { from: 'bob' }));
		history.append(line('→ fox joined'));
		log.append(history);
		await settle();
		expect(overlays()).toHaveLength(0);
	});

	it('plays nothing for a recent join line in a room just opened, one line at a time', async () => {
		const log = doc.createElement('div');
		log.className = 'atmo-test-log';
		doc.querySelector('#__nuxt').appendChild(log);
		await settle();
		log.append(line('hi', { from: 'bob' }));
		await settle();
		log.append(line('→ fox joined', { at: new Date(clock - 60 * 1000) }));
		await settle();
		expect(overlays()).toHaveLength(0);
	});

	it('plays nothing for a recent join line when a room switch refills the same log', async () => {
		const log = await addLog();
		for (let i = 0; i < 5; i++) log.append(line(`old room ${i}`, { from: 'bob' }));
		await settle();
		clock += 60 * 1000;
		log.replaceChildren();
		await settle();
		log.append(line('hi', { from: 'bob' }));
		await settle();
		log.append(line('→ kit joined', { at: new Date(clock - 60 * 1000) }));
		await settle();
		expect(overlays()).toHaveLength(0);
	});

	it('plays nothing when a room switch swaps the rows one by one in one tick, as Vue does', async () => {
		const log = await addLog();
		for (let i = 0; i < 2; i++) log.append(line(`old room ${i}`, { from: 'bob' }));
		await settle();
		clock += 60 * 1000;
		// 3 rows, no more than MAX_TRIMMED_ROWS, so only the kept check can
		// catch it: each its own removal, then the refill
		Array.from(log.children).forEach(row => row.remove());
		log.append(line('hi', { from: 'bob' }), line('→ lee joined', { at: new Date(clock - 60 * 1000) }));
		await settle();
		expect(overlays()).toHaveLength(0);
	});

	it('plays nothing when one change takes more than a trim\'s worth of rows, though some stay', async () => {
		const log = await addLog();
		for (let i = 0; i < 5; i++) log.append(line(`old room ${i}`, { from: 'bob' }));
		await settle();
		clock += 60 * 1000;
		Array.from(log.children).slice(0, 4).forEach(row => row.remove());
		log.append(line('→ mo joined'));
		await settle();
		expect(overlays()).toHaveLength(0);
	});

	it('keeps playing in a live chat that trims its oldest line', async () => {
		const log = await addLog();
		log.append(line('more', { from: 'bob' }));
		await settle();
		log.firstElementChild.remove();
		log.append(line('→ kit joined'));
		await settle();
		expect(overlays()).toHaveLength(1);
	});

	it('plays in a chat that lists the newest line first, as cIRC does', async () => {
		const log = await addLog();
		log.prepend(line('→ fox joined'));
		await settle();
		expect(overlays()).toHaveLength(1);
	});

	it('plays nothing for a message someone typed to look like a join line', async () => {
		const log = await addLog();
		log.append(line('→ fox joined', { from: 'bob' }));
		await settle();
		expect(overlays()).toHaveLength(0);
	});

	it('plays nothing for a join line stamped long ago, even alone', async () => {
		const log = await addLog();
		log.append(line('→ hal joined', { at: new Date(clock - 127 * 60 * 1000) }));
		await settle();
		expect(overlays()).toHaveLength(0);
	});

	it('takes a line stamped just before midnight as now, just after it', async () => {
		// Five seconds before the next midnight, so the log has settled at 00:00:00
		const midnight = new Date(clock);
		midnight.setHours(24, 0, 0, 0);
		clock = midnight.getTime() - 5000;
		const log = await addLog();
		log.append(line('→ ivy joined', { at: new Date(clock - 40 * 1000) }));
		await settle();
		expect(overlays()).toHaveLength(1);
	});

	it('trusts a row without a time to the other checks', async () => {
		const log = await addLog();
		log.append(line('→ jo joined', { stamped: false }));
		await settle();
		expect(overlays()).toHaveLength(1);
	});

	it('plays once when the list and a join line both show the arrival', async () => {
		const list = addOnlineList(['z0ylent']);
		const log = await addLog();
		log.append(line('→ gus joined'));
		join(list, 'gus');
		await settle();
		expect(overlays()).toHaveLength(1);
	});
});

describe('a notification from a choom', () => {
	/**
	 * A toast, as the site pops one up.
	 * @param {string} username
	 * @param {{marked?: boolean}} [opts] - marked: as the name finder leaves it
	 * @returns {HTMLElement}
	 */
	function toast(username, { marked = true } = {}) {
		const el = doc.createElement('div');
		el.className = 'bg-bg border-2 toast-notification atmo-test-sidebar';
		const mark = marked ? ` data-atmo-user="${username}" data-atmo-mention=""` : '';
		el.innerHTML = `<div class="flex"><div><a href="/messages/0fe3e7679efd03c9" class="text-sm"><span class="font-bold"><span${mark}>@${username}</span>&nbsp;</span></a><span>sent you a C-Mail</span></div>`
			+ '<div><button title="Dismiss">Dismiss</button><button title="View">View</button></div></div>';
		doc.body.appendChild(el);
		return el;
	}

	it('plays the sender\'s effect over the whole window, chat open or not, not for anyone else', async () => {
		const chat = doc.createElement('div');
		chat.className = 'messages-scroller atmo-test-sidebar';
		chat.getBoundingClientRect = () => ({ left: 100, top: 50, width: 300, height: 400, right: 400, bottom: 450 });
		doc.querySelector('#__nuxt').appendChild(chat);
		toast('stranger');
		await settle();
		expect(overlays()).toHaveLength(0);
		toast('kai');
		await settle();
		expect(overlays()).toHaveLength(1);
		const { left, top, width, height } = overlays()[0].style;
		expect({ left, top, width, height }).toEqual({ left: '0px', top: '0px', width: `${dom.window.innerWidth}px`, height: `${dom.window.innerHeight}px` });
	});

	it('reads the sender from the @name where the finder does not mark names', async () => {
		// The finder skips a .sidebar, so only the @name can say who it is
		const sidebar = doc.createElement('div');
		sidebar.className = 'sidebar atmo-test-sidebar';
		doc.body.appendChild(sidebar);
		sidebar.appendChild(toast('lou', { marked: false }));
		await settle();
		expect(sidebar.querySelector('[data-atmo-user]')).toBeNull();
		expect(overlays()).toHaveLength(1);
	});

	it('plays once a minute for one sender, and not at all with its switch off', async () => {
		toast('max');
		await settle();
		clock += 20 * 1000;
		toast('max');
		await settle();
		expect(overlays()).toHaveLength(1);
		clock += 50 * 1000;
		toast('max');
		await settle();
		expect(overlays()).toHaveLength(2);

		feature().importBackup({ onNotify: false }, true);
		clock += 60 * 60 * 1000;
		toast('ivy');
		await settle();
		expect(overlays()).toHaveLength(2);
	});

	it('plays one toast once, however the page shuffles it', async () => {
		const el = toast('ada');
		await settle();
		clock += 2 * 60 * 1000;
		el.remove();
		doc.body.appendChild(el);
		await settle();
		expect(overlays()).toHaveLength(1);
	});
});

describe('the saved effects', () => {
	it('read the two color switches saved before Match colors to my', () => {
		feature().importBackup({ users: { a: { useNickColor: true, matchTheme: false }, b: { matchTheme: false }, c: { matchTheme: true }, d: {} } }, true);
		const { users } = feature().exportBackup();
		expect(['a', 'b', 'c', 'd'].map(key => users[key].colorSource)).toEqual(['nick', 'custom', 'theme', 'theme']);
		expect(users.a).not.toHaveProperty('matchTheme');
		expect(users.a).not.toHaveProperty('useNickColor');
	});

	it('keep Spin and Drift at 0 for the motions that do not use them', () => {
		feature().importBackup({ users: { r: { motion: 'rain', spin: 200, drift: 40 }, z: { motion: 'zoom', spin: 90, drift: 100 } } }, true);
		const { users } = feature().exportBackup();
		expect([users.r.spin, users.r.drift, users.z.spin, users.z.drift]).toEqual([0, 40, 90, 0]);
	});

	it('read what was saved before Gravity as its gravity, and give each motion its own launch', () => {
		feature().importBackup({ users: {
			a: { motion: 'rise', direction: 'down' },
			b: { motion: 'firework' },
			c: { motion: 'fall', direction: 'sideways' },
			d: { motion: 'fall', direction: 'left' },
			e: { motion: 'zoom', gravity: 'up', direction: 'left' },
		} }, true);
		const { users } = feature().exportBackup();
		expect(['a', 'b', 'c', 'd', 'e'].map(key => [users[key].motion, users[key].gravity, users[key].direction])).toEqual([
			['fall', 'up', 'down'],
			['firework', 'down', 'up'],
			['fall', 'down', 'down'],
			['fall', 'left', 'down'],
			// Neither setting is shown for zoom: one value each, as its preset has
			['zoom', 'down', 'down'],
		]);
	});

	it('keep saved presets with a name, unique, up to 30, and number one a built-in took', () => {
		const presets = [{ name: 'Snow', effect: {} }, { name: '__proto__', effect: { glyphs: 'p' } }, { name: 'a\nb', effect: {} },
			{ name: 'A B', effect: {} }, { name: '', effect: {} }, { name: 'none' }, { name: 'x'.repeat(31), effect: {} }, 'junk',
			...Array.from({ length: 40 }, (_, i) => ({ name: `p${i}`, effect: {} }))];
		feature().importBackup({ presets }, true);
		const names = feature().exportBackup().presets.map(preset => preset.name);
		expect(names.slice(0, 4)).toEqual(['Snow 2', '__proto__', 'a b', 'p0']);
		expect(names).toHaveLength(30);
		expect(Object.getPrototypeOf(feature().exportBackup().presets[0])).toBe(Object.prototype);

		// Numbered past a name saved after it, which keeps its own
		feature().importBackup({ presets: [{ name: 'Snow', effect: { glyphs: 'a' } }, { name: 'Snow 2', effect: { glyphs: 'b' } }] }, true);
		expect(feature().exportBackup().presets.map(({ name, effect }) => [name, effect.glyphs])).toEqual([['Snow 3', 'a'], ['Snow 2', 'b']]);
	});

	it('keep characters of a sane size, whatever a shared file holds', () => {
		const family = '👨\u200d👩\u200d👧\u200d👦';
		const zalgo = 'a' + '\u0301'.repeat(5000);
		feature().importBackup({ default: { glyphs: `★${zalgo}${family}` + '☆'.repeat(5_000_000) } }, true);
		const { glyphs } = feature().exportBackup().default;
		expect(glyphs.startsWith(`★${family}☆`)).toBe(true);
		expect(glyphs.length).toBeLessThan(100);
	});

	it('keep only hex colors, bounded numbers and real usernames', () => {
		const result = feature().importBackup({
			default: { glyphs: ' ★ \n☆ ', colors: ['#ff0000', 'url(https://example.com/x)', 'red', '#0f0'], motion: 'spiral', amount: 9999, size: 'big', duration: 60,
				easing: 'steps(1); background: url(x)', spin: -5, drift: 'far', stagger: 41 },
			users: { '__PROTO__': { glyphs: 'x' }, 'two words': { glyphs: 'x' }, ok: { glyphs: 'x' } },
		}, true);
		expect(result.success).toBe(true);
		const saved = feature().exportBackup();
		expect(saved.default).toEqual({ glyphs: '★☆', colors: ['#ff0000', '#0f0'], colorSource: 'theme', useNickname: false, motion: 'fall', direction: 'down', gravity: 'down', amount: 150, size: 14, duration: 5,
			easing: 'linear', spin: 0, drift: 60, stagger: 40, fadeOut: false, rockets: 4, rocketDistance: 50, sprayDistance: 50, wobble: 30, splash: true, spread: 40 });
		expect(Object.keys(saved.users)).toEqual(['ok']);
		expect(Object.getPrototypeOf(saved.users)).toBe(Object.prototype);
	});
});

describe('a choom\'s Nick Effect dialog', () => {
	/**
	 * Open the dialog from a name's menu.
	 * @param {string} username
	 */
	function openDialog(username) {
		const link = join(addOnlineList([]), username);
		link.setAttribute('data-atmo-user', username);
		link.dispatchEvent(new dom.window.Event('pointerdown', { bubbles: true }));
		link.dispatchEvent(new dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));
		Array.from(doc.querySelectorAll('[role^="menuitem"]')).find(item => item.textContent === 'Edit Effect').click();
		return doc.querySelector('.atmo-dialog');
	}
	const customSwitch = (dialog) => dialog.querySelector('[data-field-key="custom"] input[type="checkbox"]');
	/**
	 * Turn Custom nick effect on or off.
	 * @param {HTMLElement} dialog
	 * @param {boolean} on
	 */
	const choose = (dialog, on) => {
		if (customSwitch(dialog).checked !== on) customSwitch(dialog).click();
		expect(customSwitch(dialog).checked).toBe(on);
	};
	const save = () => doc.querySelector('.atmo-dialog-footer button.save').click();

	/**
	 * The menu's items for a name.
	 * @param {string} username
	 * @returns {string[]}
	 */
	function menuFor(username) {
		const link = join(addOnlineList([]), username);
		link.setAttribute('data-atmo-user', username);
		link.dispatchEvent(new dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));
		const items = Array.from(doc.querySelectorAll('[role^="menuitem"]'), item => item.textContent);
		doc.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		return items;
	}

	it('is in the menu for whoever it plays for', () => {
		expect(menuFor('stranger')).not.toContain('Edit Effect');
		feature().importBackup({ playFor: 'everyone' }, true);
		expect(menuFor('stranger')).toContain('Edit Effect');
	});

	it('will not save a 501st user, and says why', () => {
		const users = Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`user${i}`, { glyphs: 'x' }]));
		// Everyone, so the saved user0 has the menu item too
		feature().importBackup({ users, playFor: 'everyone' }, true);
		const alert = vi.spyOn(globalThis, 'alert').mockImplementation(() => {});
		const dialog = openDialog('pat');
		choose(dialog, true);
		save();
		expect(alert).toHaveBeenCalledWith(expect.stringContaining('500'));
		expect(doc.querySelector('.atmo-dialog')).not.toBeNull();
		expect(Object.hasOwn(feature().exportBackup().users, 'pat')).toBe(false);
		doc.querySelector('.atmo-dialog-footer button.cancel').click();
		// One already saved still changes, and turning one off makes room
		const saved = openDialog('user0');
		saved.querySelector('[data-effect-preset="Snow"]').click();
		save();
		expect(feature().exportBackup().users.user0.glyphs).toBe('❄❅❆•');
		choose(openDialog('user1'), false);
		save();
		choose(openDialog('pat'), true);
		save();
		expect(Object.hasOwn(feature().exportBackup().users, 'pat')).toBe(true);
		alert.mockRestore();
	});

	it('plays Preview over the dialog, not the chat behind it', () => {
		const dialog = openDialog('pat');
		choose(dialog, true);
		dialog.getBoundingClientRect = () => ({ left: 20, top: 30, width: 400, height: 500, right: 420, bottom: 530 });
		// One Preview, in the footer, shown only with their own effect
		expect(dialog.querySelectorAll('.atmo-effect-preview, .atmo-effect-actions')).toHaveLength(0);
		const preview = dialog.querySelector('.atmo-dialog-footer button.preview');
		expect(preview.hidden).toBe(false);
		// The effect as changed: a preset redraws the form, not the footer
		dialog.querySelector('[data-effect-preset="Snow"]').click();
		preview.click();
		const { left, top, width, height } = overlays()[0].style;
		expect({ left, top, width, height }).toEqual({ left: '20px', top: '30px', width: '400px', height: '500px' });
		expect(Array.from(overlays()[0].children).every(glyph => '❄❅❆•'.includes(glyph.textContent))).toBe(true);
	});

	it('picks the user\'s own presets in a choom\'s dialog too, and shows one saved there on the settings tab', () => {
		feature().importBackup({ presets: [{ name: 'Party', effect: { glyphs: '☃' } }] }, true);
		const dialog = openDialog('pat');
		choose(dialog, true);
		const named = (root, name) => Array.from(root.querySelectorAll('[data-effect-preset]')).find(button => button.dataset.effectPreset === name);
		named(dialog, 'Party').click();
		save();
		expect(feature().exportBackup().users.pat.glyphs).toBe('☃');

		// Saved from the dialog, over the settings tab: the tab shows it too
		const section = openSection();
		const again = openDialog('pat');
		// In the footer, beside Preview
		expect(again.querySelector('.atmo-effect-save-preset')).toBeNull();
		again.querySelector('.atmo-dialog-footer button.save-preset').click();
		const top = Array.from(doc.querySelectorAll('.atmo-dialog')).at(-1);
		top.querySelector('input[type="text"]').value = 'Snowman';
		top.querySelector('.atmo-dialog-footer button.save').click();
		expect(named(again, 'Snowman')).toBeDefined();
		const tab = doc.querySelector('[data-atmo-settings-section="atmospheric-modulator-nick-effects"]');
		expect(named(tab, 'Snowman')).toBeDefined();
		expect(doc.activeElement).toBe(named(again, 'Snowman'));
		expect(section.isConnected).toBe(false);

		// After a redraw, the footer's Save preset saves the form as it is
		// now, once: a preset clicked, then saved under a new name
		named(again, 'Party').click();
		again.querySelector('.atmo-dialog-footer button.save-preset').click();
		const asks = Array.from(doc.querySelectorAll('.atmo-dialog')).filter(el => el.textContent.includes('Preset name'));
		expect(asks).toHaveLength(1);
		asks[0].querySelector('input[type="text"]').value = 'Party 2';
		asks[0].querySelector('.atmo-dialog-footer button.save').click();
		expect(feature().exportBackup().presets.find(preset => preset.name === 'Party 2').effect.glyphs).toBe('☃');

		// Deleted there, focus goes to the footer's Save preset
		again.querySelector('[aria-label="Delete preset Party 2"]').click();
		Array.from(doc.querySelectorAll('.atmo-dialog')).at(-1).querySelector('.atmo-danger').click();
		expect(doc.activeElement).toBe(again.querySelector('.atmo-dialog-footer button.save-preset'));
	});

	it('saves a preset of their own, or back to the default', () => {
		let dialog = openDialog('Pat');
		const shown = () => ['.atmo-effect-own', '.atmo-dialog-footer button.preview', '.atmo-dialog-footer button.save-preset']
			.map(selector => !dialog.querySelector(selector).hidden);
		expect(customSwitch(dialog).checked).toBe(false);
		expect(doc.activeElement).toBe(customSwitch(dialog));
		expect(shown()).toEqual([false, false, false]);
		choose(dialog, true);
		expect(shown()).toEqual([true, true, true]);
		dialog.querySelector('[data-effect-preset="Snow"]').click();
		expect(doc.querySelector('.atmo-dialog [data-effect-preset="Snow"]').getAttribute('aria-pressed')).toBe('true');
		save();
		expect(feature().exportBackup().users.pat.glyphs).toBe('❄❅❆•');

		dialog = openDialog('pat');
		expect(customSwitch(dialog).checked).toBe(true);
		expect(shown()).toEqual([true, true, true]);
		choose(dialog, false);
		expect(shown()).toEqual([false, false, false]);
		save();
		expect(feature().exportBackup().users).toEqual({});
	});

});

describe('the Nick Effects settings section', () => {
	/**
	 * A setting's control in the form, by its field key, so relabeling a
	 * setting does not break the tests.
	 * @param {HTMLElement} section
	 * @param {string} key - the setting's key in the effect, as 'amount'
	 * @param {string} selector - the control, as 'select'
	 * @returns {HTMLElement|null} null when the setting or its control is missing
	 */
	const control = (section, key, selector) => section.querySelector(`[data-field-key="${key}"] ${selector}`);
	const slider = (section, key) => control(section, key, 'input[type="range"]');
	const toggleFor = (section, key) => control(section, key, 'input[type="checkbox"]');
	const hidden = (el) => el.closest('[style*="display: none"]') !== null;
	const input = (el, value) => {
		el.value = value;
		el.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
	};

	const selectFor = (section, key) => control(section, key, 'select');
	const choose = (select, value) => {
		select.value = value;
		select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
	};
	/**
	 * The color source select and the custom colors' rows and Add button. By
	 * field key and place, so a relabeled control is still found.
	 * @param {HTMLElement} section
	 * @returns {{source: HTMLSelectElement|null, rows: function(): HTMLElement[], add: HTMLButtonElement|null}}
	 */
	const colorControls = (section) => ({
		source: selectFor(section, 'colorSource'),
		rows: () => Array.from(section.querySelectorAll('.atmo-effect-colors li[data-entry-key]')),
		// The one button outside the rows
		add: control(section, 'colors', '.atmo-effect-colors > button'),
	});
	const savedColors = () => feature().exportBackup().default.colors;

	it('shows Gravity, Launch direction and Fade out for the motions they move', () => {
		const section = openSection();
		const shown = { fall: [1, 0, 1], burst: [1, 0, 1], firework: [1, 1, 1], bubbles: [1, 0, 0], rain: [1, 0, 0], fountain: [1, 1, 1], zoom: [0, 0, 1] };
		for (const [motion, [gravity, launch, fades]] of Object.entries(shown)) {
			choose(selectFor(section, 'motion'), motion);
			expect([motion, !hidden(selectFor(section, 'gravity')), !hidden(selectFor(section, 'direction')), !hidden(toggleFor(section, 'fadeOut'))])
				.toEqual([motion, !!gravity, !!launch, !!fades]);
		}
	});

	it('keeps every control showing what is saved, after a trip through a motion that hides it', () => {
		const section = openSection();
		section.querySelector('[data-effect-preset="Hearts"]').click();
		choose(selectFor(section, 'motion'), 'zoom');
		choose(selectFor(section, 'motion'), 'fall');
		expect([selectFor(section, 'gravity').value, feature().exportBackup().default.gravity]).toEqual(['down', 'down']);

		section.querySelector('[data-effect-preset="Snow"]').click();
		toggleFor(section, 'fadeOut').click();
		choose(selectFor(section, 'motion'), 'bubbles');
		choose(selectFor(section, 'motion'), 'fall');
		expect([toggleFor(section, 'fadeOut').checked, feature().exportBackup().default.fadeOut]).toEqual([false, false]);
	});

	it('finds the preset again after a motion\'s own setting was changed and the motion left', () => {
		const section = openSection();
		section.querySelector('[data-effect-preset="Confetti"]').click();
		choose(selectFor(section, 'motion'), 'firework');
		input(slider(section, 'rocketDistance'), '70');
		choose(selectFor(section, 'motion'), 'fall');
		expect(section.querySelector('[data-effect-preset="Confetti"]').getAttribute('aria-pressed')).toBe('true');
		// And the slider shows the value kept, should firework be chosen again
		choose(selectFor(section, 'motion'), 'firework');
		expect(slider(section, 'rocketDistance').value).toBe('50');
	});

	it('comes right after Nick Colors on the settings tab', () => {
		openSection();
		const keys = Array.from(doc.querySelectorAll('[data-atmo-settings-section]'), el => el.dataset.atmoSettingsSection);
		expect(keys).toContain('atmospheric-modulator-nick-colors');
		expect(keys.indexOf('atmospheric-modulator-nick-effects')).toBe(keys.indexOf('atmospheric-modulator-nick-colors') + 1);
	});

	it('sets the Effect heading apart from the preset buttons, as its style rule finds it', () => {
		const section = openSection();
		// The selector in _styles.scss: it must reach this heading, or the space above it is lost
		const heading = section.querySelector('.atmo-effect-form > .atmo-settings-section-wrapper:first-child > .atmo-settings-section > h4');
		expect(heading).not.toBeNull();
	});


	it('hides Custom characters while their name is used, and Preview draws a name\'s letters', () => {
		const section = openSection();
		const toggle = toggleFor(section, 'useNickname');
		const glyphs = control(section, 'glyphs', 'input');
		expect(hidden(glyphs)).toBe(false);
		toggle.click();
		expect(hidden(glyphs)).toBe(true);
		expect(feature().exportBackup().default.useNickname).toBe(true);
		section.querySelector('.atmo-effect-preview').click();
		// Your name's letters, or "choom"'s until Cyberspace says who you are:
		// one letter each, none of the Custom characters
		const letters = Array.from(overlays()[0].children, glyph => glyph.textContent);
		expect(letters.every(letter => /^[a-z0-9_-]$/i.test(letter))).toBe(true);
	});

	it('finds the preset again after its colors were changed under Custom and Custom left', () => {
		const section = openSection();
		section.querySelector('[data-effect-preset="Snow"]').click();
		const { source, rows } = colorControls(section);
		choose(source, 'custom');
		input(rows()[0].querySelector('input[type="color"]'), '#123456');
		choose(source, 'theme');
		expect(section.querySelector('[data-effect-preset="Snow"]').getAttribute('aria-pressed')).toBe('true');
	});

	it('finds the Bubbles preset again, whatever Fade out was left at', () => {
		const section = openSection();
		section.querySelector('[data-effect-preset="Bubbles"]').click();
		choose(selectFor(section, 'motion'), 'fall');
		toggleFor(section, 'fadeOut').click();
		choose(selectFor(section, 'motion'), 'bubbles');
		expect(section.querySelector('[data-effect-preset="Bubbles"]').getAttribute('aria-pressed')).toBe('true');
	});

	it('starts a firework launching up, whatever was chosen before', () => {
		const section = openSection();
		section.querySelector('[data-effect-preset="Fireworks"]').click();
		choose(selectFor(section, 'direction'), 'left');
		choose(selectFor(section, 'motion'), 'burst');
		choose(selectFor(section, 'motion'), 'firework');
		expect([selectFor(section, 'direction').value, feature().exportBackup().default.direction]).toEqual(['up', 'up']);
	});

	it('finds the preset again after a trip through another motion', () => {
		const section = openSection();
		section.querySelector('[data-effect-preset="Stars"]').click();
		choose(selectFor(section, 'motion'), 'firework');
		choose(selectFor(section, 'motion'), 'burst');
		expect(section.querySelector('[data-effect-preset="Stars"]').getAttribute('aria-pressed')).toBe('true');
	});

	it('shows each motion\'s own setting only for it, and finds every preset', () => {
		const section = openSection();
		// Spin and Drift: every motion but one each, which does not use it
		const allBut = (motion) => ['fall', 'burst', 'firework', 'bubbles', 'rain', 'fountain', 'zoom'].filter(other => other !== motion);
		const own = {
			spin: allBut('rain'),
			drift: allBut('zoom'),
			rockets: 'firework',
			rocketDistance: 'firework',
			wobble: 'bubbles',
			spread: 'fountain',
			sprayDistance: 'fountain',
		};
		const splash = () => toggleFor(section, 'splash');
		for (const preset of ['Confetti', 'Snow', 'Stars', 'Hearts', 'Fireworks', 'Bubbles', 'Rain', 'Fountain', 'Starfield', 'Matrix Rain']) {
			section.querySelector(`[data-effect-preset="${preset}"]`).click();
			expect(section.querySelector(`[data-effect-preset="${preset}"]`).getAttribute('aria-pressed')).toBe('true');
			const { motion } = feature().exportBackup().default;
			for (const [key, its] of Object.entries(own)) expect(hidden(slider(section, key))).toBe(![its].flat().includes(motion));
			expect(hidden(splash())).toBe(motion !== 'rain');
		}
	});

	it('saves typed colors and a slider without resetting the rest', () => {
		const section = openSection();
		section.querySelector('[data-effect-preset="Hearts"]').click();
		const { source, rows } = colorControls(section);
		const glyphs = control(section, 'glyphs', 'input');
		// Hidden while the theme's colors are used
		const colors = section.querySelector('.atmo-effect-colors');
		expect(hidden(colors)).toBe(true);
		choose(source, 'custom');
		expect(hidden(colors)).toBe(false);
		input(rows()[0].querySelector('input[type="color"]'), '#123456');
		rows()[1].querySelector('[data-entry-control="remove"]').click();
		const hex = rows()[1].querySelector('[data-entry-control="hex"]');
		hex.value = 'abc';
		hex.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
		input(slider(section, 'amount'), '20');
		// Rockets only for a firework
		expect(hidden(slider(section, 'rockets'))).toBe(true);
		expect(feature().exportBackup().default).toEqual({
			glyphs: '♥❤', colors: ['#123456', '#abc'], colorSource: 'custom', useNickname: false, motion: 'fall', direction: 'down', gravity: 'up', amount: 20, size: 20, duration: 4,
			easing: 'ease-in', spin: 30, drift: 60, stagger: 40, fadeOut: true, rockets: 4, rocketDistance: 50, sprayDistance: 50, wobble: 30, splash: true, spread: 40 });
		expect(glyphs.value).toBe('♥❤');
		// Changed from Hearts, so no preset shows pressed
		expect(section.querySelectorAll('[data-effect-preset][aria-pressed="true"]')).toHaveLength(0);
	});

	it('edits custom colors a row each, keeping focus where the user was', () => {
		const section = openSection();
		section.querySelector('[data-effect-preset="Hearts"]').click();
		const { source, rows, add } = colorControls(section);
		choose(source, 'custom');
		const rowControl = (row, name) => rows()[row].querySelector(`[data-entry-control="${name}"]`);
		const typeHex = (row, text) => {
			rowControl(row, 'hex').value = text;
			rowControl(row, 'hex').dispatchEvent(new dom.window.Event('change', { bubbles: true }));
		};
		expect(rows().map((_, i) => rowControl(i, 'hex').value)).toEqual(['#ff4d8d', '#ff8fb8', '#ff2d55']);

		// A pasted code, with or without its #, is kept and shown in the
		// picker. The row stays, so a click or Tab leaving the field lands
		const field = rowControl(1, 'hex');
		typeHex(1, ' ABC ');
		expect(savedColors()).toEqual(['#ff4d8d', '#abc', '#ff2d55']);
		expect([rowControl(1, 'picker').value, rowControl(1, 'hex')]).toEqual(['#aabbcc', field]);
		// Anything else goes back to the color it was, and says why
		const status = section.querySelector('.atmo-effect-colors [role="status"]');
		typeHex(2, 'red');
		expect([rowControl(2, 'hex').value, savedColors()[2]]).toEqual(['#ff2d55', '#ff2d55']);
		expect(status.textContent).toContain('"red" is not a hex code');
		typeHex(2, ' #ff4d4d ');
		expect([savedColors()[2], status.textContent]).toEqual(['#ff4d4d', '']);

		// Removed, focus goes to the remove button that takes its place.
		// Focused first, as a click or Enter on it leaves it
		const press = (button) => {
			button.focus();
			button.click();
		};
		press(rowControl(0, 'remove'));
		expect(savedColors()).toEqual(['#abc', '#ff4d4d']);
		expect(doc.activeElement).toBe(rowControl(0, 'remove'));
		// Added, a copy of the last, with its picker focused
		press(add);
		expect(savedColors()).toEqual(['#abc', '#ff4d4d', '#ff4d4d']);
		expect(doc.activeElement).toBe(rowControl(2, 'picker'));

		while (savedColors().length < 12) press(add);
		expect(add.disabled).toBe(true);
		while (rows().length) press(rowControl(rows().length - 1, 'remove'));
		expect([savedColors(), add.disabled, doc.activeElement]).toEqual([[], false, add]);
	});
	// The dialog on top: Save Preset, or the confirm over it
	const topDialog = () => Array.from(doc.querySelectorAll('.atmo-dialog')).at(-1);
	const footerButton = (label) => Array.from(topDialog().querySelectorAll('.atmo-dialog-footer button')).find(button => button.textContent.trim() === label);
	/**
	 * Save the form as a preset, through Save Preset.
	 * @param {HTMLElement} section
	 * @param {string} name - typed in the name field
	 * @returns {string} what the name field offered, before typing
	 */
	const savePreset = (section, name) => {
		section.querySelector('.atmo-effect-save-preset').click();
		const field = topDialog().querySelector('input[type="text"]');
		const offered = field.value;
		field.value = name;
		footerButton('SAVE').click();
		return offered;
	};
	const presetButton = (section, name) => Array.from(section.querySelectorAll('[data-effect-preset]')).find(button => button.dataset.effectPreset === name);

	it('saves the form as a preset of the user\'s own, then replaces it when saved again', () => {
		let section = openSection();
		section.querySelector('[data-effect-preset="Snow"]').click();
		input(slider(section, 'amount'), '20');
		expect(savePreset(section, '  Party   time ')).toBe('');
		expect(feature().exportBackup().presets).toEqual([{ name: 'Party time', effect: { ...feature().exportBackup().default } }]);
		expect(presetButton(section, 'Party time').getAttribute('aria-pressed')).toBe('true');
		expect(doc.activeElement).toBe(presetButton(section, 'Party time'));

		// Changed and saved again: the name is offered, and replacing asks first
		input(slider(section, 'amount'), '30');
		expect(savePreset(section, 'party TIME')).toBe('Party time');
		expect(topDialog().textContent).toContain('Replace the preset Party time');
		footerButton('REPLACE').click();
		const { presets } = feature().exportBackup();
		expect([presets.length, presets[0].name, presets[0].effect.amount]).toEqual([1, 'party TIME', 30]);

		// Picked, it fills in the form like a built-in one
		presetButton(section, 'Snow').click();
		presetButton(section, 'party TIME').click();
		expect(feature().exportBackup().default.amount).toBe(30);
	});

	it('says why a name will not do, and keeps the dialog open', () => {
		const section = openSection();
		for (const [name, why] of [['', 'Type a name'], ['snow', 'built-in preset'], ['x'.repeat(31), '30 characters']]) {
			savePreset(section, name);
			expect(topDialog().querySelector('[role="status"]').textContent).toContain(why);
			footerButton('CANCEL').click();
		}
		expect(feature().exportBackup().presets).toEqual([]);

		// A 31st is refused; one of the 30 can still be replaced
		feature().importBackup({ presets: Array.from({ length: 30 }, (_, i) => ({ name: `p${i}`, effect: {} })) }, true);
		const full = doc.querySelector('[data-atmo-settings-section="atmospheric-modulator-nick-effects"]');
		savePreset(full, 'one more');
		expect(topDialog().querySelector('[role="status"]').textContent).toContain('up to 30');
		expect(topDialog().querySelector('input[type="text"]').getAttribute('aria-invalid')).toBe('true');
		footerButton('CANCEL').click();
		savePreset(full, 'p3');
		footerButton('REPLACE').click();
		expect(feature().exportBackup().presets).toHaveLength(30);
	});

	it('deletes a preset after asking, and puts focus on Save preset', () => {
		const section = openSection();
		savePreset(section, 'Party');
		section.querySelector('[aria-label="Delete preset Party"]').click();
		footerButton('DELETE').click();
		expect([feature().exportBackup().presets, presetButton(section, 'Party')]).toEqual([[], undefined]);
		expect(doc.activeElement).toBe(section.querySelector('.atmo-effect-save-preset'));
	});
});

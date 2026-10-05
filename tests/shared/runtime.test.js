/**
 * Runtime helper tests: url-match.js, menu-command.js and long-press.js,
 * evaluated the way a bundle concatenates them.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { JSDOM } from 'jsdom';

const source = (name) => readFileSync(join(__dirname, '..', '..', 'src', 'shared', name), 'utf8');

/**
 * Evaluate shared source files against a JSDOM window.
 * @param {string[]} files
 * @param {string} exportsExpr - an object expression of what to return
 * @param {Window} window - injected as window, and its document as document
 * @param {object} [globals] - extra names to inject (GM_registerMenuCommand, GM)
 * @returns {object}
 */
function load(files, exportsExpr, window, globals = {}) {
	const names = ['window', 'document', ...Object.keys(globals)];
	const factory = new Function(...names,
		files.map(source).join('\n\n') + `\nreturn ${exportsExpr};`);
	return factory(window, window.document, ...Object.values(globals));
}

describe('isPathMatch / isHostMatch', () => {
	const at = (url) => load(['url-match.js'], '{ isPathMatch, isHostMatch }', new JSDOM('', { url }).window);

	it('matches whole path segments only', () => {
		const paths = ['/terminal', '/pages/'];
		expect(at('https://cyberspace.online/').isPathMatch(paths), 'root').toBe(false);
		expect(at('https://cyberspace.online/terminal').isPathMatch(paths)).toBe(true);
		expect(at('https://cyberspace.online/terminal/room-1').isPathMatch(paths)).toBe(true);
		expect(at('https://cyberspace.online/terminal/').isPathMatch(paths), 'trailing slash').toBe(true);
		expect(at('https://cyberspace.online/pages').isPathMatch(paths), 'pattern trailing slash').toBe(true);
		expect(at('https://cyberspace.online/terminal2').isPathMatch(paths)).toBe(false);
	});

	it('matches hosts and their subdomains only', () => {
		const hosts = ['page.cyberspace.online'];
		expect(at('https://page.cyberspace.online/someuser').isHostMatch(hosts)).toBe(true);
		expect(at('https://x.page.cyberspace.online/').isHostMatch(hosts)).toBe(true);
		expect(at('https://mypage.cyberspace.online/').isHostMatch(hosts)).toBe(false);
		expect(at('https://PAGE.cyberspace.online/').isHostMatch(['Page.Cyberspace.Online'])).toBe(true);
	});

	it('matches nothing for an empty list or an empty pattern', () => {
		const m = at('https://cyberspace.online/x');
		expect(m.isPathMatch([])).toBe(false);
		expect(m.isPathMatch(['/'])).toBe(false);
		expect(m.isHostMatch([''])).toBe(false);
	});
});

describe('registerMenuCommand', () => {
	const window = new JSDOM('').window;

	it('prefers Tampermonkey GM_registerMenuCommand', () => {
		const tm = () => {};
		const { registerMenuCommand } = load(['menu-command.js'], '{ registerMenuCommand }', window,
			{ GM_registerMenuCommand: tm, GM: { registerMenuCommand: () => {} } });
		expect(registerMenuCommand).toBe(tm);
	});

	it('falls back to Greasemonkey 4 GM.registerMenuCommand', () => {
		const gm = () => {};
		const { registerMenuCommand } = load(['menu-command.js'], '{ registerMenuCommand }', window,
			{ GM_registerMenuCommand: undefined, GM: { registerMenuCommand: gm } });
		expect(registerMenuCommand).toBe(gm);
	});

	it('is null when the manager provides neither', () => {
		const { registerMenuCommand } = load(['menu-command.js'], '{ registerMenuCommand }', window,
			{ GM_registerMenuCommand: undefined, GM: undefined });
		expect(registerMenuCommand).toBeNull();
	});
});

describe('attachLongPress', () => {
	let window;
	let target;
	let calls;

	const touch = (type, x = 0, y = 0, count = 1) => {
		const e = new window.Event(type, { bubbles: true });
		e.touches = Array.from({ length: count }, () => ({ clientX: x, clientY: y }));
		target.dispatchEvent(e);
	};

	beforeEach(() => {
		vi.useFakeTimers();
		window = new JSDOM('<!DOCTYPE html><body><span id="t"></span><span id="other"></span></body>').window;
		target = window.document.getElementById('t');
		calls = [];
		const { attachLongPress } = load(['long-press.js'], '{ attachLongPress }', window);
		attachLongPress({
			findTarget: (e) => (e.target.id === 't' ? e.target : null),
			getDuration: () => 500,
			onPress: (el) => calls.push(['press', el.id]),
			onHold: (el) => calls.push(['hold', el.id]),
			onRelease: (el, held) => calls.push(['release', el.id, held]),
		});
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('holds after the duration and releases with held = true', () => {
		touch('touchstart');
		vi.advanceTimersByTime(499);
		expect(calls).toEqual([['press', 't']]);
		vi.advanceTimersByTime(1);
		expect(calls).toEqual([['press', 't'], ['hold', 't']]);
		touch('touchend', 0, 0, 0);
		expect(calls.at(-1)).toEqual(['release', 't', true]);
	});

	it('releases with held = false when lifted early, and never holds', () => {
		touch('touchstart');
		vi.advanceTimersByTime(200);
		touch('touchend', 0, 0, 0);
		vi.advanceTimersByTime(1000);
		expect(calls).toEqual([['press', 't'], ['release', 't', false]]);
	});

	it('cancels a pending hold when the finger moves past the threshold', () => {
		touch('touchstart', 0, 0);
		touch('touchmove', 5, 5);
		expect(calls.at(-1)).toEqual(['press', 't']);
		touch('touchmove', 0, 11);
		vi.advanceTimersByTime(1000);
		expect(calls).toEqual([['press', 't'], ['release', 't', false]]);
	});

	it('ignores movement once held', () => {
		touch('touchstart', 0, 0);
		vi.advanceTimersByTime(500);
		touch('touchmove', 100, 100);
		expect(calls.at(-1)).toEqual(['hold', 't']);
	});

	it('cancels a pending hold when a second finger lands', () => {
		touch('touchstart');
		touch('touchstart', 0, 0, 2);
		vi.advanceTimersByTime(1000);
		expect(calls).toEqual([['press', 't'], ['release', 't', false]]);
	});

	it('keeps a completed hold through a pinch until the last finger lifts', () => {
		touch('touchstart');
		vi.advanceTimersByTime(500);
		touch('touchstart', 0, 0, 2);
		expect(calls.at(-1)).toEqual(['hold', 't']);
		touch('touchend', 0, 0, 1);
		expect(calls.at(-1), 'one finger still down').toEqual(['hold', 't']);
		touch('touchend', 0, 0, 0);
		expect(calls.at(-1)).toEqual(['release', 't', true]);
	});

	it('ignores multi-touch and touches findTarget rejects', () => {
		touch('touchstart', 0, 0, 2);
		target = window.document.getElementById('other');
		touch('touchstart');
		vi.advanceTimersByTime(1000);
		expect(calls).toEqual([]);
	});

	it('releases on touchcancel', () => {
		touch('touchstart');
		touch('touchcancel');
		expect(calls).toEqual([['press', 't'], ['release', 't', false]]);
	});
});

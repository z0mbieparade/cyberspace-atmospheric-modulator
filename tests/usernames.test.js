/**
 * Username finder tests (src/shared/usernames.js): it runs for nick notes
 * alone, with nick colors off, so notes and the user menu do not need colors;
 * and a feature that starts watching late still hears about every name.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { dom } from './setup.js';

const doc = dom.window.document;
const feature = (key) => FEATURES.find(f => f.key === key);
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

beforeAll(() => {
	// Nick notes on, nick colors off
	featureConfig.nickColors = false;
	featureConfig.nickNotes = true;
	// As init.js does
	skipUsernamesMatching(standaloneNickColorsSelector());
	startFeatures();
	initUserMenu();
});

describe('the username finder', () => {
	it('marks names for nick notes alone, without coloring them', async () => {
		expect(feature('nickColors').booted).toBe(false);
		expect(feature('nickNotes').booted).toBe(true);
		doc.body.innerHTML = '<div class="chat-main-content"><a href="/alice">alice</a> said hi to @bob</div>';
		await settle();

		const link = doc.querySelector('a');
		expect(link.getAttribute('data-atmo-user')).toBe('alice');
		expect(link.style.color).toBe('');
		const mention = doc.querySelector('[data-atmo-mention]');
		expect(mention.getAttribute('data-atmo-user')).toBe('bob');
		expect(mention.textContent).toBe('@bob');
	});

	it('opens the user menu on a name, with no Color item while nick colors is off', async () => {
		doc.body.innerHTML = '<div class="chat-main-content"><a href="/alice">alice</a></div>';
		await settle();
		const link = doc.querySelector('a');
		link.dispatchEvent(new dom.window.Event('pointerdown', { bubbles: true }));
		const event = new dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 });
		link.dispatchEvent(event);
		expect(event.defaultPrevented).toBe(true);
		const items = Array.from(doc.querySelectorAll('[role="menuitem"]'), item => item.textContent);
		expect(items).toContain('Notes');
		expect(items.length).toBe(3);
		closeMenu();
	});

	it('tells a feature that starts watching late about the names already marked', async () => {
		doc.body.innerHTML = '<div class="chat-main-content"><a href="/carol">carol</a></div>';
		await settle();
		const heard = [];
		watchUsernames(found => heard.push(...found.map(usernameOf)));
		expect(heard).toContain('carol');
	});

	it('finds a name again after the site reused its link for someone else', async () => {
		doc.body.innerHTML = '<div class="chat-main-content"><a href="/frank">frank</a></div>';
		await settle();
		const link = doc.querySelector('a');
		// In place: an attribute and text change adds no nodes, so the mark goes stale
		link.setAttribute('href', '/grace');
		link.textContent = 'grace';
		await settle();
		expect(usernameOf(link)).toBe('frank');

		rescanUsernames();
		expect(usernameOf(link)).toBe('grace');
	});

	it('leaves a name the separate Nick Colors userscript colored to it', async () => {
		doc.body.innerHTML = '<div class="chat-main-content"><a href="/dave" data-nick-colored="true">dave</a> @erin <span data-mention-colored="true">@erin</span></div>';
		await settle();
		expect(doc.querySelector('a').hasAttribute('data-atmo-user')).toBe(false);
		expect(doc.querySelectorAll('[data-atmo-mention]').length).toBe(1);
	});
});

/**
 * User menu tests (src/user-menu.js, src/shared/ui-menu.js) and nick notes
 * (src/nick-notes/): right-click or long-press a name for the menu, its
 * keyboard behavior, and notes, copied from nick colors' storage once.
 */

import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { dom } from './setup.js';

const doc = dom.window.document;
const stored = (key) => JSON.parse(localStorage.getItem('atmosphericModulator_' + key) || 'null');
const feature = (key) => FEATURES.find(f => f.key === key);
const menu = () => doc.querySelector('[role="menu"]');
const menuItems = () => Array.from(doc.querySelectorAll('[role="menuitem"]'));
const key = (k) => doc.activeElement.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

/**
 * A name nick colors has colored.
 * @param {string} username
 * @returns {HTMLAnchorElement}
 */
function addName(username) {
	const link = doc.createElement('a');
	link.href = '/' + username;
	link.textContent = username;
	link.setAttribute('data-atmo-user', username);
	doc.body.appendChild(link);
	return link;
}

/**
 * Right-click an element, as the mouse does, or as the menu key does.
 * @param {Element} el
 * @param {{clientX?: number, clientY?: number}} [at]
 * @param {{keyboard?: boolean}} [how] - keyboard: a key was pressed last, not a pointer
 * @returns {MouseEvent} the event, to check whether it was cancelled
 */
function rightClick(el, at = { clientX: 40, clientY: 50 }, { keyboard = false } = {}) {
	if (keyboard) el.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true }));
	else el.dispatchEvent(new dom.window.Event('pointerdown', { bubbles: true }));
	const event = new dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, ...at });
	el.dispatchEvent(event);
	return event;
}

beforeAll(() => {
	// As the core does once it has booted: nick colors marks the names, nick
	// notes adds its item, and the menu listens
	localStorage.removeItem('atmosphericModulator_nickNotes');
	startFeatures();
	initUserMenu();
});

afterEach(() => {
	vi.useRealTimers();
	closeMenu();
	doc.querySelectorAll('.atmo-dialog-overlay, a').forEach(el => el.remove());
	localStorage.removeItem('atmosphericModulator_customNickColors');
	feature('nickNotes').importBackup({}, true);
});

describe('the user menu', () => {
	it('opens on a right-clicked name, instead of the browser\'s menu', () => {
		const event = rightClick(addName('alice'));
		expect(event.defaultPrevented).toBe(true);
		expect(menu().getAttribute('aria-label')).toBe('@alice');
		expect(menuItems().map(item => item.textContent)).toEqual(['Color', 'Notes', 'Poke', 'Profile']);
		// No item looks picked until the pointer or an arrow picks one
		expect(doc.activeElement).toBe(menu());
	});

	it('makes the item under the pointer the current one', () => {
		rightClick(addName('alice'));
		const notes = menuItems().find(item => item.textContent === 'Notes');
		notes.dispatchEvent(new dom.window.MouseEvent('mouseenter'));
		expect(doc.activeElement).toBe(notes);
		key('ArrowDown');
		expect(doc.activeElement.textContent).toBe('Poke');
	});

	it('leaves out Profile and Poke on that user\'s profile, but not on their posts', () => {
		dom.reconfigure({ url: 'https://cyberspace.online/Alice/' });
		try {
			// A mention typed in another case than the URL
			rightClick(addName('aLICE'));
			expect(menuItems().map(item => item.textContent)).toEqual(['Color', 'Notes']);
			closeMenu();
			dom.reconfigure({ url: 'https://cyberspace.online/alice/some-post' });
			rightClick(addName('alice'));
			expect(menuItems().map(item => item.textContent)).toEqual(['Color', 'Notes', 'Poke', 'Profile']);
		} finally {
			dom.reconfigure({ url: 'https://cyberspace.online/' });
		}
	});

	it('leaves out a feature\'s item while its switch is off, without a reload', () => {
		const name = addName('alice');
		try {
			featureConfig.nickColors = false;
			rightClick(name);
			expect(menuItems().map(item => item.textContent)).toEqual(['Notes', 'Poke', 'Profile']);
			closeMenu();
			featureConfig.nickColors = true;
			featureConfig.nickNotes = false;
			rightClick(name);
			expect(menuItems().map(item => item.textContent)).toEqual(['Color', 'Poke', 'Profile']);
		} finally {
			featureConfig.nickColors = true;
			featureConfig.nickNotes = true;
		}
	});

	it('leaves the browser\'s menu everywhere else', () => {
		const other = doc.createElement('a');
		other.href = '/alice';
		doc.body.appendChild(other);
		expect(rightClick(other).defaultPrevented).toBe(false);
		expect(menu()).toBeNull();
	});

	it('moves with the arrow keys, wrapping, and closes on Escape back to the name', () => {
		const name = addName('alice');
		rightClick(name);
		key('ArrowUp');
		expect(doc.activeElement.textContent).toBe('Profile');
		key('ArrowDown');
		expect(doc.activeElement.textContent).toBe('Color');
		key('End');
		expect(doc.activeElement.textContent).toBe('Profile');
		key('Escape');
		expect(menu()).toBeNull();
		expect(doc.activeElement).toBe(name);
	});

	it('returns focus to the name before an item\'s dialog opens, so closing it lands there', () => {
		const name = addName('alice');
		rightClick(name);
		menuItems().find(item => item.textContent === 'Notes').click();
		doc.querySelector('.atmo-dialog-footer button.cancel').click();
		expect(doc.activeElement).toBe(name);
	});

	it('puts focus back on the name on Tab, for the browser to move on from', () => {
		const name = addName('alice');
		rightClick(name);
		key('Tab');
		expect(menu()).toBeNull();
		expect(doc.activeElement).toBe(name);
	});

	it('closes on a click elsewhere', () => {
		rightClick(addName('alice'));
		doc.body.dispatchEvent(new dom.window.Event('pointerdown', { bubbles: true }));
		expect(menu()).toBeNull();
	});

	it('opens under the name from the keyboard, on its first item, whatever coordinates the browser gives', () => {
		const name = addName('alice');
		name.getBoundingClientRect = () => ({ left: 12, bottom: 34, top: 20, right: 60, width: 48, height: 14 });
		// Some browsers fill in the focused element's position
		rightClick(name, { clientX: 30, clientY: 25 }, { keyboard: true });
		expect(menu().style.left).toBe('12px');
		expect(menu().style.top).toBe('34px');
		expect(doc.activeElement).toBe(menuItems()[0]);
	});

	it('goes to the profile through the name\'s own link', () => {
		const name = addName('alice');
		const click = vi.fn(e => e.preventDefault());
		name.addEventListener('click', click);
		rightClick(name);
		menuItems().find(item => item.textContent === 'Profile').click();
		expect(menu()).toBeNull();
		expect(click).toHaveBeenCalledTimes(1);
	});

	it('opens on a long press, and swallows the click the browser sends after it', () => {
		vi.useFakeTimers();
		const name = addName('alice');
		const touch = (type, touches) => {
			const event = new dom.window.Event(type, { bubbles: true });
			Object.defineProperty(event, 'touches', { value: touches });
			name.dispatchEvent(event);
		};
		touch('touchstart', [{ clientX: 5, clientY: 5 }]);
		vi.advanceTimersByTime(USER_MENU_HOLD_MS);
		expect(menu()).not.toBeNull();
		// Touch picks an item by tapping it: nothing looks picked first
		expect(doc.activeElement).toBe(menu());
		touch('touchend', []);

		const click = new dom.window.MouseEvent('click', { bubbles: true, cancelable: true });
		name.dispatchEvent(click);
		expect(click.defaultPrevented).toBe(true);
	});
});

describe('nick notes', () => {
	it('saves notes from the menu\'s Notes item', () => {
		rightClick(addName('alice'));
		menuItems().find(item => item.textContent === 'Notes').click();
		const textarea = doc.querySelector('.atmo-dialog textarea');
		expect(doc.querySelector(`label[for="${textarea.id}"]`).textContent.trim()).not.toBe('');
		textarea.value = '  met at the meetup  ';
		doc.querySelector('.atmo-dialog-footer button.save').click();
		expect(stored('nickNotes')).toEqual({ alice: 'met at the meetup' });
	});

	it('shows a name\'s notes when hovering it, after a short wait', () => {
		feature('nickNotes').importBackup({ alice: 'met at the meetup' }, true);
		vi.useFakeTimers();
		const name = addName('alice');
		name.dispatchEvent(new dom.window.MouseEvent('mouseover', { bubbles: true }));
		const tooltip = () => doc.querySelector('.nn-tooltip.visible');
		vi.advanceTimersByTime(299);
		expect(tooltip()).toBeNull();
		vi.advanceTimersByTime(1);
		expect(tooltip().textContent).toBe('met at the meetup');
		name.dispatchEvent(new dom.window.MouseEvent('mouseout', { bubbles: true }));
		expect(tooltip()).toBeNull();
	});

	it('does not show for a name the site removed while it waited, and hides on a click', () => {
		feature('nickNotes').importBackup({ alice: 'met at the meetup' }, true);
		vi.useFakeTimers();
		const tooltip = () => doc.querySelector('.nn-tooltip.visible');
		const name = addName('alice');
		name.dispatchEvent(new dom.window.MouseEvent('mouseover', { bubbles: true }));
		name.remove();
		vi.advanceTimersByTime(300);
		expect(tooltip()).toBeNull();

		const other = addName('alice');
		other.dispatchEvent(new dom.window.MouseEvent('mouseover', { bubbles: true }));
		vi.advanceTimersByTime(300);
		expect(tooltip()).not.toBeNull();
		other.dispatchEvent(new dom.window.Event('pointerdown', { bubbles: true }));
		expect(tooltip()).toBeNull();
	});

	it('moves notes out of nick colors\' storage, newer than what is here', () => {
		feature('nickNotes').importBackup({ bob: 'kept', carol: 'older here' }, true);
		localStorage.setItem('atmosphericModulator_customNickColors', JSON.stringify({
			alice: { color: '#f00', userNotes: 'from nick colors' },
			carol: { userNotes: 'imported since' },
		}));
		feature('nickNotes').onStorageReady();
		expect(stored('nickNotes')).toEqual({ bob: 'kept', carol: 'imported since', alice: 'from nick colors' });
		// Gone from nick colors' storage, so a later clear cannot be undone from there
		expect(stored('customNickColors')).toEqual({ alice: { color: '#f00' }, carol: {} });
	});

	it('restores notes from an older backup, where they were in nick colors\' part', () => {
		feature('nickNotes').importBackup({ alice: 'edited since' }, true);
		importBackup({ app: 'cyberspace-atmospheric-modulator', version: 1,
			features: { nickColors: { v: 2, cnc: { alice: { un: 'from the backup' } } } } });
		expect(stored('nickNotes')).toEqual({ alice: 'from the backup' });
		expect(exportDebugLog()).not.toContain('from the backup');
		expect(JSON.stringify(exportBackup().features.nickColors)).not.toContain('from the backup');
	});

	it('has a SETTINGS button, to the script\'s section on the settings tab', () => {
		rightClick(addName('alice'));
		menuItems().find(item => item.textContent === 'Notes').click();
		const settings = doc.querySelector('.atmo-dialog .atmo-header-settings');
		// Off the settings page, it stores where to scroll, then loads the tab
		settings.click();
		expect(JSON.parse(sessionStorage.getItem('atmo-settings-focus')).key).toBe(SETTINGS_SECTION_KEY);
		sessionStorage.removeItem('atmo-settings-focus');
		expect(doc.querySelector('.atmo-dialog')).toBeNull();
	});

	it('forgets a note saved empty', () => {
		feature('nickNotes').importBackup({ alice: 'old' }, true);
		rightClick(addName('alice'));
		menuItems().find(item => item.textContent === 'Notes').click();
		doc.querySelector('.atmo-dialog textarea').value = '  ';
		doc.querySelector('.atmo-dialog-footer button.save').click();
		expect(stored('nickNotes')).toEqual({});
	});

	it('shows on keyboard focus, stays while the pointer is on it, and Escape hides it', () => {
		feature('nickNotes').importBackup({ alice: 'met at the meetup' }, true);
		vi.useFakeTimers();
		const name = addName('alice');
		const tooltip = () => doc.querySelector('.nn-tooltip.visible');
		name.dispatchEvent(new dom.window.FocusEvent('focusin', { bubbles: true }));
		vi.advanceTimersByTime(300);
		expect(tooltip()).not.toBeNull();
		expect(name.getAttribute('aria-describedby')).toBe(tooltip().id);

		name.dispatchEvent(new dom.window.MouseEvent('mouseout', { bubbles: true, relatedTarget: tooltip() }));
		expect(tooltip()).not.toBeNull();

		doc.body.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		expect(tooltip()).toBeNull();
		expect(name.hasAttribute('aria-describedby')).toBe(false);
	});

	it('reports a count, never the notes themselves', () => {
		feature('nickNotes').importBackup({ alice: 'private', bob: '' }, true);
		// The empty one is not kept: only alice's counts
		expect(feature('nickNotes').reportSummary()).toBe('1 note');
		expect(exportDebugLog()).not.toContain('private');
	});
});

/**
 * Friends tests: with "Only color my friends" on, only names on the list are
 * colored; the list survives a backup and is checked when it comes back.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { dom } from './setup.js';

const doc = dom.window.document;

beforeEach(() => replaceNickFriends(null));

/**
 * A name the username finder has marked, in the page.
 * @param {string} username
 * @returns {HTMLElement}
 */
const markedName = (username) => {
	const el = doc.createElement('span');
	el.setAttribute('data-atmo-user', username);
	el.textContent = username;
	doc.body.appendChild(el);
	return el;
};

describe('sanitizeNickFriends', () => {
	it('keeps the toggle only when true, and unique, valid, lowercased names', () => {
		expect(sanitizeNickFriends({ enabled: 'yes', users: ['Alice', 'alice', '@bob', ' @carol', '@', 'two words', 7, '__proto__'] }))
			.toEqual({ enabled: false, users: ['alice', 'bob', 'carol'] });
		expect(sanitizeNickFriends(null)).toEqual({ enabled: false, users: [] });
	});
});

describe('shouldColorNick', () => {
	it('colors everyone while the toggle is off, and only friends while it is on', () => {
		replaceNickFriends({ enabled: false, users: ['alice'] });
		expect(shouldColorNick('bob')).toBe(true);
		replaceNickFriends({ enabled: true, users: ['alice'] });
		expect(shouldColorNick('Alice')).toBe(true);
		expect(shouldColorNick('bob')).toBe(false);
	});
});

describe('styleUsername with only friends colored', () => {
	it('takes the color off a name whose user is not a friend, and leaves an uncolored one alone', () => {
		const bob = markedName('bob');
		styleUsername(bob);
		expect(bob.dataset.nickColored).toBe('true');

		const carol = markedName('carol');
		carol.style.fontStyle = 'italic';
		// Someone listed, so turning it on does not look up the signed-in user
		replaceNickFriends({ enabled: false, users: ['zed'] });
		setOnlyColorFriends(true);
		expect(bob.dataset.nickColored).toBeUndefined();
		expect(bob.style.cssText).toBe('');
		expect(carol.style.fontStyle).toBe('italic');

		setNickFriend('bob', true);
		expect(bob.dataset.nickColored).toBe('true');
		bob.remove();
		carol.remove();
	});
});

describe('styleUsername with nick colors switched off', () => {
	it('takes the color off, and puts it back when switched on', () => {
		const bob = markedName('bob');
		styleUsername(bob);
		featureConfig.nickColors = false;
		try {
			styleUsername(bob);
			expect(bob.dataset.nickColored).toBeUndefined();
		} finally {
			featureConfig.nickColors = true;
		}
		styleUsername(bob);
		expect(bob.dataset.nickColored).toBe('true');
		bob.remove();
	});
});

describe('names the separate Nick Colors script colored', () => {
	it('keep their color when this script switches off', () => {
		const alice = markedName('alice');
		// As the standalone script leaves a name
		alice.dataset.nickColored = 'true';
		alice.style.color = 'red';
		featureConfig.nickColors = false;
		try {
			styleUsername(alice);
			expect(alice.style.color).toBe('red');
			expect(alice.dataset.nickColored).toBe('true');
		} finally {
			featureConfig.nickColors = true;
		}
		alice.remove();
	});
});

describe('while the separate Nick Colors script runs', () => {
	it('switching this one off leaves every name colored, for that script to keep', () => {
		const ncStyles = doc.createElement('style');
		ncStyles.id = 'nc-styles';
		doc.head.appendChild(ncStyles);
		const bob = markedName('bob');
		styleUsername(bob);
		featureConfig.nickColors = false;
		try {
			styleUsername(bob);
			expect(bob.dataset.nickColored).toBe('true');
		} finally {
			featureConfig.nickColors = true;
			ncStyles.remove();
		}
		bob.remove();
	});
});

describe('backup', () => {
	it('exports the list and the toggle, and a full restore without them clears both', () => {
		replaceNickFriends({ enabled: true, users: ['alice'] });
		const exported = exportSettings();
		expect(exported.nickFriends).toEqual({ enabled: true, users: ['alice'] });

		importSettings({}, { recolor: false, replaceAll: true });
		expect(isNickFriend('alice')).toBe(false);

		importSettings(exported, { recolor: false, replaceAll: true });
		expect(isNickFriend('alice')).toBe(true);
		expect(shouldColorNick('bob')).toBe(false);
	});
});

describe('the Friends settings', () => {
	it('switches the toggle and removes a friend from the list', () => {
		replaceNickFriends({ enabled: false, users: ['alice'] });
		const container = doc.createElement('div');
		doc.body.appendChild(container);
		renderNickFriendsSettings(container);

		const toggle = container.querySelector('input[type="checkbox"]');
		toggle.click();
		expect(shouldColorNick('bob')).toBe(false);

		const remove = container.querySelector('button[aria-label="Remove @alice from friends"]');
		remove.click();
		expect(isNickFriend('alice')).toBe(false);
		container.remove();
	});
});

describe('focusAfterFriendRemoved', () => {
	// The Nick Colors section as the settings page renders it
	const section = (names) => {
		const el = doc.createElement('section');
		el.setAttribute('data-atmo-settings-section', 'atmospheric-modulator-nick-colors');
		el.innerHTML = '<div class="atmo-friends"><input type="checkbox" data-name="switch"><ul class="atmo-friend-list">'
			+ names.map(name => `<li><button type="button" data-name="${name}">×</button></li>`).join('') + '</ul></div>';
		doc.body.appendChild(el);
		return el;
	};

	it('moves focus to the × now in that place, the one before, or the switch', () => {
		let el = section(['alice', 'carol']);
		focusAfterFriendRemoved(1);
		expect(doc.activeElement.dataset.name).toBe('carol');
		el.remove();

		el = section(['alice']);
		focusAfterFriendRemoved(1);
		expect(doc.activeElement.dataset.name).toBe('alice');
		el.remove();

		el = section([]);
		focusAfterFriendRemoved(0);
		expect(doc.activeElement.dataset.name).toBe('switch');
		el.remove();
	});
});

describe('Import from Nick Colors', () => {
	it('keeps the friends list, whatever the file holds', () => {
		replaceNickFriends({ enabled: true, users: ['alice'] });
		importSettings({ siteConfig: {} }, { recolor: false, replaceAll: true, keepFriends: true });
		expect(isNickFriend('alice')).toBe(true);
		// A file pasted there from this script instead
		importSettings({ nickFriends: { enabled: false, users: [] } }, { recolor: false, replaceAll: true, keepFriends: true });
		expect(isNickFriend('alice')).toBe(true);
		expect(shouldColorNick('bob')).toBe(false);
	});
});

describe('addOwnNameAsFirstFriend', () => {
	it('adds the signed-in user to an empty list', async () => {
		replaceNickFriends({ enabled: true, users: [] });
		await addOwnNameAsFirstFriend(async () => 'Zed');
		expect(isNickFriend('zed')).toBe(true);
	});

	it('leaves the list alone when someone is already on it, or the switch went off', async () => {
		replaceNickFriends({ enabled: true, users: ['alice'] });
		await addOwnNameAsFirstFriend(async () => 'zed');
		expect(isNickFriend('zed')).toBe(false);

		replaceNickFriends({ enabled: false, users: [] });
		await addOwnNameAsFirstFriend(async () => 'zed');
		expect(isNickFriend('zed')).toBe(false);
	});

	it('leaves the list empty when nobody is signed in', async () => {
		replaceNickFriends({ enabled: true, users: [] });
		await addOwnNameAsFirstFriend(async () => { throw new Error('Not signed in to Cyberspace.'); });
		expect(exportSettings().nickFriends.users).toEqual([]);
	});
});

describe('the first-friend lookup and focus', () => {
	// The Nick Colors section as the settings page renders it, with the Friends part
	const section = () => {
		const el = doc.createElement('section');
		el.setAttribute('data-atmo-settings-section', 'atmospheric-modulator-nick-colors');
		const friends = doc.createElement('div');
		const other = doc.createElement('button');
		other.textContent = 'Monochrome';
		el.append(friends, other);
		doc.body.appendChild(el);
		renderNickFriendsSettings(friends);
		return { el, other };
	};

	it('keeps focus on the switch through the redraw', async () => {
		replaceNickFriends({ enabled: true, users: [] });
		const { el } = section();
		el.querySelector('.atmo-friends input[type="checkbox"]').focus();
		await addOwnNameAsFirstFriend(async () => 'zed');
		expect(isNickFriend('zed')).toBe(true);
		expect(doc.activeElement).toBe(el.querySelector('.atmo-friends input[type="checkbox"]'));
		el.remove();
	});

	it('leaves focus elsewhere in the section where it is', async () => {
		replaceNickFriends({ enabled: true, users: [] });
		const { el, other } = section();
		other.focus();
		await addOwnNameAsFirstFriend(async () => 'zed');
		expect(doc.activeElement).toBe(other);
		el.remove();
	});
});

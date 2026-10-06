/**
 * Friends tests: with "Only color my chooms" on, only names on the list are
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
	it('keeps the toggle only when true, and valid names, unique without case, in the case given', () => {
		expect(sanitizeNickFriends({ enabled: 'yes', users: ['Alice', 'alice', '@bob', ' @carol', '@', 'two words', 7, '__proto__'] }))
			.toEqual({ enabled: false, users: ['Alice', 'bob', 'carol'] });
		expect(sanitizeNickFriends(null)).toEqual({ enabled: false, users: [] });
	});
});

describe('setNickFriend', () => {
	it('keeps the page\'s spelling, and matches without case', () => {
		setNickFriend('Zed', true);
		expect(exportSettings().nickFriends.users).toEqual(['Zed']);
		expect(isNickFriend('zed')).toBe(true);
		setNickFriend('zed', false);
		expect(isNickFriend('Zed')).toBe(false);
	});
});

describe('a friend saved lowercase by an earlier build', () => {
	it('takes the page\'s spelling once the name is seen', () => {
		replaceNickFriends({ enabled: false, users: ['zed'] });
		const zed = markedName('Zed');
		styleUsername(zed);
		expect(exportSettings().nickFriends.users).toEqual(['Zed']);
		zed.remove();
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
	it('switches the toggle', () => {
		replaceNickFriends({ enabled: false, users: ['alice'] });
		const container = doc.createElement('div');
		doc.body.appendChild(container);
		renderNickFriendsSettings(container);
		const toggle = container.querySelector('input[type="checkbox"]');
		expect(container.querySelector('h4').textContent).toBe('Only color my chooms');
		toggle.click();
		expect(shouldColorNick('bob')).toBe(false);
		container.remove();
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

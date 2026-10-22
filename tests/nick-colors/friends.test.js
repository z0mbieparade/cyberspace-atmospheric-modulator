/**
 * Friends tests: with only chooms colored, only names on the list are
 * colored; the list survives a backup and is checked when it comes back.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { dom } from './setup.js';

/**
 * Store a choom list and whose nicks get colored, as a settings file would.
 * Side effects: replaces both, in storage too.
 * @param {{users?: string[], besties?: string[], colorFor?: string, enabled?: boolean}} friends -
 *   enabled: as saved before colorFor
 */
function setFriends(friends) {
	replaceChooms(friends);
	replaceNickColorFor(sanitizeNickColorFor(friends));
}

const doc = dom.window.document;

// As nick colors' boot does: a choom added or removed may be colored now
onChoomsChanged(() => colorizeAll());

beforeEach(() => setFriends(null));

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

describe('sanitizeChooms', () => {
	it('keeps valid names, unique without case, in the case given', () => {
		expect(sanitizeChooms({ enabled: 'yes', users: ['Alice', 'alice', '@bob', ' @carol', '@', 'two words', 7, '__proto__'] }))
			.toEqual({ users: ['Alice', 'bob', 'carol'], besties: [] });
		expect(sanitizeChooms(null)).toEqual({ users: [], besties: [] });
	});

	it('keeps only best chooms who are chooms, spelled as the chooms are', () => {
		expect(sanitizeChooms({ users: ['Alice', 'bob'], besties: ['alice', 'dave', 'ALICE', 7] }))
			.toEqual({ users: ['Alice', 'bob'], besties: ['Alice'] });
	});
});

describe('whose nicks get colored, saved before the choice', () => {
	it('reads the old switch from the choom list\'s saved key once, and saves it apart', () => {
		_GM_setValue('nickColorFor', null);
		_GM_setValue('nickFriends', JSON.stringify({ enabled: true, users: ['alice'] }));
		loadNickColorFor();
		expect(colorsOnlyChooms()).toBe(true);
		expect(_GM_getValue('nickColorFor', null)).toBe('all');
		expect(JSON.parse(_GM_getValue('nickFriends', '{}'))).not.toHaveProperty('enabled');
	});
});

describe('whose nicks get colored', () => {
	it('reads a save from before the choice: only chooms is every choom, else everyone', () => {
		expect(sanitizeNickColorFor({ enabled: true, users: ['a'] })).toBe('all');
		expect(sanitizeNickColorFor({ enabled: false })).toBe('everyone');
		expect(sanitizeNickColorFor({ colorFor: 'best', enabled: false })).toBe('best');
		expect(sanitizeNickColorFor({ colorFor: 'nobody' })).toBe('everyone');
	});

	it('colors best chooms only, every choom, or everyone', () => {
		setFriends({ users: ['pal', 'bff'], besties: ['bff'] });
		const colored = () => ['bff', 'pal', 'stranger'].filter(shouldColorNick);
		setFriends({ ...exportSettings().nickFriends, colorFor: 'best' });
		expect(colored()).toEqual(['bff']);
		setFriends({ ...exportSettings().nickFriends, colorFor: 'all' });
		expect(colored()).toEqual(['bff', 'pal']);
		setFriends({ ...exportSettings().nickFriends, colorFor: 'everyone' });
		expect(colored()).toEqual(['bff', 'pal', 'stranger']);
	});
});

describe('setChoomLevel', () => {
	it('keeps the page\'s spelling, and matches without case', () => {
		setChoomLevel('Zed', CHOOM_LEVEL_CHOOM);
		expect(exportSettings().nickFriends.users).toEqual(['Zed']);
		expect(choomLevel('zed')).toBeGreaterThan(0);
		setChoomLevel('zed', CHOOM_LEVEL_NONE);
		expect(choomLevel('Zed')).toBe(0);
	});

	it('steps a choom up to best and back, and removing one removes both', () => {
		setChoomLevel('Zed', CHOOM_LEVEL_BEST);
		expect(choomLevel('zed')).toBe(CHOOM_LEVEL_BEST);
		setChoomLevel('zed', CHOOM_LEVEL_CHOOM);
		expect(choomLevel('Zed')).toBe(CHOOM_LEVEL_CHOOM);
		setChoomLevel('Zed', CHOOM_LEVEL_BEST);
		setChoomLevel('Zed', CHOOM_LEVEL_NONE);
		expect(choomLevel('zed')).toBe(CHOOM_LEVEL_NONE);
		setChoomLevel('Zed', CHOOM_LEVEL_CHOOM);
		expect(choomLevel('zed')).toBe(CHOOM_LEVEL_CHOOM);
	});

	it('keeps a choom\'s saved spelling when a mention in another case changes their level', () => {
		setFriends({ colorFor: 'everyone', users: ['Zed'] });
		setChoomLevel('ZED', CHOOM_LEVEL_BEST);
		expect(exportSettings().nickFriends).toMatchObject({ users: ['Zed'], besties: ['Zed'] });
		setChoomLevel('zed', CHOOM_LEVEL_CHOOM);
		expect(exportSettings().nickFriends).toMatchObject({ users: ['Zed'], besties: [] });
	});
});

describe('a friend saved lowercase by an earlier build', () => {
	it('takes the page\'s spelling once the name is seen', () => {
		setFriends({ colorFor: 'everyone', users: ['zed'] });
		const zed = markedName('Zed');
		styleUsername(zed);
		expect(exportSettings().nickFriends.users).toEqual(['Zed']);
		zed.remove();
	});
});

describe('shouldColorNick', () => {
	it('colors everyone while the toggle is off, and only friends while it is on', () => {
		setFriends({ colorFor: 'everyone', users: ['alice'] });
		expect(shouldColorNick('bob')).toBe(true);
		setFriends({ colorFor: 'all', users: ['alice'] });
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
		setFriends({ colorFor: 'everyone', users: ['zed'] });
		setNickColorFor('all');
		expect(bob.dataset.nickColored).toBeUndefined();
		expect(bob.style.cssText).toBe('');
		expect(carol.style.fontStyle).toBe('italic');

		setChoomLevel('bob', CHOOM_LEVEL_CHOOM);
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
		setFriends({ colorFor: 'all', users: ['alice'] });
		const exported = exportSettings();
		expect(exported.nickFriends).toEqual({ colorFor: 'all', users: ['alice'], besties: [] });

		importSettings({}, { recolor: false, replaceAll: true });
		expect(choomLevel('alice')).toBe(0);

		importSettings(exported, { recolor: false, replaceAll: true });
		expect(choomLevel('alice')).toBeGreaterThan(0);
		expect(shouldColorNick('bob')).toBe(false);
	});
});

describe('the Whose nicks get colored choice', () => {
	it('saves and recolors as it is chosen', () => {
		setFriends({ users: ['alice'] });
		const container = doc.createElement('div');
		doc.body.appendChild(container);
		renderNickColorForSettings(container);
		const select = container.querySelector('select');
		expect(container.querySelector(`label[for="${select.id}"]`).textContent.trim()).toBe('Whose nicks get colored');
		expect(Array.from(select.options, option => option.value)).toEqual(['best', 'all', 'everyone']);
		select.value = 'all';
		select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
		expect(exportSettings().nickFriends.colorFor).toBe('all');
		expect(shouldColorNick('bob')).toBe(false);
		container.remove();
	});
});

describe('Import from Nick Colors', () => {
	it('keeps the friends list, whatever the file holds', () => {
		setFriends({ colorFor: 'all', users: ['alice'] });
		importSettings({ siteConfig: {} }, { recolor: false, replaceAll: true, keepFriends: true });
		expect(choomLevel('alice')).toBeGreaterThan(0);
		// A file pasted there from this script instead
		importSettings({ nickFriends: { colorFor: 'everyone', users: [] } }, { recolor: false, replaceAll: true, keepFriends: true });
		expect(choomLevel('alice')).toBeGreaterThan(0);
		expect(shouldColorNick('bob')).toBe(false);
	});
});

describe('addOwnNameAsFirstChoom', () => {
	it('adds the signed-in user to an empty list', async () => {
		setFriends({ colorFor: 'all', users: [] });
		await addOwnNameAsFirstChoom(async () => 'Zed');
		expect(choomLevel('zed')).toBeGreaterThan(0);
	});

	it('makes you a best choom when only best chooms are colored and none is, though you are a choom', async () => {
		setFriends({ colorFor: 'best', users: ['Zed'] });
		await addOwnNameAsFirstChoom(async () => 'Zed');
		expect(choomLevel('zed')).toBe(CHOOM_LEVEL_BEST);
	});

	it('adds you as a best choom while only best chooms are colored, so your name stays colored', async () => {
		setFriends({ colorFor: 'best', users: [] });
		await addOwnNameAsFirstChoom(async () => 'Zed');
		expect(choomLevel('zed')).toBe(CHOOM_LEVEL_BEST);
	});

	it('leaves the list alone when someone is already on it, or everyone is colored', async () => {
		setFriends({ colorFor: 'all', users: ['alice'] });
		await addOwnNameAsFirstChoom(async () => 'zed');
		expect(choomLevel('zed')).toBe(0);

		setFriends({ colorFor: 'everyone', users: [] });
		await addOwnNameAsFirstChoom(async () => 'zed');
		expect(choomLevel('zed')).toBe(0);
	});

	it('leaves the list empty when nobody is signed in', async () => {
		setFriends({ colorFor: 'all', users: [] });
		await addOwnNameAsFirstChoom(async () => { throw new Error('Not signed in to Cyberspace.'); });
		expect(exportSettings().nickFriends.users).toEqual([]);
	});
});

/**
 * Backup note tests (src/backup-note.js, src/shared/passphrase-crypto.js,
 * the notes calls in src/shared/cyberspace-api.js): the settings saved to a
 * private Cyberspace note, encrypted or not, and loaded back on another
 * browser.
 */

import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { dom } from './setup.js';
import { signedIn, answerRequests } from './api-helpers.js';

const doc = dom.window.document;
const API = 'https://api.cyberspace.online/v1';
const HEADER = 'Atmospheric Modulator settings backup v1';
const feature = (key) => FEATURES.find(f => f.key === key);
const storedNotes = () => JSON.parse(localStorage.getItem('atmosphericModulator_nickNotes') || '{}');
// A passphrase takes a moment to stretch into a key
const SLOW = { timeout: 10000 };

/**
 * Cyberspace's notes, as much of the API as the backup note uses.
 * @param {Object[]} [initial] - notes already there
 * @param {{override?: function(Object): Object|undefined, pageSize?: number, preview?: boolean}} [options] -
 *   override: answers a request itself when it returns an answer; pageSize:
 *   notes per list page; preview: lists carry only each note's first line
 * @returns {{notes: Map<string, Object>, requests: Object[]}}
 */
function fakeNotes(initial = [], { override = () => undefined, pageSize = 50, preview = false } = {}) {
	const notes = new Map(initial.map(note => [note.noteId, note]));
	let next = 1;
	const requests = answerRequests((details) => {
		const answered = override(details);
		if (answered) return answered;
		const path = details.url.slice(API.length);
		const body = details.data ? JSON.parse(details.data) : null;
		const one = path.match(/^\/notes\/([^?/]+)$/);
		const gone = { status: 404, body: { error: { code: 'NOT_FOUND', message: 'Note not found' } } };
		if (details.method === 'GET' && path.startsWith('/notes?')) {
			const start = Number(new URLSearchParams(path.split('?')[1]).get('cursor') || 0);
			const all = [...notes.values()];
			const page = all.slice(start, start + pageSize)
				.map(note => preview ? { ...note, content: note.content.split('\n')[0] } : note);
			return { status: 200, body: { data: page, cursor: start + pageSize < all.length ? String(start + pageSize) : null } };
		}
		if (details.method === 'GET' && one) return notes.has(one[1]) ? { status: 200, body: { data: notes.get(one[1]) } } : gone;
		if (details.method === 'PATCH' && one) {
			if (!notes.has(one[1])) return gone;
			notes.set(one[1], { ...notes.get(one[1]), ...body });
			return { status: 200, body: { data: notes.get(one[1]) } };
		}
		if (details.method === 'DELETE' && one) {
			if (!notes.delete(one[1])) return gone;
			return { status: 200, body: { data: { deleted: true } } };
		}
		if (details.method === 'POST' && path === '/notes') {
			const note = { noteId: `note${next++}`, ...body };
			notes.set(note.noteId, note);
			return { status: 201, body: { data: note } };
		}
		return { status: 400, body: { error: { message: `unexpected ${details.method} ${path}` } } };
	});
	return { notes, requests };
}

const dialog = () => doc.querySelector('.atmo-dialog');
const field = (label) => {
	const found = Array.from(dialog().querySelectorAll('label')).find(l => l.textContent.startsWith(label));
	return dialog().querySelector('#' + found.htmlFor);
};
const footerButton = (text) => Array.from(doc.querySelectorAll('.atmo-dialog-footer button')).find(b => b.textContent.trim() === text);
const writes = (requests) => requests.filter(r => r.method !== 'GET').map(r => `${r.method} ${r.url.slice(API.length)}`);
const remembered = () => JSON.parse(localStorage.getItem('atmosphericModulator_backupNote') || 'null');
const encryptSwitch = () => field('Encrypt note with passphrase');

/**
 * Save through the dialog, as the user does.
 * @param {string|null} passphrase - null to turn encryption off; '' to keep
 *   the remembered one
 * @param {string} [repeat]
 * @returns {Promise<void>} once the dialog is open and the save pressed
 */
async function saveWith(passphrase, repeat = passphrase) {
	showSaveBackupNoteDialog();
	await vi.waitFor(() => expect(dialog()).not.toBeNull());
	if ((passphrase === null) === encryptSwitch().checked) encryptSwitch().click();
	if (passphrase !== null) {
		field('Passphrase').value = passphrase;
		field('Repeat passphrase').value = repeat;
	}
	footerButton('SAVE NOTE').click();
}

/**
 * Wait for the next alert, and give its text.
 * @param {number} [count] - how many alerts there will have been
 * @returns {Promise<string>}
 */
async function nextAlert(count = 1) {
	await vi.waitFor(() => expect(global.alert).toHaveBeenCalledTimes(count), SLOW);
	return global.alert.mock.calls[count - 1][0];
}

/**
 * Be another browser: nothing remembered, no notes on other users.
 */
function anotherBrowser() {
	localStorage.removeItem('atmosphericModulator_backupNote');
	feature('nickNotes').importBackup({}, true);
}

beforeAll(() => {
	startFeatures();
});

afterEach(() => {
	delete global.indexedDB;
	delete global.gmRequestHandler;
	delete global.alert;
	localStorage.removeItem('atmosphericModulator_backupNote');
	feature('nickNotes').importBackup({}, true);
	doc.querySelectorAll('.atmo-dialog-overlay').forEach(o => o.remove());
});

describe('passphrase encryption', () => {
	it('opens with the passphrase it was locked with, or a kept key, and nothing else', async () => {
		const key = await deriveTextKey('correct horse battery');
		const locked = await encryptText('met at the meetup', key);
		expect(locked).not.toContain('meetup');
		// A fresh IV each time, with the same key
		expect(await encryptText('met at the meetup', key)).not.toBe(locked);
		const again = await deriveTextKey('correct horse battery', lockedTextSalt(locked));
		expect(await decryptText(locked, again)).toBe('met at the meetup');
		expect(await decryptText(locked, await importTextKey(await exportTextKey(key)))).toBe('met at the meetup');
		const wrong = await deriveTextKey('wrong horse battery', lockedTextSalt(locked));
		await expect(decryptText(locked, wrong)).rejects.toThrow('does not open it');
	}, 20000);

	it('refuses a locked text that was changed, or relabeled as another format', async () => {
		const key = await deriveTextKey('correct horse battery');
		const bytes = Uint8Array.from(atob(await encryptText('met at the meetup', key)), c => c.charCodeAt(0));
		const changed = bytes.slice();
		changed[changed.length - 1] ^= 1;
		await expect(decryptText(btoa(String.fromCharCode(...changed)), key)).rejects.toThrow('was changed');
		const relabeled = bytes.slice();
		relabeled[0] = 2;
		await expect(decryptText(btoa(String.fromCharCode(...relabeled)), key)).rejects.toThrow('newer version');
	}, 20000);
});

describe('Save to Note', () => {
	it('saves readable settings when encryption is off, warning first, out loud, that anyone who sees it can read them', async () => {
		signedIn();
		global.alert = vi.fn();
		const { notes } = fakeNotes();
		showSaveBackupNoteDialog();
		await vi.waitFor(() => expect(dialog()).not.toBeNull());
		// Encrypted unless chosen otherwise
		expect(encryptSwitch().checked).toBe(true);
		encryptSwitch().click();
		const warning = doc.getElementById(encryptSwitch().getAttribute('aria-describedby'));
		expect(warning.getAttribute('role')).toBe('status');
		expect(warning.textContent).toContain('your notes on other users');
		footerButton('SAVE NOTE').click();

		expect(await nextAlert()).toBe('Settings saved to your Cyberspace note.');
		const [note] = [...notes.values()];
		expect(note.topics).toEqual(['atmomod']);
		// Warned first, for whoever opens it on Cyberspace
		const [heading, why, blank, header, settings] = note.content.split('\n');
		expect(heading).toBe('# DO NOT PUBLISH OR EDIT');
		expect(why).toContain('notes on other users');
		expect(blank).toBe('');
		expect(header.startsWith(HEADER)).toBe(true);
		expect(JSON.parse(settings).app).toBe('cyberspace-atmospheric-modulator');
		expect(remembered()).toEqual({ id: note.noteId, encrypted: false, key: null });
	});

	it('saves encrypted, keeping the key and never the passphrase, and saves again with no typing', async () => {
		signedIn();
		global.alert = vi.fn();
		const { notes, requests } = fakeNotes();
		feature('nickNotes').importBackup({ alice: 'met at the meetup' }, true);
		await saveWith('correct horse battery');
		expect(await nextAlert()).toBe('Settings saved to your Cyberspace note, encrypted.');
		const [note] = [...notes.values()];
		expect(note.content.split('\n')[3]).toContain(', encrypted');
		expect(note.content).not.toContain('meetup');
		expect(remembered().key).not.toBeNull();
		expect(localStorage.getItem('atmosphericModulator_backupNote')).not.toContain('correct horse battery');

		// Nothing typed: the remembered key, on the same note
		await saveWith('');
		expect(await nextAlert(2)).toBe('Settings saved to your Cyberspace note, encrypted.');
		expect(writes(requests)).toEqual(['POST /notes', `PATCH /notes/${note.noteId}`]);
	}, 30000);

	it('starts a new note, after asking, when encryption is turned on, and deletes the old with its unencrypted history', async () => {
		signedIn();
		global.alert = vi.fn();
		const { notes, requests } = fakeNotes();
		await saveWith(null);
		await nextAlert();
		const [old] = [...notes.keys()];

		await saveWith('correct horse battery');
		await vi.waitFor(() => expect(footerButton('SAVE AND DELETE OLD NOTE')).toBeTruthy(), SLOW);
		expect(dialog().textContent).toContain('unencrypted');
		footerButton('SAVE AND DELETE OLD NOTE').click();
		expect(await nextAlert(2)).toBe('Settings saved to your Cyberspace note, encrypted.');
		expect(writes(requests)).toEqual(['POST /notes', 'POST /notes', `DELETE /notes/${old}`]);
		expect([...notes.keys()]).toEqual([remembered().id]);
	}, 30000);

	it('adds a version, asking nothing, when the same passphrase is typed again', async () => {
		signedIn();
		global.alert = vi.fn();
		const { notes, requests } = fakeNotes();
		await saveWith('correct horse battery');
		await nextAlert();
		const [id] = [...notes.keys()];
		await saveWith('correct horse battery');
		expect(await nextAlert(2)).toBe('Settings saved to your Cyberspace note, encrypted.');
		expect(writes(requests)).toEqual(['POST /notes', `PATCH /notes/${id}`]);
	}, 30000);

	it('shows the switch turned off when it is turned off', async () => {
		showSaveBackupNoteDialog();
		await vi.waitFor(() => expect(dialog()).not.toBeNull());
		encryptSwitch().click();
		expect(encryptSwitch().closest('.atmo-toggle').textContent).toContain('false');
	});

	it('remembers the new note, not the deleted one, when Cyberspace answers without an ID', async () => {
		signedIn();
		global.alert = vi.fn();
		const { notes } = fakeNotes([], { override: (details) => {
			if (details.method !== 'POST') return undefined;
			const note = { noteId: `made${notes.size}`, ...JSON.parse(details.data) };
			notes.set(note.noteId, note);
			// Saved, but answered without the note
			return { status: 201, body: { data: { ok: true } } };
		} });
		await saveWith(null);
		await nextAlert();
		localStorage.removeItem('atmosphericModulator_backupNote');
		await saveWith('correct horse battery');
		await vi.waitFor(() => expect(footerButton('SAVE AND DELETE OLD NOTE')).toBeTruthy(), SLOW);
		footerButton('SAVE AND DELETE OLD NOTE').click();
		await nextAlert(2);
		expect([...notes.keys()]).toEqual(['made1']);
		expect(remembered().id).toBe('made1');
	}, 30000);

	it('asks before replacing a backup note this browser has not used', async () => {
		signedIn();
		global.alert = vi.fn();
		const theirs = { noteId: 'old', topics: ['atmomod'], content: `${HEADER}. Load it.\n{}` };
		const { requests } = fakeNotes([{ noteId: 'diary', topics: ['journal'], content: 'dear diary' }, theirs]);
		await saveWith(null);
		await vi.waitFor(() => expect(dialog()?.textContent).toContain('this browser has not saved or loaded'));
		footerButton('CANCEL').click();
		expect(writes(requests)).toEqual([]);

		await saveWith(null);
		await vi.waitFor(() => expect(footerButton('REPLACE')).toBeTruthy());
		footerButton('REPLACE').click();
		expect(await nextAlert()).toBe('Settings saved to your Cyberspace note.');
		expect(writes(requests)).toEqual(['PATCH /notes/old']);
	});

	it('makes a new note when the remembered one is gone', async () => {
		signedIn();
		global.alert = vi.fn();
		localStorage.setItem('atmosphericModulator_backupNote', JSON.stringify({ id: 'deleted', encrypted: false, key: null }));
		const { requests } = fakeNotes();
		await saveWith(null);
		expect(await nextAlert()).toBe('Settings saved to your Cyberspace note.');
		expect(writes(requests)).toEqual(['POST /notes']);
		expect(remembered().id).toBe('note1');
	});

	it('refuses a short passphrase, two that differ, and none with nothing remembered, sending nothing', async () => {
		global.alert = vi.fn();
		const { requests } = fakeNotes();
		await saveWith('short');
		expect(await nextAlert()).toContain('at least 12 characters');
		await saveWith('correct horse battery', 'correct horse battery!');
		expect(await nextAlert(2)).toBe('The two passphrases are different. Type the same one twice.');
		await saveWith('');
		expect(await nextAlert(3)).toContain('at least 12 characters');
		expect(requests).toEqual([]);
	});

	it('says when Cyberspace allows no more saves, and when a read failed that nothing was saved', async () => {
		signedIn();
		global.alert = vi.fn();
		fakeNotes([], { override: (details) => details.method === 'POST'
			? { status: 429, body: { error: { code: 'RATE_LIMITED', message: 'Too many requests' } } } : undefined });
		await saveWith(null);
		expect(await nextAlert()).toContain('3 note saves a minute and 30 a day');
		expect(remembered()).toBeNull();

		fakeNotes([], { override: (details) => details.method === 'GET' ? { status: 'timeout' } : undefined });
		await saveWith(null);
		const message = await nextAlert(2);
		expect(message).toContain('nothing was saved');
		expect(message).not.toContain('may have been saved');
	});

	it('refuses settings too big for a note', async () => {
		signedIn();
		global.alert = vi.fn();
		feature('nickNotes').importBackup({ alice: 'x'.repeat(BACKUP_NOTE_MAX_LENGTH) }, true);
		const { requests } = fakeNotes();
		await saveWith(null);
		expect(await nextAlert()).toContain('too big for a Cyberspace note');
		expect(writes(requests)).toEqual([]);
	});
});

describe('Load from Note', () => {
	it('loads encrypted settings on another browser with their passphrase, refusing a wrong one, and then with no typing', async () => {
		signedIn();
		global.alert = vi.fn();
		// Lists carry only the first line: the note is fetched whole
		const { notes } = fakeNotes([], { preview: true });
		feature('nickNotes').importBackup({ alice: 'met at the meetup' }, true);
		await saveWith('correct horse battery');
		await nextAlert();
		const [id] = [...notes.keys()];

		anotherBrowser();
		loadBackupNote(() => {});
		await vi.waitFor(() => expect(dialog()?.textContent).toContain('Load from Note'));
		field('Passphrase').value = 'wrong horse battery';
		footerButton('LOAD').click();
		expect(await nextAlert(2)).toContain('does not open it');
		expect(storedNotes()).toEqual({});

		field('Passphrase').value = 'correct horse battery';
		footerButton('LOAD').click();
		await vi.waitFor(() => expect(storedNotes()).toEqual({ alice: 'met at the meetup' }), SLOW);
		expect(dialog()).toBeNull();
		expect(remembered().id).toBe(id);

		// The key is remembered now: the next load asks nothing
		feature('nickNotes').importBackup({}, true);
		await loadBackupNote(() => {});
		expect(storedNotes()).toEqual({ alice: 'met at the meetup' });
		expect(dialog()).toBeNull();
	}, 30000);

	it('loads even when the key cannot be remembered, as in a sandbox that refuses it', async () => {
		signedIn();
		global.alert = vi.fn();
		fakeNotes();
		feature('nickNotes').importBackup({ alice: 'met at the meetup' }, true);
		await saveWith('correct horse battery');
		await nextAlert();
		anotherBrowser();
		const exportKey = vi.spyOn(crypto.subtle, 'exportKey').mockRejectedValue(new Error('Permission denied to access property "constructor"'));
		try {
			loadBackupNote(() => {});
			await vi.waitFor(() => expect(dialog()?.textContent).toContain('Load from Note'));
			field('Passphrase').value = 'correct horse battery';
			footerButton('LOAD').click();
			await vi.waitFor(() => expect(storedNotes()).toEqual({ alice: 'met at the meetup' }), SLOW);
		} finally {
			exportKey.mockRestore();
		}
	}, 30000);

	it('says when a step fails that nothing else catches, and can be used again after', async () => {
		signedIn();
		fakeNotes([{ noteId: 'n', topics: ['atmomod'], content: `${HEADER}. Load it.\n${JSON.stringify(exportBackup())}` }]);
		// The import's own alert fails: nothing between it and the task catches
		global.alert = vi.fn((message) => {
			if (message.startsWith('Settings imported')) throw new Error('the page refused');
		});
		await loadBackupNote(() => {});
		expect(global.alert).toHaveBeenLastCalledWith(expect.stringContaining('Something went wrong with the Cyberspace note. the page refused'));
		// Not left busy
		await loadBackupNote(() => {});
		expect(global.alert.mock.calls.filter(([message]) => message.startsWith('Settings imported'))).toHaveLength(2);
	});

	it('imports once, however often Load is pressed', async () => {
		signedIn();
		global.alert = vi.fn();
		fakeNotes([{ noteId: 'n', topics: ['atmomod'], content: `${HEADER}. Load it.\n${JSON.stringify(exportBackup())}` }]);
		await Promise.all([loadBackupNote(() => {}), loadBackupNote(() => {})]);
		expect(global.alert.mock.calls.filter(([message]) => message.startsWith('Settings imported'))).toHaveLength(1);
	});

	it('asks before loading a note this browser saved encrypted that comes back readable, and keeps its key', async () => {
		signedIn();
		global.alert = vi.fn();
		const { notes } = fakeNotes();
		await saveWith('correct horse battery');
		await nextAlert();
		const [id] = [...notes.keys()];
		const key = remembered().key;
		notes.get(id).content = `${HEADER}. Load it.\n${JSON.stringify(exportBackup())}`;

		await loadBackupNote(() => {});
		expect(dialog().textContent).toContain('it was changed on Cyberspace');
		footerButton('LOAD ANYWAY').click();
		await vi.waitFor(() => expect(global.alert).toHaveBeenCalledTimes(2));
		expect(remembered()).toEqual({ id, encrypted: true, key });
	}, 30000);

	it('asks too when the encrypted note was swapped for a new readable one', async () => {
		signedIn();
		global.alert = vi.fn();
		const { notes } = fakeNotes();
		await saveWith('correct horse battery');
		await nextAlert();
		notes.clear();
		notes.set('swapped', { noteId: 'swapped', topics: ['atmomod'], content: `${HEADER}. Load it.\n${JSON.stringify(exportBackup())}` });
		await loadBackupNote(() => {});
		expect(dialog().textContent).toContain('it was changed on Cyberspace');
	}, 30000);

	it('stops loading when the passphrase dialog is cancelled while the key is made', async () => {
		signedIn();
		global.alert = vi.fn();
		fakeNotes();
		feature('nickNotes').importBackup({ alice: 'met at the meetup' }, true);
		await saveWith('correct horse battery');
		await nextAlert();
		anotherBrowser();
		loadBackupNote(() => {});
		await vi.waitFor(() => expect(dialog()?.textContent).toContain('Load from Note'));
		field('Passphrase').value = 'correct horse battery';
		footerButton('LOAD').click();
		footerButton('CANCEL').click();
		await new Promise(resolve => setTimeout(resolve, 3000));
		expect(storedNotes()).toEqual({});
		expect(global.alert).toHaveBeenCalledTimes(1);
	}, 30000);

	it('looks through every page of notes, and stops at one that repeats', async () => {
		signedIn();
		global.alert = vi.fn();
		const diary = Array.from({ length: 5 }, (_, i) => ({ noteId: `d${i}`, topics: ['journal'], content: 'dear diary' }));
		const backup = { noteId: 'n', topics: ['atmomod'], content: `${HEADER}. Load it.\n${JSON.stringify(exportBackup())}` };
		fakeNotes([...diary, backup], { pageSize: 2 });
		await loadBackupNote(() => {});
		expect(await nextAlert()).toMatch(/^Settings imported/);

		// A server that answers the same page forever
		const { requests } = fakeNotes(diary, { override: (details) => details.url.includes('/notes?')
			? { status: 200, body: { data: [], cursor: 'same' } } : undefined });
		await loadBackupNote(() => {});
		expect(await nextAlert(2)).toContain('no settings backup note');
		expect(requests.length).toBeLessThanOrEqual(3);
	});

	it('finds the backup under a warning worded otherwise, as a later version may word it', async () => {
		signedIn();
		global.alert = vi.fn();
		fakeNotes([{ noteId: 'n', topics: ['atmomod'], content: `# KEEP OUT\nSome other words.\n${HEADER}. Load it.\n${JSON.stringify(exportBackup())}` }]);
		await loadBackupNote(() => {});
		expect(await nextAlert()).toMatch(/^Settings imported/);
	});

	it('says so when there is no backup note yet', async () => {
		signedIn();
		global.alert = vi.fn();
		fakeNotes([{ noteId: 'diary', topics: ['journal'], content: 'dear diary' }]);
		await loadBackupNote(() => {});
		expect(await nextAlert()).toContain('no settings backup note on Cyberspace yet');
	});

	it('is forgotten by Erase All Settings, along with its key', async () => {
		signedIn();
		global.alert = vi.fn();
		fakeNotes();
		await saveWith(null);
		await nextAlert();
		eraseAllSettings();
		expect(await readBackupNoteState()).toEqual({ id: null, encrypted: false, key: null });
	});
});

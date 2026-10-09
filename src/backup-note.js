// =====================================================
// BACKUP NOTE: the settings file, kept in a private Cyberspace note
// =====================================================
// Save to Note keeps exportBackup() in one private note, tagged
// BACKUP_NOTE_TOPIC, and Load from Note brings it back on any
// browser signed in as the same user. Each save is a new revision of the
// same note: Cyberspace keeps the earlier ones in its history.
//
// Encrypted, the note holds the settings locked with a key made from the
// user's passphrase (src/shared/passphrase-crypto.js). Not encrypted, it
// holds them as JSON: they include the user's notes on other users, which
// anyone who sees the note can read, as when the site publishes it to
// their journal. The history keeps every revision, so turning encryption
// on, or changing the passphrase, starts a new note and deletes the old.
//
// Only ever from a button the user pressed: the API's terms ban automation.

const BACKUP_NOTE_TOPIC = 'atmomod';
// The line that marks a backup note: under the warning, or first in notes
// saved before it. The rest of the note is the settings: JSON, or with
// ENCRYPTED_MARK, encryptText's base64. Found by text, so never change these
const BACKUP_NOTE_HEADER = 'Atmospheric Modulator settings backup v1';
const BACKUP_NOTE_ENCRYPTED_MARK = ', encrypted';
// Above the header, for whoever opens the note on Cyberspace, where it can
// be edited or published. A markdown heading, as notes are shown, and a
// blank line after, so the header does not run into its paragraph
const BACKUP_NOTE_WARNING = '# DO NOT PUBLISH OR EDIT\nThis is your Atmospheric Modulator settings backup. Editing it breaks it, and publishing it shows your settings, notes on other users included, to everyone.';
// How far into the note the header line may start: room for the warning,
// about 190 characters, and any later rewording. Without a limit, any note
// tagged BACKUP_NOTE_TOPIC that quotes the header anywhere would pass for a
// backup, and Save would offer to replace it
const BACKUP_NOTE_PREFACE_MAX = 1000;
const BACKUP_NOTE_HOW_TO_LOAD = '. Load it with Atmospheric Modulator: Settings > AtmoMod > Backup & Troubleshooting > Load from Note.';
// Cyberspace's limit on a note
const BACKUP_NOTE_MAX_LENGTH = 32768;
// Short enough to type, long enough that guessing it offline takes years
const BACKUP_NOTE_MIN_PASSPHRASE = 12;
// The most pages of notes to look through for the backup note: a list that
// never ends must not keep a signed-in loop of requests going
const BACKUP_NOTE_MAX_PAGES = 20;
// GM storage: { id, encrypted, key } for the note this browser last saved
// or loaded. key: the key made from the passphrase (exportTextKey), never
// the passphrase, which may open other things; kept only in the manager's
// own storage (hasPrivateGMStorage), so a save needs no typing
const BACKUP_NOTE_KEY = 'backupNote';

// A save or load in flight: a second press would race it for the same note
let backupNoteBusy = false;

/**
 * Run a save or load step, unless one is running.
 * Side effects: holds backupNoteBusy while task runs; logs and alerts an
 * error task did not handle.
 * @param {function(): Promise<void>} task
 * @returns {Promise<void>}
 */
async function runBackupNoteTask(task) {
	if (backupNoteBusy) return;
	backupNoteBusy = true;
	try {
		await task();
	} catch (e) {
		// A step that should not fail did: say so, rather than nothing
		logBackupNoteError('a step', e);
		alert(`Something went wrong with the Cyberspace note. ${e.message} Turn on debug mode and try again to see where in the console.`);
	} finally {
		backupNoteBusy = false;
	}
}

/**
 * Log a failed save or load step with its stack, for a bug report: the
 * alert says only what went wrong, not where. Never given the passphrase,
 * the key or the token, none of which are in an error.
 * Side effects: writes to the console.
 * @param {string} step - what was being done
 * @param {Error} e
 */
function logBackupNoteError(step, e) {
	console.error(`${LOG_PREFIX} Backup note: ${step} failed:`, e);
}

/**
 * The note this browser last saved or loaded.
 * @returns {Promise<{id: string|null, encrypted: boolean, key: Object|null}>}
 *   encrypted: how it was last saved or loaded; key: from importTextKey
 */
async function readBackupNoteState() {
	let saved;
	try {
		saved = JSON.parse(_GM_getValue(BACKUP_NOTE_KEY, 'null'));
	} catch (e) {
		saved = null;
	}
	return {
		id: typeof saved?.id === 'string' ? saved.id : null,
		encrypted: saved?.encrypted === true,
		key: saved?.key ? await importTextKey(saved.key) : null,
	};
}

/**
 * Remember the note, and the key that opens it.
 * Side effects: writes GM storage.
 * @param {string} id
 * @param {boolean} encrypted
 * @param {Object|null} key - from deriveTextKey or importTextKey; null for
 *   none. Not kept where page scripts could read it
 * @returns {Promise<void>}
 * @throws {TypeError} where the page has no Web Crypto
 */
async function saveBackupNoteState(id, encrypted, key) {
	const kept = key && hasPrivateGMStorage() ? await exportTextKey(key) : null;
	_GM_setValue(BACKUP_NOTE_KEY, JSON.stringify({ id, encrypted, key: kept }));
}

/**
 * Forget the note and its key: Erase All Settings.
 * Side effects: writes GM storage.
 */
function forgetBackupNote() {
	_GM_setValue(BACKUP_NOTE_KEY, 'null');
}

/**
 * The note's text for the current settings.
 * @param {Object|null} key - from deriveTextKey or importTextKey; null to
 *   leave it readable
 * @returns {Promise<string>}
 * @throws {TypeError} where the page has no Web Crypto or CompressionStream
 */
async function backupNoteContent(key) {
	const settings = JSON.stringify(exportBackup());
	if (!key) return `${BACKUP_NOTE_WARNING}\n\n${BACKUP_NOTE_HEADER}${BACKUP_NOTE_HOW_TO_LOAD}\n${settings}`;
	return `${BACKUP_NOTE_WARNING}\n\n${BACKUP_NOTE_HEADER}${BACKUP_NOTE_ENCRYPTED_MARK}${BACKUP_NOTE_HOW_TO_LOAD}\n${await encryptText(settings, key)}`;
}

/**
 * What a note holds, without opening it. The header line is first, or
 * within BACKUP_NOTE_PREFACE_MAX characters, after the warning above it;
 * notes saved before the warning have none.
 * @param {*} content - the note's text
 * @returns {{encrypted: boolean, body: string}|null} null when it is not a
 *   backup note
 */
function readBackupNote(content) {
	if (typeof content !== 'string') return null;
	// Found near the top, whatever the warning says: a later version may
	// word it otherwise. The settings hold no line breaks (JSON without
	// indent, or base64), so the match cannot be in them
	const afterLine = content.indexOf('\n' + BACKUP_NOTE_HEADER);
	const start = content.startsWith(BACKUP_NOTE_HEADER) ? 0
		: afterLine !== -1 && afterLine < BACKUP_NOTE_PREFACE_MAX ? afterLine + 1
		: -1;
	if (start === -1) return null;
	const lineEnd = content.indexOf('\n', start);
	if (lineEnd === -1) return null;
	return {
		encrypted: content.startsWith(BACKUP_NOTE_ENCRYPTED_MARK, start + BACKUP_NOTE_HEADER.length),
		body: content.slice(lineEnd + 1),
	};
}

/**
 * The backup note on Cyberspace: the one this browser used, else the first
 * of the user's notes tagged BACKUP_NOTE_TOPIC with a backup in it.
 * @param {string|null} rememberedId - the note this browser used
 * @returns {Promise<{id: string, backup: Object, known: boolean}|null>}
 *   backup: from readBackupNote; known: whether it is rememberedId; null
 *   when there is none
 * @throws {ApiUncertainError|ApiRefusedError|Error} as the API calls
 */
async function findBackupNote(rememberedId) {
	if (rememberedId) {
		try {
			const backup = readBackupNote((await getNote(rememberedId))?.content);
			if (backup) return { id: rememberedId, backup, known: true };
		} catch (e) {
			// Deleted, or published to the journal: look for another
			if (!(e instanceof ApiRefusedError && e.status === 404)) throw e;
		}
	}
	let cursor = null;
	const seen = new Set();
	for (let page = 0; page < BACKUP_NOTE_MAX_PAGES; page++) {
		const { notes, cursor: next } = await listNotes(cursor);
		for (const note of notes) {
			const id = noteId(note);
			if (!id || !Array.isArray(note.topics) || !note.topics.includes(BACKUP_NOTE_TOPIC)) continue;
			// A list may carry only the start of each note: fetch it whole
			const backup = readBackupNote((await getNote(id))?.content);
			if (backup) return { id, backup, known: id === rememberedId };
		}
		if (!next || seen.has(next)) break;
		seen.add(next);
		cursor = next;
	}
	return null;
}

/**
 * A failed save or load, as the user should hear it.
 * @param {Error} e
 * @param {boolean} writing - whether the failed request was a save: only
 *   then can it have done anything
 * @returns {string}
 */
function backupNoteErrorMessage(e, writing) {
	if (e instanceof ApiRefusedError && e.status === 429) {
		return writing ? 'Cyberspace allows 3 note saves a minute and 30 a day. Try again later.' : 'Cyberspace is getting too many requests. Try again in a minute.';
	}
	if (e instanceof ApiUncertainError && writing) return `${e.message} The note may have been saved: check your notes on Cyberspace before saving again.`;
	return e.message;
}

/**
 * Ask how to save, then save the settings to the backup note.
 * Side effects: opens a dialog; as saveBackupNote, after it.
 * @returns {Promise<void>}
 */
async function showSaveBackupNoteDialog() {
	if (backupNoteBusy) return;
	const state = await readBackupNoteState();
	const encryptId = uiId('backup-note-encrypt');
	const passphraseId = uiId('backup-note-passphrase');
	const repeatId = uiId('backup-note-repeat');
	const warningId = uiId('backup-note-warning');
	const passphraseHint = state.key
		? 'Leave both empty to keep using your passphrase: this browser remembers the key it made, not the passphrase. Type one to change it.'
		: `At least ${BACKUP_NOTE_MIN_PASSPHRASE} characters. On another browser, you type it to load. Lost, the note cannot be opened.`;
	// The hidden username tells password managers the passphrase is for this,
	// not the Cyberspace login they may hold
	const dialog = createDialog({
		title: 'Save to Note',
		width: '420px',
		onHelp: null,
		warning: '',
		attribution: [],
		content: `
			<p class="hint">Your settings go into a private note on Cyberspace, to load on any browser signed in as you. Each save adds a version to the same note.</p>
			${createInputRow({ type: 'toggle', id: encryptId, label: 'Encrypt note with passphrase', checked: state.encrypted || !state.id })}
			<div data-backup-note-passphrase>
				<input type="text" autocomplete="username" value="Atmospheric Modulator backup" hidden aria-hidden="true" tabindex="-1">
				${createInputRow({ type: 'password', stacked: true, id: passphraseId, label: 'Passphrase', hint: passphraseHint })}
				${createInputRow({ type: 'password', stacked: true, id: repeatId, label: 'Repeat passphrase' })}
			</div>
			<div id="${warningId}" role="status" aria-live="polite"></div>
		`,
		buttons: [
			{ label: 'SAVE NOTE', class: 'save', onClick: async (close) => {
				// The remembered key, a typed passphrase, or neither: unencrypted
				let lock = { key: null, passphrase: null };
				if (encrypt.checked) {
					const passphrase = passphraseInput.value;
					if (!passphrase && !repeatInput.value && state.key) {
						lock = { key: state.key, passphrase: null };
					} else if (passphrase.length < BACKUP_NOTE_MIN_PASSPHRASE) {
						alert(`Use a passphrase of at least ${BACKUP_NOTE_MIN_PASSPHRASE} characters, or turn off Encrypt note with passphrase.`);
						passphraseInput.focus();
						return;
					} else if (passphrase !== repeatInput.value) {
						alert('The two passphrases are different. Type the same one twice.');
						repeatInput.focus();
						return;
					} else {
						lock = { key: null, passphrase };
					}
				}
				close();
				await runBackupNoteTask(() => saveBackupNote(state.id, lock));
			} },
			{ label: 'CANCEL', class: 'cancel', onClick: (close) => close() },
		],
	});
	const encrypt = dialog.querySelector('#' + encryptId);
	const passphraseBlock = dialog.querySelector('[data-backup-note-passphrase]');
	const passphraseInput = dialog.querySelector('#' + passphraseId);
	const repeatInput = dialog.querySelector('#' + repeatId);
	const warning = dialog.querySelector('#' + warningId);
	passphraseInput.setAttribute('autocomplete', 'new-password');
	repeatInput.setAttribute('autocomplete', 'new-password');
	// A live region, and the switch's description: heard when it appears,
	// and when the switch is reached
	const showChoice = () => {
		syncToggle(encrypt);
		passphraseBlock.hidden = !encrypt.checked;
		warning.innerHTML = encrypt.checked ? '' : warningBoxHtml('Without a passphrase, anyone who sees this note can read your settings, your notes on other users included: if it is ever published to your journal, or if Cyberspace\'s data leaks.');
		if (encrypt.checked) encrypt.removeAttribute('aria-describedby');
		else encrypt.setAttribute('aria-describedby', warningId);
	};
	encrypt.addEventListener('change', showChoice);
	showChoice();
	(encrypt.checked ? passphraseInput : encrypt).focus();
}

/**
 * Save the settings: a new revision of the backup note, or a new note.
 * Asks first before replacing a note this browser has not used, and
 * before deleting one whose history holds what this save would not: an
 * unencrypted version, or one under another passphrase.
 * Side effects: may open dialogs; saves to Cyberspace, and may delete the
 * old note; remembers the note and key; alerts how it went.
 * @param {string|null} rememberedId - the note this browser used
 * @param {{key: Object|null, passphrase: string|null}} lock - key: the
 *   remembered one; passphrase: one typed, to make a key from (keyFor);
 *   both null to save it readable
 * @returns {Promise<void>}
 */
async function saveBackupNote(rememberedId, lock) {
	let found;
	try {
		found = await findBackupNote(rememberedId);
	} catch (e) {
		logBackupNoteError('finding the note to save to', e);
		alert(`Could not read your Cyberspace notes, so nothing was saved. ${backupNoteErrorMessage(e, false)}`);
		return;
	}
	let key;
	let content;
	try {
		key = lock.passphrase ? await keyFor(lock.passphrase, found) : lock.key;
		content = await backupNoteContent(key);
	} catch (e) {
		logBackupNoteError('locking the settings', e);
		alert(`The settings were not saved to Cyberspace. ${e.message}`);
		return;
	}
	if (content.length > BACKUP_NOTE_MAX_LENGTH) {
		alert(key
			? 'Your settings are too big for a Cyberspace note. Use Save Settings File instead.'
			: 'Your settings are too big for a Cyberspace note. Encrypting compresses them, and may make them fit; else use Save Settings File.');
		return;
	}
	const save = (replace) => runBackupNoteTask(() => writeBackupNote(found, replace, content, key));
	if (!found) return writeBackupNote(null, false, content, key);
	// A key unlike the one the note was locked with: another passphrase
	const otherKey = key && found.backup.encrypted && !sameSaltOf(found.backup.body, key);
	if (key && (!found.backup.encrypted || otherKey)) {
		confirmAction({
			title: 'Start a new backup note?',
			message: `Your backup note's history keeps every version, ${found.backup.encrypted ? 'some under another passphrase' : 'some of them unencrypted'}. Saving makes a new encrypted note and deletes the old one, with all its versions. Cyberspace hides a deleted note, though it may keep a copy.`,
			confirmLabel: 'SAVE AND DELETE OLD NOTE',
			tone: 'caution',
			onConfirm: () => save(true),
		});
		return;
	}
	if (!found.known) {
		confirmAction({
			title: 'Replace the backup note?',
			message: 'There is a settings backup note on Cyberspace that this browser has not saved or loaded. Saving replaces it with this browser\'s settings. Its earlier versions stay in the note\'s history on Cyberspace.',
			confirmLabel: 'REPLACE',
			tone: 'caution',
			onConfirm: () => save(false),
		});
		return;
	}
	return writeBackupNote(found, false, content, key);
}

/**
 * The key a typed passphrase makes: the note's own, when it is the
 * passphrase the note was locked with, so the save is a plain new revision;
 * else a new one, with a new salt.
 * @param {string} passphrase
 * @param {{backup: {encrypted: boolean, body: string}}|null} found - from
 *   findBackupNote
 * @returns {Promise<Object>} as deriveTextKey's
 * @throws {TypeError} where the page has no Web Crypto
 */
async function keyFor(passphrase, found) {
	if (found?.backup.encrypted) {
		try {
			const key = await deriveTextKey(passphrase, lockedTextSalt(found.backup.body));
			await decryptText(found.backup.body, key);
			return key;
		} catch (e) {
			// Another passphrase, or a note this version cannot read
			if (e instanceof TypeError) throw e;
		}
	}
	return deriveTextKey(passphrase);
}

/**
 * Whether key opens what a locked note body was locked with.
 * @param {string} body - the note's locked text
 * @param {{salt: Uint8Array}} key
 * @returns {boolean} false too when the body is not one this version reads
 */
function sameSaltOf(body, key) {
	try {
		return sameSalt(lockedTextSalt(body), key.salt);
	} catch (e) {
		return false;
	}
}

/**
 * Write the note: a new revision of found, a new note (then delete found,
 * when replace), or a new note when there is none.
 * Side effects: saves to Cyberspace, and may delete found; remembers the
 * note and key; alerts how it went.
 * @param {{id: string}|null} found - from findBackupNote
 * @param {boolean} replace - make a new note and delete found
 * @param {string} content
 * @param {Object|null} key - as saveBackupNote's
 * @returns {Promise<void>}
 */
async function writeBackupNote(found, replace, content, key) {
	let id = found && !replace ? found.id : null;
	let note;
	try {
		if (id) {
			try {
				note = await updateNote(id, content, [BACKUP_NOTE_TOPIC]);
			} catch (e) {
				// Gone since it was found: make a new one
				if (!(e instanceof ApiRefusedError && e.status === 404)) throw e;
				id = null;
			}
		}
		if (!id) note = await createNote(content, [BACKUP_NOTE_TOPIC]);
	} catch (e) {
		logBackupNoteError('saving the note', e);
		alert(`The settings were not saved to Cyberspace. ${backupNoteErrorMessage(e, true)}`);
		return;
	}
	let message = key ? 'Settings saved to your Cyberspace note, encrypted.' : 'Settings saved to your Cyberspace note.';
	// Before looking the new note up: the old one must not be found instead
	if (replace) {
		try {
			await deleteNote(found.id);
		} catch (e) {
			if (!(e instanceof ApiRefusedError && e.status === 404)) message += ` The old note could not be deleted: delete it on Cyberspace. ${backupNoteErrorMessage(e, false)}`;
		}
	}
	id = noteId(note) ?? id;
	if (!id) {
		// An answer without an ID the script knows: find the note it made
		console.warn(LOG_PREFIX + ' Cyberspace saved the note without an ID this version recognizes');
		const made = await findBackupNote(null).catch(() => null);
		id = made && made.id !== found?.id ? made.id : null;
	}
	if (id) {
		try {
			await saveBackupNoteState(id, !!key, key);
		} catch (e) {
			// Saved all the same: the next save asks for the passphrase again
			logBackupNoteError('remembering the note and key', e);
		}
	}
	alert(message);
}

/**
 * Load the settings from the backup note: with the key this browser
 * remembers when it opens the note, else asking for the passphrase.
 * Side effects: reads Cyberspace; may open dialogs; imports the settings
 * (finishImport); remembers the note and key; alerts how it went.
 * @param {Function} onImported - as finishImport's
 * @returns {Promise<void>}
 */
async function loadBackupNote(onImported) {
	await runBackupNoteTask(async () => {
		const state = await readBackupNoteState();
		let found;
		try {
			found = await findBackupNote(state.id);
		} catch (e) {
			logBackupNoteError('finding the note to load', e);
			alert(`Could not read your Cyberspace notes. ${backupNoteErrorMessage(e, false)}`);
			return;
		}
		if (!found) {
			alert('There is no settings backup note on Cyberspace yet. Choose Save to Note first, on the browser that has your settings.');
			return;
		}
		if (!found.backup.encrypted) {
			// This browser saved the backup locked, and it comes back readable,
			// as the same note or a new one: someone changed it
			if (state.encrypted) {
				confirmAction({
					title: 'Load an unencrypted backup?',
					message: 'This browser saved your backup note encrypted, but it is not encrypted now: it was changed on Cyberspace. Load it only if you changed it yourself.',
					confirmLabel: 'LOAD ANYWAY',
					tone: 'caution',
					onConfirm: () => runBackupNoteTask(() => importBackupNote(found.id, found.backup.body, null, onImported, state.key)),
				});
				return;
			}
			await importBackupNote(found.id, found.backup.body, null, onImported);
			return;
		}
		if (state.key && sameSaltOf(found.backup.body, state.key)) {
			let text;
			try {
				text = await decryptText(found.backup.body, state.key);
			} catch (e) {
				logBackupNoteError('opening the note with the remembered key', e);
				alert(`The backup note could not be opened. ${e.message}`);
				return;
			}
			await importBackupNote(found.id, text, state.key, onImported);
			return;
		}
		try {
			lockedTextSalt(found.backup.body);
		} catch (e) {
			logBackupNoteError('reading the note\'s lock', e);
			alert(`The backup note could not be opened. ${e.message}`);
			return;
		}
		askBackupNotePassphrase(found, onImported);
	});
}

/**
 * Ask for the passphrase that opens the backup note, then load it.
 * Side effects: opens a dialog; as importBackupNote.
 * @param {{id: string, backup: {body: string}}} found - from findBackupNote
 * @param {Function} onImported - as finishImport's
 */
function askBackupNotePassphrase(found, onImported) {
	const passphraseId = uiId('backup-note-open');
	// Cancel or Escape while the key is made stops the load
	let closed = false;
	// As the save dialog's: the hidden username keeps password managers apart
	const dialog = createDialog({
		title: 'Load from Note',
		onClose: () => { closed = true; },
		width: '400px',
		onHelp: null,
		warning: '',
		attribution: [],
		content: `
			<input type="text" autocomplete="username" value="Atmospheric Modulator backup" hidden aria-hidden="true" tabindex="-1">
			${createInputRow({ type: 'password', stacked: true, id: passphraseId, label: 'Passphrase',
				hint: 'The one the settings were saved with. This browser remembers the key it makes, not the passphrase.' })}`,
		buttons: [
			{ label: 'LOAD', class: 'save', onClick: (close) => runBackupNoteTask(async () => {
				let key;
				let text;
				try {
					key = await deriveTextKey(input.value, lockedTextSalt(found.backup.body));
					text = await decryptText(found.backup.body, key);
				} catch (e) {
					if (closed) return;
					if (!(e instanceof WrongPassphraseError)) logBackupNoteError('opening the note with the passphrase', e);
					alert(e.message);
					input.focus();
					return;
				}
				if (closed) return;
				logDebug(LOG_PREFIX + ' Backup note: the passphrase opened it');
				close();
				await importBackupNote(found.id, text, key, onImported);
			}) },
			{ label: 'CANCEL', class: 'cancel', onClick: (close) => close() },
		],
	});
	const input = dialog.querySelector('#' + passphraseId);
	input.setAttribute('autocomplete', 'current-password');
	input.focus();
}

/**
 * Import the backup note's settings, then remember the note.
 * Side effects: imports the settings (finishImport); remembers the note and
 * key, or logs why it could not; alerts on a damaged note.
 * @param {string} id
 * @param {string} text - the settings' JSON
 * @param {Object|null} key - the key that opened it; null when it was not
 *   encrypted
 * @param {Function} onImported - as finishImport's
 * @param {Object|null} [keepKey] - a key to keep remembering though the
 *   note was not encrypted: one the user chose, before it was changed
 * @returns {Promise<void>}
 */
async function importBackupNote(id, text, key, onImported, keepKey = null) {
	logDebug(LOG_PREFIX + ' Backup note: opened, reading the settings');
	let data;
	try {
		data = parseBackupText(text);
	} catch (e) {
		logBackupNoteError('reading the opened settings', e);
		alert(`The backup note is damaged. ${e.message}`);
		return;
	}
	logDebug(LOG_PREFIX + ' Backup note: remembering the note and key');
	try {
		await saveBackupNoteState(id, !!(key || keepKey), key ?? keepKey);
	} catch (e) {
		// Loaded all the same: the next load asks for the passphrase again
		logBackupNoteError('remembering the note and key', e);
	}
	logDebug(LOG_PREFIX + ' Backup note: importing the settings');
	finishImport(data, onImported);
	logDebug(LOG_PREFIX + ' Backup note: imported');
}

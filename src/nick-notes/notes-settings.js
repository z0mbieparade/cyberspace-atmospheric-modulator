// =====================================================
// USERS SECTION: nick notes' part
// =====================================================
// In the Users section (src/user-list.js): each user's note, a pencil that
// opens the Notes dialog, and a trash button that deletes it after asking;
// or, with no note, a quiet "add note".

// A pixel pencil, in the text color. Decorative: the button is named
const PENCIL_ICON_SVG = '<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" shape-rendering="crispEdges" aria-hidden="true" focusable="false">'
	+ '<rect x="11" y="1" width="2" height="2"/><rect x="13" y="3" width="2" height="2"/><rect x="9" y="3" width="2" height="2"/>'
	+ '<rect x="7" y="5" width="2" height="2"/><rect x="11" y="5" width="2" height="2"/><rect x="5" y="7" width="2" height="2"/>'
	+ '<rect x="9" y="7" width="2" height="2"/><rect x="3" y="9" width="2" height="2"/><rect x="7" y="9" width="2" height="2"/>'
	+ '<rect x="1" y="11" width="2" height="4"/><rect x="3" y="13" width="2" height="2"/><rect x="5" y="11" width="2" height="2"/></svg>';

// A pixel trash can, in the text color. Decorative: the button is named
const TRASH_ICON_SVG = '<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" shape-rendering="crispEdges" aria-hidden="true" focusable="false">'
	+ '<rect x="5" y="1" width="6" height="2"/><rect x="2" y="3" width="12" height="2"/><rect x="3" y="6" width="2" height="8"/>'
	+ '<rect x="11" y="6" width="2" height="8"/><rect x="3" y="13" width="10" height="2"/><rect x="7" y="7" width="2" height="5"/></svg>';

/**
 * The key a user's notes are stored under, whatever the case of username:
 * a row's spelling can come from another feature's data, saved under other
 * capitals (a color under "ZeD", the note under "Zed"), and a note saved
 * under an older lowercase friend's spelling must still show.
 * @param {string} username
 * @returns {string} the stored key, or username when they have none
 */
function notesKeyFor(username) {
	const lower = username.toLowerCase();
	return Object.keys(nickNotes).find(key => key.toLowerCase() === lower) ?? username;
}

/**
 * A user's note for their row: the note as text, a pencil button and a
 * trash button; or "add note". Clicking the text opens the Notes dialog too,
 * as a shortcut for the pointer: the pencil is the control, for the keyboard.
 * @param {string} username
 * @returns {Node[]}
 */
function notesListParts(username) {
	const key = notesKeyFor(username);
	const notes = nickNotes[key];
	if (!notes) {
		const add = document.createElement('button');
		add.type = 'button';
		add.className = uiClass('note-add');
		// The control, for redrawEntryList: focus comes back to it after a save
		add.dataset.entryControl = 'note';
		add.textContent = 'add note';
		add.setAttribute('aria-label', `add note on @${key}`);
		add.addEventListener('click', () => createNotesDialog(key));
		return [userListColumn(add, 'text')];
	}
	const text = document.createElement('p');
	text.className = uiClass('entry-text', 'note-text');
	text.textContent = notes;
	text.title = 'Edit notes';
	text.addEventListener('click', () => createNotesDialog(key));
	const edit = iconButton(PENCIL_ICON_SVG, `Edit notes on @${key}`, () => createNotesDialog(key));
	edit.dataset.entryControl = 'note';
	const trash = iconButton(TRASH_ICON_SVG, `Delete notes on @${key}`, () => confirmDeleteNotes(key), 'danger');
	trash.dataset.entryControl = 'trash';
	return [userListColumn(text, 'text'), userListColumn(edit, 'edit'), userListColumn(trash, 'delete')];
}

/**
 * A button that is only an icon, named and titled by label.
 * @param {string} svg - the icon, decorative (aria-hidden)
 * @param {string} label
 * @param {Function} onClick
 * @param {'danger'} [tone] - danger: the error color on hover, for a delete
 * @returns {HTMLButtonElement}
 */
function iconButton(svg, label, onClick, tone) {
	const button = document.createElement('button');
	button.type = 'button';
	button.className = tone ? uiClass('icon-btn', tone) : uiClass('icon-btn');
	button.title = label;
	button.setAttribute('aria-label', label);
	button.innerHTML = svg;
	button.addEventListener('click', onClick);
	return button;
}

/**
 * Ask, then delete one user's notes.
 * Side effects: opens a dialog; confirming deletes and saves the notes and
 * redraws the Users section.
 * @param {string} username
 */
function confirmDeleteNotes(username) {
	confirmAction({
		title: 'Delete these notes?',
		message: `This deletes your notes on @${escapeHtml(username)}, and cannot be undone.`,
		confirmLabel: 'DELETE',
		tone: 'danger',
		onConfirm: () => {
			delete nickNotes[username];
			saveNickNotes();
			refreshUserList(username);
		},
	});
}

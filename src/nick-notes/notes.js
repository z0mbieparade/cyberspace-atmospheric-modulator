// =====================================================
// NICK NOTES
// =====================================================
// Personal notes on a username, shown when hovering it. Switched by
// featureConfig.nickNotes. The names are the ones src/shared/usernames.js
// marks, which this feature turns on whether or not nick colors is on.

const NOTES_LOG_PREFIX = featureLogPrefix('nick-notes');

// { username: notes }
let nickNotes = {};

// Wait before the tooltip shows, so passing over a name does not flash it
const NOTES_TOOLTIP_DELAY_MS = 300;

/**
 * Read the notes from storage.
 * Side effects: replaces nickNotes.
 */
function loadNickNotes() {
	try {
		const saved = JSON.parse(_GM_getValue('nickNotes', '{}'));
		nickNotes = saved && typeof saved === 'object' ? saved : {};
	} catch (e) {
		nickNotes = {};
	}
}

/**
 * Write the notes to storage.
 */
function saveNickNotes() {
	_GM_setValue('nickNotes', JSON.stringify(nickNotes));
}

/**
 * Move notes out of nick colors' storage, where they lived before this
 * feature, and where Import from Nick Colors and older backups still put
 * them. Anything found there is newer than what is here: nick colors drops
 * notes from memory as it loads, so it never writes old ones back.
 * Side effects: replaces those users' notes and saves; removes the notes
 * from nick colors' storage.
 */
function adoptNickColorsNotes() {
	let customNickColors;
	try {
		customNickColors = JSON.parse(_GM_getValue('customNickColors', '{}'));
	} catch (e) {
		return;
	}
	if (!customNickColors || typeof customNickColors !== 'object') return;
	let adopted = 0;
	for (const [username, styles] of Object.entries(customNickColors)) {
		if (!styles || typeof styles !== 'object' || !('userNotes' in styles)) continue;
		if (typeof styles.userNotes === 'string' && styles.userNotes) nickNotes[username] = styles.userNotes;
		delete styles.userNotes;
		adopted++;
	}
	if (!adopted) return;
	saveNickNotes();
	_GM_setValue('customNickColors', JSON.stringify(customNickColors));
	logDebug(NOTES_LOG_PREFIX + ` Moved ${adopted} notes out of nick colors' storage`);
}

/**
 * Load the notes, with any still in nick colors' storage. Runs at load,
 * with the feature on or off and on excluded pages too: it only moves data
 * between storage keys, so notes never stay where nick colors would show them.
 * Side effects: as loadNickNotes and adoptNickColorsNotes.
 */
function initNickNotes() {
	loadNickNotes();
	adoptNickColorsNotes();
}
initNickNotes();

/**
 * Open the notes dialog for a user.
 * Side effects: opens a dialog; Save stores the notes.
 * @param {string} username
 */
function createNotesDialog(username) {
	// The menu passes the name as this page spells it; the note may be saved
	// under another case, and a second key would hide it
	const noteKey = notesKeyFor(username);
	const textareaId = uiId('nick-notes');
	const dialog = createDialog({
		title: `Notes: ${escapeHtml(username)}`,
		width: '350px',
		onHelp: null,
		// The feature's switch is in the script's own section; nick colors'
		// SETTINGS_SECTION_KEY is private to its block, so this is the core's
		onSettings: () => openSettingsSection(SETTINGS_SECTION_KEY),
		content: createInputRow({
			type: 'textarea',
			id: textareaId,
			label: 'Notes',
			hint: 'Only you see these, when you hover their name.',
			value: nickNotes[noteKey] || '',
		}),
		buttons: [
			{ label: 'Save', class: 'save', onClick: (close) => {
				const notes = textarea.value.trim();
				if (notes) nickNotes[noteKey] = notes;
				else delete nickNotes[noteKey];
				saveNickNotes();
				close();
				// After close, which returns focus to what opened the dialog
				refreshUserList(username);
			} },
			{ label: 'Cancel', class: 'cancel', onClick: (close) => close() },
		],
	});
	const textarea = dialog.querySelector('#' + textareaId);
	textarea.focus();
}

let notesTooltip = null;
let notesTooltipTimer = null;
// The name the tooltip is for, while it shows or waits to
let notesTooltipTarget = null;

/**
 * The tooltip element, created once. The pointer can move onto it, and
 * leaving it for anywhere but its name hides it (WCAG 1.4.13).
 * @returns {HTMLElement}
 */
function getNotesTooltip() {
	if (!notesTooltip) {
		notesTooltip = document.createElement('div');
		notesTooltip.className = 'nn-tooltip';
		notesTooltip.id = uiId('nick-notes-tooltip');
		notesTooltip.setAttribute('role', 'tooltip');
		notesTooltip.addEventListener('mouseleave', (e) => {
			if (!notesTooltipTarget?.contains(e.relatedTarget)) hideNotesTooltip();
		});
		document.body.appendChild(notesTooltip);
	}
	return notesTooltip;
}

/**
 * Show a name's notes under it, after a short wait.
 * Side effects: marks the name (help cursor), and describes it by the
 * tooltip while it shows.
 * @param {HTMLElement} target - a user menu target
 */
function showNotesTooltip(target) {
	hideNotesTooltip();
	// Whatever the case it was saved under, as from the Users section
	const notes = nickNotes[notesKeyFor(usernameOf(target))];
	target.classList.toggle('nn-has-notes', !!notes);
	if (!notes) return;
	notesTooltipTarget = target;
	notesTooltipTimer = setTimeout(() => {
		// The site removed the name while we waited, as on navigating away
		if (!target.isConnected) {
			hideNotesTooltip();
			return;
		}
		const tooltip = getNotesTooltip();
		tooltip.textContent = notes;
		const rect = target.getBoundingClientRect();
		tooltip.style.left = rect.left + 'px';
		// Touching the name's bottom edge, so the pointer can cross onto it
		tooltip.style.top = rect.bottom + 'px';
		tooltip.classList.add('visible');
		target.setAttribute('aria-describedby', tooltip.id);
	}, NOTES_TOOLTIP_DELAY_MS);
}

/**
 * Hide the tooltip, and cancel one waiting to show.
 * Side effects: removes the name's aria-describedby.
 */
function hideNotesTooltip() {
	clearTimeout(notesTooltipTimer);
	notesTooltipTimer = null;
	notesTooltip?.classList.remove('visible');
	notesTooltipTarget?.removeAttribute('aria-describedby');
	notesTooltipTarget = null;
}

/**
 * Whether the tooltip shows or waits to.
 * @returns {boolean}
 */
function notesTooltipActive() {
	return notesTooltipTarget !== null;
}

/**
 * Nick notes' part of the debug log. Counts only: notes are private.
 * @returns {string}
 */
function nickNotesSummary() {
	const count = Object.keys(nickNotes).length;
	return `${count} ${count === 1 ? 'note' : 'notes'}`;
}

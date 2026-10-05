// =====================================================
// INITIALIZATION
// =====================================================

registerFeature({
	key: 'nickNotes',

	onStorageReady() {
		initNickNotes();
	},

	exportBackup: () => ({ ...nickNotes }),
	importBackup(data) {
		if (!data || typeof data !== 'object') return { success: false, message: 'The notes are not readable.' };
		// Only text: a note is shown as text, and nothing else belongs here
		nickNotes = Object.fromEntries(Object.entries(data).filter(([, notes]) => typeof notes === 'string' && notes));
		saveNickNotes();
		return { success: true, message: 'Notes imported.' };
	},
	resetSettings() {
		nickNotes = {};
		saveNickNotes();
	},
	debugLog: nickNotesSummary,
	reportSummary: nickNotesSummary,

	boot() {
		// Switched off: gone from the menu now, not after a reload
		registerUserMenuItem({ label: 'Notes', order: 20, showFor: () => featureConfig.nickNotes, onSelect: createNotesDialog });
		// Notes attach to the names the finder marks, with or without nick colors
		watchUsernames();

		// Delegated, so names added later need nothing of their own. Shown on
		// hover and on keyboard focus; Escape dismisses it (WCAG 1.4.13)
		document.addEventListener('mouseover', (e) => {
			const target = findUserMenuTarget(e);
			if (target && !target.contains(e.relatedTarget)) showNotesTooltip(target);
		});
		document.addEventListener('mouseout', (e) => {
			const target = findUserMenuTarget(e);
			// Onto the tooltip keeps it, so its text can be read and selected
			if (target && !target.contains(e.relatedTarget) && !notesTooltip?.contains(e.relatedTarget)) hideNotesTooltip();
		});
		document.addEventListener('focusin', (e) => {
			const target = findUserMenuTarget(e);
			if (target) showNotesTooltip(target);
		});
		document.addEventListener('focusout', (e) => {
			if (findUserMenuTarget(e)) hideNotesTooltip();
		});
		// A click may navigate and take the name with it, without a mouseout
		document.addEventListener('pointerdown', (e) => {
			if (notesTooltipActive() && !notesTooltip?.contains(e.target)) hideNotesTooltip();
		}, true);
		document.addEventListener('keydown', (e) => {
			if (e.key === 'Escape' && notesTooltipActive()) hideNotesTooltip();
		});
	},
});

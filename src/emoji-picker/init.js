// =====================================================
// INITIALIZATION
// =====================================================

registerFeature({
	key: 'emojiPicker',

	onStorageReady: () => loadEmojiRecents(),

	// The recents are what was picked, not a setting: no backup holds them
	resetSettings: () => replaceEmojiRecents(null),
	reportSummary: () => `${Object.values(currentEmojiRecents()).flat().length} recent picks`,
	// Off takes the buttons away now; on puts them back
	onSwitch: () => drawEmojiButtons(),

	boot() {
		watchEmojiFields();
		drawEmojiButtons();
	},
});

// =====================================================
// INITIALIZATION
// =====================================================

// Sections of one order sort by key: this one comes right after Nick Colors'
const NICK_EFFECTS_SECTION_KEY = 'atmospheric-modulator-nick-effects';

registerFeature({
	key: 'nickEffects',
	// Who it plays for may be chooms only
	usesChooms: true,

	onStorageReady(booted) {
		loadNickEffects();
		loadOwnUsername();
		if (booted) refreshSettingsSection(NICK_EFFECTS_SECTION_KEY);
	},

	exportBackup: () => ({ ...nickEffects }),
	importBackup(data, booted) {
		if (!data || typeof data !== 'object') return { success: false, message: 'The nick effects settings are not readable.' };
		replaceNickEffects(data);
		if (booted) refreshSettingsSection(NICK_EFFECTS_SECTION_KEY);
		return { success: true, message: 'Nick effects settings imported.' };
	},
	resetSettings(booted) {
		replaceNickEffects(null);
		if (booted) refreshSettingsSection(NICK_EFFECTS_SECTION_KEY);
	},
	reportSummary: nickEffectsSummary,

	boot() {
		// Off: hidden, and back when switched on again, without a reload
		registerSettingsSection({ key: NICK_EFFECTS_SECTION_KEY, title: 'Nick Effects', isShown: () => featureConfig.nickEffects, render: renderNickEffectsSettings });
		registerUserMenuItem({ label: 'Edit Effect', order: 11, group: USER_MENU_GROUPS.edit, showFor: username => featureConfig.nickEffects && playsEffectFor(username), onSelect: createEffectDialog });
		// The menu finds names by the marks the finder adds
		watchUsernames();
		watchEffects();
	},
});

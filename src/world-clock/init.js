// =====================================================
// INITIALIZATION
// =====================================================

const WORLD_CLOCK_SECTION_KEY = 'atmospheric-modulator-world-clock';

registerFeature({
	key: 'worldClock',

	onStorageReady(booted) {
		loadWorldClock();
		if (booted) {
			drawWorldClock();
			refreshSettingsSection(WORLD_CLOCK_SECTION_KEY);
		}
	},

	exportBackup: () => ({ ...worldClock }),
	importBackup(data, booted) {
		if (!data || typeof data !== 'object') return { success: false, message: 'The world clock settings are not readable.' };
		replaceWorldClock(data);
		if (booted) refreshSettingsSection(WORLD_CLOCK_SECTION_KEY);
		return { success: true, message: 'World clock settings imported.' };
	},
	resetSettings(booted) {
		replaceWorldClock(null);
		if (booted) refreshSettingsSection(WORLD_CLOCK_SECTION_KEY);
	},
	reportSummary: () => {
		const count = worldClock.cities.length + worldClock.custom.length;
		return `${count} ${count === 1 ? 'city' : 'cities'}`;
	},
	// Off takes the row away now; on puts it back
	onSwitch: () => drawWorldClock(),

	boot() {
		// Off: hidden, and back when switched on again, without a reload
		registerSettingsSection({ key: WORLD_CLOCK_SECTION_KEY, title: 'World Clock', isShown: () => featureConfig.worldClock, render: renderWorldClockSettings });
		watchCircHeaders();
		drawWorldClock();
	},
});

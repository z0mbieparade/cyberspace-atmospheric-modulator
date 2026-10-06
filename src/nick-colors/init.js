// =====================================================
// INITIALIZATION
// =====================================================
// Nick colors is a feature of this script, switched by featureConfig.nickColors
// (on by default). It boots only after the core has started (startFeatures):
// never on an excluded page, and after the styles are in.

// Fetch remote overrides. A failed fetch leaves the local overrides in place
function fetchOverrides() {
	if (!OVERRIDES_URL) return Promise.resolve();
	return fetchText(OVERRIDES_URL)
		.then(text => {
			// Every install applies these: only safe styles get through (sanitize.js)
			const remoteOverrides = sanitizeNickStyles(JSON.parse(text), 'imported');
			MANUAL_OVERRIDES = { ...remoteOverrides, ...MANUAL_OVERRIDES };
			logDebug(NICK_LOG_PREFIX + ' Loaded remote overrides:', Object.keys(remoteOverrides).length);
		})
		.catch(e => console.error(NICK_LOG_PREFIX + ' Failed to load remote overrides:', e));
}

registerFeature({
	key: 'nickColors',

	onStorageReady(booted) {
		loadSiteConfig();
		loadCustomNickColors();
		if (booted) colorizeAll();
	},

	// The script-wide backup and troubleshooting (src/backup.js). These work
	// with the feature off: the settings are in storage either way
	exportBackup: () => minifyKeys(exportSettings()),
	importBackup(data, booted) {
		const result = importSettings(data, { recolor: booted, replaceAll: true });
		if (result.success) refreshSettingsSection(SETTINGS_SECTION_KEY);
		return { ...result, notice: droppedStylesNote(result.dropped, 'imported').trim() };
	},
	resetSettings(booted) {
		// An import of nothing: every setting and per-name style at its default
		const result = importSettings({}, { recolor: booted, replaceAll: true });
		refreshSettingsSection(SETTINGS_SECTION_KEY);
		// importSettings reports a failure rather than throwing
		if (!result.success) throw new Error(result.message);
	},
	debugLog: nickDebugLog,
	reportSummary: nickReportSummary,

	boot() {
		// This script starts at document-start, before the site's stylesheet:
		// read the theme again now that it has loaded
		siteThemeName = document.documentElement?.dataset?.theme || null;
		loadSiteCustomTheme();
		loadSiteTheme();
		initThemeVariables();

		registerUserMenuItem({
			label: 'Color',
			order: 10,
			// Switched off: gone from the menu now, not after a reload
			showFor: () => featureConfig.nickColors,
			// Raw styles, so the sliders show the saved values before range mapping
			onSelect: username => createUserSettingsPanel(username, getRawStylesForPicker(username)),
		});

		if (registerMenuCommand) {
			registerMenuCommand('Nick Colors Settings', createSettingsPanel);
			registerMenuCommand('Refresh Nick Colors', refreshNickColors);
			registerMenuCommand('Clear All Custom Colors', confirmClearCustomNickColors);
		}

		// Off: hidden, and back when switched on again, without a reload
		registerSettingsSection({ key: SETTINGS_SECTION_KEY, title: 'Nick Colors', isShown: () => featureConfig.nickColors, render: renderSiteSettingsSection });

		// Color once the remote overrides are in, so overridden names do not
		// flash; then each name as the finder marks it (src/shared/usernames.js)
		fetchOverrides().then(() => watchUsernames(found => found.forEach(styleUsername)));

		// Watch for theme changes on <html data-theme="...">
		new MutationObserver((mutations) => {
			if (!mutations.some(mutation => mutation.attributeName === 'data-theme')) return;
			logDebug(NICK_LOG_PREFIX + ' Theme changed, refreshing colors');
			siteThemeName = document.documentElement.getAttribute('data-theme') || null;
			loadSiteCustomTheme();
			loadSiteTheme();
			initThemeVariables();
			colorizeAll();
		}).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

		console.log(NICK_LOG_PREFIX + ' Loaded. Right-click or long-press a username, then choose Color, to customize it.');
	},
});

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
			// The list's previews draw overridden names in their override
			restyleNickColorList();
			logDebug(NICK_LOG_PREFIX + ' Loaded remote overrides:', Object.keys(remoteOverrides).length);
		})
		.catch(e => console.error(NICK_LOG_PREFIX + ' Failed to load remote overrides:', e));
}

registerFeature({
	key: 'nickColors',

	onStorageReady(booted) {
		loadSiteConfig();
		loadCustomNickColors();
		loadNickFriends();
		if (booted) colorizeAll();
	},

	// The script-wide backup and troubleshooting (src/backup.js). These work
	// with the feature off: the settings are in storage either way
	exportBackup: () => minifyKeys(exportSettings()),
	importBackup(data, booted) {
		const result = importSettings(data, { recolor: booted, replaceAll: true });
		if (result.success) {
			refreshSettingsSection(SETTINGS_SECTION_KEY);
			// Its colors and friends are rows there too
			refreshUserList();
		}
		return { ...result, notice: droppedStylesNote(result.dropped, 'imported').trim() };
	},
	resetSettings(booted) {
		// An import of nothing: every setting and per-name style at its default
		const result = importSettings({}, { recolor: booted, replaceAll: true });
		refreshSettingsSection(SETTINGS_SECTION_KEY);
		refreshUserList();
		// importSettings reports a failure rather than throwing
		if (!result.success) throw new Error(result.message);
	},
	debugLog: nickDebugLog,
	reportSummary: nickReportSummary,
	// Off takes the colors off every name now; on puts them back
	onSwitch: () => colorizeAll(),
	// Only my chooms, under the switch in the main settings
	renderSwitchDetail: renderNickFriendsSettings,

	boot() {
		// This script starts at document-start, before the site's stylesheet:
		// read the theme again now that it has loaded
		siteThemeName = document.documentElement?.dataset?.theme || null;
		loadSiteCustomTheme();
		loadSiteTheme();
		initThemeVariables();
		// The theme may have changed while the script was not running
		followSiteThemePreset();

		// Switched off: gone from the menu now, not after a reload. With only
		// friends colored, a friend can be edited or removed, anyone else added
		const friendsOnly = () => featureConfig.nickColors && nickFriends.enabled;
		registerUserMenuItem({ label: 'Color', order: 10, showFor: () => featureConfig.nickColors && !nickFriends.enabled, onSelect: editNickColor });
		registerUserMenuItem({ label: 'Add Color', order: 10, showFor: username => friendsOnly() && !isNickFriend(username), onSelect: username => setNickFriend(username, true) });
		registerUserMenuItem({ label: 'Edit Color', order: 10, showFor: username => friendsOnly() && isNickFriend(username), onSelect: editNickColor });
		registerUserMenuItem({ label: 'Remove Color', order: 11, showFor: username => friendsOnly() && isNickFriend(username), onSelect: username => setNickFriend(username, false) });

		// The Users section on the settings tab: each name as the page draws it, and
		// the star that makes them a choom
		registerUserListSource({
			order: 10,
			isShown: () => featureConfig.nickColors,
			usernames: () => [...Object.keys(customNickColors), ...nickFriends.users],
			name: nickColorListName,
			parts: nickColorListParts,
			actions: nickColorListActions,
		});

		if (registerMenuCommand) {
			// The script's settings dialog, at this section
			registerMenuCommand('Nick Colors Settings', () => openSettingsPanel(SETTINGS_SECTION_KEY));
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
			// Its section shows the new preset's ranges
			if (followSiteThemePreset()) refreshSettingsSection(SETTINGS_SECTION_KEY);
			colorizeAll();
		}).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

		console.log(NICK_LOG_PREFIX + ` Loaded. Right-click or long-press a username, then ${COLOR_MENU_HOWTO}, to customize it.`);
	},
});

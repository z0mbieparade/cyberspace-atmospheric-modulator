
// =====================================================
// INITIALIZATION
// =====================================================

// The ditherer runs during hydration, before document-idle, so the prototype
// hooks must be in place before the site's own scripts execute. They are
// installed immediately (this script runs at document-start); everything that
// needs the DOM is deferred to DOMContentLoaded.
//
// The host exclusions are enforced by the @exclude metadata (the manager does
// not run this script there); the path exclusions have no manager equivalent,
// so they are checked here, before any work is done.
if (isHostMatch(HOST_EXCLUDE) || isPathMatch(PATH_EXCLUDE)) {
	console.log(LOG_PREFIX + ' Excluded, doing nothing.');
} else {
	installDitherHooks();

	function bootModulator() {
		// The shared builder defines injectStyles(); at document-start there was no <head> to inject into
		injectStyles();
		resumeMessageToUser();

		if (registerMenuCommand) {
			registerMenuCommand(SETTINGS_TITLE, openSettingsPanel);
			registerMenuCommand('Dump Image Undither Diagnostics', diagnoseImageUndither);
		}

		initImageUndither();
		skipUsernamesMatching(standaloneNickColorsSelector());
		initUserMenu();
		initSidebarLink();
		configureSettingsTab({ label: SETTINGS_TAB_LABEL, title: SETTINGS_TAB_TITLE, hash: SETTINGS_TAB_HASH, warning: REPORT_WARNING, attribution: attributionItems() });
		registerSettingsSection({ key: SETTINGS_SECTION_KEY, title: SETTINGS_TITLE, description: SETTINGS_SECTION_DESCRIPTION, icon: logoIconHtml('atmo-section-icon'), render: renderSettingsSection });
		// Last on the tab, after this script's other sections: it covers them all
		registerSettingsSection({ key: BACKUP_SECTION_KEY, title: BACKUP_SECTION_TITLE, order: 1, render: renderBackupSection });
		startFeatures();
		startUpdateCheck();

		console.log(LOG_PREFIX + ' Loaded. Hover (or press and hold) any dithered image to see the original.');
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', bootModulator, { once: true });
	} else {
		bootModulator();
	}
}

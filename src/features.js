// =====================================================
// FEATURES
// =====================================================
// A feature built in its own scope (a { scope } group in userscript.config.js)
// joins in through registerFeature: its names are invisible out here, so the
// core reaches it only through these hooks. Each is switched by
// featureConfig[key] and boots at most once.
//
// Nothing boots until the core has (startFeatures): the core skips excluded
// pages and injects the styles first, and async GM storage can load before or
// after it does.

const FEATURES = [];
let featuresStarted = false;

/**
 * Add a feature for bootFeatures and the storage-ready hook to run.
 * @param {{key: string, boot: Function, onStorageReady?: function(boolean): void,
 *   exportBackup?: function(): Object, importBackup?: function(Object, boolean): {success: boolean, message: string},
 *   debugLog?: function(): string, reportSummary?: function(): string,
 *   resetSettings?: function(boolean): void, onSwitch?: function(boolean): void,
 *   renderSwitchDetail?: function(HTMLElement): void}} feature -
 *   key: its featureConfig switch; boot: start it, once the core has;
 *   onStorageReady: re-read its settings from storage: after async GM
 *   storage loads, and after an import stored new values (a backup, Import
 *   from Nick Colors), which one feature may read from another's keys. It may
 *   run before or after boot, and gets whether the feature has booted. It
 *   never runs at load with sync storage (Tampermonkey): a feature reads its
 *   settings as its file loads too, or it starts on its defaults there.
 *   The rest feed the script-wide backup and troubleshooting (backup.js), and
 *   run whether or not the feature is on: exportBackup: its settings, as JSON
 *   data; importBackup: store what exportBackup gave, told whether the feature
 *   has booted, returning an optional `notice` for the user; debugLog: its part of the debug log; reportSummary: its part
 *   of an issue report, one short line; resetSettings: put its settings and
 *   data back to their defaults, told whether the feature has booted;
 *   onSwitch: its switch changed in the settings form while it was booted,
 *   told whether it is on now. Without it, a feature turned off stops on reload;
 *   renderSwitchDetail: draws a setting of its own just under its switch in
 *   the script's main settings (featureSwitchDetail), shown while it is on
 */
function registerFeature(feature) {
	FEATURES.push({ ...feature, booted: false });
}

/**
 * Let features boot, and boot the enabled ones. The core calls it once it has
 * started; never on an excluded page.
 * Side effects: as bootFeatures.
 */
function startFeatures() {
	featuresStarted = true;
	bootFeatures();
}

/**
 * Boot every enabled feature not booted yet, once startFeatures has run and
 * storage has loaded. Safe to call again: after async GM storage loads, or a
 * setting is saved, a feature just turned on boots then.
 * Side effects: runs each such feature's boot().
 */
function bootFeatures() {
	// Before async storage loads, every switch reads as its default: a feature
	// switched off would boot, and keep running once the real value arrives
	if (!featuresStarted || !isGMStorageReady()) return;
	for (const feature of FEATURES) {
		if (feature.booted || !featureConfig[feature.key]) continue;
		feature.booted = true;
		try {
			feature.boot();
		} catch (e) {
			// One feature failing must not stop the rest of the script
			console.error(LOG_PREFIX + ` Failed to start ${feature.key}:`, e);
		}
	}
}

/**
 * Tell each booted feature whose switch changed: after the settings form
 * saved featureConfig.
 * Side effects: runs each such feature's onSwitch().
 * @param {Object} previous - featureConfig before the change
 */
function featuresSwitched(previous) {
	for (const feature of FEATURES) {
		if (!feature.booted || previous[feature.key] === featureConfig[feature.key]) continue;
		try {
			feature.onSwitch?.(!!featureConfig[feature.key]);
		} catch (e) {
			// One feature failing must not stop the rest of the script
			console.error(LOG_PREFIX + ` Failed to switch ${feature.key}:`, e);
		}
	}
}

/**
 * Tell every feature that storage holds new values: async GM storage has
 * loaded, or an import stored them.
 * Side effects: runs each feature's onStorageReady(), then boots any newly enabled.
 */
function featuresStorageReady() {
	for (const feature of FEATURES) {
		try {
			feature.onStorageReady?.(feature.booted);
		} catch (e) {
			// One feature failing must not stop the rest booting: under async
			// storage this is the only way any of them boots
			console.error(LOG_PREFIX + ` Failed to reload ${feature.key}:`, e);
		}
	}
	bootFeatures();
}

/**
 * What a feature draws under its switch in the script's main settings: a
 * setting that belongs beside the switch but lives in the feature's scope.
 * Side effects: calls the feature's renderSwitchDetail into a new element.
 * @param {string} key - the feature's key
 * @returns {HTMLElement|null} null when the feature draws nothing there
 */
function featureSwitchDetail(key) {
	const feature = FEATURES.find(f => f.key === key);
	if (!feature?.renderSwitchDetail) return null;
	const detail = document.createElement('div');
	// Set in under the switch, as a schema field's `sub` is
	detail.className = uiClass('sub-setting');
	try {
		feature.renderSwitchDetail(detail);
	} catch (e) {
		// The rest of the settings still render
		console.error(LOG_PREFIX + ` Failed to draw ${key}'s settings:`, e);
		return null;
	}
	return detail;
}


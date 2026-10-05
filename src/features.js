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
 *   resetSettings?: function(boolean): void}} feature -
 *   key: its featureConfig switch; boot: start it, once the core has;
 *   onStorageReady: re-read its settings from storage: after async GM
 *   storage loads, and after an import stored new values (a backup, Import
 *   from Nick Colors), which one feature may read from another's keys. It may
 *   run before or after boot, and gets whether the feature has booted.
 *   The rest feed the script-wide backup and troubleshooting (backup.js), and
 *   run whether or not the feature is on: exportBackup: its settings, as JSON
 *   data; importBackup: store what exportBackup gave, told whether the feature
 *   has booted, returning an optional `notice` for the user; debugLog: its part of the debug log; reportSummary: its part
 *   of an issue report, one short line; resetSettings: put its settings and
 *   data back to their defaults, told whether the feature has booted
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
 * Boot every enabled feature not booted yet, once startFeatures has run. Safe
 * to call again: after async GM storage loads, or a setting is saved, a
 * feature just turned on boots then.
 * Side effects: runs each such feature's boot().
 */
function bootFeatures() {
	if (!featuresStarted) return;
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
 * Tell every feature that storage holds new values: async GM storage has
 * loaded, or an import stored them.
 * Side effects: runs each feature's onStorageReady(), then boots any newly enabled.
 */
function featuresStorageReady() {
	for (const feature of FEATURES) feature.onStorageReady?.(feature.booted);
	bootFeatures();
}



// =====================================================
// CONFIGURATION
// =====================================================

// Debug mode: the script's one switch for detail in the console, and for
// nick colors' calculations in its dialogs and on hover
let DEBUG = _GM_getValue('debugMode', 'false') === 'true';

// Re-read after the async GM cache is populated, where the first read can't see it
function loadDebugMode() {
	DEBUG = _GM_getValue('debugMode', 'false') === 'true';
}

function saveDebugMode() {
	_GM_setValue('debugMode', DEBUG ? 'true' : 'false');
}

/**
 * Log to the console in debug mode.
 * @param {...*} args - as console.log's; start with LOG_PREFIX or the
 *   feature's prefix (featureLogPrefix), which this does not add
 */
function logDebug(...args) {
	if (DEBUG) console.log(...args);
}

// Feature settings - defaults for anything not yet saved
const DEFAULT_FEATURE_CONFIG = {
	unditherImages: true, // hover (or press and hold) swaps a dithered img for its original
	holdDuration: 500,    // ms of press before a touch reveals an image
	// On, though the separate Nick Colors userscript may still be installed.
	// This script leaves the names that one colored (init.js), but not the
	// other way round: that script colors ours too, and its refresh (a theme
	// change, a saved dialog) recolors them. The settings warn when both run
	nickColors: true,
	nickNotes: true,      // personal notes on usernames, shown on hover
	// City times under cIRC's header, on its page and in the sidebar. Off: it adds to the chat page
	worldClock: false,
};

let featureConfig = { ...DEFAULT_FEATURE_CONFIG };

/**
 * Names the separate Nick Colors userscript colored, which the username
 * finder leaves to it (init.js); nick colors' own dialog previews carry the
 * same marks. Names this script marked are not included, though nick colors
 * sets the same attributes on them. One way only: that script does not know
 * ours, and running both is warned against. A function, built when called,
 * not a const: tests/gm-storage.test.js loads this file without
 * src/shared/usernames.js, which defines USERNAME_ATTR
 * @returns {string} a selector
 */
function standaloneNickColorsSelector() {
	return `[data-nick-colored]:not([${USERNAME_ATTR}]), [data-mention-colored]:not([${USERNAME_ATTR}])`;
}

/**
 * Whether the separate Nick Colors userscript runs on this page: it draws its
 * styles into #nc-styles.
 * @returns {boolean}
 */
function standaloneNickColorsRunning() {
	return !!document.getElementById('nc-styles');
}

function loadFeatureConfig() {
	try {
		const saved = _GM_getValue('featureConfig', null);
		if (saved) {
			featureConfig = { ...DEFAULT_FEATURE_CONFIG, ...JSON.parse(saved) };
		}
	} catch (e) {
		console.error(LOG_PREFIX + ' Failed to load feature config:', e);
	}
}
loadFeatureConfig();

// The settings dialog persists changes through this
function saveFeatureConfig() {
	_GM_setValue('featureConfig', JSON.stringify(featureConfig));
}

// Called by the shared GM storage once the async cache is populated, or failed to load
function onGMStorageReady() {
	loadDebugMode();
	loadFeatureConfig();
	featuresStorageReady();
}

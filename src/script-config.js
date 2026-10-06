// Globals the shared runtime files read; must come before them in the bundle

// Console prefix: [AtmoMod], and [AtmoMod|<feature folder>] for a feature's
// lines (featureLogPrefix), so a search for AtmoMod finds all of them, and
// one for AtmoMod|nick-colors one feature's
const LOG_NAME = 'AtmoMod';
const LOG_PREFIX = `[${LOG_NAME}]`;

/**
 * A feature's console prefix.
 * @param {string} area - the feature's folder under src/, e.g. 'nick-colors'
 * @returns {string} e.g. '[AtmoMod|nick-colors]'
 */
function featureLogPrefix(area) {
	return `[${LOG_NAME}|${area}]`;
}
// Shown in the update banner
const SCRIPT_NAME = 'Atmospheric Modulator';
// The site's settings tab, and its hover title
const SETTINGS_TAB_LABEL = 'AtmoMod';
const SETTINGS_TAB_TITLE = 'Atmospheric Modulator (Userscript settings)';
// Its URL hash: /settings/<tab>#atmomod
const SETTINGS_TAB_HASH = 'atmomod';
// The settings' name: the menu command, the dialog, and the section on that tab
const SETTINGS_TITLE = 'Atmospheric Modulator Settings';
// The settings tab's last section (backup.js); nick colors' help points to it
const BACKUP_SECTION_TITLE = 'Backup & Troubleshooting';
const SETTINGS_SECTION_DESCRIPTION = 'Usability features userscript: undither an image, give nicknames a hashed color, and keep notes on them. Changes save as you make them.';
// Published in users' localStorage: never change it
const STORAGE_PREFIX = 'atmosphericModulator_';
const GM_STORAGE_KEYS = ['debugMode', 'featureConfig', 'dismissedUpdateVersion',
	// image-undither
	'unditherMissedPage',
	// nick-colors
	'siteConfig', 'customNickColors', 'nickFriends',
	// nick-notes
	'nickNotes'];

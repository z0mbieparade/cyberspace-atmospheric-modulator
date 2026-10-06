/**
 * Test setup for the nick-colors feature - loads its source files and exposes
 * their functions for testing
 *
 * The bundle wraps nick-colors in a block of its own; here its files load
 * unscoped, so the tests can reach them. Only what nick-colors uses loads with
 * it: the script config, the shared files, and the core's header.js (DEBUG,
 * logDebug) and features.js (featuresStorageReady, after Import from Nick
 * Colors; no feature is registered, since nick-colors/init.js is skipped).
 * The rest of the core is left out, so no names clash once the block is gone.
 */

import { createRequire } from 'module';
import { createTestEnvironment, runAndExpose } from '../environment.js';

const require = createRequire(import.meta.url);
const { readBundleSource } = require('../../build/build-userscript.js');
const scriptConfig = require('../../userscript.config.js');
const nickColorsGroup = scriptConfig.parts.find(part => part.scope === 'nick-colors');
const config = {
	...scriptConfig,
	parts: [
		'script-config.js',
		...scriptConfig.parts.filter(part => typeof part === 'string' && part.startsWith('shared/')),
		'header.js',
		'features.js',
		nickColorsGroup,
	],
};

// The theme colors these tests expect, on a page with a chat
const dom = createTestEnvironment(`
	<head><style>:root { --color-bg: #0a0a0a; --color-fg: #e0e0e0; }</style></head>
	<body><div id="chat"></div></body>
`);

// The VERSION the bundle declares. Deliberately a fixed fixture rather than package.json's version - tests assert against
// versions either side of it, and those shouldn't need editing on every release bump.
export const TEST_VERSION = '1.3.3';

// nick-colors' init.js is left out: it registers the feature, whose boot has side effects
const code = readBundleSource(config, { version: TEST_VERSION, skip: ['nick-colors/init.js'], unscoped: true });

runAndExpose(code, [
	// Helper functions
	'hexToRgb',
	'hexToHsl',
	'rgbToHsl',
	'hslToRgb',
	'getRelativeLuminance',
	'getContrastRatio',
	'isPathMatch',
	'isHostMatch',
	'toKebabCase',
	'toCamelCase',
	'stylesToCssString',
	'parseColor',
	'mapHueToRange',
	'mapToRange',
	'adjustContrastToThreshold',
	'pickBestContrastingColor',
	'applyRangeMappingToColor',
	'getEffectiveSiteConfig',
	'saveSiteConfig',
	'hashString',
	'getThemeColors',
	'getThemeDefaultSettings',
	'presetOptionValue',
	'compareVersions',
	'isNewerVersion',

	// Update banner
	'showUpdateBanner',
	'getScriptURL',
	'getDismissedUpdateVersion',
	'saveDismissedUpdateVersion',
	'UPDATE_BANNER_ID',

	// Import/Export
	'getNonDefaultValues',
	'exportSettings',
	'importSettings',
	'sanitizeSiteConfig',
	'sanitizeNickStyle',
	'sanitizeNickStyles',
	'loadSiteConfig',
	'loadCustomNickColors',
	'showNickColorsImportDialog',
	'registerFeature',
	'parseSettingsText',
	'minifyKeys',
	'maxifyKeys',

	// Nick style functions
	'getNickBase',
	'getMappedNickColor',
	'getRawStylesForPicker',
	'generateStyles',
	'getHashBasedIcon',
	'getHashBasedStyleVariations',
	'applyStyles',

	// Nick functions
	'isValidUsername',
	'extractUsername',
	'isLikelyUsername',
	'colorizeAll',
	'styleUsername',
	'sanitizeNickFriends',
	'replaceNickFriends',
	'setNickFriend',
	'setOnlyColorFriends',
	'isNickFriend',
	'shouldColorNick',
	'featureConfig',
	'renderNickFriendsSettings',
	'focusAfterFriendRemoved',
	'addOwnNameAsFirstFriend',
	'findUsernames',
	'usernameOf',
	'skipUsernamesMatching',
	'watchUsernames',
	'refreshNickColors',
	'standaloneNickColorsSelector',

	// Settings engine
	'createSettingsEngine',

	// Config objects
	'siteConfig',
	'customNickColors',
	'DEFAULT_SITE_CONFIG',
	'MANUAL_OVERRIDES',
	'PATH_HINTS',
	'PATH_EXCLUDE',
	'HOST_EXCLUDE',
]);

export { dom };

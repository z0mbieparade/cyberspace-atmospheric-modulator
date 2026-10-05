/**
 * Test setup - loads the bundle's code and exposes its functions for testing
 *
 * The userscript runs in a browser with GM APIs, so tests/environment.js
 * stands those in, and the source files load in bundle order.
 */

import { createRequire } from 'module';
import { createTestEnvironment, runAndExpose } from './environment.js';

// The same code the build puts inside the bundle's IIFE
const require = createRequire(import.meta.url);
const { readBundleSource } = require('../build/build-userscript.js');
const config = require('../userscript.config.js');

// Shaped like the site's mount point
const dom = createTestEnvironment('<head></head><body><div id="__nuxt" data-v-app></div></body>');

// init.js is left out: it has side effects, and init.test.js runs it itself
const code = readBundleSource(config, { version: '0.2.2', skip: ['init.js'] });

runAndExpose(code, [
	// Shared runtime and the globals it reads
	'LOG_PREFIX',
	'isPathMatch',
	'isHostMatch',
	'registerMenuCommand',

	// Header
	'DEBUG',
	'logDebug',
	'featureConfig',
	'DEFAULT_FEATURE_CONFIG',
	'loadFeatureConfig',
	'saveFeatureConfig',
	'loadDebugMode',

	// Image undither
	'PAGE_HOOK_EVENTS',
	'installPageHooks',
	'injectPageHooks',
	'readPageHookStats',
	'installDitherHooks',
	'resetDitherHooks',
	'imageMap',
	'recordImageMap',
	'MAX_IMAGE_MAP_ENTRIES',
	'revealImage',
	'unrevealImage',
	'initImageUndither',
	'diagnoseImageUndither',
	'getHoldDuration',

	// Features
	'FEATURES',
	'startFeatures',

	// Settings panel
	'openSettingsPanel',
	'renderSettingsSection',
	'SETTINGS_SECTION_KEY',
	'SETTINGS_TAB_LABEL',
	'SETTINGS_TAB_TITLE',
	'SETTINGS_TAB_HASH',
	'REPORT_WARNING',
	'attributionItems',
	'SETTINGS_TITLE',
	'SETTINGS_SECTION_DESCRIPTION',

	// Backup & Troubleshooting
	'BACKUP_SECTION_KEY',
	'BACKUP_SECTION_TITLE',
	'exportBackup',
	'importBackup',
	'parseBackupText',
	'exportDebugLog',
	'reportSummary',
	'renderBackupSection',
	'eraseAllSettings',
	'showReportIssueDialog',

	// User menu
	'showMenu',
	'closeMenu',
	'initUserMenu',
	'findUserMenuTarget',
	'USER_MENU_HOLD_MS',
	'watchUsernames',
	'usernameOf',
	'rescanUsernames',
	'skipUsernamesMatching',
	'standaloneNickColorsSelector',
	'syncSidebarLink',
	'logoIconHtml',
	'initSidebarLink',

	// Shared helpers init.js and the tests call
	'resumeMessageToUser',
	'COMPOSE_OPEN_KEY',
	'COMPOSE_MESSAGE_KEY',
	'readSessionToken',
	'apiRequest',
	'sendCmail',
	'sendMessageToUser',

	// Exclusions
	'HOST_EXCLUDE',
	'PATH_EXCLUDE',
]);

export { dom };

// Build config for build/build-userscript.js: read by build.js and by the
// tests' setup, so the tests load the same files the bundle contains.

const path = require('path');

// Published on Gitea and mirrored to GitHub; the raw GitHub file is what
// userscript managers can fetch without a redirect
const SCRIPT_URL = 'https://raw.githubusercontent.com/z0mbieparade/cyberspace-atmospheric-modulator/refs/heads/main/cyberspace-atmospheric-modulator.user.js';

module.exports = {
	outputFile: path.join(__dirname, 'cyberspace-atmospheric-modulator.user.js'),
	srcDir: path.join(__dirname, 'src'),
	exclusionsFile: path.join(__dirname, 'src', 'exclusions.json'),
	// The logo: one drawing for the README, the sidebar button and the settings heading
	textConstants: { LOGO_SVG: path.join(__dirname, 'assets', 'logo.svg') },
	styles: {
		file: path.join(__dirname, 'src', 'styles.scss'),
		styleId: 'atmo-styles',
		// At document-start document.head does not exist yet; init.js injects
		injectAtLoad: false,
	},
	header: [
		['name', 'Cyberspace Atmospheric Modulator'],
		['author', 'https://z0m.bi/ (@z0ylent)'],
		['license', 'GPL-3.0-or-later'],
		['namespace', 'https://cyberspace.online/'],
		['version', ''],
		['description', 'Usability features for cyberspace.online: undithered images on hover, colored usernames, and more'],
		['match', 'https://cyberspace.online/*'],
		['match', 'https://beta.cyberspace.online/*'],
		['updateURL', SCRIPT_URL],
		['downloadURL', SCRIPT_URL],
		['grant', 'GM_registerMenuCommand'],
		['grant', 'GM.registerMenuCommand'],
		['grant', 'GM_setValue'],
		['grant', 'GM_getValue'],
		['grant', 'GM.setValue'],
		['grant', 'GM.getValue'],
		['grant', 'GM_xmlhttpRequest'],
		['grant', 'GM.xmlHttpRequest'],
		['grant', 'unsafeWindow'],
		['connect', 'raw.githubusercontent.com'],
		['connect', 'api.cyberspace.online'],
		['run-at', 'document-start'],
		// Image undither patches the page's own canvas code, so ask to run in
		// the page, for managers that sandbox scripts apart from it and honor
		// this (MonkeyScript does not document it). auto, not page: when the
		// page cannot run it, Violentmonkey still runs the rest of the script.
		// No @sandbox: Tampermonkey picks its mode from the grants, and that
		// mode is the one tested
		['inject-into', 'auto'],
	],
	parts: [
		'script-config.js',
		'shared/gm-storage.js',
		'shared/url-match.js',
		'shared/menu-command.js',
		'shared/long-press.js',
		'shared/ui-dialog.js',
		'shared/theme-colors.js',
		'shared/update-check.js',
		'shared/cyberspace-api.js',
		'shared/ui-slider.js',
		'shared/ui-settings-engine.js',
		'shared/settings-page.js',
		'shared/file-io.js',
		'shared/send-message.js',
		'shared/ui-menu.js',
		'shared/usernames.js',
		'header.js',
		'features.js',
		'user-menu.js',
		'user-list.js',
		'sidebar-link.js',
		'image-undither/image-undither.js',
		{ scope: 'nick-colors', parts: [
			'nick-colors/sanitize.js',
			'nick-colors/helper-functions.js',
			'nick-colors/header.js',
			'nick-colors/friends.js',
			'nick-colors/import-export.js',
			'nick-colors/debug.js',
			'nick-colors/nick-style-functions.js',
			'nick-colors/nick-functions.js',
			'nick-colors/dialog-component.js',
			'nick-colors/user-settings-panel.js',
			'nick-colors/site-settings-panel.js',
			'nick-colors/color-list.js',
			'nick-colors/init.js',
		] },
		{ scope: 'nick-notes', parts: [
			'nick-notes/notes.js',
			'nick-notes/notes-settings.js',
			'nick-notes/init.js',
		] },
		{ scope: 'world-clock', parts: [
			'world-clock/world-clock.js',
			'world-clock/init.js',
		] },
		'settings-panel.js',
		'backup.js',
		'init.js',
	],
};

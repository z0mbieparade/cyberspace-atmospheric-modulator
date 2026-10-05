const path = require('path');

module.exports = {
	outputFile: path.join(__dirname, 'fixture.user.js'),
	srcDir: path.join(__dirname, 'src'),
	exclusionsFile: path.join(__dirname, 'exclusions.json'),
	styles: {
		file: path.join(__dirname, 'src', 'styles.scss'),
		styleId: 'fixture-styles',
		injectAtLoad: false,
	},
	header: [
		['name', 'Fixture'],
		['version', ''],
		['match', 'https://example.online/*'],
		['match', 'https://beta.example.online/*'],
		['grant', 'GM_getValue'],
		['run-at', 'document-start'],
	],
	parts: [
		'first.js',
		// A shared file: parts are paths relative to srcDir
		'../../../../src/shared/menu-command.js',
		'last.js',
	],
};

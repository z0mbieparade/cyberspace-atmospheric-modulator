/**
 * Builds the userscript from userscript.config.js: concatenates its source
 * files into one IIFE, compiles its SCSS, and minifies everything below the
 * metadata header. No modules, no bundler.
 *
 * Config shape:
 *   outputFile      the .user.js to write
 *   srcDir          the script's own src/
 *   exclusionsFile  its exclusions.json
 *   header          [key, value] pairs for the metadata block, in order. The
 *                   version comes from the build; @exclude lines go after the
 *                   last @match.
 *   parts           source files in order, as paths relative to srcDir; or
 *                   { scope: 'name', parts: [...] }, whose files share a block
 *                   of their own: their const, let and function names cannot
 *                   clash with another feature's (strict mode scopes block
 *                   functions), while the files outside stay visible to them
 *   textConstants   optional { NAME: 'path' }: each file's text, as a const
 *                   string of that name, for an asset the repo also serves
 *                   on its own (the logo, used by the README too)
 *   styles          optional { file, styleId, injectAtLoad }.
 *                   The SCSS can `@use 'ui'` (src/shared/_ui.scss) for the
 *                   shared dialog, input and slider styles.
 */

const fs = require('fs');
const path = require('path');
const { minify } = require('terser');
const sass = require('sass');
const { loadExclusions } = require('./exclusions');

/**
 * Read the config's source parts, in order, as one string.
 * Tests use this to load the same files the build concatenates.
 * @param {object} config
 * @param {{skip?: string[], unscoped?: boolean, log?: Function}} [options] -
 *   skip: part paths to leave out (an init.js, whose side effects tests run
 *   separately); unscoped: drop the block around scoped groups, so a test can
 *   reach a feature's functions
 * @returns {string}
 * @throws {Error} when a part's file is missing: a bundle without it would
 *   fail at load on undefined globals
 */
function readParts(config, { skip = [], unscoped = false, log = () => {} } = {}) {
	const read = (parts) => parts
		.map(part => {
			if (typeof part !== 'string') {
				const inner = read(part.parts);
				if (!inner) return '';
				return unscoped ? inner : `// ----- ${part.scope} -----\n{\n${inner}\n}`;
			}
			if (skip.includes(part)) return '';
			const file = path.join(config.srcDir, part);
			if (!fs.existsSync(file)) throw new Error(`${file} not found`);
			log(`  + ${part}`);
			return fs.readFileSync(file, 'utf8');
		})
		.filter(Boolean)
		.join('\n\n');
	return read(config.parts);
}

/**
 * Render the ==UserScript== block.
 * @param {Array<[string, string]>} header
 * @param {string} version
 * @param {string} excludeMetadata - the @exclude lines
 * @returns {string}
 * @throws {Error} when there are @exclude lines but no @match to place them
 *   after: dropping them would run the script on the excluded hosts
 */
function renderMetadata(header, version, excludeMetadata) {
	const line = (key, value) => `// @${key.padEnd(12)} ${value}`;
	const lastMatch = header.map(([key]) => key).lastIndexOf('match');
	if (excludeMetadata && lastMatch === -1) {
		throw new Error('header has host exclusions but no @match entry; add one so the @exclude lines have a place');
	}
	const lines = [];
	header.forEach(([key, value], i) => {
		lines.push(line(key, key === 'version' ? version : value));
		if (i === lastMatch && excludeMetadata) lines.push(excludeMetadata);
	});
	return ['// ==UserScript==', ...lines, '// ==/UserScript=='].join('\n');
}

/**
 * Compile the config's SCSS into an injectStyles() function.
 * @param {object} config
 * @param {Function} log
 * @returns {string} code defining injectStyles(), and calling it when injectAtLoad
 * @throws {Error} when SCSS compilation fails
 */
function buildStyleInjection(config, log) {
	const styles = config.styles;
	if (!styles) return '';
	let compiledCSS = '';
	if (fs.existsSync(styles.file)) {
		try {
			// `@use 'ui'` resolves to src/shared/_ui.scss
			compiledCSS = sass.compile(styles.file, { style: 'compressed', loadPaths: [path.join(config.srcDir, 'shared')] }).css;
		} catch (err) {
			throw new Error('SCSS compilation failed: ' + err.message);
		}
		log(`  + ${path.basename(styles.file)} (${(compiledCSS.length / 1024).toFixed(1)} KB compiled)`);
	} else {
		log(`  Warning: ${path.basename(styles.file)} not found, skipping styles`);
	}
	// At document-start document.head does not exist yet, so such scripts call
	// injectStyles() themselves once the DOM is ready (injectAtLoad: false)
	return `
// Compiled stylesheet
const compiledCSS = ${JSON.stringify(compiledCSS)};
function injectStyles() {
	const styleEl = document.createElement('style');
	styleEl.id = ${JSON.stringify(styles.styleId)};
	styleEl.textContent = compiledCSS;
	document.head.appendChild(styleEl);
}
${styles.injectAtLoad ? 'injectStyles();' : ''}
`;
}

/**
 * The bundle body inside the IIFE: VERSION, SCRIPT_URL (from the header's
 * @downloadURL, when there is one), the styles, the text constants, the
 * exclusion constants, then the parts. Tests load this too, so their code matches the
 * bundle's without repeating its assembly.
 * @param {object} config
 * @param {{version: string, styleInjection?: string, skip?: string[], unscoped?: boolean, log?: Function}} options -
 *   styleInjection: from buildStyleInjection; tests leave it out. skip, unscoped: as readParts.
 * @returns {string}
 * @throws {Error} as loadExclusions and readParts, and when a text constant's
 *   file is missing
 */
function readBundleSource(config, { version, styleInjection = '', skip = [], unscoped = false, log = () => {} }) {
	// The install URL, for update-check.js: the header's @downloadURL, so the
	// two cannot disagree
	const downloadURL = (config.header.find(([key]) => key === 'downloadURL') || [])[1];
	return [
		`const VERSION = ${JSON.stringify(version)};`,
		downloadURL ? `const SCRIPT_URL = ${JSON.stringify(downloadURL)};` : '',
		styleInjection,
		...Object.entries(config.textConstants || {}).map(([name, file]) => {
			// Fatal, as a missing part is: the bundle would refer to a name never declared
			if (!fs.existsSync(file)) throw new Error(`${file} not found (textConstants.${name})`);
			return `const ${name} = ${JSON.stringify(fs.readFileSync(file, 'utf8'))};`;
		}),
		loadExclusions(config.exclusionsFile).buildExclusionsCode(),
		readParts(config, { skip, unscoped, log }),
	].filter(Boolean).join('\n\n');
}

/**
 * Assemble, and optionally minify, the userscript.
 * Side effects: none; runBuild writes the result to outputFile.
 * @param {object} config - see the top of this file
 * @param {{version: string, minify?: boolean, log?: Function}} options
 * @returns {Promise<string>} the full userscript, metadata header included
 * @throws {Error} when SCSS compilation, a source file, or minification fails
 */
async function buildUserscript(config, { version, minify: shouldMinify = true, log = console.log }) {
	const exclusions = loadExclusions(config.exclusionsFile);
	const metadata = renderMetadata(config.header, version, exclusions.buildExcludeMetadata());

	const body = readBundleSource(config, { version, styleInjection: buildStyleInjection(config, log), log });
	const code = `(function() {\n'use strict';\n\n${body}\n\n})();`;

	let finalCode = code;
	if (shouldMinify) {
		try {
			// Free globals (GM_*) are never mangled, so no mangle options are needed
			const result = await minify(code, {
				compress: { drop_console: false, passes: 2 },
				format: { comments: false },
			});
			finalCode = result.code;
		} catch (err) {
			// Shipping the unminified code would silently bloat the artifact
			throw new Error('Minification failed: ' + err.message);
		}
		log(`  Minified: ${(code.length / 1024).toFixed(1)} KB → ${(finalCode.length / 1024).toFixed(1)} KB`);
	}
	// The metadata header must stay unminified for userscript managers
	return `${metadata}\n\n${finalCode}`;
}

/**
 * The `node build.js [version] [--no-minify]` entry point.
 * Side effects: writes config.outputFile; exits the process with 1 on failure.
 * @param {object} config
 * @param {string} defaultVersion - the package.json version
 * @param {string[]} [argv]
 * @returns {Promise<void>}
 */
async function runBuild(config, defaultVersion, argv = process.argv.slice(2)) {
	// Flags are not versions
	const version = argv.filter(a => !a.startsWith('--'))[0] || defaultVersion;
	const shouldMinify = !argv.includes('--no-minify');
	const name = path.basename(config.outputFile);

	console.log(`Building ${name} v${version}${shouldMinify ? ' (minified)' : ''}...`);
	let output;
	try {
		output = await buildUserscript(config, { version, minify: shouldMinify });
	} catch (err) {
		console.error('Build failed:', err.message);
		process.exit(1);
	}
	fs.writeFileSync(config.outputFile, output);
	console.log(`\nBuilt successfully: ${config.outputFile}`);
	console.log(`Version: ${version}`);
	console.log(`Total size: ${(output.length / 1024).toFixed(1)} KB`);
}

module.exports = { buildUserscript, runBuild, readParts, readBundleSource, renderMetadata };

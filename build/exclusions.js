/**
 * Reads a script's exclusions.json and generates the two things that must stay
 * in sync: the userscript @exclude metadata lines, and the HOST_EXCLUDE /
 * PATH_EXCLUDE constants injected into the bundle.
 */

const fs = require('fs');

// Patterns and notes are interpolated into generated JS and metadata. A line
// break in either would terminate the line and turn the rest into code or an
// extra metadata line, so reject them with a clear error.
/**
 * @param {{hosts?: object, paths?: object}} exclusions
 * @param {string} [label] - the file name the error message points at
 * @throws {Error} when a pattern or note contains a line break
 */
function assertNoNewlines(exclusions, label = 'exclusions.json') {
	for (const [section, entries] of Object.entries({ hosts: exclusions.hosts, paths: exclusions.paths })) {
		for (const [pattern, note] of Object.entries(entries || {})) {
			if (/[\r\n]/.test(pattern) || /[\r\n]/.test(String(note))) {
				throw new Error(`${label}: ${section} entry ${JSON.stringify(pattern)} or its note must not contain a line break`);
			}
		}
	}
}

/**
 * Load and validate an exclusions file.
 * Keys are the patterns, values are notes. Hosts become @exclude lines (the
 * manager never loads the script there); paths are checked at runtime.
 * @param {string} file - path to the JSON file
 * @returns {{HOST_EXCLUDE: string[], PATH_EXCLUDE: string[], buildExcludeMetadata: () => string, buildExclusionsCode: () => string}}
 * @throws {Error} when the file is unreadable, not JSON, or contains a line break
 */
function loadExclusions(file) {
	const exclusions = JSON.parse(fs.readFileSync(file, 'utf8'));
	assertNoNewlines(exclusions, file);

	const HOST_EXCLUDE = Object.keys(exclusions.hosts || {});
	const PATH_EXCLUDE = Object.keys(exclusions.paths || {});

	// @exclude lines for the userscript header - one for the host, one for its subdomains
	const buildExcludeMetadata = () => HOST_EXCLUDE
		.flatMap(host => [`https://${host}/*`, `https://*.${host}/*`])
		.map(pattern => `// @exclude      ${pattern}`)
		.join('\n');

	// Constant declarations injected into the bundle, with the notes kept as comments
	const buildExclusionsCode = () => {
		const declare = (name, entries) => {
			const lines = Object.entries(entries || {})
				.map(([pattern, note]) => `\t${JSON.stringify(pattern)}, // ${note}`)
				.join('\n');
			return `const ${name} = [\n${lines}\n];`;
		};
		return [
			'// Generated from exclusions.json at build time - edit that file, not this block',
			declare('HOST_EXCLUDE', exclusions.hosts),
			declare('PATH_EXCLUDE', exclusions.paths),
		].join('\n');
	};

	return { HOST_EXCLUDE, PATH_EXCLUDE, buildExcludeMetadata, buildExclusionsCode };
}

module.exports = { loadExclusions, assertNoNewlines };

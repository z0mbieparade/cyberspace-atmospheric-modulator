/**
 * Builder tests: metadata rendering, exclusions generation, and a built
 * fixture bundle that runs.
 */

import { describe, it, expect, afterAll } from 'vitest';
import { createRequire } from 'module';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const require = createRequire(import.meta.url);
const { buildUserscript, readParts, readBundleSource, renderMetadata } = require('../../build/build-userscript.js');
const { loadExclusions, assertNoNewlines } = require('../../build/exclusions.js');
const fixtureConfig = require('./fixtures/userscript.config.js');

const silent = () => {};

// Exclusions files written by these tests, removed after the run
const tempDirs = [];
const writeExclusions = (exclusions) => {
	const dir = mkdtempSync(join(tmpdir(), 'excl-'));
	tempDirs.push(dir);
	const file = join(dir, 'exclusions.json');
	writeFileSync(file, JSON.stringify(exclusions));
	return file;
};
afterAll(() => {
	for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

describe('renderMetadata', () => {
	const header = [['name', 'X'], ['version', 'ignored'], ['match', 'a'], ['match', 'b'], ['grant', 'none']];

	it('aligns values, fills the version, and puts @exclude lines after the last @match', () => {
		const lines = renderMetadata(header, '1.2.3', '// @exclude      https://e/*').split('\n');
		expect(lines).toEqual([
			'// ==UserScript==',
			'// @name         X',
			'// @version      1.2.3',
			'// @match        a',
			'// @match        b',
			'// @exclude      https://e/*',
			'// @grant        none',
			'// ==/UserScript==',
		]);
	});

	it('emits no blank line when there are no exclusions', () => {
		expect(renderMetadata(header, '1', '')).not.toMatch(/\n\n/);
	});

	it('refuses host exclusions without an @match to place them after', () => {
		const includeOnly = [['name', 'X'], ['include', 'https://e/*']];
		expect(() => renderMetadata(includeOnly, '1', '// @exclude      https://e/*')).toThrow(/no @match/);
		expect(() => renderMetadata(includeOnly, '1', '')).not.toThrow();
	});
});

describe('loadExclusions', () => {
	const exclusions = loadExclusions(fixtureConfig.exclusionsFile);

	it('emits a host and a subdomain @exclude for every excluded host, and nothing else', () => {
		expect(exclusions.buildExcludeMetadata().split('\n')).toEqual([
			'// @exclude      https://page.example.online/*',
			'// @exclude      https://*.page.example.online/*',
		]);
	});

	it('declares both constants with every entry', () => {
		const declared = new Function(`${exclusions.buildExclusionsCode()} return { HOST_EXCLUDE, PATH_EXCLUDE };`)();
		expect(declared.HOST_EXCLUDE).toEqual(['page.example.online']);
		expect(declared.PATH_EXCLUDE).toEqual(['/terminal']);
	});

	it('quotes patterns as JSON, so a quote cannot break out of the string', () => {
		const file = writeExclusions({ hosts: {}, paths: { "/it's": 'apostrophe' } });
		const declared = new Function(`${loadExclusions(file).buildExclusionsCode()} return PATH_EXCLUDE;`)();
		expect(declared).toEqual(["/it's"]);
	});

	it('rejects a file with a line break in a pattern', () => {
		const file = writeExclusions({ hosts: { 'evil.example\nalert(1)': 'x' } });
		expect(() => loadExclusions(file)).toThrow(/line break/);
	});
});

describe('assertNoNewlines', () => {
	it('accepts entries without newlines', () => {
		expect(() => assertNoNewlines({ hosts: { 'a.example': 'note' }, paths: { '/x': '' } })).not.toThrow();
	});

	it('throws on a carriage return in a pattern or a line break in a note', () => {
		expect(() => assertNoNewlines({ paths: { '/x\ralert(1)': 'note' } })).toThrow(/line break/);
		expect(() => assertNoNewlines({ paths: { '/x': 'line1\nline2' } })).toThrow(/line break/);
	});
});

describe('readParts', () => {
	it('reads script and shared parts in order', () => {
		const code = readParts(fixtureConfig);
		const first = code.indexOf('[Fixture]');
		const shared = code.indexOf('const registerMenuCommand');
		const last = code.indexOf('__fixtureResult');
		expect(first).toBeGreaterThanOrEqual(0);
		expect(shared).toBeGreaterThan(first);
		expect(last).toBeGreaterThan(shared);
	});

	it('skips the named parts', () => {
		expect(readParts(fixtureConfig, { skip: ['last.js', '../../../../src/shared/menu-command.js'] })).not.toContain('registerMenuCommand');
	});

	it('wraps a scoped group in its own block, so two features can declare the same names', () => {
		const dir = mkdtempSync(join(tmpdir(), 'scope-'));
		tempDirs.push(dir);
		writeFileSync(join(dir, 'a.js'), 'const NAME = "a"; function init() { return NAME; } window.a = init();');
		writeFileSync(join(dir, 'b.js'), 'const NAME = "b"; function init() { return NAME; } window.b = init();');
		const config = { srcDir: dir, parts: [{ scope: 'a', parts: ['a.js'] }, { scope: 'b', parts: ['b.js'] }] };

		const window = {};
		new Function('window', `'use strict';\n${readParts(config)}`)(window);
		expect(window).toEqual({ a: 'a', b: 'b' });
		expect(readParts(config, { unscoped: true })).not.toMatch(/^\{$/m);
	});

	it('throws on a missing part', () => {
		expect(() => readParts({ ...fixtureConfig, parts: ['missing.js'] })).toThrow(/missing\.js not found/);
	});
});

describe('readBundleSource', () => {
	it('declares VERSION and the exclusion constants before the parts, and omits styles unless given', () => {
		const code = readBundleSource(fixtureConfig, { version: '2.0.0', skip: ['last.js'] });
		const declared = new Function(`${code} return { VERSION, HOST_EXCLUDE, LOG_PREFIX };`)();
		expect(declared).toEqual({ VERSION: '2.0.0', HOST_EXCLUDE: ['page.example.online'], LOG_PREFIX: '[Fixture]' });
		expect(code).not.toContain('injectStyles');
	});

	it('stops with the file\'s name when a text constant\'s file is missing', () => {
		expect(() => readBundleSource({ ...fixtureConfig, textConstants: { LOGO: '/nonexistent/logo.svg' } }, { version: '2.0.0' }))
			.toThrow('/nonexistent/logo.svg not found (textConstants.LOGO)');
	});

	it('declares each text constant as its file\'s exact text', () => {
		const dir = mkdtempSync(join(tmpdir(), 'text-constants-'));
		const file = join(dir, 'logo.svg');
		writeFileSync(file, '<svg>"quotes" and `ticks`\n</svg>');
		try {
			const code = readBundleSource({ ...fixtureConfig, textConstants: { LOGO: file } }, { version: '2.0.0', skip: ['last.js'] });
			expect(new Function(`${code} return LOGO;`)()).toBe('<svg>"quotes" and `ticks`\n</svg>');
		} finally {
			rmSync(dir, { recursive: true });
		}
	});
});

describe('styles/_ui.scss', () => {
	it('compiles with the atmo- prefix only', () => {
		const sass = require('sass');
		const { css } = sass.compileString("@use 'ui';", { loadPaths: [join(__dirname, '..', '..', 'src', 'shared')] });
		expect(css).toContain('.atmo-dialog');
		expect(css).toContain('.atmo-slider-input:focus-visible + .atmo-slider-thumb');
		expect(css).toContain('.atmo-dialog .atmo-dialog-warning');
		expect(css).toContain('var(--atmo-warn-bg)');
		// Must outrank the dialog's full-width `.atmo-dialog input[type=number]`
		expect(css).toContain('.atmo-dialog .atmo-slider-labels .atmo-slider-value-input');
	});
});

describe('buildUserscript', () => {
	it.each([true, false])('builds a bundle that runs (minify = %s)', async (minify) => {
		const output = await buildUserscript(fixtureConfig, { version: '9.9.9', minify, log: silent });

		expect(output.startsWith('// ==UserScript==\n// @name         Fixture\n// @version      9.9.9\n')).toBe(true);
		expect(output).toContain('// @exclude      https://*.page.example.online/*\n// @grant        GM_getValue');

		const body = output.slice(output.indexOf('// ==/UserScript==') + '// ==/UserScript=='.length);
		const window = { GM_registerMenuCommand: () => {} };
		new Function('window', 'GM_registerMenuCommand', 'document', body)(window, window.GM_registerMenuCommand, {});
		expect(window.__fixtureResult).toEqual({
			version: '9.9.9',
			prefix: '[Fixture]',
			hasMenu: 'function',
			hosts: ['page.example.online'],
		});
	});

	it('defines injectStyles with the compiled CSS without calling it when injectAtLoad is false', async () => {
		const output = await buildUserscript(fixtureConfig, { version: '1', minify: false, log: silent });
		expect(output).toContain('function injectStyles()');
		expect(output).toContain('"fixture-styles"');
		expect(output).toContain('.fixture{color:red}');
		expect(output).not.toMatch(/^injectStyles\(\);$/m);
	});

	it('calls injectStyles at load when injectAtLoad is true', async () => {
		const config = { ...fixtureConfig, styles: { ...fixtureConfig.styles, injectAtLoad: true } };
		const output = await buildUserscript(config, { version: '1', minify: false, log: silent });
		expect(output).toMatch(/^injectStyles\(\);$/m);
	});
});

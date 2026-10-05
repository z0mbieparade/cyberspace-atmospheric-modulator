/**
 * This script's exclusion entries. How exclusions.json becomes @exclude lines
 * and constants is tested in tests/shared/build.test.js.
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { loadExclusions } = require('../build/exclusions.js');
const { HOST_EXCLUDE, PATH_EXCLUDE } = loadExclusions(require('../userscript.config.js').exclusionsFile);

describe('exclusion lists', () => {
	it('excludes the page and terminal subdomains', () => {
		expect(HOST_EXCLUDE).toContain('page.cyberspace.online');
		expect(HOST_EXCLUDE).toContain('terminal.cyberspace.online');
	});

	it('excludes the /pages and /terminal paths', () => {
		expect(PATH_EXCLUDE).toContain('/pages');
		expect(PATH_EXCLUDE).toContain('/terminal');
	});
});

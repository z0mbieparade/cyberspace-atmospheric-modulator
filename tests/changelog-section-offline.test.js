/**
 * The Changelog section when the changelog cannot be had but an update is
 * out (src/changelog-section.js): it says the list could not be loaded,
 * links to the changelog, and still marks its heading with the update dot.
 * See changelog-section.test.js for why each case is its own file.
 */

import { it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { dom } from './setup.js';

const doc = dom.window.document;

beforeAll(() => {
	global.gmRequestHandler = ({ url, onload, onerror }) => {
		if (url.endsWith('CHANGELOG.md')) return onerror({});
		onload({ status: 200, responseText: '// @version 0.2.6\n' });
	};
});

it('says the list could not be loaded, links to the changelog, and keeps the update dot', async () => {
	const html = readFileSync(join(__dirname, 'shared', 'fixtures', 'settings-page.html'), 'utf8');
	doc.body.appendChild(doc.importNode(new dom.window.DOMParser().parseFromString(html, 'text/html').querySelector('main'), true));
	registerChangelogSection();
	syncSettingsPage();
	const section = doc.querySelector('[data-atmo-settings-section="atmospheric-modulator-changelog"]');
	const body = section.querySelector('.atmo-panel');
	await renderChangelogSection(body);
	expect(body.querySelector('[role="status"]').textContent).toBe('Could not load the list of changes.');
	expect(body.querySelector('li')).toBeNull();
	expect(body.querySelector('a').textContent).toBe('Read the full changelog on GitHub');
	expect(section.querySelector('h3 .atmo-settings-badge').title).toBe('update to v0.2.6 available');
});

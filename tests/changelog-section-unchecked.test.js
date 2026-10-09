/**
 * Changelog section when the update check fails but the changelog loads
 * (src/changelog-section.js): it does not claim the installed version is the
 * latest, nor call a newer one an update it could not confirm. See
 * changelog-section.test.js for why each case is its own file.
 */

import { it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { dom } from './setup.js';

const doc = dom.window.document;

beforeAll(() => {
	global.gmRequestHandler = ({ url, onload, onerror }) => {
		if (!url.endsWith('CHANGELOG.md')) return onerror({});
		onload({ status: 200, responseText: '## [0.2.6]\n\n> Six.\n\n## [0.2.5]\n\n> Five.\n' });
	};
});

it('says it could not check for updates, and marks a newer version only as newer', async () => {
	const body = doc.createElement('div');
	doc.body.append(body);
	await renderChangelogSection(body);
	expect(body.querySelector('[role="status"]').textContent).toBe('Could not check for updates; you have 0.2.5.');
	expect(Array.from(body.querySelectorAll('li'), li => li.textContent)).toEqual(['v0.2.6 (newer): Six.', 'v0.2.5 (installed): Five.']);
	expect(body.querySelector('button')).toBeNull();
});

it('puts no dot on its heading when it could not check for updates', async () => {
	const html = readFileSync(join(__dirname, 'shared', 'fixtures', 'settings-page.html'), 'utf8');
	doc.body.appendChild(doc.importNode(new dom.window.DOMParser().parseFromString(html, 'text/html').querySelector('main'), true));
	registerChangelogSection();
	syncSettingsPage();
	const section = doc.querySelector('[data-atmo-settings-section="atmospheric-modulator-changelog"]');
	await renderChangelogSection(section.querySelector('.atmo-panel'));
	expect(section.querySelector('.atmo-settings-badge')).toBeNull();
});

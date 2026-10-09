/**
 * Changelog section tests (src/changelog-section.js): each version's summary on the
 * settings tab, for whoever dismissed the update banner. The changelog and
 * the update check are fetched once per page load, so this file is the
 * page where an update is out; changelog-section-offline.test.js is the one where
 * the changelog cannot be had.
 */

import { it, expect, vi, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { dom } from './setup.js';

const doc = dom.window.document;
const CHANGELOG = [
	'# Changelog', '',
	'## [Unreleased]', '', '> Not out yet.', '',
	'## [0.2.6] - 2026-10-09', '', '> Six: <b>the</b> newest.', '',
	'## [0.2.5] - 2026-10-08', '', '> Five: the installed one.', '',
	'## [0.2.4] - 2026-10-07', '', '> Four: older.', '',
].join('\n');

beforeAll(() => {
	global.gmRequestHandler = ({ url, onload }) => onload({
		status: 200,
		responseText: url.endsWith('CHANGELOG.md') ? CHANGELOG : '// @version 0.2.6\n',
	});
});

it('lists the latest versions, newest first, marking the installed one and the update, as text', async () => {
	const body = doc.createElement('div');
	doc.body.append(body);
	await renderChangelogSection(body);
	const items = Array.from(body.querySelectorAll('li'), li => li.textContent);
	expect(items).toEqual([
		'v0.2.6 (update available): Six: <b>the</b> newest.',
		'v0.2.5 (installed): Five: the installed one.',
		'v0.2.4: Four: older.',
	]);
	expect(body.querySelector('li b')).toBeNull();
	expect(body.querySelector('[role="status"]').textContent).toBe('Version 0.2.6 is available; you have 0.2.5.');
	expect(Array.from(body.querySelectorAll('button'), b => b.textContent)).toEqual(['Update to v0.2.6']);
	expect(body.querySelector('a').href).toContain('CHANGELOG.md');
});

it('sits at the very bottom of the settings tab, below Backup & Troubleshooting', () => {
	const html = readFileSync(join(__dirname, 'shared', 'fixtures', 'settings-page.html'), 'utf8');
	doc.body.appendChild(doc.importNode(new dom.window.DOMParser().parseFromString(html, 'text/html').querySelector('main'), true));
	// As the core registers them at boot, the Changelog first here
	registerChangelogSection();
	registerSettingsSection({ key: BACKUP_SECTION_KEY, title: BACKUP_SECTION_TITLE, order: 1, render: renderBackupSection });
	registerSettingsSection({ key: SETTINGS_SECTION_KEY, title: 'Settings', render: () => {} });
	syncSettingsPage();
	const keys = Array.from(doc.querySelectorAll('[data-atmo-settings-section]'), el => el.dataset.atmoSettingsSection);
	expect(keys.slice(-2)).toEqual([BACKUP_SECTION_KEY, 'atmospheric-modulator-changelog']);
	expect(doc.querySelector('[data-atmo-settings-section="atmospheric-modulator-changelog"] h3').textContent).toContain('Changelog');
});

it('puts a dot on its heading while an update is out, said to screen readers too', async () => {
	const heading = () => doc.querySelector('[data-atmo-settings-section="atmospheric-modulator-changelog"] h3 button');
	await vi.waitFor(() => expect(heading().querySelector('.atmo-settings-badge')).not.toBeNull());
	expect(heading().textContent).toContain('Changelog (update to v0.2.6 available)');
	expect(heading().querySelector('.atmo-settings-badge').title).toBe('update to v0.2.6 available');
});


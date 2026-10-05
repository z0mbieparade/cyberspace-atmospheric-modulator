/**
 * Update check tests
 *
 * The version comparison the check depends on, the banner's show/dismiss
 * rules (never for an older or equal version; dismissing keeps it hidden until
 * something newer ships), and two scripts' banners on one page.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { JSDOM } from 'jsdom';

const SOURCE = ['ui-dialog.js', 'theme-colors.js', 'update-check.js']
	.map(name => readFileSync(join(__dirname, '..', '..', 'src', 'shared', name), 'utf8'))
	.join('\n\n');

const LOCAL_VERSION = '1.3.3';

let window;

/**
 * Evaluate the update check as one script would have it, in its own scope.
 * @param {string} scriptName
 * @param {object} [gm] - globals the manager would provide (GM_xmlhttpRequest)
 * @returns {object} the script's update-check functions and its storage
 */
function loadScript(scriptName, gm = {}) {
	const store = {};
	const factory = window.eval(`(function (GM_xmlhttpRequest) {
		const VERSION = '${LOCAL_VERSION}';
		const SCRIPT_NAME = '${scriptName}';
		const SCRIPT_URL = 'https://example.com/${scriptName}.user.js';
		const LOG_PREFIX = '[${scriptName}]';
		const logDebug = () => {};
		const _GM_getValue = (k, d) => (k in this.store ? this.store[k] : d);
		const _GM_setValue = (k, v) => { this.store[k] = v; };
		const localStorage = { getItem: () => null };
		${SOURCE}
		return { compareVersions, isNewerVersion, showUpdateBanner, checkForUpdates, startUpdateCheck, bindVersionLink,
			getDismissedUpdateVersion, saveDismissedUpdateVersion, UPDATE_BANNER_ID, versionLinkHtml,
			getUpdateAvailable: () => UPDATE_AVAILABLE };
	})`);
	return { ...factory.call({ store }, gm.GM_xmlhttpRequest), store };
}

let script;

beforeEach(() => {
	window = new JSDOM('<!DOCTYPE html><body></body>', { runScripts: 'outside-only', pretendToBeVisual: true }).window;
	script = loadScript('Nick Colors');
});

describe('compareVersions', () => {
	it('orders by numeric segment, not string', () => {
		// The case a lexicographic compare gets backwards
		expect(script.compareVersions('1.3.10', '1.3.9')).toBe(1);
		expect(script.compareVersions('1.3.9', '1.3.10')).toBe(-1);
	});

	it('treats missing segments as zero, and compares major and minor first', () => {
		expect(script.compareVersions('1.3', '1.3.0')).toBe(0);
		expect(script.compareVersions('1.3', '1.3.1')).toBe(-1);
		expect(script.compareVersions('2.0.0', '1.9.9')).toBe(1);
		expect(script.compareVersions('1.4.0', '1.3.99')).toBe(1);
	});

	it('handles empty and junk input, and a leading v', () => {
		expect(script.compareVersions('', '')).toBe(0);
		expect(script.compareVersions(null, undefined)).toBe(0);
		expect(script.compareVersions('1.3.3', '')).toBe(1);
		expect(script.compareVersions('v1.3.4', '1.3.3')).toBe(1);
	});
});

describe('isNewerVersion', () => {
	it('is true only for a genuinely newer version', () => {
		expect(script.isNewerVersion('1.3.4', '1.3.3')).toBe(true);
		expect(script.isNewerVersion('1.3.3', '1.3.3')).toBe(false);
		// A local dev build ahead of main must not prompt to "update" backwards
		expect(script.isNewerVersion('1.3.2', '1.3.3')).toBe(false);
	});
});

describe('showUpdateBanner', () => {
	const banners = () => window.document.querySelectorAll('.atmo-update-banner');

	it('shows for a newer version, naming the script and both versions', () => {
		const banner = script.showUpdateBanner('1.3.4');
		expect(banner.textContent).toContain('Nick Colors v1.3.4');
		expect(banner.textContent).toContain(LOCAL_VERSION);
	});

	it('does not show for the installed or an older version, or none', () => {
		expect(script.showUpdateBanner(LOCAL_VERSION)).toBeNull();
		expect(script.showUpdateBanner('1.3.2')).toBeNull();
		expect(script.showUpdateBanner('')).toBeNull();
		expect(banners().length).toBe(0);
	});

	it('does not show a second banner for the same script', () => {
		script.showUpdateBanner('1.3.4');
		expect(script.showUpdateBanner('1.3.4')).toBeNull();
		expect(banners().length).toBe(1);
	});

	it('stacks two scripts\' banners in one container, with their own ids', () => {
		const other = loadScript('Atmospheric Modulator');
		script.showUpdateBanner('1.3.4');
		other.showUpdateBanner('1.3.4');
		const container = window.document.getElementById('atmo-update-banners');
		expect(container.querySelectorAll('.atmo-update-banner').length).toBe(2);
		expect(script.UPDATE_BANNER_ID).not.toBe(other.UPDATE_BANNER_ID);
	});

	it('sets the theme colors it is drawn in, even before any dialog has', () => {
		expect(window.document.documentElement.style.getPropertyValue('--atmo-warn')).toBe('');
		script.showUpdateBanner('1.3.4');
		expect(window.document.documentElement.style.getPropertyValue('--atmo-warn')).not.toBe('');
	});

	it('names the x button for what it does', () => {
		const dismiss = script.showUpdateBanner('1.3.4').querySelector('.atmo-update-banner-dismiss');
		expect(dismiss.getAttribute('aria-label')).toBe("Don't show again for v1.3.4");
	});

	describe('dismissal', () => {
		it('x records the version, and the banner stays hidden for it', () => {
			script.showUpdateBanner('1.3.4').querySelector('.atmo-update-banner-dismiss').click();
			expect(script.getDismissedUpdateVersion()).toBe('1.3.4');
			window.document.getElementById(script.UPDATE_BANNER_ID).remove();
			expect(script.showUpdateBanner('1.3.4')).toBeNull();
		});

		it('shows again when a newer version than the dismissed one ships', () => {
			script.saveDismissedUpdateVersion('1.3.4');
			expect(script.showUpdateBanner('1.3.5')).not.toBeNull();
		});

		it('LATER does not record the version, so it returns next load', () => {
			script.showUpdateBanner('1.3.4').querySelector('.atmo-update-banner-later').click();
			expect(script.getDismissedUpdateVersion()).toBe('');
		});
	});
});

describe('checkForUpdates', () => {
	const managerServing = (text) => vi.fn(({ onload }) => onload({ responseText: text }));

	it('reads @version from the published script through the manager', async () => {
		const request = managerServing('// @version      1.4.0\n');
		const s = loadScript('Nick Colors', { GM_xmlhttpRequest: request });
		await s.checkForUpdates();
		expect(request.mock.calls[0][0].url).toBe('https://example.com/Nick Colors.user.js');
		expect(s.getUpdateAvailable()).toBe('1.4.0');
	});

	it('records false when the published version is not newer', async () => {
		const s = loadScript('Nick Colors', { GM_xmlhttpRequest: managerServing(`// @version ${LOCAL_VERSION}`) });
		await s.checkForUpdates();
		expect(s.getUpdateAvailable()).toBe(false);
	});

	it('stays unchecked, without rejecting, when the request fails', async () => {
		const s = loadScript('Nick Colors', { GM_xmlhttpRequest: ({ onerror }) => onerror({}) });
		await expect(s.checkForUpdates()).resolves.toBeUndefined();
		expect(s.getUpdateAvailable()).toBe(null);
	});

	it('sends one request per page load, however many ask', async () => {
		const request = managerServing('// @version 1.4.0');
		const s = loadScript('Nick Colors', { GM_xmlhttpRequest: request });
		await Promise.all([s.checkForUpdates(), s.startUpdateCheck(), s.checkForUpdates()]);
		expect(request).toHaveBeenCalledTimes(1);
	});

	it('marks a version button bound after the check with the result at once', async () => {
		const s = loadScript('Nick Colors', { GM_xmlhttpRequest: managerServing('// @version 1.4.0') });
		await s.checkForUpdates();
		const button = window.document.createElement('button');
		s.bindVersionLink(button);
		expect(button.classList.contains('atmo-update-available')).toBe(true);
		expect(button.title).toBe('Update available: v1.4.0 (click to update)');
	});

	it('startUpdateCheck shows the banner when there is an update', async () => {
		const s = loadScript('Nick Colors', { GM_xmlhttpRequest: managerServing('// @version 9.0.0') });
		await s.startUpdateCheck();
		expect(window.document.getElementById(s.UPDATE_BANNER_ID).textContent).toContain('v9.0.0');
	});
});

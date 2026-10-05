/**
 * Exclusion gate tests for init.js
 *
 * Path exclusions have no userscript-manager equivalent (@exclude can only
 * drop whole hosts), so init.js's gate is the only thing that keeps the script
 * inert on excluded hosts and paths. Load init.js against the shared setup —
 * with injectStyles standing in for the build-time-generated function — and
 * check what the gate does at each URL.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { dom } from './setup.js';

const INIT_SOURCE = readFileSync(join(process.cwd(), 'src', 'init.js'), 'utf8');

const SITE = 'https://cyberspace.online';
const ORIGINAL_A = 'https://bunker.cyberspace.online/uploads/chat/user-a/a.webp';

let injectStyles;
let startFeatures;
let logSpy;
let excludedLogs;

const loadInit = () => new Function(INIT_SOURCE)();

// bootModulator defers to DOMContentLoaded while the document is still loading
const settleBoot = () => {
	if (dom.window.document.readyState === 'loading') {
		dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
	}
};

// Probes whether the mouse listeners are live: a mapped blob img that reveals
// on hover means initImageUndither ran
const hoverProbe = () => {
	const img = dom.window.document.createElement('img');
	imageMap.set('blob:gate-1', ORIGINAL_A);
	img.setAttribute('src', 'blob:gate-1');
	dom.window.document.body.appendChild(img);
	img.dispatchEvent(new dom.window.Event('mouseover', { bubbles: true }));
	const revealed = img.getAttribute('src') === ORIGINAL_A;
	img.remove();
	return revealed;
};

beforeEach(() => {
	injectStyles = vi.fn();
	global.injectStyles = injectStyles;
	// No network in tests: the update check is the shared repo's to test
	global.startUpdateCheck = vi.fn(() => Promise.resolve());
	// The settings tab is the shared repo's to test
	global.registerSettingsSection = vi.fn();
	global.configureSettingsTab = vi.fn();
	// The user menu is tested on its own
	global.initUserMenu = vi.fn();
	global.initSidebarLink = vi.fn();
	// Features are tested on their own
	startFeatures = vi.fn();
	global.startFeatures = startFeatures;
	excludedLogs = 0;
	logSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
		if (args[0] === '[AtmoMod] Excluded, doing nothing.') excludedLogs++;
	});
});

afterEach(() => {
	logSpy.mockRestore();
	imageMap.delete('blob:gate-1');
});

describe('init exclusion gate', () => {
	it('does nothing on an excluded path', () => {
		dom.reconfigure({ url: SITE + '/terminal/room-1' });
		loadInit();
		settleBoot();

		expect(excludedLogs).toBe(1);
		expect(injectStyles).not.toHaveBeenCalled();
		expect(hoverProbe(), 'no listeners wired').toBe(false);
		// Features (nick colors) must not start here either, whenever storage loads
		expect(startFeatures).not.toHaveBeenCalled();
	});

	it('boots on an included path', () => {
		dom.reconfigure({ url: SITE + '/' });
		loadInit();
		settleBoot();

		expect(excludedLogs).toBe(0);
		expect(injectStyles).toHaveBeenCalledTimes(1);
		expect(startFeatures).toHaveBeenCalledTimes(1);
		expect(hoverProbe(), 'listeners wired').toBe(true);
	});

	it('stays excluded on an excluded host even after a boot', () => {
		dom.reconfigure({ url: SITE + '/' });
		loadInit();
		settleBoot();
		expect(injectStyles).toHaveBeenCalledTimes(1);

		dom.reconfigure({ url: 'https://page.cyberspace.online/someuser' });
		loadInit();
		settleBoot();

		expect(excludedLogs).toBe(1);
		expect(injectStyles).toHaveBeenCalledTimes(1, 'no second boot');
	});
});

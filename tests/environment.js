/**
 * The browser and userscript-manager stand-ins every test setup needs: a jsdom
 * page wired up as the globals the bundle reads, and sync GM_* mocks over its
 * localStorage, under the script's STORAGE_PREFIX.
 */

import { JSDOM } from 'jsdom';

/**
 * Create the page and install it as the test's globals.
 * Side effects: sets window, document, localStorage and the other browser
 * globals, and the GM_* mocks, on the test's global object.
 * @param {string} documentHtml - what goes inside <html>: the <head> and <body>
 * @returns {JSDOM}
 */
export function createTestEnvironment(documentHtml) {
	const dom = new JSDOM(`<!DOCTYPE html><html>${documentHtml}</html>`, { url: 'https://cyberspace.online/' });
	const w = dom.window;

	global.window = w;
	global.document = w.document;
	global.localStorage = w.localStorage;
	global.Node = w.Node;
	// Pin constructors to this dom: elements are created from it, and
	// `instanceof` against the jsdom environment's own (another realm) fails
	global.Element = w.Element;
	global.HTMLElement = w.HTMLElement;
	global.navigator = w.navigator;
	global.getComputedStyle = w.getComputedStyle;
	global.MutationObserver = w.MutationObserver;
	// jsdom only provides rAF in visual mode; a timeout is close enough here
	global.requestAnimationFrame = w.requestAnimationFrame
		? w.requestAnimationFrame.bind(w)
		: (callback) => setTimeout(() => callback(Date.now()), 0);

	// Sync GM API, stored the way the localStorage fallback would
	global.GM_setValue = (key, value) => localStorage.setItem('atmosphericModulator_' + key, value);
	global.GM_getValue = (key, defaultValue) => {
		const val = localStorage.getItem('atmosphericModulator_' + key);
		return val !== null ? val : defaultValue;
	};
	global.GM_registerMenuCommand = () => {};
	// No network in tests: the update check and nick colors' overrides get an empty answer
	// The bundle keeps the function it finds at load: a test answers requests
	// by setting global.gmRequestHandler instead of replacing this
	global.GM_xmlhttpRequest = (details) => (global.gmRequestHandler
		?? (({ onload }) => onload({ status: 200, responseText: '{}' })))(details);

	return dom;
}

/**
 * Run bundle code and put the named functions and values on the global object.
 * Strict, like the bundle's IIFE: block-scoped functions depend on it.
 * @param {string} code
 * @param {string[]} names - what the tests reach as globals
 * @throws {Error} whatever the code throws as it loads
 */
export function runAndExpose(code, names) {
	new Function(`'use strict';\n${code}\nObject.assign(this, { ${names.join(', ')} });`).call(global);
}

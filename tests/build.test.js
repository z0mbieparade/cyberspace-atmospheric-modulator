/**
 * Shipped-bundle test
 *
 * The page hooks reach the page only as the toString() of terser's output, so
 * a minifier change or an outer reference added to installPageHooks breaks
 * the injection while every source-level test stays green. Build the minified
 * bundle and run it in a jsdom that executes scripts, as a browser would.
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { JSDOM } from 'jsdom';

const require = createRequire(import.meta.url);
const { buildUserscript } = require('../build/build-userscript.js');
const config = require('../userscript.config.js');

const ORIGINAL = 'https://bunker.cyberspace.online/uploads/post/x/1.webp';

// A page-realm error carries jsdom stack frames vitest cannot source-map (it
// crashes the run instead of failing the test), so rethrow the message alone
const evalInPage = (w, code) => {
	try {
		w.eval(code);
	} catch (e) {
		throw new Error('page script threw: ' + e.message);
	}
};

describe('minified bundle', () => {
	it('injects the hooks into the page and reveals the original on hover', async () => {
		const bundle = await buildUserscript(config, { version: '0.0.0-test', minify: true, log: () => {} });
		const page = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>',
			{ url: 'https://cyberspace.online/', runScripts: 'dangerously' });
		const w = page.window;
		w.CanvasRenderingContext2D = { prototype: { drawImage() {} } };
		w.WebGLRenderingContext = { prototype: { texImage2D() {} } };
		w.HTMLCanvasElement.prototype.toBlob = function (cb) { cb(new w.Blob(['x'])); };
		w.URL.createObjectURL = () => 'blob:https://cyberspace.online/bundle-1';
		w.GM_getValue = (key, defaultValue) => defaultValue;
		w.GM_setValue = () => {};
		let diagnose = null;
		// By name: other features register commands after this one
		w.GM_registerMenuCommand = (name, fn) => { if (name === 'Dump Image Undither Diagnostics') diagnose = fn; };
		const logs = [];
		w.console.log = (...args) => logs.push(args.join(' '));

		evalInPage(w, bundle);
		await new Promise((resolve) => {
			if (w.document.readyState === 'loading') w.document.addEventListener('DOMContentLoaded', resolve, { once: true });
			else resolve();
		});

		// The site's engine call sequence (N84VKJ4_.js), inside the page realm
		evalInPage(w, `
			const i = new Image(); i.crossOrigin = 'anonymous'; i.src = ${JSON.stringify(ORIGINAL)};
			const c = document.createElement('canvas'); CanvasRenderingContext2D.prototype.drawImage.call({ canvas: c }, i, 0, 0);
			const o = document.createElement('canvas'); WebGLRenderingContext.prototype.texImage2D.call({ canvas: o }, 0, 0, 0, 0, 0, c);
			o.toBlob((b) => {
				const img = document.createElement('img');
				img.src = URL.createObjectURL(b);
				document.body.appendChild(img);
			}, 'image/png');
		`);
		const img = w.document.querySelector('img');
		img.dispatchEvent(new w.MouseEvent('mouseover', { bubbles: true }));
		expect(img.getAttribute('src')).toBe(ORIGINAL);
		img.dispatchEvent(new w.MouseEvent('mouseout', { bubbles: true }));
		expect(img.getAttribute('src')).toBe('blob:https://cyberspace.online/bundle-1');

		diagnose();
		expect(logs.join('\n')).toContain('realm = page');
	});

	it.each([false, true])('colors usernames only when nick colors is on (on = %s)', async (enabled) => {
		const bundle = await buildUserscript(config, { version: '0.0.0-test', minify: true, log: () => {} });
		const page = new JSDOM('<!DOCTYPE html><html data-theme="dark"><head></head><body><div class="chat-main-content"><a href="/alice">alice</a> and <a href="/bob">bob</a></div></body></html>',
			{ url: 'https://cyberspace.online/chat/general', runScripts: 'dangerously' });
		const w = page.window;
		const store = { featureConfig: JSON.stringify({ nickColors: enabled }) };
		w.GM_getValue = (key, defaultValue) => (key in store ? store[key] : defaultValue);
		w.GM_setValue = (key, value) => { store[key] = value; };
		const menu = [];
		w.GM_registerMenuCommand = (name) => menu.push(name);
		w.GM_xmlhttpRequest = ({ onload }) => setTimeout(() => onload({ responseText: '{}' }));
		const errors = [];
		w.console.error = (...args) => errors.push(args.join(' '));
		w.console.log = () => {};

		evalInPage(w, bundle);
		await new Promise((resolve) => setTimeout(resolve, 100));

		expect(errors).toEqual([]);
		expect(w.document.querySelectorAll('[data-nick-colored]').length).toBe(enabled ? 2 : 0);
		expect(menu.includes('Nick Colors Settings')).toBe(enabled);
	});
});

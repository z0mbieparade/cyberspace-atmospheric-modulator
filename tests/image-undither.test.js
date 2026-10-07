/**
 * Image undither tests
 *
 * The dither pipeline is exercised against stubbed canvas/WebGL prototypes
 * (jsdom implements neither 2D, WebGL, nor toBlob): drawImage tags the 2D
 * canvas, texImage2D copies the tag onto the WebGL canvas, toBlob records the
 * blob, createObjectURL feeds the map. The reveal/handler tests then drive
 * revealImage directly against a populated imageMap.
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { dom } from './setup.js';

const ORIGINAL_A = 'https://bunker.cyberspace.online/uploads/chat/user-a/1791061822973-a.webp';

const makeImg = (src) => {
	const img = dom.window.document.createElement('img');
	if (src) img.setAttribute('src', src);
	return img;
};

// The page hooks' counters, read over the same event bridge diagnostics use
const pageStats = () => readPageHookStats(dom.window.document);

// Populate the map the way the dither hooks would, for tests that do not need
// to walk the full pipeline.
const mapBlob = (blobSrc, originalUrl) => {
	imageMap.set(blobSrc, originalUrl);
	return blobSrc;
};

// jsdom has no canvas 2D, WebGL, or toBlob. Stand in the prototype shapes the
// hooks patch (overwriting any jsdom defaults so behavior is controlled), then
// install so the real hook code under test wraps our stubs.
// The stub originals return distinct sentinels so a hook that forgets to call
// (or return) the original is caught, not silently swallowed.
function setupCanvasStubs(target) {
	const w = target || dom.window;
	if (!w.CanvasRenderingContext2D) {
		w.CanvasRenderingContext2D = { prototype: {} };
	}
	w.CanvasRenderingContext2D.prototype.drawImage = function () {
		return 'drawImage-called';
	};
	w.WebGLRenderingContext = { prototype: { texImage2D: function () {
		return 'texImage2D-called';
	} } };
	w.HTMLCanvasElement.prototype.toBlob = function (callback) {
		callback(new w.Blob(['x'], { type: 'image/png' }));
		return 'toBlob-called';
	};
	let counter = 0;
	w.URL.createObjectURL = function () {
		return 'blob:atmo-test-' + (++counter);
	};
}

beforeAll(() => {
	setupCanvasStubs();
	installDitherHooks();
});

beforeEach(() => {
	imageMap.clear();
});

describe('dither hook pipeline', () => {
	it('maps a blob: URL to its original through drawImage -> texImage2D -> toBlob -> createObjectURL', () => {
		const imgEl = dom.window.document.createElement('img');
		imgEl.src = ORIGINAL_A;

		// drawImage onto a 2D canvas tags it with the image's URL
		const dst2d = dom.window.document.createElement('canvas');
		dom.window.CanvasRenderingContext2D.prototype.drawImage.call(
			{ canvas: dst2d }, imgEl, 0, 0, 10, 10, 0, 0, 10, 10
		);
		expect(dst2d.__atmoSrc).toBe(ORIGINAL_A);

		// uploading that canvas into the WebGL canvas copies the tag
		const glCanvas = dom.window.document.createElement('canvas');
		dom.window.WebGLRenderingContext.prototype.texImage2D.call(
			{ canvas: glCanvas }, 0, 0, 0, 0, 0, dst2d
		);
		expect(glCanvas.__atmoSrc).toBe(ORIGINAL_A);

		// toBlob records the original for the blob about to be created
		let blob = null;
		glCanvas.toBlob((b) => { blob = b; });
		expect(blob).toBeTruthy();

		// createObjectURL feeds the map with the URL the <img> will show
		const objectUrl = dom.window.URL.createObjectURL(blob);
		expect(imageMap.get(objectUrl)).toBe(ORIGINAL_A);
	});

	it('clears the tag for a drawImage whose source is neither an image nor a canvas', () => {
		const dst = dom.window.document.createElement('canvas');
		dst.__atmoSrc = ORIGINAL_A;
		// An ImageBitmap, say: no tagName, so no URL to carry
		dom.window.CanvasRenderingContext2D.prototype.drawImage.call(
			{ canvas: dst }, {}, 0, 0
		);
		expect(dst.__atmoSrc).toBeUndefined();
	});

	it('leaves the map empty when createObjectURL is called without a dithered blob', () => {
		const plain = new dom.window.Blob(['y'], { type: 'image/png' });
		const objectUrl = dom.window.URL.createObjectURL(plain);
		expect(imageMap.has(objectUrl)).toBe(false);
	});

	it('maps a blob: URL source the same way as http(s), when the site draws a fetched object URL', () => {
		const fetchedBlobUrl = 'blob:https://cyberspace.online/9c1f-0001';
		const fetchedImg = dom.window.document.createElement('img');
		fetchedImg.src = fetchedBlobUrl;
		const before = { ...pageStats().pipelineStats };

		const dst2d = dom.window.document.createElement('canvas');
		dom.window.CanvasRenderingContext2D.prototype.drawImage.call(
			{ canvas: dst2d }, fetchedImg, 0, 0, 10, 10, 0, 0, 10, 10
		);
		expect(dst2d.__atmoSrc).toBe(fetchedBlobUrl);

		// The live pipeline skips WebGL: toBlob runs on the same 2D canvas
		let blob = null;
		dst2d.toBlob((b) => { blob = b; });

		const objectUrl = dom.window.URL.createObjectURL(blob);
		expect(imageMap.get(objectUrl)).toBe(fetchedBlobUrl);

		const pipelineStats = pageStats().pipelineStats;
		expect(pipelineStats.drawImageBlob - before.drawImageBlob).toBe(1);
		expect(pipelineStats.toBlobTagged - before.toBlobTagged).toBe(1);
		expect(pipelineStats.createObjectURLMatched - before.createObjectURLMatched).toBe(1);
		expect(pipelineStats.drawImageOther - before.drawImageOther).toBe(0);
	});

	it('does not tag a drawImage of a non-http(s) image', () => {
		const dataImg = dom.window.document.createElement('img');
		dataImg.setAttribute('src', 'data:image/png;base64,AAAA');
		const dst = dom.window.document.createElement('canvas');
		dom.window.CanvasRenderingContext2D.prototype.drawImage.call({ canvas: dst }, dataImg, 0, 0);
		expect(dst.__atmoSrc).toBeUndefined();
	});

	it('clears a stale tag when a canvas is re-drawn from a non-http(s) image', () => {
		const httpImg = dom.window.document.createElement('img');
		httpImg.src = ORIGINAL_A;
		const nonHttpImg = dom.window.document.createElement('img');
		nonHttpImg.setAttribute('src', 'data:image/png;base64,AAAA');
		const dst = dom.window.document.createElement('canvas');
		dom.window.CanvasRenderingContext2D.prototype.drawImage.call({ canvas: dst }, httpImg, 0, 0);
		expect(dst.__atmoSrc, 'first draw tags it').toBe(ORIGINAL_A);
		dom.window.CanvasRenderingContext2D.prototype.drawImage.call({ canvas: dst }, nonHttpImg, 0, 0);
		expect(dst.__atmoSrc, 'non-http(s) re-draw clears it').toBeUndefined();
	});

	it('does not record a toBlob on an untagged canvas', () => {
		const glCanvas = dom.window.document.createElement('canvas');
		let blob = null;
		glCanvas.toBlob((b) => { blob = b; });
		expect(blob).toBeTruthy();
		expect(imageMap.has(dom.window.URL.createObjectURL(blob))).toBe(false);
	});

	it('calls through to the original and returns its result', () => {
		const img = makeImg(ORIGINAL_A);
		const canvas = dom.window.document.createElement('canvas');

		expect(dom.window.CanvasRenderingContext2D.prototype.drawImage.call({ canvas }, img, 0, 0))
			.toBe('drawImage-called');

		const glCanvas = dom.window.document.createElement('canvas');
		expect(dom.window.WebGLRenderingContext.prototype.texImage2D.call({ canvas: glCanvas }, 0, 0, 0, 0, 0, canvas))
			.toBe('texImage2D-called');

		expect(glCanvas.toBlob(() => {})).toBe('toBlob-called');

		expect(dom.window.URL.createObjectURL(new dom.window.Blob(['z'])))
			.toMatch(/^blob:atmo-test-/);
	});

	it('routes hooks to unsafeWindow (page realm) when defined, not the sandbox window', () => {
		const pageDom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
		const pageWindow = pageDom.window;
		setupCanvasStubs(pageWindow);

		// Snapshot the sandbox window's stubs to assert they are untouched
		const sandboxDrawImage = dom.window.CanvasRenderingContext2D.prototype.drawImage.toString();

		globalThis.unsafeWindow = pageWindow;
		resetDitherHooks();
		try {
			installDitherHooks();

			// Hooks must be on the PAGE realm
			expect(pageWindow.CanvasRenderingContext2D.prototype.drawImage.toString()).toContain('__atmoSrc');
			expect(pageWindow.WebGLRenderingContext.prototype.texImage2D.toString()).toContain('__atmoSrc');
			expect(pageWindow.HTMLCanvasElement.prototype.toBlob.toString()).toContain('pendingBlobs');
			expect(pageWindow.URL.createObjectURL.toString()).toContain('pendingBlobs');

			// Sandbox window must be untouched
			expect(dom.window.CanvasRenderingContext2D.prototype.drawImage.toString()).toBe(sandboxDrawImage);
		} finally {
			delete globalThis.unsafeWindow;
		}
	});
});

describe('recordImageMap', () => {
	it('evicts the oldest entry past the cap', () => {
		for (let i = 0; i <= MAX_IMAGE_MAP_ENTRIES; i++) {
			recordImageMap('blob:cap-' + i, 'https://example.com/img-' + i);
		}
		expect(imageMap.size).toBe(MAX_IMAGE_MAP_ENTRIES);
		expect(imageMap.has('blob:cap-0'), 'oldest evicted').toBe(false);
		expect(imageMap.get('blob:cap-1')).toBe('https://example.com/img-1');
		expect(imageMap.has('blob:cap-' + MAX_IMAGE_MAP_ENTRIES)).toBe(true);
	});

	it('treats a re-map as most recent', () => {
		for (let i = 0; i < MAX_IMAGE_MAP_ENTRIES; i++) {
			recordImageMap('blob:fill-' + i, 'https://example.com/fill-' + i);
		}
		recordImageMap('blob:fill-0', 'https://example.com/fill-0');
		recordImageMap('blob:newest', 'https://example.com/newest');

		expect(imageMap.size).toBe(MAX_IMAGE_MAP_ENTRIES);
		expect(imageMap.has('blob:fill-0'), 're-mapped entry survives').toBe(true);
		expect(imageMap.has('blob:fill-1'), 'next-oldest evicted').toBe(false);
	});
});

describe('revealImage / unrevealImage', () => {
	it('swaps in the original and restores the blob src', () => {
		const img = makeImg(mapBlob('blob:reveal-1', ORIGINAL_A));

		revealImage(img);
		expect(img.getAttribute('src')).toBe(ORIGINAL_A);
		expect(img.classList.contains('atmo-revealed')).toBe(true);

		unrevealImage(img);
		expect(img.getAttribute('src')).toBe('blob:reveal-1');
		expect(img.classList.contains('atmo-revealed')).toBe(false);
	});

	it('pins the rendered size while revealed and restores the inline size after', () => {
		const img = makeImg(mapBlob('blob:reveal-size', ORIGINAL_A));
		img.style.width = '50%';
		// jsdom has no layout: stand in the size the browser would compute
		const spy = vi.spyOn(dom.window, 'getComputedStyle').mockReturnValue({ width: '120px', height: '80px' });
		try {
			revealImage(img);
		} finally {
			spy.mockRestore();
		}
		expect(img.style.width).toBe('120px');
		expect(img.style.height).toBe('80px');

		unrevealImage(img);
		expect(img.style.width).toBe('50%');
		expect(img.style.height).toBe('');
	});

	it('leaves the size alone for an img with no rendered size', () => {
		const img = makeImg(mapBlob('blob:reveal-unsized', ORIGINAL_A));
		const spy = vi.spyOn(dom.window, 'getComputedStyle').mockReturnValue({ width: 'auto', height: '0px' });
		try {
			revealImage(img);
		} finally {
			spy.mockRestore();
		}
		expect(img.getAttribute('src')).toBe(ORIGINAL_A);
		expect(img.style.width).toBe('');
		expect(img.style.height).toBe('');
		unrevealImage(img);
	});

	it('restores the blob src when the revealed original fails to load', () => {
		const img = makeImg(mapBlob('blob:reveal-2', 'blob:https://cyberspace.online/revoked-0001'));

		revealImage(img);
		expect(img.getAttribute('src')).toBe('blob:https://cyberspace.online/revoked-0001');

		// The site revoked the original object URL: the swap fails to load
		img.dispatchEvent(new dom.window.Event('error'));

		expect(img.getAttribute('src')).toBe('blob:reveal-2');
		expect(img.classList.contains('atmo-revealed')).toBe(false);
	});

	it('removes the error fallback listener on unreveal, so reveal cycles do not accumulate listeners', () => {
		const img = makeImg(mapBlob('blob:reveal-3', 'blob:https://cyberspace.online/revoked-0003'));
		const removed = [];
		const origRemove = img.removeEventListener.bind(img);
		img.removeEventListener = (type, fn, opts) => { removed.push([type, fn]); origRemove(type, fn, opts); };

		revealImage(img);
		unrevealImage(img);

		expect(removed, 'one error listener removed on unreveal').toHaveLength(1);
		expect(removed[0][0]).toBe('error');
		expect(typeof removed[0][1]).toBe('function');
	});

	it('leaves unmapped images alone', () => {
		const img = makeImg('blob:unknown');

		revealImage(img);
		expect(img.getAttribute('src')).toBe('blob:unknown');
		expect(img.classList.contains('atmo-revealed')).toBe(false);

		unrevealImage(img);
		expect(img.getAttribute('src')).toBe('blob:unknown');
	});

	it('is idempotent while revealed', () => {
		const img = makeImg(mapBlob('blob:reveal-1', ORIGINAL_A));

		revealImage(img);
		expect(img.getAttribute('src')).toBe(ORIGINAL_A);
		revealImage(img);
		expect(img.getAttribute('src'), 'second reveal leaves it revealed').toBe(ORIGINAL_A);

		unrevealImage(img);
		expect(img.getAttribute('src')).toBe('blob:reveal-1');

		unrevealImage(img);
		expect(img.getAttribute('src')).toBe('blob:reveal-1');
	});

	it('ends the reveal and its pinned size when the site swaps in another image under the pointer', async () => {
		const img = makeImg(mapBlob('blob:recycle-a', ORIGINAL_A));
		const spy = vi.spyOn(dom.window, 'getComputedStyle').mockReturnValue({ width: '120px', height: '80px' });
		try {
			revealImage(img);
		} finally {
			spy.mockRestore();
		}

		img.setAttribute('src', 'blob:recycle-b');
		await Promise.resolve(); // MutationObserver callbacks run as a microtask

		expect(img.getAttribute('src')).toBe('blob:recycle-b');
		expect(img.classList.contains('atmo-revealed')).toBe(false);
		expect(img.style.width).toBe('');
		expect(img.style.height).toBe('');
	});

	it('keeps a later reveal of another original on the same img: the earlier reveal stops watching src', async () => {
		const ORIGINAL_B = 'https://bunker.cyberspace.online/uploads/post/u/b.webp';
		const img = makeImg(mapBlob('blob:watch-a', ORIGINAL_A));
		mapBlob('blob:watch-b', ORIGINAL_B);
		revealImage(img);
		unrevealImage(img);
		img.setAttribute('src', 'blob:watch-b');
		revealImage(img);
		await Promise.resolve();

		expect(img.getAttribute('src')).toBe(ORIGINAL_B);
		expect(img.classList.contains('atmo-revealed')).toBe(true);
		unrevealImage(img);
	});

	it('restores the pre-reveal inline size, not the pinned one, when re-revealing a recycled img', () => {
		mapBlob('blob:recycle-c', ORIGINAL_A);
		const img = makeImg(mapBlob('blob:recycle-d', 'https://bunker.cyberspace.online/uploads/post/u/d.webp'));
		img.style.width = '50%';
		const spy = vi.spyOn(dom.window, 'getComputedStyle').mockReturnValue({ width: '120px', height: '80px' });
		try {
			revealImage(img);
			// src changes and the next reveal runs before the observer's microtask
			img.setAttribute('src', 'blob:recycle-c');
			revealImage(img);
		} finally {
			spy.mockRestore();
		}
		expect(img.getAttribute('src')).toBe(ORIGINAL_A);

		unrevealImage(img);
		expect(img.style.width).toBe('50%');
		expect(img.style.height).toBe('');
	});

	it('re-reveals when the src changes while revealed', () => {
		const img = makeImg(mapBlob('blob:reveal-1', ORIGINAL_A));
		revealImage(img);
		expect(img.getAttribute('src')).toBe(ORIGINAL_A);

		// The site recycles the element for another image while it is revealed
		img.setAttribute('src', 'blob:recycled');

		revealImage(img);
		unrevealImage(img);
		// The stale blob src must not be restored over the new one
		expect(img.getAttribute('src')).toBe('blob:recycled');
		revealImage(img);
		expect(img.getAttribute('src')).toBe('blob:recycled');
	});
});

describe('event handlers', () => {
	beforeAll(() => {
		initImageUndither();
	});

	afterEach(() => {
		for (const child of Array.from(dom.window.document.body.children)) {
			child.remove();
		}
	});

	// touches lists the fingers still down, so a touchend lifting the last one has none
	const bubblingEvent = (type, x = 100, y = 100) => {
		const evt = new dom.window.Event(type, { bubbles: true });
		evt.touches = type === 'touchend' ? [] : [{ clientX: x, clientY: y }];
		return evt;
	};

	describe('mouse and keyboard', () => {
		it('reveals on hover and restores on leave', () => {
			const img = makeImg(mapBlob('blob:reveal-1', ORIGINAL_A));
			dom.window.document.body.appendChild(img);

			img.dispatchEvent(bubblingEvent('mouseover'));
			expect(img.getAttribute('src')).toBe(ORIGINAL_A);

			img.dispatchEvent(bubblingEvent('mouseout'));
			expect(img.getAttribute('src')).toBe('blob:reveal-1');
		});

		it('reveals on keyboard focus and restores on blur', () => {
			const img = makeImg(mapBlob('blob:reveal-1', ORIGINAL_A));
			dom.window.document.body.appendChild(img);

			img.dispatchEvent(bubblingEvent('focusin'));
			expect(img.getAttribute('src')).toBe(ORIGINAL_A);

			img.dispatchEvent(bubblingEvent('focusout'));
			expect(img.getAttribute('src')).toBe('blob:reveal-1');
		});

		it('does nothing when the feature is disabled', () => {
			const img = makeImg(mapBlob('blob:reveal-1', ORIGINAL_A));
			dom.window.document.body.appendChild(img);
			featureConfig.unditherImages = false;

			img.dispatchEvent(bubblingEvent('mouseover'));
			expect(img.getAttribute('src')).toBe('blob:reveal-1');

			featureConfig.unditherImages = true;
		});
	});

	describe('touch press and hold', () => {
		let img;

		beforeEach(() => {
			vi.useFakeTimers();
			img = makeImg(mapBlob('blob:reveal-1', ORIGINAL_A));
			dom.window.document.body.appendChild(img);
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		it('reveals after the hold duration and restores on release', () => {
			img.dispatchEvent(bubblingEvent('touchstart'));
			expect(img.getAttribute('src'), 'before hold elapses').toBe('blob:reveal-1');

			vi.advanceTimersByTime(500);
			expect(img.getAttribute('src'), 'after hold').toBe(ORIGINAL_A);

			img.dispatchEvent(bubblingEvent('touchend'));
			expect(img.getAttribute('src'), 'after release').toBe('blob:reveal-1');
		});

		it('restores when the finger lifts before the hold elapses', () => {
			img.dispatchEvent(bubblingEvent('touchstart'));
			img.dispatchEvent(bubblingEvent('touchend'));

			vi.advanceTimersByTime(500);
			expect(img.getAttribute('src')).toBe('blob:reveal-1');
		});

		it('cancels the hold when the finger moves (scrolling)', () => {
			img.dispatchEvent(bubblingEvent('touchstart', 100, 100));
			img.dispatchEvent(bubblingEvent('touchmove', 120, 100));

			vi.advanceTimersByTime(500);
			expect(img.getAttribute('src')).toBe('blob:reveal-1');

			img.dispatchEvent(bubblingEvent('touchend'));
			expect(img.getAttribute('src')).toBe('blob:reveal-1');
		});

		it('honors a shorter configured hold duration', () => {
			featureConfig.holdDuration = 150;
			img.dispatchEvent(bubblingEvent('touchstart'));

			vi.advanceTimersByTime(150);
			expect(img.getAttribute('src')).toBe(ORIGINAL_A);

			featureConfig.holdDuration = 500;
			img.dispatchEvent(bubblingEvent('touchend'));
		});
	});
});

describe('feature config', () => {
	afterEach(() => {
		localStorage.removeItem('atmosphericModulator_featureConfig');
		Object.assign(featureConfig, DEFAULT_FEATURE_CONFIG);
	});

	it('saves to storage including defaults', () => {
		Object.assign(featureConfig, { holdDuration: 900 });
		saveFeatureConfig();

		expect(JSON.parse(localStorage.getItem('atmosphericModulator_featureConfig'))).toEqual({
			unditherImages: true,
			holdDuration: 900,
			nickColors: true,
			nickNotes: true,
			worldClock: false,
		});
	});
});

describe('diagnoseImageUndither', () => {
	let logSpy;

	beforeEach(() => {
		logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
	});

	afterEach(() => {
		logSpy.mockRestore();
	});

	const loggedText = () => logSpy.mock.calls
		.map(call => call.join(' '))
		.join('\n');

	it('reports the hook realm, live hooks and how many blob imgs are mapped', () => {
		// An earlier describe's afterEach empties body, so create the mount the
		// env line reports on
		const nuxt = dom.window.document.createElement('div');
		nuxt.id = '__nuxt';
		dom.window.document.body.appendChild(nuxt);
		const container = dom.window.document.createElement('div');
		container.appendChild(makeImg(mapBlob('blob:diag-1', ORIGINAL_A)));
		container.appendChild(makeImg('blob:diag-2'));
		dom.window.document.body.appendChild(container);

		// An earlier test left the hooks pointed at another realm
		resetDitherHooks();
		installDitherHooks();
		diagnoseImageUndither();

		// jsdom does not run inline scripts, so the fallback patched window directly
		expect(loggedText()).toContain('dither hooks installed = true , realm = window');
		expect(loggedText()).toContain('unsafeWindow = undefined');
		expect(loggedText()).toContain('hooks live (drawImage / texImage2D / toBlob / createObjectURL) = true true true true');
		// jsdom implements the src accessor but no fetch, so only the src probe can land
		expect(loggedText()).toContain('first-stage probes live (src / fetch / gif arrayBuffer) = true false');
		expect(loggedText()).toContain('image map size = 1');
		expect(loggedText()).toContain('blob imgs in DOM = 2 of 2 imgs, mapped = 1');
		expect(loggedText()).toContain('drawImage-http / drawImage-blob -> texImage2D-tagged -> toBlob-tagged -> createObjectURL-matched) =');
		expect(loggedText()).toContain('first stage (src-sets-http / load-ok / load-error, fetch-total / fetch-failed) =');
		expect(loggedText()).toContain('recent load failures =');
		expect(loggedText()).toContain('env  #__nuxt = 0 children');

		container.remove();
		nuxt.remove();
	});

	it('reports a hook the site replaced as not live', () => {
		const proto = dom.window.HTMLCanvasElement.prototype;
		const ours = proto.toBlob;
		proto.toBlob = function () {};
		try {
			diagnoseImageUndither();
		} finally {
			proto.toBlob = ours;
		}
		expect(loggedText()).toContain('hooks live (drawImage / texImage2D / toBlob / createObjectURL) = true true false true');
	});
});

describe('GIFs', () => {
	const GIF_URL = 'https://latex.gg/share/CNCBS0Ba.gif';

	// A page realm with the hooks, and a stand-in Response: jsdom has none
	const gifRealm = () => {
		const w = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'https://cyberspace.online/', runScripts: 'outside-only' }).window;
		setupCanvasStubs(w);
		w.Response = class {
			constructor(url, buffer) { this.url = url; this.buffer = buffer; }
			arrayBuffer() { return Promise.resolve(this.buffer); }
		};
		installPageHooks(w, PAGE_HOOK_EVENTS);
		return w;
	};
	// A GIF header: the logical screen size is little-endian at bytes 6-9
	const gifBytes = (width, height) => {
		const bytes = new Uint8Array(16);
		bytes.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, width & 255, width >> 8, height & 255, height >> 8]);
		return bytes.buffer;
	};
	const proxyUrl = (url) => 'https://cyberspace.online/api/gif-proxy?url=' + encodeURIComponent(url);
	const canvasOf = (w, width, height) => {
		const c = w.document.createElement('canvas');
		c.width = width;
		c.height = height;
		return c;
	};
	const draw = (w, dest, source) => w.CanvasRenderingContext2D.prototype.drawImage.call({ canvas: dest }, source, 0, 0);

	// What the site's decoder and ChatGifMessage do, through the hooks
	const decodeAndShow = async (w, url, width, height) => {
		await new w.Response(proxyUrl(url), gifBytes(width, height)).arrayBuffer();
		const composite = canvasOf(w, width, height);
		const frames = [];
		for (let i = 0; i < 2; i++) {
			draw(w, composite, canvasOf(w, width, height)); // a decoded frame patch
			const frame = canvasOf(w, width, height);
			draw(w, frame, composite);
			frames.push(frame);
		}
		const gl = canvasOf(w, width, height);
		const visible = canvasOf(w, width, height);
		w.document.body.appendChild(visible);
		for (const frame of frames) {
			w.WebGLRenderingContext.prototype.texImage2D.call({ canvas: gl }, 0, 0, 0, 0, 0, frame);
			draw(w, visible, gl);
		}
		return { visible, frames };
	};

	it('marks the visible canvas with the GIF\'s original, through every frame', async () => {
		const w = gifRealm();
		const { visible, frames } = await decodeAndShow(w, GIF_URL, 225, 400);
		expect(frames.map(f => f.__atmoSrc)).toEqual([GIF_URL, GIF_URL]);
		expect(visible.getAttribute(PAGE_HOOK_EVENTS.originalAttr)).toBe(GIF_URL);
	});

	it('marks a visible canvas drawn before the site inserts it', async () => {
		const w = gifRealm();
		await new w.Response(proxyUrl(GIF_URL), gifBytes(320, 218)).arrayBuffer();
		const frame = canvasOf(w, 320, 218);
		draw(w, frame, canvasOf(w, 320, 218));
		const gl = canvasOf(w, 320, 218);
		w.WebGLRenderingContext.prototype.texImage2D.call({ canvas: gl }, 0, 0, 0, 0, 0, frame);
		// A one-frame GIF: its only draw, before the canvas is in the page
		const visible = canvasOf(w, 320, 218);
		draw(w, visible, gl);
		w.document.body.appendChild(visible);
		expect(visible.getAttribute(PAGE_HOOK_EVENTS.originalAttr)).toBe(GIF_URL);
	});

	it('matches each GIF to the canvas of its own size', async () => {
		const w = gifRealm();
		const other = 'https://latex.gg/share/other.gif';
		await new w.Response(proxyUrl(other), gifBytes(100, 50)).arrayBuffer();
		const { visible, frames } = await decodeAndShow(w, GIF_URL, 225, 400);
		expect(frames.map(f => f.__atmoSrc)).toEqual([GIF_URL, GIF_URL]);
		expect(visible.getAttribute(PAGE_HOOK_EVENTS.originalAttr)).toBe(GIF_URL);
	});

	it('keeps a GIF\'s tag when another of the same size is fetched mid-decode', async () => {
		const w = gifRealm();
		const other = 'https://latex.gg/share/same-size.gif';
		await new w.Response(proxyUrl(GIF_URL), gifBytes(225, 400)).arrayBuffer();
		const composite = canvasOf(w, 225, 400);
		draw(w, composite, canvasOf(w, 225, 400));
		await new w.Response(proxyUrl(other), gifBytes(225, 400)).arrayBuffer();
		draw(w, composite, canvasOf(w, 225, 400));
		expect(composite.__atmoSrc).toBe(GIF_URL);

		const otherComposite = canvasOf(w, 225, 400);
		draw(w, otherComposite, canvasOf(w, 225, 400));
		expect(otherComposite.__atmoSrc).toBe(other);
	});

	it('drops the mark when the visible canvas is drawn from something untagged', async () => {
		const w = gifRealm();
		const { visible } = await decodeAndShow(w, GIF_URL, 225, 400);
		// A GIF that went unmatched now plays on the same canvas
		const gl = canvasOf(w, 225, 400);
		w.WebGLRenderingContext.prototype.texImage2D.call({ canvas: gl }, 0, 0, 0, 0, 0, canvasOf(w, 225, 400));
		draw(w, visible, gl);
		expect(visible.hasAttribute(PAGE_HOOK_EVENTS.originalAttr)).toBe(false);

		const again = (await decodeAndShow(w, GIF_URL, 225, 400)).visible;
		draw(w, again, {});
		expect(again.hasAttribute(PAGE_HOOK_EVENTS.originalAttr)).toBe(false);
	});

	it('lets an unclaimed GIF go after its task, so a later one of its size keeps its own original', async () => {
		const w = gifRealm();
		const lost = 'https://latex.gg/share/never-decoded.gif';
		await new w.Response(proxyUrl(lost), gifBytes(225, 400)).arrayBuffer();
		await new Promise(resolve => setTimeout(resolve, 0));
		const { visible } = await decodeAndShow(w, GIF_URL, 225, 400);
		expect(visible.getAttribute(PAGE_HOOK_EVENTS.originalAttr)).toBe(GIF_URL);
	});

	it('keeps a later GIF\'s own original while a stale one of its size is still queued', async () => {
		const w = gifRealm();
		const lost = 'https://latex.gg/share/never-decoded.gif';
		// A background tab can delay the expiry timer past the next GIF's read
		await new w.Response(proxyUrl(lost), gifBytes(225, 400)).arrayBuffer();
		const { visible } = await decodeAndShow(w, GIF_URL, 225, 400);
		expect(visible.getAttribute(PAGE_HOOK_EVENTS.originalAttr)).toBe(GIF_URL);
	});

	it('clears a still image\'s tag when an untagged canvas is drawn over it', () => {
		const w = gifRealm();
		const work = canvasOf(w, 225, 400);
		const img = w.document.createElement('img');
		img.src = ORIGINAL_A;
		draw(w, work, img);
		draw(w, work, canvasOf(w, 225, 400));
		expect(work.__atmoSrc).toBeUndefined();
	});

	it('marks only GIF canvases, not one an image is drawn straight onto', () => {
		const w = gifRealm();
		const visible = canvasOf(w, 225, 400);
		w.document.body.appendChild(visible);
		const sprite = w.document.createElement('img');
		sprite.src = ORIGINAL_A;
		draw(w, visible, sprite);
		expect(visible.hasAttribute(PAGE_HOOK_EVENTS.originalAttr)).toBe(false);
	});

	it('ignores responses that are not the GIF proxy', async () => {
		const w = gifRealm();
		await new w.Response('https://cyberspace.online/api/other?url=' + encodeURIComponent(GIF_URL), gifBytes(225, 400)).arrayBuffer();
		const dest = canvasOf(w, 225, 400);
		draw(w, dest, canvasOf(w, 225, 400));
		expect(dest.__atmoSrc).toBeUndefined();
	});

	it('lays the original over a marked canvas while hovered', () => {
		const canvas = dom.window.document.createElement('canvas');
		canvas.setAttribute(PAGE_HOOK_EVENTS.originalAttr, GIF_URL);
		dom.window.document.body.appendChild(canvas);

		canvas.dispatchEvent(new dom.window.MouseEvent('mouseover', { bubbles: true }));
		const overlay = canvas.nextElementSibling;
		expect(overlay && overlay.tagName).toBe('IMG');
		expect(overlay.getAttribute('src')).toBe(GIF_URL);

		canvas.dispatchEvent(new dom.window.MouseEvent('mouseout', { bubbles: true }));
		expect(canvas.nextElementSibling).toBeNull();
		canvas.remove();
	});

	describe('overlay lifetime', () => {
		const markedCanvas = () => {
			const parent = dom.window.document.createElement('div');
			const canvas = dom.window.document.createElement('canvas');
			canvas.setAttribute(PAGE_HOOK_EVENTS.originalAttr, GIF_URL);
			parent.appendChild(canvas);
			dom.window.document.body.appendChild(parent);
			return { parent, canvas };
		};
		const hover = (canvas, type) => canvas.dispatchEvent(new dom.window.MouseEvent(type, { bubbles: true }));
		// MutationObserver callbacks run as a microtask
		const settle = () => new Promise(resolve => setTimeout(resolve, 0));

		it('anchors the overlay to the canvas\'s parent while revealed, then restores it', () => {
			const { parent, canvas } = markedCanvas();
			hover(canvas, 'mouseover');
			expect(parent.style.position).toBe('relative');
			hover(canvas, 'mouseout');
			expect(parent.style.position).toBe('');
			parent.remove();
		});

		it('goes on mouseout even when the canvas lost its mark mid-hover', () => {
			const { parent, canvas } = markedCanvas();
			hover(canvas, 'mouseover');
			canvas.removeAttribute(PAGE_HOOK_EVENTS.originalAttr);
			hover(canvas, 'mouseout');
			expect(parent.querySelector('img')).toBeNull();
			expect(parent.style.position).toBe('');
			parent.remove();
		});

		it('goes when another GIF starts playing on the canvas mid-hover', async () => {
			const { parent, canvas } = markedCanvas();
			hover(canvas, 'mouseover');
			canvas.setAttribute(PAGE_HOOK_EVENTS.originalAttr, 'https://latex.gg/share/next.gif');
			await settle();
			expect(parent.querySelector('img')).toBeNull();
			parent.remove();
		});

		it('goes when a re-render removes the canvas mid-hover', async () => {
			const { parent, canvas } = markedCanvas();
			hover(canvas, 'mouseover');
			expect(parent.querySelector('img')).not.toBeNull();
			canvas.remove();
			await settle();
			expect(parent.querySelector('img')).toBeNull();
			parent.remove();
		});

		it('stays when an earlier overlay fails to load', () => {
			const { parent, canvas } = markedCanvas();
			hover(canvas, 'mouseover');
			const first = canvas.nextElementSibling;
			hover(canvas, 'mouseout');
			hover(canvas, 'mouseover');
			const second = canvas.nextElementSibling;
			first.dispatchEvent(new dom.window.Event('error'));
			expect(second.isConnected).toBe(true);
			hover(canvas, 'mouseout');
			parent.remove();
		});
	});
});

describe('page hook bridge', () => {
	it('gets no stats answer from a document with no hooks', () => {
		const bare = new JSDOM('<!DOCTYPE html><html><body></body></html>');
		expect(readPageHookStats(bare.window.document)).toBeNull();
	});

	it('runs the injected hooks in the page realm and reports mappings over events', () => {
		// runScripts makes jsdom execute the inline <script>, as the browser would
		const page = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', { runScripts: 'dangerously' });
		const w = page.window;
		setupCanvasStubs(w);

		expect(injectPageHooks(w.document)).toBe(true);
		expect(w.document.querySelector('script'), 'the injected script is removed').toBeNull();
		expect(readPageHookStats(w.document).live).toMatchObject({
			drawImage: true, texImage2D: true, toBlob: true, createObjectURL: true,
		});

		const pairs = [];
		w.document.addEventListener(PAGE_HOOK_EVENTS.mapped, (e) => pairs.push(JSON.parse(e.detail)));

		// Walk the site's pipeline inside the page realm
		w.eval(`
			const img = new Image();
			img.src = ${JSON.stringify(ORIGINAL_A)};
			const c2d = document.createElement('canvas');
			CanvasRenderingContext2D.prototype.drawImage.call({ canvas: c2d }, img, 0, 0);
			const gl = document.createElement('canvas');
			WebGLRenderingContext.prototype.texImage2D.call({ canvas: gl }, 0, 0, 0, 0, 0, c2d);
			gl.toBlob((b) => { window.__objectUrl = URL.createObjectURL(b); });
		`);
		expect(pairs).toEqual([[w.__objectUrl, ORIGINAL_A]]);
		expect(readPageHookStats(w.document).pipelineStats.createObjectURLMatched).toBe(1);
	});

	describe('unditherMissesPage', () => {
		// A realm with its own hooks, as MonkeyScript's sandbox would have
		const sandboxRealm = () => {
			const w = new JSDOM('<!DOCTYPE html><html><body></body></html>', { runScripts: 'outside-only' }).window;
			setupCanvasStubs(w);
			installPageHooks(w, PAGE_HOOK_EVENTS);
			return w;
		};
		const addBlobImg = (w) => {
			const img = w.document.createElement('img');
			img.setAttribute('src', 'blob:dithered');
			w.document.body.appendChild(img);
		};

		it('is true when dithered images are on the page but the hooks saw nothing drawn', () => {
			const w = sandboxRealm();
			addBlobImg(w);
			expect(unditherMissesPage(w.document, 'unsafeWindow')).toBe(true);
		});

		it('is true when no hooks answer at all', () => {
			const w = new JSDOM('<!DOCTYPE html><html><body></body></html>').window;
			addBlobImg(w);
			expect(unditherMissesPage(w.document, 'unsafeWindow')).toBe(true);
		});

		it('is false once the hooks see the site draw an image', () => {
			const w = sandboxRealm();
			addBlobImg(w);
			w.eval(`
				const img = new Image();
				img.src = ${JSON.stringify(ORIGINAL_A)};
				CanvasRenderingContext2D.prototype.drawImage.call({ canvas: document.createElement('canvas') }, img, 0, 0);
			`);
			expect(unditherMissesPage(w.document, 'unsafeWindow')).toBe(false);
		});

		it('is false with no dithered images to judge by', () => {
			expect(unditherMissesPage(sandboxRealm().document, 'unsafeWindow')).toBe(false);
		});

		it('is false when the injected script ran, or no hooks went in', () => {
			const w = sandboxRealm();
			addBlobImg(w);
			expect(unditherMissesPage(w.document, 'page')).toBe(false);
			expect(unditherMissesPage(w.document, 'none')).toBe(false);
		});
	});

	describe('a hover with nothing to reveal', () => {
		afterEach(() => {
			delete globalThis.unsafeWindow;
			_GM_setValue('unditherMissedPage', '');
			// Back to the realm the rest of the file uses
			resetDitherHooks();
			installDitherHooks();
		});

		it('remembers, once per page, that the hooks miss the page', () => {
			// The fallback lands in a realm the site never draws in
			const w = new JSDOM('<!DOCTYPE html><html><body></body></html>').window;
			setupCanvasStubs(w);
			globalThis.unsafeWindow = w;
			resetDitherHooks();
			installDitherHooks();

			const img = w.document.createElement('img');
			img.setAttribute('src', 'blob:unmapped');
			w.document.body.appendChild(img);
			revealImage(img);
			expect(unditherCannotWork()).toBe(true);

			_GM_setValue('unditherMissedPage', '');
			revealImage(img);
			expect(unditherCannotWork(), 'checked once per page').toBe(false);
		});

		it('waits for a dithered img: hovering an avatar does not use up the check', () => {
			const w = new JSDOM('<!DOCTYPE html><html><body></body></html>').window;
			setupCanvasStubs(w);
			globalThis.unsafeWindow = w;
			resetDitherHooks();
			installDitherHooks();

			const avatar = w.document.createElement('img');
			avatar.setAttribute('src', 'https://cyberspace.online/avatar.png');
			w.document.body.appendChild(avatar);
			revealImage(avatar);

			const img = w.document.createElement('img');
			img.setAttribute('src', 'blob:unmapped');
			w.document.body.appendChild(img);
			// This script's own download makes a blob in the same realm
			w.URL.createObjectURL(new w.Blob(['{}']));
			revealImage(img);
			expect(unditherCannotWork()).toBe(true);
		});
	});

	describe('unditherCannotWork', () => {
		afterEach(() => _GM_setValue('unditherMissedPage', ''));

		it('remembers a miss seen on another page, until an image maps', () => {
			_GM_setValue('unditherMissedPage', 'true');
			expect(unditherCannotWork()).toBe(true);

			dom.window.document.dispatchEvent(new dom.window.CustomEvent(PAGE_HOOK_EVENTS.mapped, {
				detail: JSON.stringify(['blob:mapped-now', ORIGINAL_A]),
			}));
			expect(unditherCannotWork()).toBe(false);
		});
	});

	it('reports injection as not run when the page does not execute it (CSP)', () => {
		const page = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>');
		expect(injectPageHooks(page.window.document)).toBe(false);
	});

	it('does not stack wrappers when installed twice on one realm', () => {
		const page = new JSDOM('<!DOCTYPE html><html><body></body></html>');
		const w = page.window;
		setupCanvasStubs(w);
		installPageHooks(w, PAGE_HOOK_EVENTS);
		installPageHooks(w, PAGE_HOOK_EVENTS);

		const pairs = [];
		w.document.addEventListener(PAGE_HOOK_EVENTS.mapped, (e) => pairs.push(e.detail));
		const img = w.document.createElement('img');
		img.src = ORIGINAL_A;
		const c2d = w.document.createElement('canvas');
		w.CanvasRenderingContext2D.prototype.drawImage.call({ canvas: c2d }, img, 0, 0);
		const gl = w.document.createElement('canvas');
		w.WebGLRenderingContext.prototype.texImage2D.call({ canvas: gl }, 0, 0, 0, 0, 0, c2d);
		gl.toBlob((b) => w.URL.createObjectURL(b));

		expect(pairs).toHaveLength(1);
		const { pipelineStats } = readPageHookStats(w.document);
		expect(pipelineStats.drawImageHttp).toBe(1);
		expect(pipelineStats.createObjectURLMatched).toBe(1);
	});

	it('reports texImage2D live from WebGL1, the context the site uses', () => {
		const page = new JSDOM('<!DOCTYPE html><html><body></body></html>');
		const w = page.window;
		setupCanvasStubs(w);
		w.WebGL2RenderingContext = { prototype: { texImage2D() {} } };
		installPageHooks(w, PAGE_HOOK_EVENTS);
		expect(readPageHookStats(w.document).live.texImage2D).toBe(true);

		w.WebGLRenderingContext.prototype.texImage2D = function () {};
		expect(readPageHookStats(w.document).live.texImage2D).toBe(false);
	});

	it('returns false instead of throwing when Trusted Types rejects the script text', () => {
		const page = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', { runScripts: 'dangerously' });
		const doc = page.window.document;
		const createElement = doc.createElement.bind(doc);
		doc.createElement = (tag) => {
			const el = createElement(tag);
			Object.defineProperty(el, 'textContent', { set() { throw new page.window.TypeError('TrustedScript required'); } });
			return el;
		};
		expect(injectPageHooks(doc)).toBe(false);
		expect(doc.querySelector('script')).toBeNull();
	});

	it('records valid mapped events and ignores malformed ones', () => {
		const send = (detail) => dom.window.document.dispatchEvent(
			new dom.window.CustomEvent(PAGE_HOOK_EVENTS.mapped, { detail }));

		send(JSON.stringify(['blob:bridge-1', ORIGINAL_A]));
		expect(imageMap.get('blob:bridge-1')).toBe(ORIGINAL_A);

		send(JSON.stringify(['blob:bridge-2', 'javascript:alert(1)']));
		send(JSON.stringify(['https://not-a-blob', ORIGINAL_A]));
		send('not json');
		send(JSON.stringify({ blob: 'blob:bridge-3' }));
		expect(imageMap.size).toBe(1);
	});
});

describe('first-stage probes', () => {
	const DATA_GIF = 'data:image/gif;base64,R0lGODlhAQABAAAAAC';

	// Re-install over the current realm so a test's stubbed fetch never leaks
	// into later tests; delete (not assign undefined) when the realm had none.
	const restoreFetch = (origFetch) => {
		if (origFetch === undefined) delete dom.window.fetch;
		else dom.window.fetch = origFetch;
		resetDitherHooks();
		installDitherHooks();
	};

	it('counts an http(s) src set once, and its load outcome while that src is still set', () => {
		const before = { ...pageStats().firstStageStats };
		const img = dom.window.document.createElement('img');
		img.src = ORIGINAL_A;
		expect(pageStats().firstStageStats.srcSetHttp - before.srcSetHttp).toBe(1);
		expect(pageStats().firstStageStats.srcLoadOk - before.srcLoadOk).toBe(0);
		img.dispatchEvent(new dom.window.Event('load'));
		expect(pageStats().firstStageStats.srcLoadOk - before.srcLoadOk).toBe(1);
		expect(pageStats().firstStageStats.srcLoadError - before.srcLoadError).toBe(0);
	});

	it('ignores non-http srcs and repeated sets of the same url', () => {
		const before = { ...pageStats().firstStageStats };
		const img = dom.window.document.createElement('img');
		img.src = DATA_GIF;
		img.src = 'blob:https://cyberspace.online/fetched-1';
		expect(pageStats().firstStageStats.srcSetHttp - before.srcSetHttp).toBe(0);
		img.src = ORIGINAL_A;
		expect(pageStats().firstStageStats.srcSetHttp - before.srcSetHttp).toBe(1);
		img.src = ORIGINAL_A;
		expect(pageStats().firstStageStats.srcSetHttp - before.srcSetHttp).toBe(1);
	});

	it('does not attribute a load that happens after a different src replaced the counted one', () => {
		const before = { ...pageStats().firstStageStats };
		const img = dom.window.document.createElement('img');
		img.src = ORIGINAL_A;
		img.src = DATA_GIF;
		img.dispatchEvent(new dom.window.Event('load'));
		expect(pageStats().firstStageStats.srcLoadOk - before.srcLoadOk).toBe(0);
		expect(pageStats().firstStageStats.srcLoadError - before.srcLoadError).toBe(0);
	});

	it('records a load error with its url in firstStageErrors', () => {
		const before = { ...pageStats().firstStageStats };
		const img = dom.window.document.createElement('img');
		img.src = ORIGINAL_A;
		img.dispatchEvent(new dom.window.Event('error'));
		expect(pageStats().firstStageStats.srcLoadError - before.srcLoadError).toBe(1);
		expect(pageStats().firstStageErrors.at(-1)).toBe(ORIGINAL_A);
	});

	it('counts fetch() of http(s) URLs and non-ok responses', async () => {
		const before = { ...pageStats().firstStageStats };
		const origFetch = dom.window.fetch;
		dom.window.fetch = () => Promise.resolve({ ok: false, status: 403 });
		resetDitherHooks();
		installDitherHooks();
		try {
			await dom.window.fetch(ORIGINAL_A);
			await new Promise((r) => setTimeout(r, 0));
			expect(pageStats().firstStageStats.fetchTotal - before.fetchTotal).toBe(1);
			expect(pageStats().firstStageStats.fetchFailed - before.fetchFailed).toBe(1);
			expect(pageStats().firstStageErrors.at(-1)).toBe(ORIGINAL_A + '  [403]');
		} finally {
			restoreFetch(origFetch);
		}
	});

	it('passes non-http fetches through without counting them', async () => {
		const before = { ...pageStats().firstStageStats };
		const origFetch = dom.window.fetch;
		dom.window.fetch = () => Promise.resolve({ ok: true, status: 200 });
		resetDitherHooks();
		installDitherHooks();
		try {
			const res = await dom.window.fetch('/api/local');
			await new Promise((r) => setTimeout(r, 0));
			expect(res.ok).toBe(true);
			expect(pageStats().firstStageStats.fetchTotal - before.fetchTotal).toBe(0);
		} finally {
			restoreFetch(origFetch);
		}
	});

	it('counts a fetch() whose input is a URL object', async () => {
		const before = { ...pageStats().firstStageStats };
		const origFetch = dom.window.fetch;
		dom.window.fetch = () => Promise.resolve({ ok: true, status: 200 });
		resetDitherHooks();
		installDitherHooks();
		try {
			await dom.window.fetch(new dom.window.URL(ORIGINAL_A));
			await new Promise((r) => setTimeout(r, 0));
			expect(pageStats().firstStageStats.fetchTotal - before.fetchTotal).toBe(1);
			expect(pageStats().firstStageStats.fetchFailed - before.fetchFailed).toBe(0);
		} finally {
			restoreFetch(origFetch);
		}
	});

	it('records a rejected fetch with its url and lets the rejection pass through', async () => {
		const before = { ...pageStats().firstStageStats };
		const origFetch = dom.window.fetch;
		dom.window.fetch = () => Promise.reject(new Error('net down'));
		resetDitherHooks();
		installDitherHooks();
		try {
			await expect(dom.window.fetch(ORIGINAL_A)).rejects.toThrow('net down');
			await new Promise((r) => setTimeout(r, 0));
			expect(pageStats().firstStageStats.fetchTotal - before.fetchTotal).toBe(1);
			expect(pageStats().firstStageStats.fetchFailed - before.fetchFailed).toBe(0);
			expect(pageStats().firstStageErrors.at(-1)).toBe(ORIGINAL_A + '  [fetch rejected]');
		} finally {
			restoreFetch(origFetch);
		}
	});

	it('re-attaches the outcome listeners when the url changes, so one load credits the newest set only', () => {
		const before = { ...pageStats().firstStageStats };
		const img = dom.window.document.createElement('img');
		img.src = ORIGINAL_A;
		img.src = 'https://bunker.cyberspace.online/uploads/chat/user-a/second.webp';
		expect(pageStats().firstStageStats.srcSetHttp - before.srcSetHttp).toBe(2);
		img.dispatchEvent(new dom.window.Event('load'));
		// 2 instead of 1 if the first set's once-listener were still attached
		expect(pageStats().firstStageStats.srcLoadOk - before.srcLoadOk).toBe(1);
	});

	it('does not double-count a src set when the hooks are re-installed over themselves', () => {
		const before = { ...pageStats().firstStageStats };
		resetDitherHooks();
		installDitherHooks();
		resetDitherHooks();
		installDitherHooks();
		const img = dom.window.document.createElement('img');
		img.src = ORIGINAL_A;
		expect(pageStats().firstStageStats.srcSetHttp - before.srcSetHttp).toBe(1);
	});
});


// =====================================================
// IMAGE UNDITHER
// =====================================================

const IMAGE_LOG_PREFIX = featureLogPrefix('image-undither');

// The site dithers every image client-side (RasterImage + its WebGL engine):
// the original URL is loaded into `new Image()`, drawn onto a 2D canvas,
// uploaded into one shared WebGL canvas, and only the resulting blob: PNG is
// set on the <img>. The original never reaches the DOM, and production Vue
// does not expose the component props, so we tag the pipeline at every stage
// that carries a canvas:
//   drawImage       -> the 2D canvas the original was drawn onto  carries __atmoSrc
//   texImage2D      -> the shared WebGL canvas fed that 2D canvas  carries __atmoSrc
//   toBlob          -> the blob about to be created                -> pendingBlobs
//   createObjectURL -> the blob: URL the <img> will show           -> mapped event
// The engine dithers strictly serially (one toBlob awaited at a time), so the
// tag is always read before the shared WebGL canvas is reused for the next
// image. The hooks must be in place before the engine first runs, hence
// @run-at document-start.

// Blob -> original pairs and the diagnostics travel between the page hooks and
// the userscript as DOM events: the document is the one thing both realms
// share in every manager and browser. Details are JSON strings because an
// object created in one realm is unreadable (Chrome) or wrapped (Firefox) in
// the other.
const PAGE_HOOK_EVENTS = {
	mapped: 'atmo:image-mapped',        // page -> userscript, detail [blobUrl, originalUrl]
	statsRequest: 'atmo:stats-request', // userscript -> page, answered synchronously
	stats: 'atmo:stats',                // page -> userscript, detail: the page's counters
};

const imageMap = new Map();          // blob: URL -> original URL
let ditherHooksInstalled = false;
// Where the hooks went: 'page' (injected <script>), 'unsafeWindow' or 'window'
// (fallback, direct patch). Reported by diagnoseImageUndither.
let ditherHookRealm = 'none';

// The map is bounded: entries accumulate one pair per dithered image for the
// life of the page, so least recently added entries are dropped first. (The
// mapped URLs may outlive their img - see the reveal error fallback - but a
// dead entry only costs a reveal that reverts itself.)
const MAX_IMAGE_MAP_ENTRIES = 1024;

/**
 * Record a blob -> original pair, evicting the oldest past the cap.
 * @param {string} objectUrl - the blob: URL on the <img>
 * @param {string} url - the original it was dithered from
 */
function recordImageMap(objectUrl, url) {
	imageMap.delete(objectUrl); // a re-map refreshes recency (Map.set keeps the old position)
	imageMap.set(objectUrl, url);
	while (imageMap.size > MAX_IMAGE_MAP_ENTRIES) {
		imageMap.delete(imageMap.keys().next().value);
	}
}

/**
 * Patch the dither pipeline in one realm and report back over DOM events.
 *
 * Runs in the page's realm when injected as a <script> (via toString), so it
 * must stay self-contained: no references to anything outside this function.
 * Counters live on pageWindow.__atmoHookState, so they are per realm. A second
 * install (a fallback after a partly-run injection, or a second copy of the
 * script) skips every hook whose prototype still holds our wrapper: stacked
 * wrappers would count each call twice and send each mapping twice.
 *
 * Side effects: replaces drawImage, texImage2D, toBlob, URL.createObjectURL,
 * the HTMLImageElement src setter and fetch on pageWindow; adds one listener
 * for events.statsRequest on its document.
 * @param {Window} pageWindow - the realm whose prototypes the site's engine uses
 * @param {{mapped: string, statsRequest: string, stats: string}} events - PAGE_HOOK_EVENTS
 */
function installPageHooks(pageWindow, events) {
	const doc = pageWindow.document;
	const emit = (name, detail) => doc.dispatchEvent(new pageWindow.CustomEvent(name, { detail: JSON.stringify(detail) }));

	let state = pageWindow.__atmoHookState;
	if (!state) {
		state = {
			pendingBlobs: new WeakMap(),  // Blob -> original URL (toBlob -> createObjectURL)
			wrappers: {},                 // hook name -> our installed function, for the live check
			// Per-stage call counts. When the map ends up empty the final state
			// alone cannot say which stage failed, so each hook counts the calls
			// that carry (or could carry) a tag.
			pipelineStats: {
				drawImageHttp: 0,      // drawImage of an http(s) <img>: the tag is set here
				drawImageBlob: 0,      // drawImage of a blob: <img>: the tag is set here
				drawImageOther: 0,     // drawImage of anything else: the tag is cleared here
				texImage2DTagged: 0,   // texImage2D whose source carried a tag
				texImage2DUntagged: 0, // texImage2D whose source had no tag
				toBlobTagged: 0,       // toBlob on a tagged canvas: the blob is recorded
				toBlobUntagged: 0,     // toBlob on an untagged canvas
				createObjectURLMatched: 0,  // createObjectURL whose blob was recorded
				createObjectURLMissed: 0,   // createObjectURL whose blob was not recorded
				mappedEmitFailed: 0,        // a recorded blob whose mapped event could not be sent
			},
			// The load stage runs before any canvas exists. pipelineStats stays
			// zero when it fails or the engine never starts, so these are the
			// only numbers that say which.
			firstStageStats: {
				srcSetHttp: 0,    // http(s) URL set on an <img>.src
				srcLoadOk: 0,     // that img's load event, attributed to the counted set
				srcLoadError: 0,  // that img's error event, attributed to the counted set
				fetchTotal: 0,    // fetch() of an http(s) URL
				fetchFailed: 0,   // of those, a non-ok response
			},
			// Recent load failures, bounded; a dead entry is just a stale URL
			firstStageErrors: [],
		};
		pageWindow.__atmoHookState = state;

		doc.addEventListener(events.statsRequest, () => {
			const w = state.wrappers;
			const srcDesc = pageWindow.HTMLImageElement
				&& Object.getOwnPropertyDescriptor(pageWindow.HTMLImageElement.prototype, 'src');
			// A hook is live only while the prototype still holds our newest
			// wrapper: false means it never landed or the site replaced it
			const isLive = (current, name) => !!w[name] && current === w[name];
			emit(events.stats, {
				live: {
					drawImage: isLive(pageWindow.CanvasRenderingContext2D && pageWindow.CanvasRenderingContext2D.prototype.drawImage, 'drawImage'),
					// The site's engine asks for getContext('webgl'): WebGL1 only
					texImage2D: isLive(pageWindow.WebGLRenderingContext && pageWindow.WebGLRenderingContext.prototype.texImage2D, 'texImage2D:WebGLRenderingContext'),
					toBlob: isLive(pageWindow.HTMLCanvasElement && pageWindow.HTMLCanvasElement.prototype.toBlob, 'toBlob'),
					createObjectURL: isLive(pageWindow.URL && pageWindow.URL.createObjectURL, 'createObjectURL'),
					src: isLive(srcDesc && srcDesc.set, 'src'),
					fetch: isLive(pageWindow.fetch, 'fetch'),
				},
				pipelineStats: state.pipelineStats,
				firstStageStats: state.firstStageStats,
				firstStageErrors: state.firstStageErrors,
			});
		});
	}

	const { pendingBlobs, wrappers, pipelineStats, firstStageStats, firstStageErrors } = state;
	const recordFirstStageError = (entry) => {
		firstStageErrors.push(entry);
		if (firstStageErrors.length > 8) firstStageErrors.shift();
	};

	// drawImage: tag the destination 2D canvas with the source image's URL. A
	// source that is neither an http(s) nor a blob: image clears any stale tag
	// so a later toBlob on the same canvas cannot map a leftover URL. (Worst
	// case for blob: sources: a pass that draws an already-dithered blob maps
	// dither to dither - harmless, and a lookup cannot cycle.)
	const drawImageProto = pageWindow.CanvasRenderingContext2D && pageWindow.CanvasRenderingContext2D.prototype;
	if (drawImageProto && typeof drawImageProto.drawImage === 'function' && drawImageProto.drawImage !== wrappers.drawImage) {
		const origDrawImage = drawImageProto.drawImage;
		wrappers.drawImage = drawImageProto.drawImage = function (...args) {
			const image = args[0];
			const url = image && image.tagName === 'IMG' ? image.src : null;
			if (this && this.canvas) {
				if (typeof url === 'string' && /^https?:\/\//.test(url)) {
					this.canvas.__atmoSrc = url;
					pipelineStats.drawImageHttp++;
				} else if (typeof url === 'string' && /^blob:/.test(url)) {
					this.canvas.__atmoSrc = url;
					pipelineStats.drawImageBlob++;
				} else {
					delete this.canvas.__atmoSrc;
					pipelineStats.drawImageOther++;
				}
			}
			return origDrawImage.apply(this, args);
		};
	}

	// texImage2D: copy the 2D canvas' tag onto the shared WebGL canvas it is
	// uploaded into (or clear it, for the same reason as above).
	for (const name of ['WebGLRenderingContext', 'WebGL2RenderingContext']) {
		const Proto = pageWindow[name];
		const key = 'texImage2D:' + name;
		if (!Proto || !Proto.prototype || typeof Proto.prototype.texImage2D !== 'function') continue;
		if (Proto.prototype.texImage2D === wrappers[key]) continue;
		const origTexImage2D = Proto.prototype.texImage2D;
		wrappers[key] = Proto.prototype.texImage2D = function (...args) {
			const source = args[args.length - 1];
			const url = source && source.__atmoSrc;
			if (this && this.canvas) {
				if (url) {
					this.canvas.__atmoSrc = url;
					pipelineStats.texImage2DTagged++;
				} else {
					delete this.canvas.__atmoSrc;
					pipelineStats.texImage2DUntagged++;
				}
			}
			return origTexImage2D.apply(this, args);
		};
	}

	// toBlob: remember which original produced this blob, read at call time so it
	// is captured before the shared WebGL canvas is overwritten for the next frame.
	const canvasProto = pageWindow.HTMLCanvasElement && pageWindow.HTMLCanvasElement.prototype;
	if (canvasProto && typeof canvasProto.toBlob === 'function' && canvasProto.toBlob !== wrappers.toBlob) {
		const origToBlob = canvasProto.toBlob;
		wrappers.toBlob = canvasProto.toBlob = function (callback, ...rest) {
			const url = this.__atmoSrc;
			if (url) pipelineStats.toBlobTagged++;
			else pipelineStats.toBlobUntagged++;
			return origToBlob.call(this, function (blob) {
				if (blob && url) pendingBlobs.set(blob, url);
				if (callback) callback(blob);
			}, ...rest);
		};
	}

	// createObjectURL: the blob: URL the renderer sets on the <img>.
	if (pageWindow.URL && typeof pageWindow.URL.createObjectURL === 'function'
		&& pageWindow.URL.createObjectURL !== wrappers.createObjectURL) {
		const origCreateObjectURL = pageWindow.URL.createObjectURL;
		wrappers.createObjectURL = pageWindow.URL.createObjectURL = function (blob, ...rest) {
			const url = pendingBlobs.get(blob);
			const objectUrl = origCreateObjectURL.call(this, blob, ...rest);
			if (url && typeof objectUrl === 'string') {
				// A throw here would reach the site's toBlob callback and break its render
				try {
					emit(events.mapped, [objectUrl, url]);
					pipelineStats.createObjectURLMatched++;
				} catch (e) {
					pipelineStats.mappedEmitFailed++;
				}
			} else {
				pipelineStats.createObjectURLMissed++;
			}
			return objectUrl;
		};
	}

	// <img>.src setter: the load stage. No canvas exists yet here, so none of
	// the hooks above can fire before this; counting the http(s) sets and their
	// outcomes is the only way to tell "the load of the original failed" from
	// "the engine never ran". A repeated set of the same URL (Vue re-renders)
	// counts once per img; the once-listeners are re-attached on each new URL
	// and the outcome is attributed only while that URL is still the src, so a
	// blob: swapped onto the same img later cannot credit or blame the http set.
	const imgProto = pageWindow.HTMLImageElement && pageWindow.HTMLImageElement.prototype;
	const srcDesc = imgProto && Object.getOwnPropertyDescriptor(imgProto, 'src');
	if (srcDesc && typeof srcDesc.set === 'function' && srcDesc.set !== wrappers.src) {
		const origSrcSet = srcDesc.set;
		const srcWrapper = function (value) {
			origSrcSet.call(this, value);
			const url = typeof value === 'string' ? value : '';
			if (!/^https?:\/\//.test(url) || this.__atmoFirstSrc === url) return;
			this.__atmoFirstSrc = url;
			firstStageStats.srcSetHttp++;
			if (this.__atmoSrcOutcome) {
				this.removeEventListener('load', this.__atmoSrcOutcome.ok);
				this.removeEventListener('error', this.__atmoSrcOutcome.fail);
			}
			const stillSrc = () => this.getAttribute('src') === url || this.src === url;
			const ok = () => { if (stillSrc()) firstStageStats.srcLoadOk++; };
			const fail = () => {
				if (!stillSrc()) return;
				firstStageStats.srcLoadError++;
				recordFirstStageError(url);
			};
			this.__atmoSrcOutcome = { ok, fail };
			this.addEventListener('load', ok, { once: true });
			this.addEventListener('error', fail, { once: true });
		};
		// A non-configurable descriptor throws; the src probe is diagnostics
		// only, so it must not stop the fetch probe from installing
		try {
			Object.defineProperty(imgProto, 'src', {
				configurable: srcDesc.configurable,
				enumerable: srcDesc.enumerable,
				get: srcDesc.get,
				set: srcWrapper,
			});
			wrappers.src = srcWrapper;
		} catch (e) { /* reported as src not live */ }
	}

	// fetch: the load stage for engines that pull the original with fetch()
	// instead of <img>. Pass-through; the .then only records, never alters the
	// page's promise (the swallowed .catch keeps a failed fetch from becoming
	// an unhandled rejection in the page's realm).
	if (typeof pageWindow.fetch === 'function' && pageWindow.fetch !== wrappers.fetch) {
		const origFetch = pageWindow.fetch;
		wrappers.fetch = pageWindow.fetch = function (input, ...rest) {
			let url = '';
			try {
				// A string, a Request (.url), or a URL object (.href; .url is
				// not part of the WHATWG URL interface some engines implement)
				url = typeof input === 'string' ? input : (input && (input.url || input.href)) || '';
			} catch (e) { url = ''; }
			if (typeof url !== 'string' || !/^https?:\/\//.test(url)) {
				return origFetch.call(this, input, ...rest);
			}
			firstStageStats.fetchTotal++;
			const response = origFetch.call(this, input, ...rest);
			if (response && typeof response.then === 'function') {
				response.then((r) => {
					if (r && r.ok === false) {
						firstStageStats.fetchFailed++;
						recordFirstStageError(url + '  [' + r.status + ']');
					}
				}).catch(() => {
					// A rejected fetch has no status; the URL alone still locates it.
					recordFirstStageError(url + '  [fetch rejected]');
				});
			}
			return response;
		};
	}
}

/**
 * Ask the hooks installed in doc for their counters.
 * @param {Document} doc
 * @returns {object|null} the page's stats payload, or null when no hooks answer
 */
function readPageHookStats(doc) {
	let stats = null;
	const onStats = (e) => {
		try { stats = JSON.parse(e.detail); } catch (err) { stats = null; }
	};
	doc.addEventListener(PAGE_HOOK_EVENTS.stats, onStats);
	try {
		doc.dispatchEvent(new doc.defaultView.CustomEvent(PAGE_HOOK_EVENTS.statsRequest));
	} finally {
		doc.removeEventListener(PAGE_HOOK_EVENTS.stats, onStats);
	}
	return stats;
}

/**
 * Run installPageHooks in the page's own realm through an inline <script>.
 *
 * This is the primary path: managers that run userscripts in an isolated world
 * (Tampermonkey on Chrome MV3) or behind Xray wrappers (Firefox) cannot patch
 * page prototypes reliably, but an inline script always runs as the page. The
 * site's CSP allows 'unsafe-inline'. When a CSP or Trusted Types policy blocks
 * the script, this returns false rather than throwing.
 *
 * Side effects: appends and removes one <script> element in doc.
 * @param {Document} doc
 * @returns {boolean} true when the injected script ran
 */
function injectPageHooks(doc) {
	const root = doc.head || doc.documentElement;
	if (!root) return false;
	const script = doc.createElement('script');
	try {
		// currentScript marks the run, so a copy already answering in this
		// document (a second install) is not mistaken for this one
		script.textContent = '(' + installPageHooks.toString() + ')(window, '
			+ JSON.stringify(PAGE_HOOK_EVENTS) + ');document.currentScript.dataset.atmoRan="1";';
		root.appendChild(script);
		return script.dataset.atmoRan === '1';
	} catch (e) {
		// Trusted Types rejects a plain-string textContent on a <script>
		return false;
	} finally {
		script.remove();
	}
}

// The fallback must patch the realm the site's own code walks. In a sandbox,
// `window` is the sandbox's window; `unsafeWindow` (@grant unsafeWindow) is the
// page's. In tests (jsdom) `unsafeWindow` is undefined and `window` is the
// dom's window, where the stubs live.
function hookTargetWindow() {
	return typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
}

/**
 * Receive a blob -> original pair from the page hooks.
 * @param {CustomEvent} e - detail is JSON [blobUrl, originalUrl]
 */
function onImageMapped(e) {
	let pair;
	try { pair = JSON.parse(e.detail); } catch (err) { return; }
	if (!Array.isArray(pair)) return;
	const [objectUrl, url] = pair;
	if (typeof objectUrl !== 'string' || !/^blob:/.test(objectUrl)) return;
	if (typeof url !== 'string' || !/^(https?|blob):/.test(url)) return;
	recordImageMap(objectUrl, url);
	logDebug(IMAGE_LOG_PREFIX + ' mapped', url, '->', objectUrl);
}

// Install the hooks: injected into the page first, patched directly as the
// fallback. The mapped listener goes on before either, so no pair is missed.
function installDitherHooks() {
	if (ditherHooksInstalled) return;
	document.addEventListener(PAGE_HOOK_EVENTS.mapped, onImageMapped);
	if (injectPageHooks(document)) {
		ditherHookRealm = 'page';
	} else {
		installPageHooks(hookTargetWindow(), PAGE_HOOK_EVENTS);
		ditherHookRealm = typeof unsafeWindow !== 'undefined' ? 'unsafeWindow' : 'window';
	}
	ditherHooksInstalled = true;
}

// Reset for tests: allows installDitherHooks to re-run with a different realm.
// The counters live on the realm, not here, so they are not reset; tests that
// assert on them use relative diffs.
function resetDitherHooks() {
	ditherHooksInstalled = false;
	ditherHookRealm = 'none';
}

// Revealed images, holding the srcs and inline size to restore on hide. A
// WeakMap so a re-rendered (removed) img is forgotten automatically.
const revealedImages = new WeakMap();

/**
 * Pin img's inline width/height to its current rendered size.
 *
 * The site sets width/height attributes only on a fresh dither; an img served
 * from its dither cache has none and shows at the blob's natural size. The
 * original's natural size is usually far larger, so without this the swap
 * reflows the page. The computed size follows box-sizing, so copying it back
 * inline reproduces the same box.
 * Side effects: sets img.style.width and img.style.height.
 * @param {HTMLImageElement} img
 * @returns {{width: string, height: string}|null} the inline values to restore,
 *   or null when img has no rendered size (not laid out) and was left alone
 */
function lockRenderedSize(img) {
	const computed = window.getComputedStyle(img);
	if (!(parseFloat(computed.width) > 0) || !(parseFloat(computed.height) > 0)) return null;
	const previous = { width: img.style.width, height: img.style.height };
	img.style.width = computed.width;
	img.style.height = computed.height;
	return previous;
}

/**
 * Show img's original in place of its dithered blob, at the same size.
 * Does nothing for an img with no mapped original.
 * Side effects: changes img's src, class, inline size, an error listener, and
 * observes img's src until unrevealImage.
 * @param {HTMLImageElement} img
 */
function revealImage(img) {
	const blobSrc = img.getAttribute('src');
	const current = revealedImages.get(img);
	if (current) {
		// src still the original: already revealed, nothing to do.
		// Anything else means the element's src moved on while revealed
		// (re-render, re-dither): drop the stale reveal and start over for
		// the new src
		if (blobSrc === current.originalUrl) return;
		unrevealImage(img);
	}
	const originalUrl = imageMap.get(blobSrc);
	if (!originalUrl) return;
	// A blob: original may be revoked by the site after we revealed it.
	// Restore the dithered src if the swap fails to load. The listener is kept
	// on the reveal record so unrevealImage removes it: a stale once-listener
	// from a superseded reveal must not revert the new one.
	const onRevealError = () => unrevealImage(img);
	const lockedSize = lockRenderedSize(img);
	img.setAttribute('src', originalUrl);
	img.classList.add('atmo-revealed');
	img.addEventListener('error', onRevealError, { once: true });
	// The site reuses the img for another image by patching src. Under the
	// pointer no mouseout follows, so the new image would sit in this one's
	// pinned box until it left; end the reveal as soon as src moves on
	const srcObserver = new MutationObserver(() => {
		if (img.getAttribute('src') !== originalUrl) unrevealImage(img);
	});
	srcObserver.observe(img, { attributes: true, attributeFilter: ['src'] });
	revealedImages.set(img, { blobSrc, originalUrl, onRevealError, lockedSize, srcObserver });
}

/**
 * Undo revealImage: restore the dithered blob and the inline size.
 * Side effects: changes img's src, class, inline size, and an error listener.
 * @param {HTMLImageElement} img
 */
function unrevealImage(img) {
	const current = revealedImages.get(img);
	if (!current) return;
	revealedImages.delete(img);
	img.classList.remove('atmo-revealed');
	if (current.onRevealError) img.removeEventListener('error', current.onRevealError);
	// A leftover observer would end a later reveal of a different original on
	// this same img, since that src is not the original it watches for
	current.srcObserver.disconnect();
	if (current.lockedSize) {
		img.style.width = current.lockedSize.width;
		img.style.height = current.lockedSize.height;
	}
	// Restore only if nobody else changed the src since we revealed: a re-render
	// that swapped in a new blob must not be overwritten with the stale one.
	if (img.getAttribute('src') === current.originalUrl) {
		img.setAttribute('src', current.blobSrc);
	}
}

// --- Hover (mouse and keyboard focus) ---

function onMouseOver(e) {
	if (featureConfig.unditherImages && e.target && e.target.tagName === 'IMG') revealImage(e.target);
}

function onMouseOut(e) {
	if (e.target && e.target.tagName === 'IMG') unrevealImage(e.target);
}

function onFocusIn(e) {
	if (featureConfig.unditherImages && e.target && e.target.tagName === 'IMG') revealImage(e.target);
}

function onFocusOut(e) {
	if (e.target && e.target.tagName === 'IMG') unrevealImage(e.target);
}

// --- Touch: press and hold to reveal, release to restore ---

function getHoldDuration() {
	// The slider's minimum and the default, from where they are set
	return Math.max(settingsField('holdDuration').min, Number(featureConfig.holdDuration) || DEFAULT_FEATURE_CONFIG.holdDuration);
}

// --- Init ---

// Wire up the DOM-side listeners. The blob -> original map is already being
// populated by the dither hooks (installed at document-start), so there is
// nothing to build or poll for here.
function initImageUndither() {
	document.addEventListener('mouseover', onMouseOver);
	document.addEventListener('mouseout', onMouseOut);
	document.addEventListener('focusin', onFocusIn);
	document.addEventListener('focusout', onFocusOut);
	attachLongPress({
		findTarget: (e) => (featureConfig.unditherImages && e.target && e.target.tagName === 'IMG' ? e.target : null),
		getDuration: getHoldDuration,
		onHold: revealImage,
		onRelease: (img, held) => { if (held) unrevealImage(img); },
	});
}

// --- Diagnostics ---

// Report where the hooks went, whether each is still live in the page, how well
// the map tracks the blob imgs in the DOM, and the per-stage call counts. Run
// from the menu. When the map is empty the per-stage lines show which link of
// the chain (drawImage -> texImage2D -> toBlob -> createObjectURL) failed.
function diagnoseImageUndither() {
	console.log(IMAGE_LOG_PREFIX + ' diagnose: dither hooks installed =', ditherHooksInstalled, ', realm =', ditherHookRealm);
	console.log(IMAGE_LOG_PREFIX + ' diagnose: unsafeWindow =', typeof unsafeWindow,
		', shares document =', typeof unsafeWindow !== 'undefined' && unsafeWindow.document === document);

	const stats = readPageHookStats(document);
	if (!stats) {
		// Nothing answered: the hooks never ran in any realm that shares this document
		console.log(IMAGE_LOG_PREFIX + ' diagnose: page hooks = no answer');
	} else {
		const { live, pipelineStats: p, firstStageStats: f, firstStageErrors } = stats;
		console.log(IMAGE_LOG_PREFIX + ' diagnose: hooks live (drawImage / texImage2D / toBlob / createObjectURL) =',
			live.drawImage, live.texImage2D, live.toBlob, live.createObjectURL);
		console.log(IMAGE_LOG_PREFIX + ' diagnose: first-stage probes live (src / fetch) =', live.src, live.fetch);
		console.log(IMAGE_LOG_PREFIX + ' diagnose: pipeline (drawImage-http / drawImage-blob -> texImage2D-tagged -> toBlob-tagged -> createObjectURL-matched) =',
			p.drawImageHttp, '/', p.drawImageBlob, '->', p.texImage2DTagged, '->', p.toBlobTagged, '->', p.createObjectURLMatched);
		console.log(IMAGE_LOG_PREFIX + ' diagnose: pipeline misses (drawImage-other / texImage2D-untagged / toBlob-untagged / createObjectURL-missed / mapped-emit-failed) =',
			p.drawImageOther, p.texImage2DUntagged, p.toBlobUntagged, p.createObjectURLMissed, p.mappedEmitFailed);
		console.log(IMAGE_LOG_PREFIX + ' diagnose: first stage (src-sets-http / load-ok / load-error, fetch-total / fetch-failed) =',
			f.srcSetHttp, '/', f.srcLoadOk, '/', f.srcLoadError, ',', f.fetchTotal, '/', f.fetchFailed);
		console.log(IMAGE_LOG_PREFIX + ' diagnose: recent load failures =',
			firstStageErrors.length ? firstStageErrors.join(' | ') : '(none)');
	}

	console.log(IMAGE_LOG_PREFIX + ' diagnose: image map size =', imageMap.size);
	const blobImgs = Array.from(document.querySelectorAll('img[src^="blob:"]'));
	let mapped = 0;
	for (const img of blobImgs) {
		if (imageMap.has(img.getAttribute('src'))) mapped++;
	}
	const allImgs = document.querySelectorAll('img').length;
	console.log(IMAGE_LOG_PREFIX + ' diagnose: blob imgs in DOM = ' + blobImgs.length + ' of ' + allImgs + ' imgs, mapped = ' + mapped);

	// The environment: when every counter above is zero, the question is
	// whether the app rendered anything at all, in this document, in this
	// frame. Cross-origin iframes cannot be inspected and are counted without
	// their img totals.
	const nuxt = document.getElementById('__nuxt');
	const iframes = document.querySelectorAll('iframe');
	let iframeImgs = 0;
	for (const frame of iframes) {
		try {
			const frameDoc = frame.contentDocument;
			if (frameDoc) iframeImgs += frameDoc.querySelectorAll('img').length;
		} catch (e) { /* cross-origin frame */ }
	}
	console.log(IMAGE_LOG_PREFIX + ' diagnose: env  href =', document.location.href,
		', title =', JSON.stringify(document.title || null),
		', userAgent =', navigator.userAgent);
	console.log(IMAGE_LOG_PREFIX + ' diagnose: env  #__nuxt =', nuxt ? nuxt.childElementCount + ' children' : 'absent',
		', elements =', document.querySelectorAll('*').length,
		', iframes =', iframes.length + (iframes.length ? ' (' + iframeImgs + ' imgs inside)' : ''));
	for (const [blob, original] of Array.from(imageMap.entries()).slice(0, 12)) {
		console.log(IMAGE_LOG_PREFIX + ' diagnose: map  ' + blob + '  ->  ' + original);
	}
}

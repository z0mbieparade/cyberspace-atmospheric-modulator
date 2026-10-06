// =====================================================
// GM STORAGE
// =====================================================

// One storage API across userscript managers, with a localStorage fallback.
// Requires these globals, declared by the script before this file:
//   LOG_PREFIX       e.g. '[AtmoMod]', prefixes every console message
//   STORAGE_PREFIX   e.g. 'atmosphericModulator_', the localStorage key prefix. Never
//                    change it for a published script: migration and the
//                    fallback look values up by it.
//   GM_STORAGE_KEYS  the keys the async cache preloads and migration copies
// Optional: onGMStorageReady(), called once the async cache is populated, or
// failed to load, so the script can re-read config it loaded with defaults at
// startup.

const _isThenable = (value) => !!value && typeof value.then === 'function';

// Detect which GM API is available:
// 1. Old style: GM_setValue/GM_getValue (synchronous)
// 2. New style: GM.setValue/GM.getValue (async/Promise-based)
// 3. Fallback: localStorage
//
// Existence is NOT enough to call GM_getValue synchronous! Some managers expose the
// GM_* names but implement them async, which would hand callers a Promise that then
// blows up in JSON.parse as "[object Promise]". Probe the actual return value instead.
const _hasSyncGM = (() => {
	if (typeof GM_getValue !== 'function' || typeof GM_setValue !== 'function') return false;
	try {
		return !_isThenable(GM_getValue('__' + STORAGE_PREFIX + 'api_probe', null));
	} catch (e) {
		return false;
	}
})();

// Async storage accessors, whichever spelling this manager provides
const _asyncGetValue = (typeof GM !== 'undefined' && typeof GM.getValue === 'function') ? (key) => GM.getValue(key) :
	(typeof GM_getValue === 'function') ? (key) => Promise.resolve(GM_getValue(key)) :
	null;
const _asyncSetValue = (typeof GM !== 'undefined' && typeof GM.setValue === 'function') ? (key, value) => GM.setValue(key, value) :
	(typeof GM_setValue === 'function') ? (key, value) => Promise.resolve(GM_setValue(key, value)) :
	null;

const _hasAsyncGM = !_hasSyncGM && !!_asyncGetValue && !!_asyncSetValue;

// Cache of GM values for the async API, populated by _initGMCache(). Declared
// before the wrappers below so they don't rely on evaluation order surviving a
// reorder (TDZ).
let _gmCache = {};

// False until the async cache has loaded, or failed to: until then a read
// returns the default, not what is stored
let _gmStorageReady = !_hasAsyncGM;

/**
 * Whether reads return stored values yet: always with sync storage, and with
 * async storage once its cache has loaded (or failed to, leaving defaults).
 * @returns {boolean}
 */
function isGMStorageReady() {
	return _gmStorageReady;
}

// Wrapper functions that handle both sync and async APIs uniformly
// For setValue: fire-and-forget (don't need to wait), also update cache
const _GM_setValue = _hasSyncGM ? GM_setValue :
	_hasAsyncGM ? (key, value) => {
		// Cache first so reads are correct immediately; the write is fire-and-forget,
		// but still catch so a rejecting manager doesn't surface as an unhandled rejection
		_gmCache[key] = value;
		Promise.resolve(_asyncSetValue(key, value)).catch(e => console.error(LOG_PREFIX + ' Failed to save ' + key + ':', e));
	} :
	(key, value) => localStorage.setItem(STORAGE_PREFIX + key, value);

// For getValue: need async handling for new API
// We'll use a sync wrapper that returns cached values, with async refresh
const _GM_getValue = _hasSyncGM ? GM_getValue :
	_hasAsyncGM ? (key, defaultValue) => {
		// Return cached value if available, otherwise default
		// Cache is populated by _initGMCache()
		return (key in _gmCache) ? _gmCache[key] : defaultValue;
	} :
	(key, defaultValue) => {
		const val = localStorage.getItem(STORAGE_PREFIX + key);
		return val !== null ? val : defaultValue;
	};

// Async initialization for new GM API - loads all values into cache
async function _initGMCache() {
	if (!_hasAsyncGM) return;
	try {
		for (const key of GM_STORAGE_KEYS) {
			const val = await _asyncGetValue(key);
			if (val !== undefined) _gmCache[key] = val;
		}
	} catch (e) {
		console.error(LOG_PREFIX + ' Failed to load GM cache:', e);
	}
}

// Set in GM storage once localStorage has been copied over. localStorage is
// writable by any script on the site: copied on every load, a value planted
// there would come back each time the GM value is empty
const _MIGRATED_KEY = '_migratedFromLocalStorage';

/**
 * Copy the script's localStorage values into GM storage, once per install.
 * Side effects: writes GM storage, and the _MIGRATED_KEY flag.
 */
async function _migrateFromLocalStorage() {
	const migrated = _hasAsyncGM ? await _asyncGetValue(_MIGRATED_KEY) : _GM_getValue(_MIGRATED_KEY, null);
	if (migrated) return;
	for (const key of GM_STORAGE_KEYS) {
		const lsKey = STORAGE_PREFIX + key;
		const lsVal = localStorage.getItem(lsKey);

		if (lsVal !== null) {
			// Check if GM storage already has this key
			const gmVal = _hasAsyncGM ? await _asyncGetValue(key) : _GM_getValue(key, null);

			if (gmVal === undefined || gmVal === null) {
				// Migrate from localStorage to GM
				if (_hasAsyncGM) {
					await _asyncSetValue(key, lsVal);
					_gmCache[key] = lsVal;
				} else if (_hasSyncGM) {
					GM_setValue(key, lsVal);
				}
			}
		}
	}
	if (_hasAsyncGM) await _asyncSetValue(_MIGRATED_KEY, 'true');
	else if (_hasSyncGM) GM_setValue(_MIGRATED_KEY, 'true');
}

// Initialize cache and run migration if using new GM API
if (_hasAsyncGM) {
	_initGMCache().then(async () => {
		try {
			await _migrateFromLocalStorage();
		} catch (e) {
			// A rejecting GM.setValue must not drop the config re-read below
			console.error(LOG_PREFIX + ' Failed to migrate storage:', e);
		}
	}).finally(() => {
		// Reload config after cache is populated (and possibly migrated). Also
		// when loading failed (_initGMCache logs it): the script then runs on
		// its defaults
		_gmStorageReady = true;
		try {
			if (typeof onGMStorageReady === 'function') onGMStorageReady();
		} catch (e) {
			console.error(LOG_PREFIX + ' Failed to start after loading GM storage:', e);
		}
	});
} else if (_hasSyncGM) {
	// Also migrate for old GM API. It runs in a microtask despite the sync GM
	// calls, so a throwing GM_setValue surfaces as a rejection, not a throw.
	_migrateFromLocalStorage().catch(e => console.error(LOG_PREFIX + ' Failed to migrate storage:', e));
}

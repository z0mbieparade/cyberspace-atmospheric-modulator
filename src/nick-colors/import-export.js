// =====================================================
// EXPORT / IMPORT SETTINGS
// =====================================================

const EXPORT_VERSION = 2;

/**
 * Get only non-default values from an object by comparing to defaults
 */
function getNonDefaultValues(current, defaults) {
	const result = {};
	for (const key of Object.keys(current)) {
		if (JSON.stringify(current[key]) !== JSON.stringify(defaults[key])) {
			result[key] = current[key];
		}
	}
	return Object.keys(result).length > 0 ? result : null;
}

/**
 * Export all settings to a JSON object (only non-default values)
 */
function exportSettings() {
	const data = {
		version: EXPORT_VERSION,
		exportedAt: new Date().toISOString()
	};

	// Only include configs that have non-default values
	const siteConfigDiff = getNonDefaultValues(siteConfig, DEFAULT_SITE_CONFIG);
	if (siteConfigDiff) data.siteConfig = siteConfigDiff;

	// Always include custom nick colors if any exist
	if (Object.keys(customNickColors).length > 0) {
		data.customNickColors = customNickColors;
	}

	return data;
}

// v1 used different full key names for some settings
// Map old names to new names
const V1_KEY_RENAMES = {
	useHueRange: 'useSiteThemeHue',
	useSaturation: 'useSiteThemeSat',
	useLightness: 'useSiteThemeLit',
	saturationSpread: 'satSpread',
	lightnessSpread: 'litSpread',
	// excludeRanges is removed in v1.1, will be ignored
};

/**
 * Rename v1 keys to v2 keys after expansion
 */
function renameV1Keys(obj) {
	const result = {};
	for (const [key, value] of Object.entries(obj)) {
		const newKey = V1_KEY_RENAMES[key] || key;
		// Skip excludeRanges as it's not used in v1.1
		if (key === 'excludeRanges') continue;
		result[newKey] = value;
	}
	return result;
}

/**
 * Migrate v1 settings format to v2
 * v1 had separate configs: colorConfig (cc), siteThemeConfig (stc), styleConfig (sc)
 * v2 unified them all into siteConfig (sc)
 */
function migrateV1ToV2(data) {
	const migrated = { version: 2 };
	const mergedConfig = {};

	// Handle minified keys (cc, stc, sc)
	if (data.cc) {
		// colorConfig: mL, xL, mS, xS, mH, xH, cT, eR
		Object.assign(mergedConfig, renameV1Keys(maxifyKeys(data.cc)));
	}
	if (data.stc) {
		// siteThemeConfig: hS, sS, lS, uH, uS, uL
		Object.assign(mergedConfig, renameV1Keys(maxifyKeys(data.stc)));
	}
	if (data.sc) {
		// In v1, sc was styleConfig: vW, vI, vC, pI, aI, iS
		Object.assign(mergedConfig, renameV1Keys(maxifyKeys(data.sc)));
	}

	// Handle unminified keys (colorConfig, siteThemeConfig, styleConfig)
	if (data.colorConfig) {
		Object.assign(mergedConfig, renameV1Keys(data.colorConfig));
	}
	if (data.siteThemeConfig) {
		Object.assign(mergedConfig, renameV1Keys(data.siteThemeConfig));
	}
	if (data.styleConfig) {
		Object.assign(mergedConfig, renameV1Keys(data.styleConfig));
	}

	if (Object.keys(mergedConfig).length > 0) {
		migrated.siteConfig = mergedConfig;
	}

	// customNickColors structure is the same
	if (data.cnc) {
		migrated.customNickColors = maxifyKeys(data.cnc);
	}
	if (data.customNickColors) {
		migrated.customNickColors = data.customNickColors;
	}

	// Preserve exportedAt if present
	if (data.at || data.exportedAt) {
		migrated.exportedAt = data.at || data.exportedAt;
	}

	return migrated;
}

/**
 * Imported per-user styles, with each user's notes put back as plain text:
 * sanitizing keeps only styles, and nick notes reads the notes from storage.
 * @param {Object} styles - sanitized, { username: styles }
 * @param {*} raw - the same, before sanitizing
 * @returns {Object} styles, with userNotes where the raw entry had a string
 */
function withImportedNotes(styles, raw) {
	if (!raw || typeof raw !== 'object') return styles;
	for (const [username, entry] of Object.entries(raw)) {
		if (username === '__proto__' || typeof entry?.userNotes !== 'string' || !isValidUsername(username)) continue;
		styles[username] = { ...styles[username], userNotes: entry.userNotes };
	}
	return styles;
}

/**
 * Import settings from a JSON object
 * Side effects: replaces siteConfig and the custom colors, and saves them;
 * with recolor, recolors the page.
 * @param {Object} data - The imported data
 * @param {{recolor?: boolean, replaceAll?: boolean}} [options] - recolor: off
 *   when nick colors has not booted, so names stay uncolored while the
 *   feature is off; replaceAll: settings and per-user styles the data leaves
 *   out go back to their defaults, as a restore should
 * @returns {{ success: boolean, message: string, dropped?: number }} dropped:
 *   per-user style properties left out as unsafe to import
 */
function importSettings(data, { recolor = true, replaceAll = false } = {}) {
	try {
		if (!data || typeof data !== 'object') {
			return { success: false, message: 'Invalid data format' };
		}

		// Check for v1 format (has cc, stc, colorConfig, siteThemeConfig, styleConfig, or version 1)
		const isV1 = data.v === 1 || data.version === 1 ||
			data.cc || data.stc || data.colorConfig || data.siteThemeConfig || data.styleConfig;
		if (isV1) {
			data = migrateV1ToV2(data);
		} else {
			// Expand minified keys if present
			data = maxifyKeys(data);
		}

		// Validate version (for future compatibility)
		if (data.version && data.version > EXPORT_VERSION) {
			return { success: false, message: `Export version ${data.version} is newer than supported version ${EXPORT_VERSION}` };
		}

		// An export leaves out what is at its default: a full restore puts that
		// back too, rather than keep whatever is set here. After the v1
		// migration, which fills these from the old keys
		if (replaceAll) {
			data.siteConfig = data.siteConfig ?? {};
			data.customNickColors = data.customNickColors ?? {};
		}

		// Import site config (mutate in place to preserve references)
		if (data.siteConfig) {
			for (const key in siteConfig) {
				delete siteConfig[key];
			}
			// Only known settings, of the right type and range (sanitize.js)
			Object.assign(siteConfig, DEFAULT_SITE_CONFIG, sanitizeSiteConfig(data.siteConfig));
			saveSiteConfig();
		}

		let dropped = 0;
		if (data.customNickColors) {
			// Only safe styles; notes ride along as text, saved for nick notes
			// to move out of storage (featuresStorageReady), then dropped here
			const styles = sanitizeNickStyles(data.customNickColors, 'imported');
			dropped = countDroppedStyles(data.customNickColors, styles);
			replaceCustomNickColors(withImportedNotes(styles, data.customNickColors));
			dropUserNotes();
		}

		if (recolor) colorizeAll();
		const migrationNote = isV1 ? ' (migrated from v1)' : '';
		return { success: true, dropped, message: `Settings imported successfully${migrationNote}.${droppedStylesNote(dropped)}` };
	} catch (e) {
		return { success: false, message: `Import failed: ${e.message}` };
	}
}

// Key mappings for minification (full key -> short key)
const KEY_MAP = {
	// Color config
	minSaturation: 'mS',
	maxSaturation: 'xS',
	minLightness: 'mL',
	maxLightness: 'xL',
	minHue: 'mH',
	maxHue: 'xH',
	contrastThreshold: 'cT',
	// Site theme config
	useSiteThemeHue: 'uH',
	hueSpread: 'hS',
	useSiteThemeSat: 'uS',
	satSpread: 'sS',
	useSiteThemeLit: 'uL',
	litSpread: 'lS',
	// Monochrome mode
	useSingleColor: 'uSC',
	singleColorHue: 'sCH',
	singleColorSat: 'sCS',
	singleColorLit: 'sCL',
	singleColorCustom: 'sCC',
	// Style config
	varyWeight: 'vW',
	varyItalic: 'vI',
	varyCase: 'vC',
	prependIcon: 'pI',
	appendIcon: 'aI',
	iconSet: 'iS',
	// Per-user style properties
	color: 'c',
	backgroundColor: 'bg',
	fontWeight: 'fW',
	fontStyle: 'fS',
	fontVariant: 'fV',
	fontFamily: 'fF',
	customFontFamily: 'cFF',
	userNotes: 'un',
	invert: 'inv',
	// Config sections
	siteConfig: 'sc',
	customNickColors: 'cnc',
	version: 'v',
	exportedAt: 'at'
};

// Reverse mapping (short key -> full key)
const KEY_MAP_REVERSE = Object.fromEntries(
	Object.entries(KEY_MAP).map(([k, v]) => [v, k])
);

/**
 * Minify an object by replacing keys with short versions
 */
function minifyKeys(obj) {
	if (obj === null || typeof obj !== 'object') return obj;
	if (Array.isArray(obj)) return obj.map(minifyKeys);

	const result = {};
	for (const [key, value] of Object.entries(obj)) {
		const shortKey = KEY_MAP[key] || key;
		result[shortKey] = minifyKeys(value);
	}
	return result;
}

/**
 * Maxify an object by replacing short keys with full versions
 */
function maxifyKeys(obj) {
	if (obj === null || typeof obj !== 'object') return obj;
	if (Array.isArray(obj)) return obj.map(maxifyKeys);

	const result = {};
	for (const [key, value] of Object.entries(obj)) {
		const fullKey = KEY_MAP_REVERSE[key] || key;
		result[fullKey] = maxifyKeys(value);
	}
	return result;
}

// =====================================================
// UNIFIED IMPORT/EXPORT HELPERS
// =====================================================

/**
 * Save data to a JSON file (minified keys)
 * Side effects: starts a download.
 * @param {Object} data - The data to save
 * @param {string} filename - The filename to save as
 */
function saveToFile(data, filename) {
	downloadText(JSON.stringify(minifyKeys(data), null, 2), filename, 'application/json');
}

/**
 * Read exported settings from pasted text, expanding the short keys Copy to
 * Clipboard writes. Expanded here, not left to importSettings: the per-user
 * paste reads the keys directly and never goes through importSettings.
 * @param {string} text - an export, as Copy to Clipboard produces
 * @returns {Object} the settings, keys expanded
 * @throws {Error} when the text is not JSON
 */
function parseSettingsText(text) {
	try {
		return maxifyKeys(JSON.parse(text));
	} catch (err) {
		throw new Error(`Failed to parse: ${err.message}`);
	}
}

/**
 * Walk the user through bringing their settings over from the separate Nick
 * Colors userscript. Each userscript has its own storage, so this script
 * cannot read that one's: the user exports there and pastes or loads here.
 * Side effects: opens a dialog; a successful import replaces siteConfig and
 * the custom colors, recolors the page, and calls onImported.
 * @param {Function} onImported - shows the imported settings (re-renders the form)
 */
function showNickColorsImportDialog(onImported) {
	const textareaId = uiId('nick-colors-import');
	let dialog = null;

	/**
	 * Import the settings, or say what went wrong without closing.
	 * @param {Object|null} data
	 * @param {Error|null} err
	 */
	const finish = (data, err) => {
		// As its warning says: it replaces, so what the export leaves out goes back to default
		const result = err ? { success: false, message: err.message } : importSettings(data, { replaceAll: true });
		if (!result.success) {
			const error = document.createElement('div');
			error.className = uiClass('dialog-error');
			error.textContent = result.message;
			status.replaceChildren(error);
			return;
		}
		dialog.close();
		// Other features read what the import stored, such as nick notes' notes
		featuresStorageReady();
		onImported();
		alert(result.message);
	};

	dialog = createDialog({
		title: 'Import from Nick Colors',
		width: '420px',
		onHelp: null,
		content: `
			<ol class="hint">
				<li>In your Userscript extension (Greasemonkey, Tampermonkey, etc), locate the <b>Nick Colors Settings</b> option.</li>
				<li>Under <strong>Backup</strong>, choose <strong>Copy to Clipboard</strong>.</li>
				<li>Paste it below and choose <strong>Import</strong>. Or, if you saved a settings file there, choose <strong>Load Settings File</strong>.</li>
				<li>Then turn the <b>Nick Colors userscript off</b>, so the two do not recolor each other's names.</li>
			</ol>
			<div class="${uiClass('dialog-warning')}">This replaces the built-in nick colors' settings and custom colors.</div>
			<label for="${textareaId}" class="hint">Settings from Nick Colors</label>
			<textarea id="${textareaId}" style="min-height: 120px; width: 100%;"></textarea>
			<div role="status" aria-live="polite"></div>
		`,
		buttons: [
			{ label: 'IMPORT', class: 'nc-import-btn', onClick: () => {
				const text = textarea.value.trim();
				if (!text) {
					finish(null, new Error('Paste the settings from Nick Colors first.'));
					return;
				}
				try {
					finish(parseSettingsText(text), null);
				} catch (err) {
					finish(null, err);
				}
			} },
			{ label: 'LOAD SETTINGS FILE', class: 'nc-load-file-btn', onClick: () => pickTextFile(finish, { parse: parseSettingsText }) },
			{ label: 'CANCEL', class: 'nc-cancel-btn', onClick: (close) => close() },
		],
	});
	const textarea = dialog.querySelector('#' + textareaId);
	// Always rendered, so screen readers announce the error box put in it
	const status = dialog.querySelector('[role="status"]');
	textarea.focus();
}

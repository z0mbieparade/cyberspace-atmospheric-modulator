const NICK_LOG_PREFIX = featureLogPrefix('nick-colors');

// =====================================================
// CONFIGURATION
// =====================================================

// Debug mode is the script's one switch (DEBUG, logDebug and saveDebugMode in
// src/header.js); with it on, nick colors also shows its calculation details.

// Site-wide styles requested through Request Override: overrides.json in this
// repo, a copy of the one in the standalone Nick Colors repo. While people
// still run that script, a granted request goes in both. null disables it
const OVERRIDES_URL = 'https://raw.githubusercontent.com/z0mbieparade/cyberspace-atmospheric-modulator/refs/heads/main/overrides.json';


// Manual color overrides - set specific users to specific styles
// Format: 'username': { ...CSS style properties }
// Or simple format: 'username': 'css-color' (text color only)
// These are merged with fetched overrides (local takes precedence)
// Add local overrides here for testing, or they will be fetched from OVERRIDES_URL
let MANUAL_OVERRIDES = {};

// Default color generation settings
const DEFAULT_SITE_CONFIG = {
	useSingleColor: false,  // When true, all nicks use the same color (no variation)

	useSiteThemeHue: false,      // Limit hue to site theme's color range
	useSiteThemeSat: false,      // Match site theme's saturation
	useSiteThemeLit: false,      // Match site theme's lightness

	singleColorHue: 180,    // Hue for monochrome mode (0-360)
	singleColorSat: 85,     // Saturation for monochrome mode (0-100)
	singleColorLit: 65,     // Lightness for monochrome mode (0-100)
	singleColorCustom: '',  // Custom color value (hex or hsl) - overrides H/S/L if set

	satSpread: 15,    // +/- percentage around site theme saturation
	hueSpread: 30,    // +/- degrees around site theme hue
	litSpread: 10,    // +/- percentage around site theme lightness

	minHue: 0,           // starting hue (0 = red)
	maxHue: 360,         // ending hue (360 = back to red)
	minSaturation: 70,   // 0-100, min saturation
	maxSaturation: 100,  // 0-100, max saturation
	minLightness: 55,    // 0-100, min lightness
	maxLightness: 75,    // 0-100, max lightness
	
	contrastThreshold: 4.5, // WCAG contrast ratio threshold (1-21). 0=disabled, 3=large text, 4.5=AA, 7=AAA

	varyWeight: false,    // randomly vary font-weight
	varyItalic: false,    // randomly apply italic
	varyCase: false,      // randomly apply small-caps
	prependIcon: false,   // prepend random icon from iconSet
	appendIcon: false,    // append random icon from iconSet
	iconSet: '● ○ ◆ ◇ ■ □ ▲ △ ★ ☆ ♦ ♠ ♣ ♥ ☢ ☣ ☠ ⚙ ⬡ ⬢ ♻ ⚛ ⚠ ⛒',  // space-separated icons

	followSiteTheme: false, // apply the site theme's preset whenever the theme changes
	followedTheme: '',      // the theme whose preset it last applied: only a different one replaces the ranges
};

// Containers where we should invert backgroundColor/Color for nicks
const INVERTED_CONTAINERS = [
	'.profile-box-inverted'
];

// Nick color settings for each site theme, by the same names as the shared
// THEME_COLORS (which holds the themes' colors). In the site's own order,
// which the preset buttons show, after Full Spectrum, the script's default.
// Not every range stays at 4.5:1 on its theme's background: contrastThreshold
// adjusts or inverts a color that falls below it
const PRESET_THEMES = {
	'Full Spectrum': {
		settings: { minSaturation: 70, maxSaturation: 100, minLightness: 55, maxLightness: 75, minHue: 0, maxHue: 360, contrastThreshold: 4.5 },
	},
	'z0ylent': {
		settings: { minSaturation: 80, maxSaturation: 100, minLightness: 45, maxLightness: 65, minHue: 60, maxHue: 150, contrastThreshold: 4.5 },
	},
	'Dark': {
		settings: { minSaturation: 12, maxSaturation: 60, minLightness: 65, maxLightness: 80, minHue: 0, maxHue: 70, contrastThreshold: 4.5 },
	},
	'Light': {
		settings: { minSaturation: 12, maxSaturation: 60, minLightness: 30, maxLightness: 45, minHue: 344, maxHue: 44, contrastThreshold: 4.5 },
	},
	'LCD': {
		settings: { minSaturation: 15, maxSaturation: 45, minLightness: 15, maxLightness: 28, minHue: 60, maxHue: 200, contrastThreshold: 4.5 },
	},
	'C64': {
		settings: { minSaturation: 70, maxSaturation: 90, minLightness: 60, maxLightness: 75, minHue: 180, maxHue: 280, contrastThreshold: 4.5 },
	},
	'VT320': {
		settings: { minSaturation: 90, maxSaturation: 100, minLightness: 50, maxLightness: 65, minHue: 15, maxHue: 55, contrastThreshold: 4.5 },
	},
	'Matrix': {
		settings: { minSaturation: 75, maxSaturation: 95, minLightness: 45, maxLightness: 60, minHue: 70, maxHue: 140, contrastThreshold: 4.5 },
	},
	'Poetry': {
		settings: { minSaturation: 0, maxSaturation: 35, minLightness: 30, maxLightness: 45, minHue: 339, maxHue: 46, contrastThreshold: 4.5 },
	},
	'Brutalist': {
		settings: { minSaturation: 50, maxSaturation: 70, minLightness: 60, maxLightness: 75, minHue: 180, maxHue: 260, contrastThreshold: 4.5 },
	},
	'GRiD': {
		settings: { minSaturation: 90, maxSaturation: 100, minLightness: 50, maxLightness: 65, minHue: 20, maxHue: 60, contrastThreshold: 4.5 },
	},
	'Crypt': {
		settings: { minSaturation: 80, maxSaturation: 100, minLightness: 55, maxLightness: 70, minHue: 340, maxHue: 30, contrastThreshold: 4.5 },
	},
	'Bubblegum': {
		settings: { minSaturation: 50, maxSaturation: 80, minLightness: 25, maxLightness: 36, minHue: 270, maxHue: 350, contrastThreshold: 4.5 },
	},
	'Top8': {
		// The site's data-theme for Top8 (see findThemeEntry)
		id: 'myspace',
		settings: { minSaturation: 60, maxSaturation: 90, minLightness: 15, maxLightness: 25, minHue: 0, maxHue: 360, contrastThreshold: 4.5 },
	},
	'System': {
		settings: { minSaturation: 60, maxSaturation: 80, minLightness: 65, maxLightness: 80, minHue: 0, maxHue: 360, contrastThreshold: 4.5 },
	},
};

// The site theme: its data-theme name, and its colors as getThemeColors
// (shared theme-colors.js) resolves them
let siteTheme = null;
let siteThemeName = null;

// Get theme name from body data attribute
try {
	siteThemeName = document.documentElement?.dataset?.theme || null;
} catch (e) {
	// Body might not be ready yet
}

function loadSiteTheme() {
	const themeColors = getThemeColors();
	logDebug(NICK_LOG_PREFIX + ' Theme variables:', themeColors);
	if (themeColors && themeColors.fg && themeColors.bg) {
		siteThemeName = document.documentElement?.dataset?.theme || null;
		siteTheme = { ...themeColors };
	}
}
if (!siteTheme) loadSiteTheme();

// Load saved site theme integration config
let siteConfig = { ...DEFAULT_SITE_CONFIG };
function loadSiteConfig() {
	try {
		const savedSiteConfig = _GM_getValue('siteConfig', null);
		if (savedSiteConfig) {
			siteConfig = { ...DEFAULT_SITE_CONFIG, ...sanitizeSiteConfig(JSON.parse(savedSiteConfig)) };
		}
	} catch (e) {
		console.error(NICK_LOG_PREFIX + ' Failed to load site config:', e);
	}
}
loadSiteConfig();

function saveSiteConfig() {
	_GM_setValue('siteConfig', JSON.stringify(siteConfig));
}

// =====================================================
// COLOR ENGINE
// =====================================================

// Load saved custom colors from storage
let customNickColors = {};
function loadCustomNickColors() {
	try {
		const saved = _GM_getValue('customNickColors', '{}');
		// Typed in the Color dialog, but storage can be written from the page too
		customNickColors = sanitizeNickStyles(JSON.parse(saved), 'typed');
	} catch (e) {
		customNickColors = {};
	}
	dropUserNotes();
}

/**
 * Forget the notes in customNickColors, in memory only. Notes belong to nick
 * notes (src/nick-notes/), which moves them out of storage: kept here, the
 * next save would write them back, and the debug log and backup would show them.
 * Side effects: deletes userNotes from every entry in customNickColors.
 */
function dropUserNotes() {
	for (const styles of Object.values(customNickColors)) {
		if (styles && typeof styles === 'object') delete styles.userNotes;
	}
}
loadCustomNickColors();

function saveCustomNickColors() {
	_GM_setValue('customNickColors', JSON.stringify(customNickColors));
}

/**
 * Replace every per-user style, and save.
 * Side effects: empties customNickColors in place, since other code holds
 * the object, fills it from colors, and saves it.
 * @param {Object} colors - { username: styles }; {} removes them all
 */
function replaceCustomNickColors(colors) {
	for (const username of Object.keys(customNickColors)) delete customNickColors[username];
	Object.assign(customNickColors, colors);
	saveCustomNickColors();
}


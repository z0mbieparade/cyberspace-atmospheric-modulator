// =====================================================
// SANITIZING STORED AND IMPORTED VALUES
// =====================================================
// Settings files, pasted settings, overrides.json and even storage can hold
// anything: a shared "theme" file is a way in. Each value is checked where it
// enters, so the code past here can trust its types, and a style cannot
// reach outside its name. The HTML that shows values escapes them as well.

// The number settings' ranges; a number outside is clamped into it
const SITE_CONFIG_RANGES = {
	minHue: [0, 360], maxHue: [0, 360], hueSpread: [0, 180],
	minSaturation: [0, 100], maxSaturation: [0, 100], satSpread: [0, 100],
	minLightness: [0, 100], maxLightness: [0, 100], litSpread: [0, 100],
	singleColorHue: [0, 360], singleColorSat: [0, 100], singleColorLit: [0, 100],
	contrastThreshold: [0, 21],
};

// What a style from a settings file or overrides.json may set: the look of a
// name, nothing that moves it, layers it, or loads anything
const IMPORTED_STYLE_KEYS = [
	'color', 'backgroundColor', 'fontWeight', 'fontStyle', 'fontVariant', 'fontFamily',
	'letterSpacing', 'textDecoration', 'prependIcon', 'appendIcon', 'invert',
];

// What a style typed in the Color dialog's Additional CSS may not set: the
// properties that move or layer a name (position, offsets, z-index, every
// transform), generate content, or bind behavior. Not a full containment:
// size and spacing still apply, as the user typed them
const BLOCKED_STYLE_KEYS = [
	'position', 'inset', 'top', 'right', 'bottom', 'left', 'zIndex', 'content',
	'transform', 'translate', 'scale', 'rotate', 'filter', 'behavior', 'MozBinding', 'data',
];

// Shown as text beside the name, never as CSS: any characters are safe, so
// the CSS value check does not apply (an icon like <3 or ¯\\_(ツ)_/¯ stays)
const TEXT_STYLE_KEYS = ['prependIcon', 'appendIcon'];

// A value that loads something (url(), image-set()), runs something, or
// breaks out of its declaration
const UNSAFE_STYLE_VALUE = /url\s*\(|image-set\s*\(|expression\s*\(|javascript:|\\|[;{}<>]/i;

/**
 * A siteConfig with only the known settings, each of its default's type,
 * numbers clamped to their range. Unknown keys, __proto__ included, are dropped.
 * @param {*} config - parsed from storage or a settings file
 * @returns {Object} the settings to merge over DEFAULT_SITE_CONFIG
 */
function sanitizeSiteConfig(config) {
	const clean = {};
	if (!config || typeof config !== 'object') return clean;
	for (const [key, fallback] of Object.entries(DEFAULT_SITE_CONFIG)) {
		const value = config[key];
		if (typeof value !== typeof fallback) continue;
		if (typeof value === 'number') {
			if (!Number.isFinite(value)) continue;
			const range = SITE_CONFIG_RANGES[key];
			clean[key] = range ? Math.min(range[1], Math.max(range[0], value)) : value;
		} else {
			clean[key] = value;
		}
	}
	return clean;
}

/**
 * One user's style, with only what is safe to apply to their name.
 * @param {*} styles - { property: value } as customNickColors or overrides
 *   hold, or a color string (overrides.json's short form)
 * @param {'imported'|'typed'} source - imported: a settings file or
 *   overrides.json, only IMPORTED_STYLE_KEYS; typed: the user's own Color
 *   dialog, anything but BLOCKED_STYLE_KEYS
 * @returns {Object|null} the safe style, or null when nothing is left
 */
function sanitizeNickStyle(styles, source) {
	if (typeof styles === 'string') styles = { color: styles };
	if (!styles || typeof styles !== 'object' || Array.isArray(styles)) return null;
	const clean = {};
	for (const key of Object.keys(styles)) {
		const allowed = source === 'imported' ? IMPORTED_STYLE_KEYS.includes(key) : !BLOCKED_STYLE_KEYS.includes(key);
		if (!allowed || key === '__proto__') continue;
		const value = styles[key];
		if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) {
			clean[key] = value;
		} else if (TEXT_STYLE_KEYS.includes(key)) {
			if (typeof value === 'string' && value.length <= 50) clean[key] = value;
		} else if (typeof value === 'string' && value.length <= 200 && !UNSAFE_STYLE_VALUE.test(value)) {
			clean[key] = value;
		}
	}
	return Object.keys(clean).length ? clean : null;
}

/**
 * Every user's style, sanitized; users left with nothing are dropped.
 * @param {*} colors - { username: styles }
 * @param {'imported'|'typed'} source - as sanitizeNickStyle
 * @returns {Object} { username: styles }
 */
function sanitizeNickStyles(colors, source) {
	const clean = {};
	if (!colors || typeof colors !== 'object') return clean;
	for (const [username, styles] of Object.entries(colors)) {
		if (username === '__proto__' || !isValidUsername(username)) continue;
		const safe = sanitizeNickStyle(styles, source);
		if (safe) clean[username] = safe;
	}
	return clean;
}

/**
 * How many style properties sanitizing left out, for telling the user: an
 * import of their own backup keeps only the imported list, so Additional CSS
 * beyond it does not come back.
 * @param {*} raw - { username: styles } before sanitizing
 * @param {Object} clean - the same after
 * @returns {number}
 */
function countDroppedStyles(raw, clean) {
	if (!raw || typeof raw !== 'object') return 0;
	let dropped = 0;
	for (const [username, styles] of Object.entries(raw)) {
		if (!styles || typeof styles !== 'object') continue;
		for (const key of Object.keys(styles)) {
			if (key !== 'userNotes' && !(clean[username] && key in clean[username])) dropped++;
		}
	}
	return dropped;
}

/**
 * The note for an import message when styles were left out, or ''.
 * @param {number} dropped - from countDroppedStyles
 * @returns {string} e.g. ' 2 styles were left out: …'
 */
function droppedStylesNote(dropped) {
	if (!dropped) return '';
	return ` ${dropped === 1 ? '1 style was' : `${dropped} styles were`} left out: an import keeps only colors, fonts, spacing, decoration and icons.`;
}

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
// transform), generate content, or bind behavior. Lowercase, without hyphens
// or a vendor prefix, as blockedStyleKey compares them. Not a full
// containment: size and spacing still apply, as the user typed them
const BLOCKED_STYLE_KEYS = [
	'position', 'inset', 'top', 'right', 'bottom', 'left', 'zindex', 'content',
	'transform', 'translate', 'scale', 'rotate', 'filter', 'behavior', 'binding', 'data',
];

/**
 * Whether a typed style key is one BLOCKED_STYLE_KEYS keeps out. It is
 * compared as the property applyStyles writes, toKebabCase(key), which the
 * browser lowercases and honors with a vendor prefix: Webkit-transform,
 * WebkitTransform and -webkit-transform are all transform.
 * @param {string} key - e.g. 'WebkitTransform', 'z-index', 'offsetPath'
 * @returns {boolean}
 */
function blockedStyleKey(key) {
	const bare = toKebabCase(key).toLowerCase()
		.replace(/^-?(webkit|moz|ms|o)-/, '')
		.replace(/-/g, '');
	// offset-path and its family move a name along a path; inset-inline-start
	// and the other logical insets are offsets
	return BLOCKED_STYLE_KEYS.includes(bare) || bare.startsWith('offset') || bare.startsWith('inset');
}

// Shown as text beside the name, never as CSS: any characters are safe, so
// the CSS value check does not apply (an icon like <3 or ¯\\_(ツ)_/¯ stays).
// The length caps apply to imports only: a long icon or value is harmless,
// so storage keeps what the user typed. Load still drops blocked keys and
// unsafe values, whoever saved them: storage cannot tell an old import from
// the user's own typing
const TEXT_STYLE_KEYS = ['prependIcon', 'appendIcon'];
const IMPORTED_ICON_MAX = 50;
const IMPORTED_CSS_VALUE_MAX = 200;

// A value that loads something (url(), image-set()), runs something, or
// breaks out of its declaration. A line break or other control character
// counts, but not a tab, which is only whitespace: an imported value
// lands in the Additional CSS box, which splits lines into declarations.
// UNSAFE_STYLE_VALUE_TEXT says it to the user
const UNSAFE_STYLE_VALUE_TEXT = 'url(), image-set(), expression(), javascript:, \\ ; { } < >, a line break or another control character';
const UNSAFE_STYLE_VALUE = /url\s*\(|image-set\s*\(|expression\s*\(|javascript:|\\|[;{}<>\x00-\x08\x0a-\x1f]/i;

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
 *   overrides.json, only IMPORTED_STYLE_KEYS, within the length caps;
 *   typed: the user's own Color dialog or storage, anything blockedStyleKey
 *   allows, any length. Either way, a CSS value matching UNSAFE_STYLE_VALUE
 *   is dropped
 * @returns {Object|null} the safe style, or null when nothing is left
 */
function sanitizeNickStyle(styles, source) {
	if (typeof styles === 'string') styles = { color: styles };
	if (!styles || typeof styles !== 'object' || Array.isArray(styles)) return null;
	const clean = {};
	for (const key of Object.keys(styles)) {
		const imported = source === 'imported';
		const allowed = imported ? IMPORTED_STYLE_KEYS.includes(key) : !blockedStyleKey(key);
		if (!allowed || key === '__proto__') continue;
		const value = styles[key];
		if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) {
			clean[key] = value;
		} else if (typeof value !== 'string') {
			continue;
		} else if (TEXT_STYLE_KEYS.includes(key)) {
			if (!imported || value.length <= IMPORTED_ICON_MAX) clean[key] = value;
		} else if ((!imported || value.length <= IMPORTED_CSS_VALUE_MAX) && !UNSAFE_STYLE_VALUE.test(value)) {
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
		if (!isValidUsername(username)) continue;
		const safe = sanitizeNickStyle(styles, source);
		if (safe) clean[username] = safe;
	}
	return clean;
}

/**
 * The friends list from storage or a settings file: the toggle as a
 * boolean, and valid usernames, unique without case, in the case given.
 * @param {*} friends - { enabled, users }
 * @returns {{enabled: boolean, users: string[]}}
 */
function sanitizeNickFriends(friends) {
	const users = friends && Array.isArray(friends.users) ? friends.users : [];
	// Normalized before the check, so the name stored is the one checked
	const clean = users
		.filter(user => typeof user === 'string')
		.map(user => user.trim().replace(/^@/, ''))
		.filter(user => isValidUsername(user));
	const seen = new Set();
	const unique = clean.filter(user => !seen.has(user.toLowerCase()) && seen.add(user.toLowerCase()));
	return { enabled: !!friends && friends.enabled === true, users: unique };
}

/**
 * How many style properties sanitizing left out, for telling the user after
 * an import or a Save. An import of their own backup keeps only the imported
 * list, so Additional CSS beyond it does not come back.
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
 * The note for a message when styles were left out, or ''.
 * @param {number} dropped - from countDroppedStyles
 * @param {'imported'|'typed'} source - as sanitizeNickStyle: says what that source keeps
 * @returns {string} e.g. ' 2 styles were left out: …'
 */
function droppedStylesNote(dropped, source) {
	if (!dropped) return '';
	const kept = source === 'imported'
		? `an import keeps only color, background color, font, letter spacing, text decoration, inversion and icons, with icons up to ${IMPORTED_ICON_MAX} characters and other values up to ${IMPORTED_CSS_VALUE_MAX}, and no CSS value holding ${UNSAFE_STYLE_VALUE_TEXT}`
		: `Additional CSS cannot set position, offsets, z-index, transforms, filter, content or behavior, and a value cannot hold ${UNSAFE_STYLE_VALUE_TEXT}`;
	return ` ${dropped === 1 ? '1 style was' : `${dropped} styles were`} left out: ${kept}.`;
}

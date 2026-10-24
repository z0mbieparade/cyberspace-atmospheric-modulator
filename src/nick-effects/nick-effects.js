// =====================================================
// NICK EFFECTS
// =====================================================
// When a ★★ best choom joins the cIRC room you have open, or sends you a
// notification, confetti, snow or the like plays over the chat or the page
// for a few seconds; or for any ★ choom, or anyone, as the user picks.
// Switched by featureConfig.nickEffects. One default effect, and anyone it
// plays for may have their own or none.

const NICK_EFFECTS_LOG_PREFIX = featureLogPrefix('nick-effects');

// The heading over cIRC's user list on /chat: "Online (6)". The names are
// links in the element after it
const ONLINE_HEADING_PATTERN = /^Online \(\d+\)$/;

// The line cIRC adds to the chat when someone joins, with the site's show
// joins and leaves in cIRC setting on: "→ jingles joined". The only sign of
// a join where cIRC has no user list, as in the sidebar
const JOIN_LINE_PATTERN = /^→\s*(\S+)\s+joined$/;
// One new chat line is a few elements. A change adding more than this is
// history loading or cIRC being drawn, whose join lines are old news
const MAX_LIVE_CHANGE_ELEMENTS = 40;
// A notification as the site pops it up, on any page: "@z0mbi sent you a C-Mail"
const TOAST_SELECTOR = '.toast-notification';
// One sender's notifications play once in this long
const NOTIFY_REPLAY_MS = 60 * 1000;

// A join line's row and its local time: <div class="chat-message">…<span>15:11:47</span>.
// Rows sit side by side in their chat's log
const CHAT_MESSAGE_SELECTOR = '.chat-message';
// A chat log this new is still loading its history, one row at a time on
// a reload or a room switch: its join lines are old news
const CHAT_LOG_SETTLE_MS = 3000;
// A change taking more rows than this from a log at once is a room switch
// redrawing it, which starts its settling again. A live chat trims its
// oldest row one at a time
const MAX_TRIMMED_ROWS = 3;
const CHAT_TIME_PATTERN = /^(\d{2}):(\d{2}):(\d{2})$/;
// A join line stamped further from now than this is history, however few
// lines came with it
const LIVE_JOIN_LINE_MS = 2 * 60 * 1000;

// A choom whose heartbeat drops for a moment leaves the list and comes back.
// Back within this long of leaving is the same visit, not an effect
const EFFECT_REPLAY_MS = 10 * 60 * 1000;

// More names than this new at once, on the list or in join lines, is it
// reloading (a reconnect, a room redrawn), not people joining
const MAX_EFFECTS_AT_ONCE = 3;

// Each setting's bounds: the sliders' and sanitizeEffect's. Under
// 5 seconds, moving content that starts on its own needs no pause control
// (WCAG 2.2.2)
const EFFECT_LIMITS = {
	amount: { min: 5, max: 150, step: 5 },
	size: { min: 8, max: 40, step: 1 },
	duration: { min: 1, max: 5, step: 0.5 },
	// Each glyph turns up to this many degrees, either way
	spin: { min: 0, max: 720, step: 30 },
	// Each glyph sways up to this many px sideways, either way
	drift: { min: 0, max: 200, step: 10 },
	// Starts spread over this share of the duration, in %, so they do not
	// all move as one line
	stagger: { min: 0, max: 80, step: 5 },
	// A firework's rockets, sharing the amount between them
	rockets: { min: 1, max: 5, step: 1 },
	// How far a rocket climbs from its edge before it bursts, in % of the chat
	rocketDistance: { min: 20, max: 80, step: 5 },
	// How far a fountain sprays from its edge before gravity turns it, in % of the chat
	sprayDistance: { min: 20, max: 80, step: 5 },
	// How far a bubble sways across its way up, in px, either way
	wobble: { min: 0, max: 80, step: 5 },
	// How wide a fountain sprays, in degrees around straight out of its edge
	spread: { min: 10, max: 90, step: 5 },
};
// How each glyph speeds up and slows down. Saved by value; the CSS timing
// function is looked up here, so nothing saved goes into the page as CSS.
// The values are saved in users' settings: never change one
const EFFECT_EASINGS = [
	{ value: 'linear', label: 'Linear', css: 'linear' },
	{ value: 'ease', label: 'Ease', css: 'ease' },
	{ value: 'ease-in', label: 'Ease in', css: 'ease-in' },
	{ value: 'ease-out', label: 'Ease out', css: 'ease-out' },
	{ value: 'ease-in-out', label: 'Ease in-out', css: 'ease-in-out' },
	{ value: 'overshoot', label: 'Overshoot', css: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
];
// The values are saved in users' settings: never change one. 'rise', saved
// before Gravity, is read as a fall with gravity up (sanitizeEffect).
// direction: the Launch direction a firework or fountain starts on; gravity:
// whether Gravity moves it; fades: whether Fade out shows, false where a
// glyph ends on its own (a pop, a splash, past the edge); spins, drifts:
// whether Spin and Drift move it
const EFFECT_MOTIONS = [
	{ value: 'fall', label: 'Fall/Rise', gravity: true, fades: true, spins: true, drifts: true },
	{ value: 'burst', label: 'Burst from name', gravity: true, fades: true, spins: true, drifts: true },
	{ value: 'firework', label: 'Firework', direction: 'up', gravity: true, fades: true, spins: true, drifts: true },
	{ value: 'bubbles', label: 'Bubbles', gravity: true, fades: false, spins: true, drifts: true },
	// A drop leans with its line, and does not turn
	{ value: 'rain', label: 'Rain', gravity: true, fades: false, spins: false, drifts: true },
	{ value: 'fountain', label: 'Fountain', direction: 'up', gravity: true, fades: true, spins: true, drifts: true },
	// Each star flies straight out of the middle
	{ value: 'zoom', label: 'Starfield zoom', gravity: false, fades: true, spins: true, drifts: false },
];
// Which way a firework launches, a fountain sprays, or gravity pulls. Saved
// by value: never change one
const EFFECT_DIRECTIONS = [
	{ value: 'down', label: 'Down' },
	{ value: 'up', label: 'Up' },
	{ value: 'left', label: 'Left' },
	{ value: 'right', label: 'Right' },
];
// The settings that belong to one motion, by the motion each is for: shown
// only for it, and kept at the default preset's value for any other, so a
// hidden leftover cannot make an effect differ from its preset
const MOTION_SETTINGS = {
	rockets: 'firework',
	rocketDistance: 'firework',
	sprayDistance: 'fountain',
	wobble: 'bubbles',
	splash: 'rain',
	spread: 'fountain',
};

const MAX_EFFECT_GLYPHS = 24;
// One character's length in UTF-16 units: room for the longest emoji, as a
// family of four (11). Zalgo text, a letter under thousands of marks, is
// one character too, and would bloat storage and stall every page it draws on
const MAX_GLYPH_LENGTH = 16;
const MAX_EFFECT_COLORS = 12;
// Users with an effect of their own: more than anyone sets by hand, few
// enough that a shared file cannot bloat storage
const MAX_EFFECT_USERS = 500;
// The user's own presets, and their names' length: more than anyone keeps
// by hand, few enough that a shared file cannot bloat storage
const MAX_SAVED_PRESETS = 30;
const MAX_PRESET_NAME = 30;
// One effect at most this often, whoever arrives: one lasts up to 5 s, so
// a busy room still pauses between them, and moving content that starts on
// its own never runs past 5 s (WCAG 2.2.2)
const EFFECT_GAP_MS = 10 * 1000;

// The preset buttons, in this order. Each fills in every setting, which the
// user may then change. Each matches the Cyberspace theme's colors; its own
// colors are what Custom shows
const EFFECT_PRESETS = {
	'Confetti': { glyphs: '▪●▲■◆', colors: ['#ff4d4d', '#ffd84d', '#4dff88', '#4dc3ff', '#d24dff'], colorSource: 'theme', useNickname: false, motion: 'fall', direction: 'down', gravity: 'down', amount: 80, size: 14, duration: 3, easing: 'linear', spin: 360, drift: 60, stagger: 40, fadeOut: false, rockets: 4, rocketDistance: 50, sprayDistance: 50, wobble: 30, splash: true, spread: 40 },
	'Snow': { glyphs: '❄❅❆•', colors: ['#ffffff', '#cfe8ff'], colorSource: 'theme', useNickname: false, motion: 'fall', direction: 'down', gravity: 'down', amount: 50, size: 16, duration: 5, easing: 'linear', spin: 90, drift: 100, stagger: 50, fadeOut: false, rockets: 4, rocketDistance: 50, sprayDistance: 50, wobble: 30, splash: true, spread: 40 },
	'Stars': { glyphs: '★✦✧☆', colors: ['#fff6a0', '#ffd84d', '#ffffff'], colorSource: 'theme', useNickname: false, motion: 'burst', direction: 'down', gravity: 'down', amount: 40, size: 18, duration: 3, easing: 'ease-out', spin: 360, drift: 0, stagger: 15, fadeOut: true, rockets: 4, rocketDistance: 50, sprayDistance: 50, wobble: 30, splash: true, spread: 40 },
	'Hearts': { glyphs: '♥❤', colors: ['#ff4d8d', '#ff8fb8', '#ff2d55'], colorSource: 'theme', useNickname: false, motion: 'fall', direction: 'down', gravity: 'up', amount: 30, size: 20, duration: 4, easing: 'ease-in', spin: 30, drift: 60, stagger: 40, fadeOut: true, rockets: 4, rocketDistance: 50, sprayDistance: 50, wobble: 30, splash: true, spread: 40 },
	'Fireworks': { glyphs: '✦✧•*+', colors: ['#ffd84d', '#ff4d8d', '#4dc3ff', '#ffffff'], colorSource: 'theme', useNickname: false, motion: 'firework', direction: 'up', gravity: 'down', amount: 150, size: 18, duration: 2.5, easing: 'ease-out', spin: 180, drift: 20, stagger: 30, fadeOut: true, rockets: 4, rocketDistance: 35, sprayDistance: 50, wobble: 30, splash: true, spread: 40 },
	'Bubbles': { glyphs: '○◯°o', colors: ['#cfe8ff', '#9fd4ff', '#ffffff'], colorSource: 'theme', useNickname: false, motion: 'bubbles', direction: 'down', gravity: 'down', amount: 30, size: 20, duration: 5, easing: 'ease-out', spin: 0, drift: 20, stagger: 50, fadeOut: false, rockets: 4, rocketDistance: 50, sprayDistance: 50, wobble: 30, splash: true, spread: 40 },
	'Rain': { glyphs: '│|,', colors: ['#9fd4ff', '#4dc3ff', '#cfe8ff'], colorSource: 'theme', useNickname: false, motion: 'rain', direction: 'down', gravity: 'down', amount: 100, size: 16, duration: 3, easing: 'ease-in', spin: 0, drift: 40, stagger: 70, fadeOut: false, rockets: 4, rocketDistance: 50, sprayDistance: 50, wobble: 30, splash: true, spread: 40 },
	'Fountain': { glyphs: '•∙·*', colors: ['#4dc3ff', '#9fd4ff', '#ffffff'], colorSource: 'theme', useNickname: false, motion: 'fountain', direction: 'up', gravity: 'down', amount: 80, size: 14, duration: 4, easing: 'linear', spin: 90, drift: 0, stagger: 70, fadeOut: false, rockets: 4, rocketDistance: 50, sprayDistance: 50, wobble: 30, splash: true, spread: 40 },
	'Starfield': { glyphs: '·•✦*', colors: ['#ffffff', '#fff6a0', '#cfe8ff'], colorSource: 'theme', useNickname: false, motion: 'zoom', direction: 'down', gravity: 'down', amount: 80, size: 12, duration: 3, easing: 'ease-in', spin: 0, drift: 0, stagger: 60, fadeOut: false, rockets: 4, rocketDistance: 50, sprayDistance: 50, wobble: 30, splash: true, spread: 40 },
	'Matrix Rain': { glyphs: '01アイウエオカキクケコ', colors: ['#00ff41', '#00c832'], colorSource: 'theme', useNickname: false, motion: 'fall', direction: 'down', gravity: 'down', amount: 70, size: 14, duration: 3, easing: 'ease-in', spin: 0, drift: 0, stagger: 60, fadeOut: false, rockets: 4, rocketDistance: 50, sprayDistance: 50, wobble: 30, splash: true, spread: 40 },
};
const DEFAULT_EFFECT_PRESET = 'Confetti';

// Where an effect's colors come from, after "Match colors to my". Saved by
// value: never change one
const EFFECT_COLOR_SOURCES = [
	{ value: 'theme', label: 'Cyberspace theme' },
	{ value: 'nickTheme', label: 'Nick colors theme' },
	{ value: 'nick', label: 'Choom\'s nick color' },
	{ value: 'custom', label: 'Custom' },
];
// Nick colors theme: this many sampled colors, enough to look varied
const NICK_THEME_SAMPLES = 12;

// Who it plays for by default, of CHOOM_AUDIENCES
const DEFAULT_PLAY_FOR = 'best';

// playFor: a CHOOM_AUDIENCES value, who it plays for; default: the effect
// for each of them; users: by lowercased username, a user's own effect.
// Anyone not in users gets the default. presets: the user's own presets,
// after the built-in ones, in the order saved
let nickEffects = sanitizeNickEffects(null);

/**
 * A preset's settings, as a new object the caller may change.
 * @param {string} name - a key of EFFECT_PRESETS, or a saved preset's name
 * @returns {Object} an effect, as sanitizeEffect returns
 * @throws {TypeError} for a name that is neither: take names from
 *   effectPresetNames
 */
function effectPreset(name) {
	const preset = Object.hasOwn(EFFECT_PRESETS, name) ? EFFECT_PRESETS[name] : savedPreset(name).effect;
	return { ...preset, colors: [...preset.colors] };
}

/**
 * Every preset's name, in the order their buttons show: the built-in ones,
 * then the user's own as they saved them.
 * @returns {string[]}
 */
function effectPresetNames() {
	return [...Object.keys(EFFECT_PRESETS), ...nickEffects.presets.map(preset => preset.name)];
}

/**
 * A saved preset, by its name in any case.
 * @param {string} name
 * @returns {{name: string, effect: Object}|undefined}
 */
function savedPreset(name) {
	return nickEffects.presets.find(preset => preset.name.toLowerCase() === name.toLowerCase());
}

/**
 * Whether a name is a built-in preset's, in any case.
 * @param {string} name
 * @returns {boolean}
 */
function isBuiltInPresetName(name) {
	return Object.keys(EFFECT_PRESETS).some(builtIn => builtIn.toLowerCase() === name.toLowerCase());
}

/**
 * A preset's name as it is saved: spaces trimmed and collapsed.
 * @param {*} name - as typed or saved
 * @returns {string} '' for anything that is not a string
 */
function cleanPresetName(name) {
	return typeof name === 'string' ? name.replace(/[\s\u0000-\u001f\u007f]+/g, ' ').trim() : '';
}

/**
 * Why a name cannot be saved as a new preset, or null when it can. A name
 * already saved can: it replaces that preset.
 * @param {string} name - from cleanPresetName
 * @returns {string|null} what to change, for the user
 */
function presetNameProblem(name) {
	if (!name) return 'Type a name for the preset.';
	if (name.length > MAX_PRESET_NAME) return `Use ${MAX_PRESET_NAME} characters or fewer.`;
	if (isBuiltInPresetName(name)) {
		return `${name} is a built-in preset. Pick another name.`;
	}
	if (!savedPreset(name) && nickEffects.presets.length >= MAX_SAVED_PRESETS) {
		return `You can save up to ${MAX_SAVED_PRESETS} presets. Delete one first.`;
	}
	return null;
}

/**
 * A number within limits, on its step.
 * @param {*} value
 * @param {{min: number, max: number, step: number}} limits
 * @param {number} fallback - when value is not a number
 * @returns {number}
 */
function clampEffectNumber(value, limits, fallback) {
	if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
	const snapped = Math.round((value - limits.min) / limits.step) * limits.step + limits.min;
	return Math.min(limits.max, Math.max(limits.min, snapped));
}

/**
 * The characters an effect is drawn with: no spaces or control characters,
 * none longer than MAX_GLYPH_LENGTH, up to MAX_EFFECT_GLYPHS.
 * @param {*} glyphs - as typed or saved
 * @returns {string} '' when there is nothing usable
 */
function cleanEffectGlyphs(glyphs) {
	if (typeof glyphs !== 'string') return '';
	// Read one at a time, and only until there are enough: an imported
	// string of any size costs one pass, and none of it is kept
	const kept = [];
	for (const glyph of eachGlyph(glyphs.replace(/[\s\u0000-\u001f\u007f]+/g, ''))) {
		if (glyph.length <= MAX_GLYPH_LENGTH) kept.push(glyph);
		if (kept.length === MAX_EFFECT_GLYPHS) break;
	}
	return kept.join('');
}

/**
 * Whether value is a hex color: #fff or #ffffff.
 * @param {*} value
 * @returns {boolean}
 */
function isEffectColor(value) {
	return typeof value === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value);
}

/**
 * A #rgb color as #rrggbb, which parseColor and a color picker take.
 * @param {string} color - any CSS color
 * @returns {string} color as given when it is not #rgb
 */
function fullHexColor(color) {
	return /^#[0-9a-f]{3}$/i.test(color) ? '#' + color.slice(1).split('').map(c => c + c).join('') : color;
}

/**
 * An effect with anything unknown or malformed replaced by the default
 * preset's.
 * @param {*} effect - as saved, from a backup, or from the form
 * @returns {{glyphs: string, colors: string[], colorSource: string, useNickname: boolean, motion: string, direction: string, gravity: string, amount: number, size: number, duration: number,
 *   easing: string, spin: number, drift: number, stagger: number, fadeOut: boolean, rockets: number, rocketDistance: number,
 *   wobble: number, splash: boolean, spread: number, sprayDistance: number}} rockets and rocketDistance
 *   belong to a firework, wobble to bubbles, splash to rain, spread and sprayDistance to a fountain
 *   useNickname: the letters of the name of whoever it plays for are the
 *   characters, in place of glyphs; colorSource: an EFFECT_COLOR_SOURCES value; colors: the user's own,
 *   used for a Custom colorSource, none meaning the
 *   page's text color; direction: an EFFECT_DIRECTIONS value, the way a
 *   firework launches or a fountain sprays; gravity: one too, the way things fall; easing: an
 *   EFFECT_EASINGS value
 */
function sanitizeEffect(effect) {
	const base = effectPreset(DEFAULT_EFFECT_PRESET);
	if (!effect || typeof effect !== 'object') return base;
	const motion = effect.motion === 'rise' ? 'fall'
		: EFFECT_MOTIONS.some(choice => choice.value === effect.motion) ? effect.motion : base.motion;
	return {
		glyphs: cleanEffectGlyphs(effect.glyphs) || base.glyphs,
		colors: Array.isArray(effect.colors) ? effect.colors.filter(isEffectColor).slice(0, MAX_EFFECT_COLORS) : base.colors,
		colorSource: EFFECT_COLOR_SOURCES.some(source => source.value === effect.colorSource) ? effect.colorSource
			// Saved before the choice: two switches
			: effect.useNickColor === true ? 'nick'
			: effect.matchTheme === false ? 'custom'
			: base.colorSource,
		useNickname: typeof effect.useNickname === 'boolean' ? effect.useNickname : base.useNickname,
		motion,
		// A motion with no Direction, or no Gravity, keeps one value, so a
		// hidden leftover cannot make it differ from its preset
		direction: !effectMotion(motion).direction ? EFFECT_DIRECTIONS[0].value
			: isEffectDirection(effect.direction) ? effect.direction
			: effectMotion(motion).direction,
		gravity: !effectMotion(motion).gravity ? EFFECT_DIRECTIONS[0].value
			: isEffectDirection(effect.gravity) ? effect.gravity
			// Saved before Gravity: a rise went up, and a fall went its Direction
			: effect.motion === 'rise' ? 'up'
			: motion === 'fall' && isEffectDirection(effect.direction) ? effect.direction
			: EFFECT_DIRECTIONS[0].value,
		amount: clampEffectNumber(effect.amount, EFFECT_LIMITS.amount, base.amount),
		size: clampEffectNumber(effect.size, EFFECT_LIMITS.size, base.size),
		duration: clampEffectNumber(effect.duration, EFFECT_LIMITS.duration, base.duration),
		easing: EFFECT_EASINGS.some(easing => easing.value === effect.easing) ? effect.easing : base.easing,
		// 0 where Spin or Drift is not shown, as every preset of those motions has
		spin: !effectMotion(motion).spins ? 0 : clampEffectNumber(effect.spin, EFFECT_LIMITS.spin, base.spin),
		drift: !effectMotion(motion).drifts ? 0 : clampEffectNumber(effect.drift, EFFECT_LIMITS.drift, base.drift),
		stagger: clampEffectNumber(effect.stagger, EFFECT_LIMITS.stagger, base.stagger),
		// Off where Fade out is not shown: a hidden leftover would make it
		// differ from its preset
		fadeOut: !effectMotion(motion).fades ? false
			: typeof effect.fadeOut === 'boolean' ? effect.fadeOut : base.fadeOut,
		...Object.fromEntries(Object.entries(MOTION_SETTINGS).map(([key, owner]) => [key, owner !== motion ? base[key]
			: typeof base[key] === 'boolean' ? (typeof effect[key] === 'boolean' ? effect[key] : base[key])
			: clampEffectNumber(effect[key], EFFECT_LIMITS[key], base[key])])),
	};
}

/**
 * Whether value is an EFFECT_DIRECTIONS value.
 * @param {*} value
 * @returns {boolean}
 */
function isEffectDirection(value) {
	return EFFECT_DIRECTIONS.some(direction => direction.value === value);
}

/**
 * A motion's entry in EFFECT_MOTIONS.
 * @param {string} value - a motion's value, as sanitizeEffect keeps it
 * @returns {{value: string, label: string, direction?: string, gravity: boolean, fades: boolean, spins: boolean, drifts: boolean}}
 */
function effectMotion(value) {
	return EFFECT_MOTIONS.find(choice => choice.value === value);
}

/**
 * Nick effects settings with anything unknown or malformed dropped.
 * @param {*} data - as saved, or from a backup
 * @returns {{playFor: string, onNotify: boolean, default: Object, users: Object<string, Object>, presets: {name: string, effect: Object}[]}}
 */
function sanitizeNickEffects(data) {
	const users = {};
	const saved = data && typeof data === 'object' && data.users && typeof data.users === 'object' ? data.users : {};
	for (const [username, effect] of Object.entries(saved)) {
		if (Object.keys(users).length === MAX_EFFECT_USERS) break;
		const key = username.toLowerCase();
		// isValidUsername checks the case as given: __PROTO__ lowercases to a
		// key that would write through Object.prototype
		if (!isValidUsername(username) || key in Object.prototype) continue;
		// null was "no effect", saved by earlier builds: they get the default
		if (!effect || typeof effect !== 'object') continue;
		users[key] = sanitizeEffect(effect);
	}
	// An array, not an object by name: a name such as __proto__ stays a name.
	// Two saved alike are one saved twice: the first stays
	const kept = [];
	for (const preset of Array.isArray(data?.presets) ? data.presets : []) {
		if (kept.length === MAX_SAVED_PRESETS) break;
		const name = cleanPresetName(preset?.name);
		if (!name || name.length > MAX_PRESET_NAME || !preset.effect || typeof preset.effect !== 'object') continue;
		if (kept.some(other => other.name.toLowerCase() === name.toLowerCase())) continue;
		kept.push({ name, effect: sanitizeEffect(preset.effect) });
	}
	// A built-in preset added since one was saved takes its name: numbered
	// past every name in use, it stays, and takes no other's
	const inUse = new Set(Object.keys(EFFECT_PRESETS).concat(kept.map(preset => preset.name)).map(name => name.toLowerCase()));
	const presets = kept.map(({ name, effect }) => {
		if (!isBuiltInPresetName(name)) return { name, effect };
		let numbered = name;
		for (let n = 2; inUse.has(numbered.toLowerCase()); n++) numbered = `${name.slice(0, MAX_PRESET_NAME - String(n).length - 1)} ${n}`;
		inUse.add(numbered.toLowerCase());
		return { name: numbered, effect };
	});
	const playFor = isAudience(data?.playFor) ? data.playFor : DEFAULT_PLAY_FOR;
	const onNotify = typeof data?.onNotify === 'boolean' ? data.onNotify : true;
	return { playFor, onNotify, default: sanitizeEffect(data?.default), users, presets };
}

/**
 * The preset an effect is, setting for setting, so its button shows pressed.
 * @param {Object} effect - from sanitizeEffect
 * @returns {string|null} a preset's name, built-in first; null when changed
 *   from all of them
 */
function effectPresetOf(effect) {
	// Both sanitized, so the keys are in one order whatever the preset's.
	// Colors only count while Custom shows them: each preset has its own,
	// and a hidden list the user left behind must not unmatch it
	const seen = (one) => {
		const clean = sanitizeEffect(one);
		if (clean.colorSource !== 'custom') delete clean.colors;
		return JSON.stringify(clean);
	};
	const text = seen(effect);
	return effectPresetNames().find(name => seen(effectPreset(name)) === text) ?? null;
}

/**
 * Read the settings from storage.
 * Side effects: replaces nickEffects.
 */
function loadNickEffects() {
	try {
		nickEffects = sanitizeNickEffects(JSON.parse(_GM_getValue('nickEffects', 'null')));
	} catch (e) {
		nickEffects = sanitizeNickEffects(null);
	}
}
// At load, as every feature reads its settings: onStorageReady runs only
// once async storage loads (Greasemonkey 4), never with sync storage
// (Tampermonkey), which would leave the defaults on every page
loadNickEffects();

/**
 * Replace the settings and save them.
 * Side effects: replaces nickEffects; writes storage.
 * @param {*} data - checked here; null for the defaults
 */
function replaceNickEffects(data) {
	nickEffects = sanitizeNickEffects(data);
	_GM_setValue('nickEffects', JSON.stringify(nickEffects));
}

/**
 * Whether a user's effect plays: they are close enough for playFor.
 * @param {string} username
 * @returns {boolean}
 */
function playsEffectFor(username) {
	return isInAudience(nickEffects.playFor, choomLevel(username));
}

/**
 * The effect a choom gets when they arrive: their own, or the default.
 * @param {string} username
 * @returns {Object}
 */
function effectFor(username) {
	const key = username.toLowerCase();
	return Object.hasOwn(nickEffects.users, key) ? nickEffects.users[key] : nickEffects.default;
}

/**
 * How many users have an effect of their own, for the issue report.
 * @returns {string}
 */
function nickEffectsSummary() {
	const count = Object.keys(nickEffects.users).length;
	return `${count} ${count === 1 ? 'user' : 'users'} with their own effect`;
}

// =====================================================
// DRAWING
// =====================================================

const EFFECT_OVERLAY_CLASS = uiClass('effect');
// Whose name Preview shows for the default effect, before Cyberspace says
// who you are
const PREVIEW_NAME = 'choom';
// cIRC's messages, on its page and in the sidebar: where an effect plays
const MESSAGES_SCROLLER_SELECTOR = '.messages-scroller';
// The fastest glyph takes this share of the time left after its delay
const EFFECT_FASTEST_SHARE = 0.55;
// A rocket climbs for this share of its time, then its glyphs burst and
// shower for the rest
const FIREWORK_CLIMB = 0.35;
// The shortest a glyph's whole flight may be, as a share of its rocket's
// time. Must stay above FIREWORK_CLIMB: an offset past 1 throws
const FIREWORK_SHORTEST_FLIGHT = 0.8;
// After the burst, a glyph falls this many times as far as it flew out
const FIREWORK_DROP = 1.2;
// Where its burn starts to fade, through the burst and shower, with Fade out
const FIREWORK_FADE_FROM = 0.6;
// Where a spark has grown to full size, then burns smaller. On one of the
// arc's points (CURVE_POINTS), as FIREWORK_FADE_FROM is: between two, the
// line drawn between them would never reach it
const FIREWORK_FULL_SIZE_AT = 0.2;
// How long a name stays outlined in place of the effect, with reduced motion
const EFFECT_HIGHLIGHT_MS = 4000;

/**
 * A random number from min up to max.
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function randomBetween(min, max) {
	return min + Math.random() * (max - min);
}

/**
 * A name's element on the page, in any case.
 * @param {string} username
 * @returns {HTMLElement|undefined} the first, if the name is on the page
 */
function nameElementOnPage(username) {
	const lower = username.toLowerCase();
	return Array.from(document.querySelectorAll(USERNAME_SELECTOR)).find(el => usernameOf(el).toLowerCase() === lower);
}

/**
 * The text color of a name's element: its nick color, when it has one.
 * @param {HTMLElement|undefined} name - from nameElementOnPage
 * @returns {string|null} null when the name is not on the page
 */
function nickColorOf(name) {
	return name ? getComputedStyle(name).color : null;
}

/**
 * Positions along a direction. along: how far from the edge it points away
 * from; across: where along that edge. A path is worked out going one way
 * and turned to the direction chosen.
 * @param {string} direction - an EFFECT_DIRECTIONS value
 * @param {{width: number, height: number}} area - the overlay's size
 * @returns {{length: number, breadth: number, point: function(number, number): {x: number, y: number}}}
 *   length: the area's size along the direction; breadth: across it;
 *   point: where (across, along) is in the overlay, in px
 */
function effectFrame(direction, area) {
	const { width, height } = area;
	const toXY = {
		down: (across, along) => ({ x: across, y: along }),
		up: (across, along) => ({ x: across, y: height - along }),
		right: (across, along) => ({ x: along, y: across }),
		left: (across, along) => ({ x: width - along, y: across }),
	}[direction];
	const vertical = direction === 'down' || direction === 'up';
	return { length: vertical ? height : width, breadth: vertical ? width : height, point: toXY };
}

/**
 * The keyframes and timing for one glyph, by the effect's motion. Each
 * ends within the effect's duration, at its own time. A firework's glyphs
 * climb and burst with their rocket, then each showers for its own time.
 * @param {Object} effect - from sanitizeEffect
 * @param {{width: number, height: number}} area - the overlay's size
 * @param {{x: number, y: number}} origin - where a burst starts, in the overlay
 * @param {{across: number, peak: number, delay: number}|null} rocket - for a
 *   firework, the glyph's rocket from fireworkRockets: where it climbs from,
 *   how far, and when; null for any other motion
 * @returns {{keyframes: Object[], delay: number, duration: number, easing: string}} ms
 */
function effectGlyphMotion(effect, area, origin, rocket) {
	const total = effect.duration * 1000;
	const { width, height } = area;
	const spin = randomBetween(-effect.spin, effect.spin);
	const drift = randomBetween(-effect.drift, effect.drift);
	const delay = randomBetween(0, effect.stagger / 100) * total;
	// Each its own speed, so they reach the far side one by one rather than
	// all as the effect ends. The slowest still ends by then
	const duration = (total - delay) * randomBetween(EFFECT_FASTEST_SHARE, 1);
	const easing = EFFECT_EASINGS.find(choice => choice.value === effect.easing).css;
	// Fades over its last part, or ends as it is: past the area's edge for a
	// fall, clipped there, or where it lands for a burst or firework
	// (playEffect removes each one as it finishes)
	const endOpacity = effect.fadeOut ? 0 : 1;
	// Which way is down, and sideways to it: where a burst or a shower falls,
	// and which way drift sways it
	const down = gravityVector(effect.gravity);
	const fallen = (point, by, sway) => ({ x: point.x + down.x * by + down.y * sway, y: point.y + down.y * by + down.x * sway });
	if (rocket) {
		// A rocket's glyphs launch with its delay, climb as one and burst at
		// one moment, as a firework does; then each showers for its own time
		const frame = effectFrame(effect.direction, area);
		const angle = randomBetween(0, Math.PI * 2);
		const reach = randomBetween(0.1, 0.3) * Math.min(width, height);
		const peak = frame.point(rocket.across, rocket.peak);
		const out = { x: Math.cos(angle) * reach, y: Math.sin(angle) * reach };
		const rocketTime = total - rocket.delay;
		// Its own shower: the climb ends at the rocket's moment, so the
		// offsets scale with how much of the rocket's time this one takes.
		// Without it, fade off, they would all vanish in one frame
		const share = randomBetween(FIREWORK_SHORTEST_FLIGHT, 1);
		const burstAt = FIREWORK_CLIMB / share;
		// The burst and shower as one arc, as a spark flies: out fast and
		// slowing, while gravity pulls it more and more, burning smaller.
		// Points along it, not straight legs, so it does not move stiffly
		const spark = (s) => {
			const flown = 1 - (1 - s) ** 3;
			const at = fallen({ x: peak.x + out.x * flown, y: peak.y + out.y * flown }, reach * FIREWORK_DROP * s * s, drift * s);
			return {
				transform: glyphTransform(at, spin * s, String(s < FIREWORK_FULL_SIZE_AT ? 0.5 + s / FIREWORK_FULL_SIZE_AT * 0.5 : 1 - 0.4 * (s - FIREWORK_FULL_SIZE_AT) / (1 - FIREWORK_FULL_SIZE_AT))),
				opacity: effect.fadeOut ? Math.min(1, (1 - s) / (1 - FIREWORK_FADE_FROM)) : 1,
				offset: burstAt + (1 - burstAt) * s,
			};
		};
		return {
			keyframes: [
				// The climb, eased as the user chose; the arc is timed by its points
				{ transform: glyphTransform(frame.point(rocket.across, -edgeMargin(effect)), 0, '0.5'), opacity: 1, easing },
				...evenTimes(CURVE_POINTS).map(spark),
			],
			delay: rocket.delay,
			duration: rocketTime * share,
			easing: 'linear',
		};
	}

	if (effect.motion === 'burst') {
		const angle = randomBetween(0, Math.PI * 2);
		const reach = randomBetween(0.15, 0.45) * Math.min(width, height);
		const out = { x: origin.x + Math.cos(angle) * reach, y: origin.y + Math.sin(angle) * reach };
		return {
			keyframes: [
				{ transform: glyphTransform(origin, 0, '0.4'), opacity: 1 },
				{ transform: glyphTransform(out, spin / 2, '1'), opacity: 1, offset: 0.5 },
				// Then drops a little with gravity
				{ transform: glyphTransform(fallen(out, reach * 0.5, drift), spin, '1'), opacity: endOpacity },
			],
			delay,
			duration,
			easing,
		};
	}
	const path = EFFECT_PATHS[effect.motion];
	return {
		keyframes: path.keyframes(effect, area, { spin, drift, endOpacity }),
		delay,
		duration: duration * path.speed,
		easing,
	};
}

/**
 * Which way gravity pulls, as a unit step on screen.
 * @param {string} gravity - an EFFECT_DIRECTIONS value
 * @returns {{x: number, y: number}}
 */
function gravityVector(gravity) {
	return { down: { x: 0, y: 1 }, up: { x: 0, y: -1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } }[gravity];
}

/**
 * A glyph's transform: the same functions in every frame. A list that
 * differs is blended as a matrix, which turns a spin past 180° the wrong way.
 * @param {{x: number, y: number}} point - in the overlay, px
 * @param {number} rotate - degrees
 * @param {string} scale - as CSS takes it: "1", or "2, 0.2"
 * @returns {string}
 */
function glyphTransform(point, rotate, scale) {
	return `translate(${point.x}px, ${point.y}px) rotate(${rotate}deg) scale(${scale})`;
}

/**
 * The colors an effect draws with, by its colorSource. The choom's nick
 * color without one on the page, or Nick colors theme with nick colors off,
 * is the site theme's.
 * @param {Object} effect - from sanitizeEffect
 * @param {string|null} nickColor - as playEffect
 * @returns {string[]} none means the page's text color
 */
function effectColors(effect, nickColor) {
	if (effect.colorSource === 'custom') return effect.colors;
	if (effect.colorSource === 'nick' && nickColor) return [nickColor];
	if (effect.colorSource === 'nickTheme') {
		const sample = featureService('nickColorSample');
		const colors = sample ? Array.from({ length: NICK_THEME_SAMPLES }, sample).filter(Boolean) : [];
		if (colors.length) return colors;
	}
	// The theme's own colors, not its status ones: a one-color theme stays one color
	const theme = getThemeColors();
	return [...new Set([theme.fg, theme.fgDim, theme.border].filter(Boolean))];
}

/**
 * The whole window, as an area for playEffect: for a notification,
 * which shows on any page, and where no chat is shown.
 * @returns {{left: number, top: number, width: number, height: number}}
 */
function windowArea() {
	return { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
}

/**
 * Where a choom's effect plays, in the viewport: cIRC's messages, on its
 * page or in the sidebar. The chat a join line is in, when there are two;
 * the whole window where none is shown.
 * @param {HTMLElement|null} nameElement - the name it is for
 * @returns {{left: number, top: number, width: number, height: number}}
 */
function effectArea(nameElement) {
	const own = nameElement?.closest(MESSAGES_SCROLLER_SELECTOR);
	return (own && elementArea(own))
		?? Array.from(document.querySelectorAll(MESSAGES_SCROLLER_SELECTOR)).map(elementArea).find(Boolean)
		?? windowArea();
}

/**
 * Where an element is in the viewport, as an effect's area.
 * @param {HTMLElement} el
 * @returns {{left: number, top: number, width: number, height: number}|null}
 *   null while it is not shown
 */
function elementArea(el) {
	const rect = el.getBoundingClientRect();
	return rect.width && rect.height ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : null;
}

/**
 * Play an effect over an area, cIRC's messages or the window, or with
 * reduced motion, outline the name
 * instead. Nothing flashes: a glyph moves, grows or shrinks, and fades in
 * or out once.
 * Side effects: adds an overlay of glyphs to the body, removes each glyph
 * as its animation finishes, and the overlay once the effect ends; or
 * outlines nameElement for EFFECT_HIGHLIGHT_MS.
 * @param {Object} effect - from sanitizeEffect
 * @param {HTMLElement|null} nameElement - the name it is for: where a burst
 *   starts, and what reduced motion outlines; null for the area's middle
 * @param {string|null} nickColor - the colors to use, when the effect takes
 *   the choom's nick color
 * @param {{left: number, top: number, width: number, height: number}} area -
 *   where it plays, in the viewport (effectArea, windowArea)
 * @param {string} name - who it is for, as the page spells it: its letters
 *   are the characters, when the effect uses their name
 * @param {boolean} [overDialogs=false] - over the script's dialogs, as a
 *   Preview in one; a choom's join plays under them
 */
function playEffect(effect, nameElement, nickColor, area, name, overDialogs = false) {
	if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
		if (!nameElement) return;
		const highlight = uiClass('effect-highlight');
		nameElement.classList.add(highlight);
		setTimeout(() => nameElement.classList.remove(highlight), EFFECT_HIGHLIGHT_MS);
		return;
	}
	const rect = nameElement?.getBoundingClientRect();
	const x = rect && rect.left + rect.width / 2 - area.left;
	const y = rect && rect.top + rect.height / 2 - area.top;
	// A name outside the area, as in the Online list beside the chat, bursts
	// from the middle of it
	const origin = rect && rect.width && x >= 0 && x <= area.width && y >= 0 && y <= area.height
		? { x, y }
		: { x: area.width / 2, y: area.height / 2 };
	// Their name's letters, one picked for each glyph as from Characters
	const glyphs = splitGlyphs(effect.useNickname ? name : effect.glyphs);
	const colors = effectColors(effect, nickColor);

	const overlay = document.createElement('div');
	overlay.className = EFFECT_OVERLAY_CLASS;
	overlay.classList.toggle(uiClass('effect-over-dialogs'), overDialogs);
	// Fixed over the chat's box, not inside it: the chat's layout and scroll
	// stay as they are
	Object.assign(overlay.style, { left: `${area.left}px`, top: `${area.top}px`, width: `${area.width}px`, height: `${area.height}px` });
	// Decoration: the name joining, or the notification, is what it is about
	overlay.setAttribute('aria-hidden', 'true');
	const rockets = effect.motion === 'firework' ? fireworkRockets(effect, area) : null;
	// A firework is mostly one color: each rocket takes one, a different one
	// while there are enough, and its sparks are near it
	const rocketColors = rockets && colors.length ? shuffled(colors) : null;
	for (let i = 0; i < effect.amount; i++) {
		const glyph = document.createElement('span');
		glyph.className = uiClass('effect-glyph');
		glyph.textContent = glyphs[Math.floor(Math.random() * glyphs.length)];
		if (rocketColors) glyph.style.color = nearColor(rocketColors[(i % rockets.length) % rocketColors.length]);
		else if (colors.length) glyph.style.color = colors[Math.floor(Math.random() * colors.length)];
		glyph.style.fontSize = `${Math.round(effect.size * randomBetween(0.7, 1.3))}px`;
		overlay.append(glyph);
		// Not in every browser (nor jsdom): without it, nothing moves
		if (typeof glyph.animate !== 'function') continue;
		const { keyframes, delay, duration, easing } = effectGlyphMotion(effect, area, origin, rockets && rockets[i % rockets.length]);
		// both: holds the first frame through the delay. Removed as it finishes,
		// so a burst that does not fade is not left standing until the rest end
		const animation = glyph.animate(keyframes, { delay, duration, easing, fill: 'both' });
		if (animation) animation.onfinish = () => glyph.remove();
	}
	document.body.append(overlay);
	setTimeout(() => overlay.remove(), effect.duration * 1000 + 100);
}

// A raindrop crosses in this share of the time another glyph would take
const RAIN_SPEED = 0.45;
// A fountain's glyph, sprayed against gravity, is at its highest this far
// through its flight, and back where it started at twice this
const FOUNTAIN_APEX = 0.4;
// With Fade out, a fountain's glyph starts to fade this far through its time
// in sight
const FOUNTAIN_FADE_FROM = 0.5;
// Points along a curve: enough to look smooth
const CURVE_POINTS = 10;
// Where a fall's fade starts: that far along the path too, so the keyframe
// adds no change of speed
const FALL_FADE_FROM = 0.7;

/**
 * How far past an edge a glyph is wholly out of sight: one character, at
 * the largest it is drawn (1.3 × size), turned any way, with room to spare.
 * point() places a glyph's corner, so a path that ends any nearer shows a
 * strip of it.
 * @param {Object} effect - from sanitizeEffect
 * @returns {number} px
 */
function edgeMargin(effect) {
	return effect.size * 2;
}

/**
 * Keyframes along a path, from pathKeyframes' at for each time.
 * @param {function(number): {point: {x: number, y: number}, rotate: number, scale: string, opacity: number}} at -
 *   where the glyph is at t from 0 to 1
 * @param {number[]} times - the t of each keyframe, rising from 0 to 1
 * @returns {Object[]} for Element.animate
 */
function pathKeyframes(at, times) {
	return times.map(t => {
		const { point, rotate, scale, opacity } = at(t);
		return { transform: glyphTransform(point, rotate, scale), opacity, offset: t };
	});
}

/**
 * Evenly spaced times from 0 to 1, for pathKeyframes.
 * @param {number} count - how many steps
 * @returns {number[]} count + 1 times
 */
function evenTimes(count) {
	return Array.from({ length: count + 1 }, (_, i) => i / count);
}

// Each motion with a path of its own, by its value. speed: a share of the
// time the glyph would take otherwise; keyframes: gets the effect, the
// overlay's size, and the glyph's own spin, drift and end opacity
// (effectGlyphMotion). One that comes in from an edge, or leaves past
// one, goes edgeMargin beyond it, so it is out of sight there. Each with
// Gravity works in its frame (effectFrame): along runs the way it pulls
const EFFECT_PATHS = {
	// With gravity, from past the edge it starts at to past the far one, the
	// same margin both ends: point() places a glyph's corner, so a shorter
	// end would show a strip of it
	fall: {
		speed: 1,
		keyframes(effect, area, { spin, drift, endOpacity }) {
			const frame = effectFrame(effect.gravity, area);
			const across = randomBetween(0, frame.breadth);
			const from = -edgeMargin(effect);
			const to = frame.length + edgeMargin(effect);
			return pathKeyframes(t => ({
				point: frame.point(across + drift * t, from + (to - from) * t),
				rotate: spin * t,
				scale: '1',
				opacity: t < 1 ? 1 : endOpacity,
			}), [0, FALL_FADE_FROM, 1]);
		},
	},
	// Against gravity from past its edge, swaying, to where it pops: grows
	// and is gone at once
	bubbles: {
		speed: 1,
		keyframes(effect, area, { spin, drift }) {
			const frame = effectFrame(effect.gravity, area);
			const across = randomBetween(0, frame.breadth);
			const from = frame.length + edgeMargin(effect);
			const pop = frame.length * randomBetween(0.1, 0.4);
			const sways = randomBetween(1.5, 3);
			const phase = randomBetween(0, Math.PI * 2);
			const popAt = 0.9;
			return pathKeyframes(t => {
				const rise = Math.min(t / popAt, 1);
				return {
					point: frame.point(across + drift * rise + effect.wobble * Math.sin(phase + rise * sways * Math.PI * 2), from + (pop - from) * rise),
					rotate: spin * rise,
					scale: t < 1 ? '1' : '1.6',
					opacity: t < 1 ? 1 : 0,
				};
			}, [...evenTimes(CURVE_POINTS).map(t => t * popAt), 1]);
		},
	},
	// Straight with gravity, slanted by drift, leaning along the line it
	// travels; with a splash, it flattens and is gone on the far edge, else
	// it falls out of sight
	rain: {
		speed: RAIN_SPEED,
		keyframes(effect, area, { drift }) {
			const frame = effectFrame(effect.gravity, area);
			const across = randomBetween(0, frame.breadth);
			const from = -edgeMargin(effect);
			const ground = effect.splash ? frame.length - effect.size : frame.length + edgeMargin(effect);
			const start = frame.point(across, from);
			const end = frame.point(across + drift, ground);
			// A drop drawn upright, turned to the line from start to end
			const lean = Math.atan2(end.x - start.x, end.y - start.y) * -180 / Math.PI;
			// In time order: an object's keys would put 0 and 1 before 0.85
			const frames = [[0, { point: start, rotate: lean, scale: '1', opacity: 1 }]];
			if (effect.splash) {
				frames.push([0.85, { point: end, rotate: lean, scale: '1', opacity: 1 }]);
				frames.push([1, { point: end, rotate: lean, scale: '2, 0.2', opacity: 0 }]);
			} else {
				frames.push([1, { point: end, rotate: lean, scale: '1', opacity: 1 }]);
			}
			const at = new Map(frames);
			return pathKeyframes(t => at.get(t), frames.map(([t]) => t));
		},
	},
	// Out of the middle of the edge it sprays from, its spray direction, at
	// an angle within the spread, while gravity pulls it its own way. Sprayed
	// against gravity, it turns at its spray distance and falls back past that
	// edge; any other way, gravity pulls hard enough that it leaves the chat
	// by the end, so none vanishes in mid-air
	fountain: {
		speed: 1,
		keyframes(effect, area, { spin, drift }) {
			const frame = effectFrame(effect.direction, area);
			const down = gravityVector(effect.gravity);
			const margin = edgeMargin(effect);
			const from = -margin;
			// How far it goes before gravity, pulling straight back, would turn it
			const reach = frame.length * (effect.sprayDistance / 100 + randomBetween(-SPRAY_DISTANCE_SPREAD, SPRAY_DISTANCE_SPREAD)) - from;
			const angle = randomBetween(-effect.spread / 2, effect.spread / 2) * Math.PI / 180;
			// Out at a·t, pulled by b·t², furthest at FOUNTAIN_APEX when straight back
			const b = reach / (FOUNTAIN_APEX * FOUNTAIN_APEX);
			const a = 2 * b * FOUNTAIN_APEX;
			// Leaves at the angle: sideways speed over outward speed is its tangent
			const sideways = a * Math.tan(angle) + drift;
			const sprayed = (t) => frame.point(frame.breadth / 2 + sideways * t, from + a * t);
			// Where unpulled it ends, along gravity's axis, and how far gravity
			// must pull it from there to be past the edge it pulls toward
			const end = sprayed(1);
			const along = down.x ? end.x * down.x : end.y * down.y;
			const past = down.x ? (down.x > 0 ? area.width : 0) : (down.y > 0 ? area.height : 0);
			// A pixel more, so rounding cannot leave it on the edge
			const pull = Math.max(b, past * (down.x || down.y) + margin + 1 - along);
			const at = (t) => {
				const point = sprayed(t);
				return { x: point.x + down.x * pull * t * t, y: point.y + down.y * pull * t * t };
			};
			// Faded out over the last part of its time in sight: gone by the
			// time it leaves the chat, wherever that is
			const times = evenTimes(CURVE_POINTS);
			const outOfSight = (point) => point.x <= -margin || point.y <= -margin
				|| point.x >= area.width + margin || point.y >= area.height + margin;
			const gone = times.find(t => t > 0 && outOfSight(at(t))) ?? 1;
			const fadeFrom = gone * FOUNTAIN_FADE_FROM;
			return pathKeyframes(t => ({
				point: at(t),
				rotate: spin * t,
				scale: '1',
				opacity: effect.fadeOut ? Math.min(1, Math.max(0, (gone - t) / (gone - fadeFrom))) : 1,
			}), times);
		},
	},

	// Out of the middle, small, growing as it comes, and past the edges, as a
	// screensaver's stars. Fades in, so none blinks into being. No gravity
	zoom: {
		speed: 1,
		keyframes(effect, area, { spin, endOpacity }) {
			const center = { x: area.width / 2, y: area.height / 2 };
			const angle = randomBetween(0, Math.PI * 2);
			// Out any way, grown to twice its size by then
			const out = Math.hypot(area.width, area.height) / 2 + edgeMargin(effect) * 2;
			const start = randomBetween(0, 0.15) * out;
			return pathKeyframes(t => {
				const reach = start + (out - start) * t;
				return {
					point: { x: center.x + Math.cos(angle) * reach, y: center.y + Math.sin(angle) * reach },
					rotate: spin * t,
					scale: String(0.1 + 1.9 * t),
					opacity: t === 0 ? 0 : t < 1 ? 1 : endOpacity,
				};
			}, [0, 0.2, 1]);
		},
	},
};

// How far either way of its Rocket distance each rocket bursts, and of its
// Spray distance each fountain drop turns, as a share of the chat
const ROCKET_DISTANCE_SPREAD = 0.1;
const SPRAY_DISTANCE_SPREAD = ROCKET_DISTANCE_SPREAD;
// How far off its turn a rocket may launch, as a share of the time between
// turns: under half, so two never swap
const ROCKET_TURN_JITTER = 0.3;

/**
 * A firework's rockets: as many as the effect says, each from its own place
 * along the edge it launches from, launched one after another over the
 * stagger's share of the duration, in no set order along that edge.
 * @param {Object} effect - from sanitizeEffect, with motion 'firework'
 * @param {{width: number, height: number}} area - the overlay's size
 * @returns {{across: number, peak: number, delay: number}[]} px along and
 *   from that edge (effectFrame), and ms
 */
function fireworkRockets(effect, area) {
	const count = effect.rockets;
	const launchWindow = effect.stagger / 100 * effect.duration * 1000;
	const frame = effectFrame(effect.direction, area);
	// Turns spread evenly over the window, then dealt out at random, so they
	// do not go off from one side to the other. Each a little off its turn,
	// never so far as to swap with the next, nor out of the window
	const step = count === 1 ? 0 : launchWindow / (count - 1);
	const turns = shuffled(Array.from({ length: count }, (_, i) => i));
	return Array.from({ length: count }, (_, i) => ({
		// Each in its own part of the edge, so two do not climb as one
		across: frame.breadth * (i + randomBetween(0.3, 0.7)) / count,
		// Within ROCKET_DISTANCE_SPREAD of the distance chosen, so they do not
		// burst in a line
		peak: frame.length * randomBetween(-ROCKET_DISTANCE_SPREAD, ROCKET_DISTANCE_SPREAD) + frame.length * effect.rocketDistance / 100,
		delay: Math.min(launchWindow, Math.max(0, step * (turns[i] + randomBetween(-ROCKET_TURN_JITTER, ROCKET_TURN_JITTER)))),
	}));
}

// How far a firework's spark may stray from its rocket's color: hue in
// degrees, saturation and lightness in %, either way
const SPARK_COLOR_VARIATION = { h: 10, s: 10, l: 10 };

/**
 * A color a little off from one, for a firework's spark. Its see-through
 * stays: a theme's colors may be partly clear.
 * @param {string} color - as CSS takes it: #rgb, #rrggbb, rgb(), rgba(),
 *   hsl() or hsla()
 * @returns {string} an hsl() or hsla() color; color as given when it
 *   cannot be read
 */
function nearColor(color) {
	const full = fullHexColor(color);
	const hsl = parseColor(full, 'hsl');
	if (!hsl) return color;
	// parseColor leaves alpha out
	const alpha = String(full).match(/^(?:rgba|hsla)\([^)]*,\s*([\d.]+)\s*\)$/i)?.[1];
	const off = (value, by, max) => Math.min(max, Math.max(0, value + randomBetween(-by, by)));
	const h = (hsl.h + randomBetween(-SPARK_COLOR_VARIATION.h, SPARK_COLOR_VARIATION.h) + 360) % 360;
	const parts = `${h.toFixed(1)}, ${off(hsl.s, SPARK_COLOR_VARIATION.s, 100).toFixed(1)}%, ${off(hsl.l, SPARK_COLOR_VARIATION.l, 100).toFixed(1)}%`;
	return alpha === undefined ? `hsl(${parts})` : `hsla(${parts}, ${alpha})`;
}

/**
 * A copy of a list in random order (Fisher–Yates).
 * @param {Array} list
 * @returns {Array} a new list; list is left as it was
 */
function shuffled(list) {
	const copy = list.slice();
	for (let i = copy.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[copy[i], copy[j]] = [copy[j], copy[i]];
	}
	return copy;
}

/**
 * Play a choom's effect for their name on the page.
 * Side effects: as playEffect.
 * @param {string} username
 * @param {HTMLElement|null} nameElement - as playEffect
 * @param {{left: number, top: number, width: number, height: number}} area -
 *   where, as playEffect
 */
function playChoomEffect(username, nameElement, area) {
	logDebug(NICK_EFFECTS_LOG_PREFIX + ' Playing for:', username);
	// One scan of the page for both
	const onPage = nameElementOnPage(username);
	playEffect(effectFor(username), nameElement, nickColorOf(onPage), area, spellingOf(username, onPage));
}

/**
 * A name as the page spells it, where it is on the page: an effect is
 * known by its lowercased name.
 * @param {string} username - in any case
 * @param {HTMLElement|undefined} name - from nameElementOnPage
 * @returns {string} as given when the name is not on the page
 */
function spellingOf(username, name) {
	return name ? usernameOf(name) : username;
}

// =====================================================
// WATCHING FOR EFFECTS: THE USER LIST AND JOIN LINES
// =====================================================

// The list last read, the room it was in, and who was on it, lowercased
let watchedOnlineList = null;
let watchedOnlinePath = '';
let onlineUsers = new Set();
// When each name last left the list, by lowercased username: one there at
// the first read may flicker too
const lastDepartures = new Map();
// When each choom last played, by lowercased username: the list and a join
// line may both report one effect. Where there is no list, as in the
// sidebar, this is the only rule: no departure is seen there
const lastPlayed = new Map();
// When each chat log was first seen (noteChatLogs)
const chatLogsSeen = new WeakMap();
// When the last effect started, for EFFECT_GAP_MS
let lastEffectAt = -Infinity;
// When each sender's notification last played, by lowercased username
const lastNotified = new Map();
// The toasts already seen: one plays once, and one there as the page loads
// is old news
const toastsSeen = new WeakSet();
// The signed-in user, lowercased, as Cyberspace last said; null until it
// has. Saved, so a page load does not ask: the API's terms ban bots, so it
// is asked only after a click or key press of the user's (lookUpOwnUsername)
let ownUsername = null;
const OWN_USERNAME_KEY = 'nickEffectsOwnUsername';
// The lookup in flight, and when the last one started (lookUpOwnUsername)
let ownUsernameLookup = null;
let lastOwnUsernameLookup = -Infinity;
const OWN_USERNAME_RETRY_MS = 60 * 1000;

/**
 * Read who is signed in, as last saved.
 * Side effects: sets ownUsername.
 */
function loadOwnUsername() {
	const saved = _GM_getValue(OWN_USERNAME_KEY, null);
	// Checked as a string first: a throw here, at load, would stop the script
	ownUsername = typeof saved === 'string' && isValidUsername(saved) ? saved.toLowerCase() : null;
}
loadOwnUsername();

/**
 * Play the effect for someone who just arrived, unless it is not for them,
 * they were here a moment ago, another effect just played, or they are you.
 * Side effects: may play an effect, and remember when.
 * @param {string} name - lowercased username
 * @param {HTMLElement|null} nameElement - as playEffect
 * @param {number} now - ms epoch
 */
function noteEffect(name, nameElement, now) {
	const recently = (times) => now - (times.get(name) ?? -Infinity) < EFFECT_REPLAY_MS;
	const why = effectSkipReason(name, now)
		?? (recently(lastPlayed) ? 'played for them in the last 10 minutes'
		: recently(lastDepartures) ? 'they left the list less than 10 minutes ago'
		: null);
	if (why) return logDebug(NICK_EFFECTS_LOG_PREFIX + ` Not playing for ${name}: ${why}`);
	lastPlayed.set(name, now);
	lastEffectAt = now;
	playChoomEffect(name, nameElement, effectArea(nameElement));
}

/**
 * Why no effect plays for someone now, whatever brought it on: not one it
 * plays for, you, or another effect just started.
 * @param {string} name - lowercased username
 * @param {number} now - ms epoch
 * @returns {string|null} for the debug log; null when it may play
 */
function effectSkipReason(name, now) {
	if (!playsEffectFor(name)) return `Who animation effects play for is ${nickEffects.playFor}, and their choom level is ${choomLevel(name)}`;
	if (name === ownUsername) return 'that is you';
	if (now - lastEffectAt < EFFECT_GAP_MS) return 'another effect started less than 10 seconds ago';
	return null;
}

/**
 * Play the effect for someone who sent a notification, over the whole
 * window: a toast shows on any page. Not past once a NOTIFY_REPLAY_MS for
 * one sender, so a run of C-Mails is one effect.
 * Side effects: may play an effect, and remember when.
 * @param {string} name - lowercased username
 * @param {HTMLElement} nameElement - their name in the toast: where a burst
 *   starts, and what reduced motion outlines
 * @param {number} now - ms epoch
 */
function noteNotification(name, nameElement, now) {
	if (!nickEffects.onNotify) return;
	const why = effectSkipReason(name, now)
		?? (now - (lastNotified.get(name) ?? -Infinity) < NOTIFY_REPLAY_MS ? 'played for a notification of theirs in the last minute' : null);
	if (why) return logDebug(NICK_EFFECTS_LOG_PREFIX + ` Not playing for ${name}'s notification: ${why}`);
	lastNotified.set(name, now);
	lastEffectAt = now;
	playChoomEffect(name, nameElement, windowArea());
}

/**
 * Who a toast notification is from, and their name in it.
 * @param {Element} toast - a TOAST_SELECTOR element
 * @returns {{name: string, element: HTMLElement}|null} name lowercased;
 *   null when it names nobody
 */
function toastSender(toast) {
	// Marked by the finder; else the "@name" the site writes, before it is marked
	const marked = toast.querySelector(USERNAME_SELECTOR);
	if (marked) return { name: usernameOf(marked).toLowerCase(), element: marked };
	for (const span of toast.querySelectorAll('span')) {
		const match = span.textContent.trim().match(/^@([^\s@]+)$/);
		if (match && isValidUsername(match[1])) return { name: match[1].toLowerCase(), element: span };
	}
	return null;
}

/**
 * The toasts a change added that were not on the page before.
 * Side effects: remembers each, so it plays once.
 * @param {Node[]} nodes - what the change added
 * @returns {Element[]}
 */
function newToasts(nodes) {
	const toasts = [];
	for (const node of nodes) {
		if (!(node instanceof Element)) continue;
		for (const toast of node.matches(TOAST_SELECTOR) ? [node] : node.querySelectorAll(TOAST_SELECTOR)) {
			if (toastsSeen.has(toast)) continue;
			toastsSeen.add(toast);
			toasts.push(toast);
		}
	}
	return toasts;
}

/**
 * Find out who is signed in, so your own join in another tab does not play
 * for you, and Preview draws your name. Called only from a click or key
 * press of the user's: in the Nick Effects section, in a choom's Nick
 * Effect dialog, or on Preview. Not from a render: the settings page draws
 * every section as it loads, shown or not, and the API's terms ban bots.
 * Asked again after each such, so a change of account is seen, but at most
 * once in OWN_USERNAME_RETRY_MS.
 * Side effects: asks the Cyberspace API; sets and saves ownUsername when it
 * answers.
 * @param {number} now - ms epoch
 */
function lookUpOwnUsername(now) {
	if (ownUsernameLookup || now - lastOwnUsernameLookup < OWN_USERNAME_RETRY_MS) return;
	lastOwnUsernameLookup = now;
	ownUsernameLookup = fetchOwnUsername()
		.then(username => {
			if (!isValidUsername(username)) return;
			ownUsername = username.toLowerCase();
			if (_GM_getValue(OWN_USERNAME_KEY, null) !== ownUsername) _GM_setValue(OWN_USERNAME_KEY, ownUsername);
		}, e => logDebug(NICK_EFFECTS_LOG_PREFIX + ' Could not tell who is signed in:', e.message))
		.finally(() => {
			ownUsernameLookup = null;
		});
}

/**
 * cIRC's user list on the page now.
 * @returns {Element|null} the element holding the names
 */
function findOnlineList() {
	if (watchedOnlineList?.isConnected) return watchedOnlineList;
	const heading = Array.from(document.querySelectorAll('div.uppercase'))
		.find(el => ONLINE_HEADING_PATTERN.test(el.textContent.trim()));
	return heading?.nextElementSibling ?? null;
}

/**
 * The names in a user list, each with its link.
 * @param {Element} list - from findOnlineList
 * @returns {Map<string, HTMLAnchorElement>} by lowercased username
 */
function onlineListNames(list) {
	const names = new Map();
	for (const link of list.querySelectorAll('a[href]')) {
		const match = link.getAttribute('href').match(/^\/([^/?#]+)$/);
		if (match && isValidUsername(match[1])) names.set(match[1].toLowerCase(), link);
	}
	return names;
}

/**
 * Compare the user list with the last read, and play the effect for each
 * choom new on it. The first read of a list, in a room, is who was already
 * there: nobody arrived.
 * Side effects: remembers the list; may play effects.
 */
function checkOnlineList() {
	const list = findOnlineList();
	if (!list) {
		watchedOnlineList = null;
		return;
	}
	const names = onlineListNames(list);
	const arrived = [...names.keys()].filter(name => !onlineUsers.has(name));
	// The list is never empty once loaded: you are on it
	const freshList = list !== watchedOnlineList || location.pathname !== watchedOnlinePath || !onlineUsers.size;
	const now = Date.now();
	if (!freshList) {
		for (const name of onlineUsers) {
			if (!names.has(name)) lastDepartures.set(name, now);
		}
	}
	watchedOnlineList = list;
	watchedOnlinePath = location.pathname;
	onlineUsers = new Set(names.keys());
	if (arrived.length && featureConfig.nickEffects) {
		logDebug(NICK_EFFECTS_LOG_PREFIX + ` New on the Online list: ${arrived.join(', ')}`
			+ (freshList ? ' (first read of this list: already here)' : arrived.length > MAX_EFFECTS_AT_ONCE ? ' (too many at once: taken for a reload)' : ''));
	}
	if (freshList || arrived.length > MAX_EFFECTS_AT_ONCE || !featureConfig.nickEffects) return;
	for (const name of arrived) noteEffect(name, names.get(name), now);
}

/**
 * Why a join line is not someone joining now, if it is not. Someone joining
 * is a row in a chat log that has settled, stamped about now, and not a
 * message someone typed.
 * @param {HTMLElement} line - the join line's text
 * @param {number} now - ms epoch
 * @returns {string|null} why it is not, for the debug log; null when it is
 */
function joinLineSkipReason(line, now) {
	const row = line.closest(CHAT_MESSAGE_SELECTOR);
	// A message names its sender with a link to them; cIRC's own lines do not.
	// Without this, typing "→ eve joined" would play eve's effect
	if (!row) return `not in a ${CHAT_MESSAGE_SELECTOR} row`;
	if (row.querySelector('a[href]')) return 'its row has a link, as a typed message does';
	const since = chatLogsSeen.get(row.parentElement);
	if (since === undefined) return 'its chat is new';
	if (now - since < CHAT_LOG_SETTLE_MS) return `its chat opened or switched rooms ${now - since} ms ago`;
	// Not by its place among the rows: cIRC lists the newest first, not last.
	// Rows that scrolling back loads are told apart by their old time stamps
	const time = Array.from(row.querySelectorAll('span'))
		.map(span => span.textContent.trim().match(CHAT_TIME_PATTERN)).find(Boolean);
	// A row without a time: the log and change size checks are all there is
	if (!time) return null;
	const [hours, minutes, seconds] = time.slice(1).map(Number);
	const stamped = ((hours * 60 + minutes) * 60 + seconds) * 1000;
	const day = 24 * 60 * 60 * 1000;
	// The site stamps lines in the reader's local time
	const date = new Date(now);
	const clock = ((date.getHours() * 60 + date.getMinutes()) * 60 + date.getSeconds()) * 1000;
	// Around midnight, 23:59:50 is ten seconds from 00:00:00
	const apart = Math.abs(clock - stamped);
	if (Math.min(apart, day - apart) > LIVE_JOIN_LINE_MS) return `stamped ${time[0]}, not about now`;
	return null;
}

/**
 * Remember each chat log on the page, or in what a change added, from when
 * it was first seen. A log cIRC empties or redraws for another room is
 * timed again by restartChatLogs.
 * Side effects: adds to chatLogsSeen.
 * @param {Node[]} nodes - where to look
 * @param {number} now - ms epoch
 */
function noteChatLogs(nodes, now) {
	for (const node of nodes) {
		if (!(node instanceof Element)) continue;
		const rows = node.matches(CHAT_MESSAGE_SELECTOR) ? [node] : node.querySelectorAll(CHAT_MESSAGE_SELECTOR);
		for (const row of rows) {
			if (row.parentElement && !chatLogsSeen.has(row.parentElement)) chatLogsSeen.set(row.parentElement, now);
		}
	}
}

/**
 * Time again each log a change emptied or took many rows from: a room
 * switch that keeps the log element and fills it with another room's lines.
 * Counted over the whole change, not per record: Vue removes a list's rows
 * one by one and adds the new ones in the same tick, so no one record, nor
 * the log as it is by now, shows the switch.
 * Side effects: updates chatLogsSeen.
 * @param {MutationRecord[]} records
 * @param {Node[]} added - what the change added
 * @param {number} now - ms epoch
 */
function restartChatLogs(records, added, now) {
	const removedFrom = new Map();
	for (const record of records) {
		const removed = Array.from(record.removedNodes).filter(node => node instanceof Element && node.matches(CHAT_MESSAGE_SELECTOR)).length;
		if (removed && record.target instanceof Element) removedFrom.set(record.target, (removedFrom.get(record.target) ?? 0) + removed);
	}
	const addedNow = new Set(added);
	for (const [log, removed] of removedFrom) {
		// Rows there before the change and still there
		const kept = Array.from(log.children).some(child => child.matches(CHAT_MESSAGE_SELECTOR) && !addedNow.has(child));
		if (!kept || removed > MAX_TRIMMED_ROWS) chatLogsSeen.set(log, now);
	}
}

/**
 * The join lines a change to the page added, when it is a live change:
 * one or a few new chat lines, not history loading.
 * @param {Node[]} nodes - what the change added
 * @returns {{name: string, line: HTMLElement}[]} name: lowercased username
 */
function addedJoinLines(nodes) {
	const added = nodes.filter(node => node instanceof Element);
	const size = added.reduce((count, node) => count + 1 + node.getElementsByTagName('*').length, 0);
	if (!added.length) return [];
	if (size > MAX_LIVE_CHANGE_ELEMENTS) {
		// Only in debug mode: reading a big change's text costs
		if (DEBUG && added.some(node => / joined/.test(node.textContent))) {
			logDebug(NICK_EFFECTS_LOG_PREFIX + ` A join line came in a change of ${size} elements, over ${MAX_LIVE_CHANGE_ELEMENTS}: taken for history`);
		}
		return [];
	}
	const lines = [];
	for (const node of added) {
		for (const span of [node, ...node.querySelectorAll('span')]) {
			if (span.tagName !== 'SPAN') continue;
			const match = span.textContent.trim().match(JOIN_LINE_PATTERN);
			if (match && isValidUsername(match[1])) lines.push({ name: match[1].toLowerCase(), line: span });
		}
	}
	if (DEBUG && !lines.length) {
		const text = added.map(node => node.textContent.trim()).find(text => / joined/.test(text));
		if (text) logDebug(NICK_EFFECTS_LOG_PREFIX + ' Text with "joined" that is not a join line:', JSON.stringify(text.slice(0, 120)));
	}
	return lines;
}

/**
 * Play the effect for each choom a live join line names.
 * Side effects: as noteEffect; notes the chat logs the change added, and
 * times again those it redrew.
 * @param {MutationRecord[]} records
 */
function checkJoinLines(records) {
	const now = Date.now();
	const added = records.flatMap(record => Array.from(record.addedNodes));
	restartChatLogs(records, added, now);
	// Before noting the logs: a log new in this change is still loading
	const lines = featureConfig.nickEffects ? addedJoinLines(added).filter(({ name, line }) => {
		const why = joinLineSkipReason(line, now);
		if (why) logDebug(NICK_EFFECTS_LOG_PREFIX + ` Join line for ${name} skipped: ${why}`);
		return !why;
	}) : [];
	noteChatLogs(added, now);
	if (lines.length > MAX_EFFECTS_AT_ONCE) {
		logDebug(NICK_EFFECTS_LOG_PREFIX + ` ${lines.length} join lines at once: taken for a reload`);
		return;
	}
	for (const { name, line } of lines) noteEffect(name, line, now);
}

/**
 * Watch cIRC's user list and its join lines for chooms joining. Called
 * once, by boot.
 * Side effects: observes the document for as long as the page lives.
 */
function watchEffects() {
	let queued = false;
	let toasts = [];
	new MutationObserver((records) => {
		// At once: what a change added is known only from its records
		checkJoinLines(records);
		if (featureConfig.nickEffects) toasts.push(...newToasts(records.flatMap(record => Array.from(record.addedNodes))));
		// A burst of chat lines is one check, after them. A toast's sender is
		// read then too, once the finder has marked its name
		if (queued) return;
		queued = true;
		setTimeout(() => {
			queued = false;
			checkOnlineList();
			const now = Date.now();
			for (const toast of toasts) {
				const sender = toastSender(toast);
				if (sender) noteNotification(sender.name, sender.element, now);
			}
			toasts = [];
		}, 0);
	}).observe(document.documentElement, { childList: true, subtree: true });
	noteChatLogs([document.documentElement], Date.now());
	newToasts([document.documentElement]);
	checkOnlineList();
	logDebug(NICK_EFFECTS_LOG_PREFIX + ' Watching the cIRC user list, join lines and notifications');
}

// =====================================================
// SETTINGS
// =====================================================

/**
 * A showWhen for the motions that have something.
 * @param {function(Object): boolean} has - gets an EFFECT_MOTIONS entry
 * @returns {{any: Object[]}}
 */
function motionsWhere(has) {
	return { any: EFFECT_MOTIONS.filter(has).map(choice => ({ field: 'motion', is: choice.value })) };
}

/**
 * The custom colors of an effect: a row for each, with a color picker, its
 * hex code and a remove button, then a button that adds one. The hex code
 * names each color in text, and takes a pasted one.
 * Side effects: each change calls onChange. Adding or removing a color
 * redraws the rows and moves focus: to the new color's picker, or to the
 * row now in the removed one's place.
 * @param {string[]} colors - hex colors, from sanitizeEffect
 * @param {function(string[]): void} onChange - gets every color, as changed
 * @returns {HTMLFieldSetElement}
 */
function effectColorList(colors, onChange) {
	let list = [...colors];
	const fieldset = document.createElement('fieldset');
	fieldset.className = uiClass('effect-colors');
	const legend = document.createElement('legend');
	legend.textContent = 'Colors';
	const rows = document.createElement('div');
	// Why a typed code was not kept. A status: focus has often moved on
	const error = document.createElement('div');
	error.className = 'hint';
	error.setAttribute('role', 'status');
	error.setAttribute('aria-live', 'polite');
	const add = document.createElement('button');
	add.type = 'button';
	add.className = uiClass('inline-btn');
	add.textContent = '+ Add color';
	add.addEventListener('click', () => {
		// A copy of the last, so a shade of it is one small change away
		list = [...list, list.at(-1) ?? EFFECT_PRESETS[DEFAULT_EFFECT_PRESET].colors[0]];
		onChange([...list]);
		draw();
		rows.querySelector('li:last-child [data-entry-control="picker"]').focus();
	});
	fieldset.append(legend, rows, error, add);

	// Keyed by place: a removed color's key goes to the row that takes its
	// place, which keeps focus (redrawEntryList)
	function draw() {
		rows.textContent = '';
		rows.append(entryList(list.map((color, i) => {
			const name = `Color ${i + 1}`;
			const picker = document.createElement('input');
			picker.type = 'color';
			picker.value = fullHexColor(color);
			picker.setAttribute('aria-label', name);
			picker.dataset.entryControl = 'picker';
			const hex = document.createElement('input');
			hex.type = 'text';
			hex.value = color;
			hex.spellcheck = false;
			hex.setAttribute('aria-label', `${name} hex code`);
			hex.dataset.entryControl = 'hex';
			// Neither redraws: a redraw would close the picker while it is
			// dragged, and take the control a click or Tab is moving to
			const set = (value) => {
				list[i] = value;
				error.textContent = '';
				onChange([...list]);
			};
			picker.addEventListener('input', () => {
				hex.value = picker.value;
				set(picker.value);
			});
			hex.addEventListener('change', () => {
				const typed = hex.value.trim().replace(/^#?/, '#').toLowerCase();
				if (!isEffectColor(typed)) {
					error.textContent = `${name} kept ${list[i]}: "${hex.value.trim()}" is not a hex code, such as #ff4d4d or #f00.`;
					hex.value = list[i];
					return;
				}
				hex.value = typed;
				picker.value = fullHexColor(typed);
				set(typed);
			});
			const remove = iconButton(TRASH_ICON_SVG, `Remove ${name.toLowerCase()}`, () => {
				list = list.filter((_, at) => at !== i);
				error.textContent = '';
				onChange([...list]);
				redrawEntryList(rows, draw, String(i), add);
			}, 'danger');
			remove.dataset.entryControl = 'remove';
			return { key: String(i), parts: [picker, hex, remove] };
		}), 'No colors.'));
		add.disabled = list.length >= MAX_EFFECT_COLORS;
	}
	draw();
	return fieldset;
}

/**
 * A preset's button in an editor, by name: names are the user's to type, so
 * not put in a selector.
 * @param {HTMLElement|null|undefined} root - holds the editor
 * @param {string} name
 * @returns {HTMLButtonElement|undefined}
 */
function presetButtonIn(root, name) {
	return Array.from(root?.querySelectorAll('[data-effect-preset]') ?? []).find(button => button.dataset.effectPreset === name);
}

/**
 * Ask for the name to save a preset under, in a dialog of its own.
 * Side effects: opens a dialog; Save closes it and calls onSave, or says
 * what to change.
 * @param {string} suggested - filled in: the user's own preset last picked,
 *   so changing one and saving it again replaces it
 * @param {function(string): void} onSave - gets the name, cleaned and valid
 */
function askPresetName(suggested, onSave) {
	const inputId = uiId('preset-name');
	const errorId = uiId('preset-name-error');
	const dialog = createDialog({
		title: 'Save Preset',
		width: '360px',
		onHelp: null,
		warning: '',
		attribution: [],
		content: `
			${createInputRow({ type: 'text', label: 'Preset name', id: inputId, value: suggested, stacked: true })}
			<div id="${errorId}" class="hint" role="status" aria-live="polite"></div>`,
		buttons: [
			{ label: 'CANCEL', class: 'cancel', onClick: (close) => close() },
			{ label: 'SAVE', class: 'save', onClick: (close) => {
				const name = cleanPresetName(input.value);
				const problem = presetNameProblem(name);
				if (problem) {
					error.textContent = problem;
					input.setAttribute('aria-invalid', 'true');
					input.focus();
					return;
				}
				close();
				onSave(name);
			} },
		],
	});
	const input = dialog.querySelector('#' + inputId);
	const error = dialog.querySelector('#' + errorId);
	input.maxLength = MAX_PRESET_NAME;
	input.setAttribute('aria-describedby', errorId);
	input.addEventListener('keydown', (e) => {
		if (e.key !== 'Enter') return;
		e.preventDefault();
		dialog.querySelector(`.${uiClass('dialog-footer')} button.save`).click();
	});
	input.focus();
	input.select();
}

/**
 * Play an effect from its Preview button. In a dialog, as a choom's Nick
 * Effect or the settings opened from the userscript menu, over the dialog,
 * where the user is looking. On the settings tab, where an effect would
 * play: in the chat, with cIRC open in the sidebar, or over the whole window.
 * Side effects: as playEffect.
 * @param {Object} effect - from sanitizeEffect
 * @param {HTMLElement} button - the Preview button: a burst starts from it
 * @param {string|null} username - whose name and nick color it shows; null
 *   for yours
 */
function previewEffect(effect, button, username) {
	lookUpOwnUsername(Date.now());
	// Theirs in their own effect; yours in the default, once Cyberspace has
	// said who you are: its letters, and its color where it is on the page
	const name = username ?? (ownUsername && spellingOf(ownUsername, nameElementOnPage(ownUsername))) ?? PREVIEW_NAME;
	const dialog = button.closest('.' + uiClass('dialog'));
	const area = (dialog && elementArea(dialog)) ?? effectArea(button);
	playEffect(effect, button, nickColorOf(nameElementOnPage(name)), area, name, true);
}

/**
 * The form for one effect: a preset button for each, every setting, then
 * Preview and Save preset, or those in the caller's place (options.buttons).
 * The default effect and a choom's own both use it.
 * Side effects: renders into container; each change calls onChange; a
 * preset redraws the form. Sets onclick on options.buttons on every render,
 * replacing any handler there. Saving or deleting a preset of the user's
 * own opens a dialog, saves to storage at once, wherever the form is, may
 * redraw the Nick Effects section, and moves focus.
 * @param {HTMLElement} container
 * @param {Object} effect - from sanitizeEffect
 * @param {function(Object): void} onChange - gets the effect as changed
 * @param {string|null} username - whose name and nick color Preview shows;
 *   null for yours (previewEffect)
 * @param {Object} [options]
 * @param {{preview: HTMLButtonElement, savePreset: HTMLButtonElement}|null} [options.buttons=null] -
 *   Preview and Save preset outside the form, as in a dialog's footer, for
 *   it to drive; null for its own, under the settings
 * @param {string|null} [options.picked=null] - the preset last picked:
 *   Save preset offers its name, when it is one of the user's own
 */
function renderEffectEditor(container, effect, onChange, username, { buttons = null, picked = null } = {}) {
	container.textContent = '';
	let current = effect;
	const redraw = (next, nextPicked) => renderEffectEditor(container, next, onChange, username, { buttons, picked: nextPicked });
	/**
	 * A button of the form's own, under the settings.
	 * @param {string} label
	 * @param {string} name - its class, after the effect- prefix
	 * @returns {HTMLButtonElement}
	 */
	const ownButton = (label, name) => {
		const button = document.createElement('button');
		button.type = 'button';
		button.className = uiClass('inline-btn', `effect-${name}`);
		button.textContent = label;
		return button;
	};
	// Preview is a button, not the engine's field, so a burst starts from it
	// where it plays over the whole window
	const preview = buttons?.preview ?? ownButton('Preview', 'preview');
	const save = buttons?.savePreset ?? ownButton('Save preset', 'save-preset');

	const presets = document.createElement('fieldset');
	presets.className = uiClass('effect-presets', 'chip-row');
	const legend = document.createElement('legend');
	legend.textContent = 'Presets';
	presets.append(legend);
	const presetButtons = effectPresetNames().map(name => {
		const button = document.createElement('button');
		button.type = 'button';
		button.className = uiClass('chip');
		button.dataset.effectPreset = name;
		button.textContent = name;
		button.addEventListener('click', () => {
			onChange(effectPreset(name));
			redraw(effectPreset(name), name);
			presetButtonIn(container, name).focus();
		});
		if (Object.hasOwn(EFFECT_PRESETS, name)) {
			presets.append(button);
			return button;
		}
		// The user's own: a delete button with it, kept on its line
		const saved = document.createElement('span');
		saved.className = uiClass('effect-saved-preset');
		saved.append(button, iconButton(TRASH_ICON_SVG, `Delete preset ${name}`, () => confirmAction({
			title: 'Delete Preset',
			message: `Delete the preset ${escapeHtml(name)}? Effects already set from it keep their settings.`,
			confirmLabel: 'DELETE',
			onConfirm: () => {
				replaceNickEffects({ ...nickEffects, presets: nickEffects.presets.filter(preset => preset.name !== name) });
				presetsChanged(null);
			},
		}), 'danger'));
		presets.append(saved);
		return button;
	});
	// Set, not added: buttons outside the form outlive each redraw, and each
	// must act on the form as it is now
	save.onclick = () => askPresetName(picked && savedPreset(picked) ? picked : '', name => {
		const store = () => {
			const others = nickEffects.presets.filter(preset => preset.name.toLowerCase() !== name.toLowerCase());
			const at = nickEffects.presets.findIndex(preset => preset.name.toLowerCase() === name.toLowerCase());
			const saved = { name, effect: sanitizeEffect(current) };
			// A replaced preset keeps its place among the buttons
			others.splice(at === -1 ? others.length : at, 0, saved);
			replaceNickEffects({ ...nickEffects, presets: others });
			presetsChanged(name);
		};
		if (!savedPreset(name)) return store();
		confirmAction({
			title: 'Replace Preset',
			message: `Replace the preset ${escapeHtml(savedPreset(name).name)} with these settings?`,
			confirmLabel: 'REPLACE',
			tone: 'caution',
			onConfirm: store,
		});
	});

	/**
	 * Show the presets as saved: in this editor, and from a choom's dialog,
	 * in the Nick Effects section too, which would otherwise show the old
	 * ones once the dialog closes.
	 * Side effects: redraws this editor, and may redraw the section; moves
	 * focus to the preset named, else to Save preset.
	 * @param {string|null} focusName - the preset just saved; null after a delete
	 */
	function presetsChanged(focusName) {
		// The section's own editor is this one: redrawing the section would
		// take it, and focus, away
		if (!settingsSectionFoldButton(container)) refreshSettingsSection(NICK_EFFECTS_SECTION_KEY);
		redraw(current, focusName ?? picked);
		// The redraw made a new Save preset, unless it is outside the form
		(focusName && presetButtonIn(container, focusName) || buttons?.savePreset || container.querySelector('.' + uiClass('effect-save-preset'))).focus();
	}
	const showPreset = () => {
		const pressed = effectPresetOf(current);
		presetButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.effectPreset === pressed)));
	};
	showPreset();

	preview.onclick = () => previewEffect(current, preview, username);
	/**
	 * The form's own Preview and Save preset, side by side under the settings.
	 * @returns {HTMLElement}
	 */
	const ownActions = () => {
		const actions = document.createElement('div');
		actions.className = uiClass('effect-actions');
		actions.append(preview, save);
		return actions;
	};

	const form = document.createElement('div');
	form.className = uiClass('effect-form');
	container.append(presets, form);
	const engine = createSettingsEngine({
		container: form,
		inlineSliders: true,
		values: current,
		schema: [{ type: 'section', label: 'Effect', noHr: true, fields: [
			{ key: 'useNickname', type: 'toggle', label: 'Use their nick name as the characters'},
			{ key: 'glyphs', type: 'text', label: 'Custom characters', placeholder: EFFECT_PRESETS[DEFAULT_EFFECT_PRESET].glyphs, sub: true,
				showWhen: { field: 'useNickname', is: false } },
			{ key: 'colorSource', type: 'select', label: 'Effect character colors match', options: EFFECT_COLOR_SOURCES },
			{ key: 'colors', type: 'custom', sub: true, showWhen: { field: 'colorSource', is: 'custom' },
				render: (colors, api) => effectColorList(colors, list => api.setFieldValue('colors', list)) },
			{ key: 'motion', type: 'select', label: 'Animation effect', options: EFFECT_MOTIONS },
			// Each motion's own settings, under it
			{ key: 'gravity', type: 'select', label: 'Gravity direction', options: EFFECT_DIRECTIONS, sub: true,
				showWhen: motionsWhere(choice => choice.gravity) },
			{ key: 'direction', type: 'select', label: 'Launch direction', options: EFFECT_DIRECTIONS, sub: true,
				showWhen: motionsWhere(choice => choice.direction) },
			{ key: 'rockets', type: 'slider', label: 'Rocket count', ...EFFECT_LIMITS.rockets, sub: true, showWhen: { field: 'motion', is: MOTION_SETTINGS.rockets }},
			{ key: 'rocketDistance', type: 'slider', label: 'Rocket distance (%)', ...EFFECT_LIMITS.rocketDistance, sub: true, showWhen: { field: 'motion', is: MOTION_SETTINGS.rocketDistance }},
			{ key: 'sprayDistance', type: 'slider', label: 'Spray distance (%)', ...EFFECT_LIMITS.sprayDistance, sub: true, showWhen: { field: 'motion', is: MOTION_SETTINGS.sprayDistance } },
			{ key: 'wobble', type: 'slider', label: 'Wobble (px)', ...EFFECT_LIMITS.wobble, sub: true, showWhen: { field: 'motion', is: MOTION_SETTINGS.wobble } },
			{ key: 'splash', type: 'toggle', label: 'Splash where it lands', sub: true, showWhen: { field: 'motion', is: MOTION_SETTINGS.splash } },
			{ key: 'spread', type: 'slider', label: 'Spread (degrees)', ...EFFECT_LIMITS.spread, sub: true, showWhen: { field: 'motion', is: MOTION_SETTINGS.spread } },
			{ key: 'amount', type: 'slider', label: 'Particle/Character count', ...EFFECT_LIMITS.amount },
			{ key: 'size', type: 'slider', label: 'Character Size (px)', ...EFFECT_LIMITS.size },
			{ key: 'duration', type: 'slider', label: 'Animation length (sec)', ...EFFECT_LIMITS.duration },
			{ key: 'easing', type: 'select', label: 'Animation easing', options: EFFECT_EASINGS },
			{ key: 'spin', type: 'slider', label: 'Character spin (degrees)', ...EFFECT_LIMITS.spin, showWhen: motionsWhere(choice => choice.spins) },
			{ key: 'drift', type: 'slider', label: 'Drift sideways (px)', ...EFFECT_LIMITS.drift, showWhen: motionsWhere(choice => choice.drifts) },
			{ key: 'stagger', type: 'slider', label: 'Stagger effects (%)', ...EFFECT_LIMITS.stagger },
			{ key: 'fadeOut', type: 'toggle', label: 'Fade out', showWhen: motionsWhere(choice => choice.fades) },
			...(buttons ? [] : [{ type: 'custom', render: ownActions }]),
		] }],
		onChange: (key, value) => {
			current = sanitizeEffect({ ...current, [key]: value });
			onChange(current);
			showPreset();
			// A new motion starts on its own launch: a firework going down is a
			// choice, not what was left from before. And each setting a motion
			// hides is kept at one value (sanitizeEffect) while its
			// control still shows the last: set the controls to what is saved.
			// Each setValue calls back here with that key
			if (key === 'motion') {
				const wanted = { direction: effectMotion(value).direction ?? current.direction, gravity: current.gravity, fadeOut: current.fadeOut,
					spin: current.spin, drift: current.drift,
					...Object.fromEntries(Object.keys(MOTION_SETTINGS).map(field => [field, current[field]])) };
				for (const [field, want] of Object.entries(wanted)) {
					const control = engine.getField(field);
					if (want !== current[field] || want !== control.getValue()) control.setValue(want);
				}
			}
		},
	});
	engine.render();
}

/**
 * The Nick Effects section of the settings tab: who it plays for, and the
 * default effect.
 * Side effects: renders into body; every change saves.
 * @param {HTMLElement} body - the section body from registerSettingsSection
 */
function renderNickEffectsSettings(body) {
	// Once the user works in the section, a moment to learn who they are,
	// so the next arrival can tell their own join from another's
	askWhoOnUse(body);
	body.innerHTML = `
		<div class="hint">Changes save as you make them. Per-user effects: right-click or long-press a username and choose Edit Effect.<br />
		<br />
		An effect plays when they join the cIRC room you have open. Using cIRC in the sidebar? Turn on <b>Show joins and leaves in cIRC</b> in the <b>Settings > Content</b> tab, or no effect will play. The effect below is your default effect: pick a preset to start from and customize to your heart's content.</div>
	`;
	const playFor = document.createElement('div');
	const editor = document.createElement('div');
	body.append(playFor, editor);
	createSettingsEngine({
		container: playFor,
		values: { playFor: nickEffects.playFor, onNotify: nickEffects.onNotify },
		schema: [
			{ key: 'playFor', type: 'select', label: 'Who animation effects play for', options: CHOOM_AUDIENCES},
			{ key: 'onNotify', type: 'toggle', label: 'Also play when they send me a notification' },
		],
		onChange: (key, value) => replaceNickEffects({ ...nickEffects, [key]: value }),
	}).render();
	renderEffectEditor(editor, nickEffects.default,
		effect => replaceNickEffects({ ...nickEffects, default: effect }), null);
}

/**
 * Look up who is signed in on the first click or key press inside el.
 * Side effects: listens on el, once each.
 * @param {HTMLElement} el
 */
function askWhoOnUse(el) {
	const ask = () => lookUpOwnUsername(Date.now());
	el.addEventListener('pointerdown', ask, { once: true });
	el.addEventListener('keydown', ask, { once: true });
}

/**
 * The Nick Effect dialog for one choom: Custom nick effect, a switch.
 * Off plays the default effect; on shows an effect of their own to change.
 * Side effects: opens a dialog; Save stores the choice.
 * @param {string} username - as the page spells it
 */
function createEffectDialog(username) {
	const key = username.toLowerCase();
	let custom = Object.hasOwn(nickEffects.users, key);
	let ownEffect = custom ? nickEffects.users[key] : nickEffects.default;
	const dialog = createDialog({
		title: `Nick Effect: ${escapeHtml(username)}`,
		width: '400px',
		onHelp: null,
		onSettings: () => openSettingsSection(NICK_EFFECTS_SECTION_KEY),
		content: `
			<div class="${uiClass('effect-choice')}"></div>
			<div class="${uiClass('effect-own')}"></div>`,
		buttons: [
			// In the footer, so they stay in reach however far the settings
			// scroll. The form drives them (renderEffectEditor)
			{ label: 'Preview', class: 'preview' },
			{ label: 'Save preset', class: 'save-preset' },
			{ label: 'Save', class: 'save', onClick: (close) => {
				const users = { ...nickEffects.users };
				if (custom && !Object.hasOwn(users, key) && Object.keys(users).length >= MAX_EFFECT_USERS) {
					alert(`You can give up to ${MAX_EFFECT_USERS} users a custom nick effect. Turn it off for someone first.`);
					return;
				}
				if (custom) users[key] = ownEffect;
				else delete users[key];
				replaceNickEffects({ ...nickEffects, users });
				close();
			} },
			{ label: 'Cancel', class: 'cancel', onClick: (close) => close() },
		],
	});
	const ownEditor = dialog.querySelector('.' + uiClass('effect-own'));
	const footerButton = (name) => dialog.querySelector(`.${uiClass('dialog-footer')} button.${name}`);
	const formButtons = { preview: footerButton('preview'), savePreset: footerButton('save-preset') };
	// Shown with the effect they act on: only theirs has settings to try
	const showOwn = () => {
		ownEditor.hidden = !custom;
		formButtons.preview.hidden = !custom;
		formButtons.savePreset.hidden = !custom;
	};
	const choice = dialog.querySelector('.' + uiClass('effect-choice'));
	createSettingsEngine({
		container: choice,
		values: { custom },
		schema: [
			{ key: 'custom', type: 'toggle', label: 'Custom nick effect',
				hint: `Off plays your default effect for @${escapeHtml(username)}. On plays the effect below.` },
		],
		onChange: (field, value) => {
			custom = value;
			showOwn();
		},
	}).render();
	renderEffectEditor(ownEditor, ownEffect, effect => { ownEffect = effect; }, username, { buttons: formButtons });
	showOwn();
	askWhoOnUse(dialog.el);
	choice.querySelector('input[type="checkbox"]').focus();
}

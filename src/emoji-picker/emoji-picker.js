// =====================================================
// EMOJI PICKER
// =====================================================
// A button after the chat's message input, in the ASCII art window, and in
// the site's editor, on /write and in a post's reply box, in place of its
// Emoticon button, opens a dialog of emoji, symbols, ASCII art characters,
// kaomoji and emoticons, in five tabs. A pick goes into the box at the
// cursor; the user sends it themselves. Each tab holds only what Cyberspace
// shows as sent (site-rule.js), less what the browser cannot draw
// (showsPick). The last picks of each kind show first.

const EMOJI_PICKER_LOG_PREFIX = featureLogPrefix('emoji-picker');

// Saved: the last picks, newest first, per tab
const EMOJI_RECENTS_KEY = 'emojiRecents';
const MAX_EMOJI_RECENTS = 24;

// The message input: on /chat, in the sidebar, and wherever else the site
// puts its send-a-message form. Its placeholder says message, as "Type a
// message..."; a search field's does not
const CHAT_MESSAGE_INPUT_SELECTOR = 'form input[type="text"][placeholder*="message" i]';
const EMOJI_BUTTON_CLASS = uiClass('emoji-button');

// A pixel smiley, in the text color. Decorative: the button is named
const EMOJI_BUTTON_SVG = '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" shape-rendering="crispEdges" aria-hidden="true" focusable="false">'
	+ '<rect x="5" y="1" width="6" height="1"/><rect x="3" y="2" width="2" height="1"/><rect x="11" y="2" width="2" height="1"/>'
	+ '<rect x="2" y="3" width="1" height="2"/><rect x="13" y="3" width="1" height="2"/><rect x="1" y="5" width="1" height="6"/>'
	+ '<rect x="14" y="5" width="1" height="6"/><rect x="2" y="11" width="1" height="2"/><rect x="13" y="11" width="1" height="2"/>'
	+ '<rect x="3" y="13" width="2" height="1"/><rect x="11" y="13" width="2" height="1"/><rect x="5" y="14" width="6" height="1"/>'
	+ '<rect x="5" y="5" width="2" height="2"/><rect x="9" y="5" width="2" height="2"/>'
	+ '<rect x="4" y="9" width="1" height="1"/><rect x="11" y="9" width="1" height="1"/><rect x="5" y="10" width="6" height="1"/></svg>';

// The tabs, in order. Emoji last: Cyberspace shows few as sent. value: the
// recents' kind and the panel's id part; one, many: what the search counts
const EMOJI_PICKER_TABS = [
	{ value: 'emoticons', label: 'Emoticons', one: 'emoticon', many: 'emoticons', placeholder: 'smile, wink, heart…' },
	{ value: 'kaomoji', label: 'Kaomoji', one: 'kaomoji', many: 'kaomoji', placeholder: 'happy, shrug, cat…' },
	{ value: 'symbols', label: 'Symbols', one: 'symbol', many: 'symbols', placeholder: 'fish, arrow, card…' },
	{ value: 'ascii', label: 'ASCII art', one: 'character', many: 'characters', placeholder: 'double, shade, braille…' },
	{ value: 'emoji', label: 'Emoji', one: 'emoji', many: 'emoji', placeholder: 'star, clock, cool…' },
];

// The recents as read from storage, not yet checked
let storedEmojiRecents = null;
// By kind, the last picks, newest first, checked (currentEmojiRecents); null
// until first needed: checking parses every list, which a page that never
// opens the picker has no use for
let emojiRecents = null;
// By the box the picker serves, the tab it opened on last, for this page:
// the chat starts on the first, the art window on its own tab, and the
// editor on Kaomoji, as the picker stands in for its list of kaomoji
const lastEmojiPickerTabs = { chat: 'emoticons', art: 'ascii', editor: 'kaomoji' };
// Set by boot: until then, as on an excluded page, no button is drawn
let emojiPickerBooted = false;

// Read from the lists once, when first needed
const groupsByKind = new Map();
const pickNamesByKind = new Map();
const pickKeywordsByKind = new Map();

/**
 * Generated pairs, as [text, words].
 * @param {string} pairs - "text words" pairs joined by |
 * @returns {Array<[string, string]>}
 */
function parsePairs(pairs) {
	return pairs.split('|').map(pair => {
		const space = pair.indexOf(' ');
		return [pair.slice(0, space), pair.slice(space + 1)];
	});
}

/**
 * A generated list's groups, as [text, name] picks.
 * @param {{name: string, picks: string}[]} groups - "text name" pairs joined by |
 * @returns {{name: string, picks: Array<[string, string]>}[]}
 */
function parseGroups(groups) {
	return groups.map(group => ({ name: group.name, picks: parsePairs(group.picks) }));
}

/**
 * A tab's groups of picks. Each list holds only what the site shows as sent:
 * the generated ones by the generator, the kaomoji and emoticons by their test.
 * @param {string} kind - an EMOJI_PICKER_TABS value
 * @returns {{name: string, picks: Array<[string, string, string?]>}[]} the same list each call
 */
function pickGroupsOf(kind) {
	if (!groupsByKind.has(kind)) {
		groupsByKind.set(kind, kind === 'emoji' ? parseGroups(EMOJI_GROUPS)
			: kind === 'symbols' ? parseGroups(SYMBOL_GROUPS)
			: kind === 'ascii' ? parseGroups(ASCII_ART_GROUPS)
			: kind === 'emoticons' ? EMOTICON_GROUPS
			: KAOMOJI_GROUPS);
	}
	return groupsByKind.get(kind);
}

/**
 * The name of each pick of a kind, by its text: what a screen reader says
 * for a recent one, and the list a saved recent must be in.
 * @param {string} kind - an EMOJI_PICKER_TABS value
 * @returns {Map<string, string>}
 */
function pickNames(kind) {
	if (!pickNamesByKind.has(kind)) pickNamesByKind.set(kind, new Map(pickGroupsOf(kind).flatMap(group => group.picks)));
	return pickNamesByKind.get(kind);
}

/**
 * The search keywords of each pick of a kind that has any, by its text:
 * words its name does not have, as zap for ⚡ or lol for XD. The generated
 * lists' come from CLDR_KEYWORDS; the hand-written lists' are each pick's third item.
 * @param {string} kind - an EMOJI_PICKER_TABS value
 * @returns {Map<string, string>} the words joined by spaces
 */
function pickKeywords(kind) {
	if (!pickKeywordsByKind.has(kind)) {
		pickKeywordsByKind.set(kind, new Map(kind === 'emoticons' || kind === 'kaomoji'
			? pickGroupsOf(kind).flatMap(group => group.picks).filter(([, , words]) => words).map(([text, , words]) => [text, words])
			: parsePairs(CLDR_KEYWORDS)));
	}
	return pickKeywordsByKind.get(kind);
}

/**
 * The recents from storage or a settings file: picks still in the lists,
 * once each, up to MAX_EMOJI_RECENTS of each kind.
 * @param {*} data - by EMOJI_PICKER_TABS value, as { emoji, symbols, ascii, kaomoji, emoticons }
 * @returns {Object<string, string[]>} by EMOJI_PICKER_TABS value
 */
function sanitizeEmojiRecents(data) {
	return Object.fromEntries(EMOJI_PICKER_TABS.map(({ value: kind }) => {
		const names = pickNames(kind);
		const list = Array.isArray(data?.[kind]) ? data[kind] : [];
		return [kind, [...new Set(list.filter(text => typeof text === 'string' && names.has(text)))].slice(0, MAX_EMOJI_RECENTS)];
	}));
}

/**
 * Read the recents from storage, to be checked when first needed.
 * Side effects: replaces storedEmojiRecents; clears emojiRecents.
 */
function loadEmojiRecents() {
	try {
		storedEmojiRecents = JSON.parse(_GM_getValue(EMOJI_RECENTS_KEY, 'null'));
	} catch (e) {
		storedEmojiRecents = null;
	}
	emojiRecents = null;
}

/**
 * The recents, checked against the lists the first time they are asked for.
 * Side effects: sets emojiRecents, the first time.
 * @returns {Object<string, string[]>} by EMOJI_PICKER_TABS value
 */
function currentEmojiRecents() {
	if (!emojiRecents) emojiRecents = sanitizeEmojiRecents(storedEmojiRecents);
	return emojiRecents;
}
// At load, as every feature reads its settings: with sync storage
// (Tampermonkey) nothing reads it again
loadEmojiRecents();

/**
 * Replace the recents, and save them.
 * Side effects: replaces emojiRecents; writes storage.
 * @param {*} data - checked here; null for none
 */
function replaceEmojiRecents(data) {
	emojiRecents = sanitizeEmojiRecents(data);
	_GM_setValue(EMOJI_RECENTS_KEY, JSON.stringify(emojiRecents));
}

/**
 * Put a pick first among its kind's recents.
 * Side effects: as replaceEmojiRecents.
 * @param {string} kind - an EMOJI_PICKER_TABS value
 * @param {string} text
 */
function rememberPick(kind, text) {
	const recents = currentEmojiRecents();
	replaceEmojiRecents({ ...recents, [kind]: [text, ...recents[kind].filter(other => other !== text)] });
}

// =====================================================
// WHAT THE BROWSER CAN DRAW
// =====================================================

// The emoji fonts the picks draw in (pickButton), so the check below asks
// about the same fonts: the theme's pixel fonts have no emoji
const EMOJI_FONT_FAMILY = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

// The canvas each check draws on
let glyphCanvas = null;
// By canvas context, what its checks found, all page long: what a browser
// can draw does not change while the page is open. By context, so a test's
// canvas starts with nothing found
const glyphFindings = new WeakMap();
const GLYPH_PX = 24;

/**
 * The canvas a glyph check draws on, with what it has found so far.
 * A browser that hides the canvas from fingerprinting, as Tor Browser or
 * LibreWolf, gives back blank or noise, the same for any text: each check
 * would take every character for missing and empty the tabs. So the canvas
 * is trusted only if A, which every font has, comes out unlike the box of
 * U+FFFF, which none has.
 * Side effects: makes the canvas, and draws on it, the first time.
 * @returns {{ctx: CanvasRenderingContext2D, checks: Map<string, boolean>,
 *   boxes: Map<string, Array<string|null>>, emojiWidth: number|null}|null}
 *   checks: by key, whether it draws; boxes: by font, the ink of the boxes
 *   a character with no font draws; emojiWidth: how wide one emoji draws,
 *   set by the first emoji check. null where nothing can tell: no canvas,
 *   as in a test without one, or one that does not give back what it drew
 */
function glyphCanvasFindings() {
	if (!glyphCanvas) {
		glyphCanvas = document.createElement('canvas');
		glyphCanvas.width = GLYPH_PX * 2;
		glyphCanvas.height = GLYPH_PX * 2;
	}
	let ctx;
	try {
		ctx = glyphCanvas.getContext('2d', { willReadFrequently: true });
	} catch (e) {
		return null;
	}
	if (typeof ctx?.getImageData !== 'function') return null;
	if (!glyphFindings.has(ctx)) {
		const letter = drawAlone(ctx, 'A', 'sans-serif').ink;
		const reads = letter !== null && letter !== drawAlone(ctx, '\uFFFF', 'sans-serif').ink;
		glyphFindings.set(ctx, reads ? { ctx, checks: new Map(), boxes: new Map(), emojiWidth: null } : null);
	}
	return glyphFindings.get(ctx);
}

/**
 * Draw text alone, in black, and read back what came out.
 * Side effects: draws on the canvas; leaves its font set to family.
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {string} family - a CSS font-family list
 * @returns {{ink: string|null, colored: boolean}} ink: the bounds of what
 *   was drawn, as "left,top,right,bottom", null for nothing; colored:
 *   whether any of it is not gray, as a color emoji is
 */
function drawAlone(ctx, text, family) {
	const size = GLYPH_PX * 2;
	ctx.clearRect(0, 0, size, size);
	ctx.font = `${GLYPH_PX}px ${family}`;
	ctx.textBaseline = 'top';
	ctx.fillStyle = '#000';
	ctx.fillText(text, 0, 0);
	const { data } = ctx.getImageData(0, 0, size, size);
	let left = size, top = size, right = -1, bottom = -1, colored = false;
	for (let i = 0; i < data.length; i += 4) {
		if (!data[i + 3]) continue;
		const x = (i / 4) % size;
		const y = Math.floor(i / 4 / size);
		left = Math.min(left, x);
		right = Math.max(right, x);
		top = Math.min(top, y);
		bottom = Math.max(bottom, y);
		if (data[i] !== data[i + 1] || data[i + 1] !== data[i + 2]) colored = true;
	}
	return { ink: right < 0 ? null : `${left},${top},${right},${bottom}`, colored };
}

/**
 * Whether drawn ink is the box a character with no font draws. Compared by
 * its bounds, not its pixels: Firefox writes the missing code point inside
 * the box, so missing code points of one length draw boxes of one size.
 * Side effects: draws the boxes, the first time for a font.
 * @param {{ctx: CanvasRenderingContext2D, boxes: Map<string, Array<string|null>>}} found - from glyphCanvasFindings
 * @param {string|null} ink - from drawAlone
 * @param {string} family - the font it was drawn in
 * @returns {boolean}
 */
function isMissingBox(found, ink, family) {
	// Never characters, so every font draws their boxes: U+FFFF's, the size
	// of a missing character's up to it, as a kaomoji's, and U+1FFFF's, the
	// size of one past it, as an emoji's
	if (!found.boxes.has(family)) found.boxes.set(family, ['\uFFFF', '\u{1FFFF}'].map(box => drawAlone(found.ctx, box, family).ink));
	return ink === null || found.boxes.get(family).includes(ink);
}

/**
 * Whether the browser draws one character of a kaomoji, in the page's font
 * or a system one.
 * @param {string} glyph - one character, without marks
 * @param {string} family - the page's CSS font-family list
 * @returns {boolean} true where nothing can tell (glyphCanvasFindings)
 */
function drawsGlyph(glyph, family) {
	const found = glyphCanvasFindings();
	if (!found) return true;
	const key = `k:${family}:${glyph}`;
	if (!found.checks.has(key)) found.checks.set(key, !isMissingBox(found, drawAlone(found.ctx, glyph, family).ink, family));
	return found.checks.get(key);
}

/**
 * Whether the browser draws an emoji as one emoji: in color, or, for one
 * gray by design as ⬜, as anything but the missing box. A sequence the
 * system does not know, as a keycap, draws as its parts, side by side,
 * wider than one emoji.
 * @param {string} emoji
 * @returns {boolean} true where nothing can tell (glyphCanvasFindings)
 */
function drawsEmoji(emoji) {
	const found = glyphCanvasFindings();
	if (!found) return true;
	const key = `e:${emoji}`;
	if (found.checks.has(key)) return found.checks.get(key);
	const { ctx } = found;
	if (found.emojiWidth === null) {
		drawAlone(ctx, '😀', EMOJI_FONT_FAMILY);
		found.emojiWidth = ctx.measureText('😀').width;
	}
	const { ink, colored } = drawAlone(ctx, emoji, EMOJI_FONT_FAMILY);
	const asParts = ctx.measureText(emoji).width > found.emojiWidth * 1.5;
	const draws = !asParts && (colored || !isMissingBox(found, ink, EMOJI_FONT_FAMILY));
	found.checks.set(key, draws);
	return draws;
}

/**
 * Whether the picker shows a pick of a kind: one the browser draws.
 * @param {string} kind - an EMOJI_PICKER_TABS value
 * @param {string} text
 * @returns {boolean}
 */
function showsPick(kind, text) {
	return kind === 'emoji' ? drawsEmoji(text) : drawsText(text);
}

// Characters that draw no ink by design, so a check would take them for
// missing: the braille blank, which dot art rows are lined up with
const BLANK_BY_DESIGN = /^[\u2800]+$/;

/**
 * Whether the browser draws every character of a symbol, an ASCII art
 * character, a kaomoji or an emoticon. A mark is drawn on the character it
 * follows, and plain ASCII, spaces and BLANK_BY_DESIGN always draw, so a
 * character is checked without its marks, and those not at all.
 * @param {string} text
 * @returns {boolean}
 */
function drawsText(text) {
	const family = getComputedStyle(document.body).fontFamily || 'sans-serif';
	return splitGlyphs(text).every(glyph => {
		const base = glyph.replace(/\p{M}/gu, '');
		return !base || /^[\x20-\x7e]+$/.test(base) || BLANK_BY_DESIGN.test(base) || drawsGlyph(base, family);
	});
}

// =====================================================
// THE BUTTONS: IN THE CHAT, THE ASCII ART WINDOW AND THE EDITOR
// =====================================================

// The window /art opens in the chat: its art box, in the site's DOS frame
const ASCII_ART_FIELD_SELECTOR = '.dos-frame textarea[placeholder*="ASCII art" i]';
// The site's editor, on /write and in a post's reply box: its toolbar's
// Emoticon button, a list of a few kaomoji, which the picker's button stands
// in for. By the editor's own markup, not the page: a post's address is
// /<username>/<post>, which no path rule can tell from a profile's
const EDITOR_EMOTICON_SELECTOR = '.editor > .menu-bar button[title="Emoticon"]';

// Each field a button is drawn for, to its button, and back
const emojiFieldButtons = new WeakMap();
const emojiButtonFields = new WeakMap();
// Each site button an emoji button stands in for, while it is hidden, to the
// inline display it had of its own, given back when it is shown again. By the
// site's button, not ours: the site may draw that one again on its own
const hiddenSiteButtons = new Map();

/**
 * Whether a field is a rich-text editor, which takes text by paste rather
 * than by value.
 * @param {Element} field
 * @returns {boolean}
 */
function isEditorField(field) {
	return field.getAttribute('contenteditable') === 'true';
}

/**
 * A message form's own send button.
 * @param {HTMLFormElement} form
 * @returns {HTMLButtonElement|null}
 */
function chatSendButton(form) {
	return form.querySelector(':scope > button[type="submit"]');
}

/**
 * The site's message inputs on the page now: each in a form with a send
 * button of its own.
 * @returns {HTMLInputElement[]}
 */
function chatMessageInputs() {
	return Array.from(document.querySelectorAll(CHAT_MESSAGE_INPUT_SELECTOR))
		// Its own form, around it: one named by a form attribute could be
		// anywhere, and the button goes inside the form that holds the input
		.filter(input => input.form?.contains(input) && chatSendButton(input.form));
}

/**
 * The ASCII art window's Cancel and Send buttons, which sit together in a
 * bordered group.
 * @param {HTMLTextAreaElement} field - the art box
 * @returns {HTMLElement|null} the group; null when the window has none yet
 */
function asciiArtButtonGroup(field) {
	const send = Array.from(field.closest('.dos-frame').querySelectorAll('button')).find(button => button.textContent.trim() === 'Send');
	return send?.parentElement ?? null;
}

/**
 * Every field an emoji button serves, with where its button goes and whose
 * look it takes.
 * - A chat message input: after the part of its form that holds it, before
 *   the image and send buttons; drawn as the send button.
 * - The ASCII art box: before its Cancel and Send group; drawn as Cancel,
 *   with the group's border of its own.
 * - The site's editor, on /write and in a reply box: in its toolbar, in
 *   place of the Emoticon button, which it hides; drawn as that button.
 * @returns {{field: HTMLElement, box: 'chat'|'art'|'editor', place: function(HTMLButtonElement): void, looksLike: HTMLButtonElement, border: boolean, replaces?: HTMLButtonElement}[]}
 */
function emojiTargets() {
	const chats = chatMessageInputs().map(input => {
		let anchor = input;
		while (anchor.parentElement !== input.form) anchor = anchor.parentElement;
		return { field: input, box: 'chat', place: button => anchor.after(button), looksLike: chatSendButton(input.form), border: false };
	});
	const art = Array.from(document.querySelectorAll(ASCII_ART_FIELD_SELECTOR)).map(field => {
		const group = asciiArtButtonGroup(field);
		return group && { field, box: 'art', place: button => group.before(button), looksLike: group.querySelector('button'), border: true };
	}).filter(Boolean);
	const editors = Array.from(document.querySelectorAll(EDITOR_EMOTICON_SELECTOR)).map(siteButton => {
		const field = siteButton.closest('.editor')?.querySelector('.ProseMirror[contenteditable="true"]');
		return field && { field, box: 'editor', looksLike: siteButton, border: false, replaces: siteButton, place: button => siteButton.after(button) };
	}).filter(Boolean);
	return [...chats, ...art, ...editors];
}

/**
 * Hide a site button an emoji button stands in for, keeping the inline
 * display it has of its own. Inline and important: the site's toolbar styles
 * set a display on its buttons, which outweighs the hidden attribute.
 * Side effects: sets the button's inline display; records it in hiddenSiteButtons.
 * @param {HTMLButtonElement} siteButton
 */
function hideSiteButton(siteButton) {
	hiddenSiteButtons.set(siteButton, {
		value: siteButton.style.getPropertyValue('display'),
		priority: siteButton.style.getPropertyPriority('display'),
	});
	siteButton.style.setProperty('display', 'none', 'important');
}

/**
 * Whether a site button is hidden as hideSiteButton hides it. The site may
 * set its display again, as its framework redraws the toolbar.
 * @param {HTMLButtonElement} siteButton
 * @returns {boolean}
 */
function isSiteButtonHidden(siteButton) {
	return hiddenSiteButtons.has(siteButton)
		&& siteButton.style.getPropertyValue('display') === 'none'
		&& siteButton.style.getPropertyPriority('display') === 'important';
}

/**
 * Show each hidden site button no emoji button stands in for any more, with
 * the inline display it had of its own, and forget it. One the site took out
 * of the page is shown too: the site may put the same button back.
 * Side effects: may set site buttons' inline display; prunes hiddenSiteButtons.
 * @param {Set<HTMLButtonElement>} replaced - the site buttons still stood in for
 */
function showSiteButtons(replaced) {
	for (const [siteButton, { value, priority }] of hiddenSiteButtons) {
		if (replaced.has(siteButton)) continue;
		hiddenSiteButtons.delete(siteButton);
		if (value) siteButton.style.setProperty('display', value, priority);
		else siteButton.style.removeProperty('display');
	}
}

/**
 * Put an emoji button by each field it serves, or take them away: while the
 * feature is on. The site redraws the chat as rooms change and cIRC moves
 * in and out of the sidebar, opens and closes the ASCII art window, and
 * redraws its editor's toolbar, so this runs on every such change.
 * Side effects: adds or removes buttons in the site's markup; hides the site
 * buttons they stand in for and shows the rest again, by their inline
 * display; adds to and prunes hiddenSiteButtons.
 */
function drawEmojiButtons() {
	const targets = emojiPickerBooted && featureConfig.emojiPicker ? emojiTargets() : [];
	const fields = new Set(targets.map(target => target.field));
	document.querySelectorAll('.' + EMOJI_BUTTON_CLASS).forEach(button => {
		const field = emojiButtonFields.get(button);
		if (!fields.has(field) || emojiFieldButtons.get(field) !== button) button.remove();
	});
	showSiteButtons(new Set(targets.map(target => target.replaces).filter(Boolean)));
	for (const target of targets) {
		// Every pass: the site may have drawn its button again
		if (target.replaces && !isSiteButtonHidden(target.replaces)) hideSiteButton(target.replaces);
		if (emojiFieldButtons.get(target.field)?.isConnected) continue;
		const button = emojiButtonFor(target);
		target.place(button);
		emojiFieldButtons.set(target.field, button);
		emojiButtonFields.set(button, target.field);
	}
}

/**
 * The emoji button for one field, drawn as a button beside it is, so it
 * takes the theme's look.
 * @param {{field: HTMLElement, box: 'chat'|'art'|'editor', looksLike: HTMLButtonElement, border: boolean}} target - from emojiTargets
 * @returns {HTMLButtonElement}
 */
function emojiButtonFor({ field, box, looksLike, border }) {
	const button = document.createElement('button');
	button.type = 'button';
	// The site's classes first: its disabled look, as the send button has
	// while the input is empty, must not come with them; nor Cancel's dim
	// text, too faint for a button on its own
	const classes = looksLike.className.split(/\s+/).filter(name => name && !name.startsWith('disabled:') && name !== 'text-fg-dim');
	if (border) classes.push('text-fg', 'border', 'border-border', 'rounded-md', uiClass('emoji-button-apart'));
	button.className = [...classes, EMOJI_BUTTON_CLASS].join(' ');
	// The site's scoped styles find their buttons by these
	for (const { name, value } of looksLike.attributes) if (name.startsWith('data-v-')) button.setAttribute(name, value);
	button.setAttribute('aria-label', 'Insert emoji, a symbol, ASCII art, kaomoji or an emoticon');
	button.setAttribute('aria-haspopup', 'dialog');
	button.title = 'Emoji, symbols, ASCII art, kaomoji and emoticons';
	button.innerHTML = EMOJI_BUTTON_SVG;
	if (!isEditorField(field)) {
		button.addEventListener('click', () => openEmojiPicker(field, box, null));
		return button;
	}
	// An editor's cursor in the page is its selection, which a click elsewhere
	// may move: kept as the pointer goes down on the button, or at the click
	// from the keyboard, and given back before the paste. ProseMirror also
	// keeps a cursor of its own, which the button does not move
	let range = null;
	const keepRange = () => {
		const selection = field.ownerDocument.getSelection();
		if (selection?.rangeCount && field.contains(selection.getRangeAt(0).commonAncestorContainer)) range = selection.getRangeAt(0).cloneRange();
	};
	button.addEventListener('pointerdown', keepRange);
	button.addEventListener('click', () => {
		keepRange();
		openEmojiPicker(field, box, range);
		range = null;
	});
	return button;
}

/**
 * Keep a button by each field as the site redraws the page. Called once,
 * by boot.
 * Side effects: observes the document for as long as the page lives.
 */
function watchEmojiFields() {
	emojiPickerBooted = true;
	new MutationObserver(() => {
		if (!featureConfig.emojiPicker) return;
		// Most changes are chat lines: only a field without its button, a
		// button whose field went, or a hidden site button the site took out
		// of the page needs a redraw. That last holds its whole editor in
		// hiddenSiteButtons until the redraw lets it go
		const targets = emojiTargets();
		const unplaced = targets.some(target => !emojiFieldButtons.get(target.field)?.isConnected
			|| (target.replaces && !isSiteButtonHidden(target.replaces)));
		const stray = document.querySelectorAll('.' + EMOJI_BUTTON_CLASS).length !== targets.length
			|| Array.from(hiddenSiteButtons.keys()).some(siteButton => !siteButton.isConnected);
		if (unplaced || stray) drawEmojiButtons();
	// style too: the site's framework may show its Emoticon button again by its style
	}).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
	logDebug(EMOJI_PICKER_LOG_PREFIX + ' Watching for chat inputs, the ASCII art window and the editor');
}

/**
 * Put text into a field where its selection was, as typing would, so the
 * site's own handling sees it.
 * Side effects: changes the field's value and selection; fires its input
 * event; for an editor, as pasteIntoEditor.
 * @param {HTMLElement} input - a chat input, the art box or the editor
 * @param {string} text
 * @param {{start: number, end: number}|Range|null} selection - what to replace:
 *   offsets in an input; a range in an editor, null for where it is
 * @returns {boolean} false when nothing changed: it would pass the input's
 *   maxlength, or the editor did not take it
 */
function insertIntoField(input, text, selection) {
	if (isEditorField(input)) return pasteIntoEditor(input, text, selection);
	const length = input.value.length;
	const start = Math.min(selection.start, length);
	const end = Math.min(Math.max(selection.end, start), length);
	if (input.maxLength > 0 && length - (end - start) + text.length > input.maxLength) return false;
	input.setRangeText(text, start, end, 'end');
	// The site's input binding listens for this, as it does for typing
	input.dispatchEvent(new Event('input', { bubbles: true }));
	return true;
}

/**
 * Put text into a rich-text editor at a range, as a paste: the editor
 * (ProseMirror, on /write and in replies) keeps its own document and turns
 * a paste into its own change, where a change to its DOM would be undone.
 * Side effects: focuses the editor; sets its selection; sends it a paste event.
 * @param {HTMLElement} editor
 * @param {string} text
 * @param {Range|null} range - where; null for the editor's own selection
 * @returns {boolean} whether the editor took it
 */
function pasteIntoEditor(editor, text, range) {
	editor.focus();
	const selection = editor.ownerDocument.getSelection();
	if (range && selection) {
		selection.removeAllRanges();
		selection.addRange(range);
	}
	let data = null;
	if (typeof DataTransfer === 'function') {
		data = new DataTransfer();
		data.setData('text/plain', text);
	}
	let event = null;
	try {
		event = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true });
	} catch (e) { /* no ClipboardEvent: the plain event below */ }
	// A browser that cannot build one with its data, or a test without it,
	// gets the data set on a plain event, as the editor reads it
	if (!event?.clipboardData) {
		event = new Event('paste', { bubbles: true, cancelable: true });
		Object.defineProperty(event, 'clipboardData', { value: data ?? {
			getData: type => (type === 'text/plain' ? text : ''), types: ['text/plain'], files: [], items: [],
		} });
	}
	editor.dispatchEvent(event);
	// The editor stops the browser's own paste when it makes the change itself
	return event.defaultPrevented;
}

// =====================================================
// THE DIALOG
// =====================================================

/**
 * Open the picker for a field. A pick goes in at the field's cursor, or over
 * what was selected, and the dialog closes with focus back in the field,
 * after the pick.
 * Side effects: opens a dialog; a pick changes the field and the recents.
 * @param {HTMLElement} input - a chat input, the art box or the editor
 * @param {'chat'|'art'|'editor'} box - which: each opens on the tab it used last
 * @param {Range|null} editorRange - for the editor, where its cursor was
 */
function openEmojiPicker(input, box, editorRange) {
	// Read now, at the click: the search box takes focus next, and a
	// redraw of the chat would take the input with it
	const selection = isEditorField(input) ? editorRange
		: { start: input.selectionStart ?? input.value.length, end: input.selectionEnd ?? input.value.length };
	const tabsId = uiId('emoji-tabs');
	const statusId = uiId('emoji-status');
	const dialog = createDialog({
		title: 'Emoji',
		width: '420px',
		onHelp: null,
		onSettings: null,
		header: `<div class="${uiClass('emoji-tabs')}" role="tablist" aria-label="Kind" id="${tabsId}"></div>`,
		content: `
			<div id="${statusId}" class="hint ${uiClass('emoji-status')}" role="status" aria-live="polite"></div>`,
		buttons: [{ label: 'Close', class: 'cancel', onClick: (close) => close() }],
	});
	const tablist = dialog.querySelector('#' + tabsId);
	const status = dialog.querySelector('#' + statusId);

	/**
	 * Put a pick into the input, and close.
	 * Side effects: as insertIntoField and rememberPick; closes the
	 * dialog and focuses the input; or says why not.
	 * @param {string} kind - an EMOJI_PICKER_TABS value
	 * @param {string} text
	 */
	const pick = (kind, text) => {
		// The site may have drawn the chat again while the picker was open,
		// as when cIRC moves to or from the sidebar: the input is gone
		if (!input.isConnected) {
			status.textContent = 'The page was redrawn. Close this, then open the picker again from the button by the box you were typing in.';
			return;
		}
		if (!insertIntoField(input, text, selection)) {
			status.textContent = isEditorField(input)
				? 'The editor did not take it. Close this, click where it should go in your writing, then try again.'
				: `That would make your message longer than its ${input.maxLength} characters.`;
			return;
		}
		rememberPick(kind, text);
		dialog.close();
		input.focus();
	};

	const panels = EMOJI_PICKER_TABS.map((kind) => {
		const { value, label } = kind;
		const tab = document.createElement('button');
		tab.type = 'button';
		tab.id = uiId(`emoji-tab-${value}`);
		tab.className = uiClass('emoji-tab');
		tab.setAttribute('role', 'tab');
		tab.textContent = label;
		tab.dataset.tab = value;
		// Filled the first time it shows (showTab): each pick is checked against
		// what the browser draws, and the Symbols tab has thousands
		const panel = document.createElement('div');
		panel.className = uiClass('emoji-panel');
		panel.id = uiId(`emoji-panel-${value}`);
		panel.setAttribute('role', 'tabpanel');
		panel.setAttribute('aria-labelledby', tab.id);
		tab.setAttribute('aria-controls', panel.id);
		tab.addEventListener('click', () => showTab(value));
		tablist.append(tab);
		status.before(panel);
		return { kind, value, tab, panel, filled: false };
	});

	/**
	 * Show one tab's panel.
	 * Side effects: sets each tab's selected state and roving focus; hides
	 * the other panels; remembers the tab for next time.
	 * @param {string} value - an EMOJI_PICKER_TABS value
	 */
	function showTab(value) {
		lastEmojiPickerTabs[box] = value;
		for (const entry of panels) {
			const { value: other, tab, panel } = entry;
			const selected = other === value;
			if (selected && !entry.filled) {
				fillPickPanel(panel, entry.kind, pick, status);
				entry.filled = true;
			}
			tab.setAttribute('aria-selected', String(selected));
			// The status is one for every tab: it says what this one's search found
			if (selected) status.textContent = panel.dataset.status ?? '';
			tab.tabIndex = selected ? 0 : -1;
			panel.hidden = !selected;
		}
	}
	// The tab pattern: arrows move between tabs, and show the one moved to
	tablist.addEventListener('keydown', (e) => {
		const at = panels.findIndex(({ tab }) => tab === document.activeElement);
		const to = { ArrowRight: at + 1, ArrowLeft: at - 1, Home: 0, End: panels.length - 1 }[e.key];
		if (at === -1 || to === undefined) return;
		e.preventDefault();
		const next = panels[(to + panels.length) % panels.length];
		showTab(next.value);
		next.tab.focus();
	});
	const first = lastEmojiPickerTabs[box];
	showTab(first);
	panels.find(({ value }) => value === first).panel.querySelector('input[type="search"]').focus();
}

/**
 * A button for one pick.
 * @param {string} kind - an EMOJI_PICKER_TABS value
 * @param {string} text
 * @param {string} name - its accessible name and tooltip
 * @param {string} group - its group's name, which the search matches too,
 *   as it does the pick's keywords (pickKeywords)
 * @returns {HTMLButtonElement}
 */
function pickButton(kind, text, name, group) {
	const button = document.createElement('button');
	button.type = 'button';
	button.className = uiClass('emoji-pick', `emoji-pick-${kind}`);
	// The fonts drawsEmoji checks, set here so the two cannot drift apart
	if (kind === 'emoji') button.style.fontFamily = EMOJI_FONT_FAMILY;
	button.textContent = text;
	button.title = name;
	button.setAttribute('aria-label', name);
	// Roving focus: arrows move within a panel (moveInGrid), Tab leaves it
	button.tabIndex = -1;
	button.dataset.pick = text;
	button.dataset.search = `${name} ${pickKeywords(kind).get(text) ?? ''} ${group}`.toLowerCase();
	return button;
}

/**
 * One titled group of picks, as a list of buttons under a heading.
 * @param {string} title - the heading
 * @param {HTMLButtonElement[]} buttons
 * @returns {HTMLElement}
 */
function pickGroup(title, buttons) {
	const section = document.createElement('section');
	section.className = uiClass('emoji-group');
	const heading = document.createElement('h4');
	heading.id = uiId('emoji-group');
	heading.textContent = title;
	const grid = document.createElement('div');
	grid.className = uiClass('emoji-grid');
	grid.setAttribute('role', 'group');
	grid.setAttribute('aria-labelledby', heading.id);
	grid.append(...buttons);
	section.append(heading, grid);
	return section;
}

/**
 * A panel's picks not hidden by a search.
 * @param {HTMLElement} panel
 * @returns {HTMLButtonElement[]} in order
 */
function shownPicks(panel) {
	return Array.from(panel.querySelectorAll('[data-pick]')).filter(button => !button.closest('[hidden]'));
}

/**
 * Groups of picks, leaving out any with none: a group the browser cannot
 * draw, as Flags on a system without them, would be a heading over nothing.
 * @param {string} kind - an EMOJI_PICKER_TABS value
 * @param {Array<{name: string, picks: Array<[string, string]>}>} groups - text and name of each
 * @returns {HTMLElement[]}
 */
function pickGroups(kind, groups) {
	return groups
		.filter(group => group.picks.length)
		.map(group => pickGroup(group.name, group.picks.map(([text, name]) => pickButton(kind, text, name, group.name))));
}

/**
 * The picks a panel holds, with arrow-key focus among them and a click to
 * pick one.
 * Side effects: listens on panel.
 * @param {HTMLElement} panel
 * @param {string} kind - an EMOJI_PICKER_TABS value
 * @param {function(string, string): void} pick - gets the kind and the text
 */
function wirePicks(panel, kind, pick) {
	panel.addEventListener('click', (e) => {
		const button = e.target.closest('[data-pick]');
		if (button) pick(kind, button.dataset.pick);
	});
	panel.addEventListener('keydown', (e) => moveInGrid(panel, e));
	// The first pick takes Tab, until arrows move it
	const first = panel.querySelector('[data-pick]');
	if (first) first.tabIndex = 0;
}

/**
 * Move focus among a panel's shown picks: Left and Right one step, Up and
 * Down a row, as they are laid out, Home and End to the ends.
 * Side effects: may move focus and the roving tab stop.
 * @param {HTMLElement} panel
 * @param {KeyboardEvent} e
 */
function moveInGrid(panel, e) {
	const buttons = shownPicks(panel);
	const at = buttons.indexOf(document.activeElement);
	if (at === -1) return;
	let to;
	if (e.key === 'ArrowRight') to = at + 1;
	else if (e.key === 'ArrowLeft') to = at - 1;
	else if (e.key === 'Home') to = 0;
	else if (e.key === 'End') to = buttons.length - 1;
	else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') to = rowNeighbor(buttons, at, e.key === 'ArrowDown' ? 1 : -1);
	if (to === undefined) return;
	e.preventDefault();
	const next = buttons[Math.max(0, Math.min(buttons.length - 1, to))];
	buttons[at].tabIndex = -1;
	next.tabIndex = 0;
	next.focus();
}

/**
 * The pick in the next row up or down nearest across to one, as laid out.
 * @param {HTMLButtonElement[]} buttons - shown, in order
 * @param {number} at - the focused one's index
 * @param {number} step - 1 down, -1 up
 * @returns {number} its index; at itself at the first or last row
 */
function rowNeighbor(buttons, at, step) {
	const from = buttons[at].getBoundingClientRect();
	let best = at;
	let bestDistance = Infinity;
	for (let i = at + step; i >= 0 && i < buttons.length; i += step) {
		const rect = buttons[i].getBoundingClientRect();
		const rowChange = (rect.top - from.top) * step;
		if (rowChange <= 0) continue;
		// The nearest row only: past it, stop looking
		if (best !== at && rowChange > (buttons[best].getBoundingClientRect().top - from.top) * step) break;
		const distance = Math.abs(rect.left - from.left);
		if (distance < bestDistance) {
			best = i;
			bestDistance = distance;
		}
	}
	return best;
}

/**
 * A tab's groups as the picker offers them: an NSFW one only with the
 * emojiPickerNsfw setting on.
 * @param {string} kind - an EMOJI_PICKER_TABS value
 * @returns {{name: string, picks: Array<[string, string, string?]>}[]}
 */
function offeredPickGroups(kind) {
	return pickGroupsOf(kind).filter(group => !group.nsfw || featureConfig.emojiPickerNsfw);
}

/**
 * Fill one tab's panel: a search box, the recent picks, then each group,
 * less what the browser cannot draw, and NSFW ones with the setting off.
 * Side effects: fills panel and listens on it.
 * @param {HTMLElement} panel - empty
 * @param {{value: string, one: string, many: string, placeholder: string}} kind - from EMOJI_PICKER_TABS
 * @param {function(string, string): void} pick - gets the kind and the text
 * @param {HTMLElement} status - where the search says how many match
 */
function fillPickPanel(panel, { value: kind, one, many, placeholder }, pick, status) {
	const searchId = uiId('emoji-search');
	panel.innerHTML = createInputRow({ type: 'search', id: searchId, label: `Search ${many}`, placeholder, stacked: true });
	const search = panel.querySelector('#' + searchId);
	const names = pickNames(kind);
	const shows = (text) => showsPick(kind, text);
	const offered = offeredPickGroups(kind);
	// A recent NSFW pick stays saved while the setting is off, but not shown
	const offeredTexts = new Set(offered.flatMap(group => group.picks.map(([text]) => text)));
	const [recentGroup] = pickGroups(kind, [{ name: 'Recent', picks: currentEmojiRecents()[kind].filter(text => offeredTexts.has(text) && shows(text)).map(text => [text, names.get(text)]) }]);
	if (recentGroup) panel.append(recentGroup);
	const groups = pickGroups(kind, offered.map(group => ({ name: group.name, picks: group.picks.filter(([text]) => shows(text)) })));
	panel.append(...groups);
	wirePicks(panel, kind, pick);

	search.addEventListener('input', () => {
		const words = search.value.toLowerCase().split(/\s+/).filter(Boolean);
		let count = 0;
		for (const group of groups) {
			let shown = 0;
			for (const button of group.querySelectorAll('[data-pick]')) {
				const match = words.every(word => button.dataset.search.includes(word));
				button.hidden = !match;
				if (match) shown++;
			}
			group.hidden = !shown;
			count += shown;
		}
		if (recentGroup) recentGroup.hidden = words.length > 0;
		panel.dataset.status = !words.length ? ''
			: count === 1 ? `1 ${one} matches.`
			: count ? `${count} ${many} match.`
			: `No ${many} match. Try another word.`;
		status.textContent = panel.dataset.status;
		// The tab stop goes to the first shown pick, so Tab from the search reaches one
		panel.querySelectorAll('[data-pick]').forEach(button => { button.tabIndex = -1; });
		const [first] = shownPicks(panel);
		if (first) first.tabIndex = 0;
	});
	// Enter picks the first match, as a search box's one action
	search.addEventListener('keydown', (e) => {
		if (e.key !== 'Enter') return;
		e.preventDefault();
		const [first] = shownPicks(panel);
		if (first && search.value.trim()) pick(kind, first.dataset.pick);
	});
}

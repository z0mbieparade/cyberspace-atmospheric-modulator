// =====================================================
// USERNAMES
// =====================================================
// Finds the usernames on a Cyberspace page and marks each one with
// data-atmo-user="<username>": profile links where usernames are listed, and
// @mentions anywhere, which are wrapped in a <span data-atmo-mention>. Whatever
// uses usernames reads the mark (styling, notes, a menu), so none of them
// has to find the names itself. It runs once something calls watchUsernames.

const USERNAME_ATTR = `data-${UI_PREFIX}-user`;
const MENTION_ATTR = `data-${UI_PREFIX}-mention`;
// Every marked username, link or mention
const USERNAME_SELECTOR = `[${USERNAME_ATTR}]`;

// The beta site lists usernames in different markup
const IS_BETA_SITE = window.location.hostname === 'beta.cyberspace.online';

// Elements that may be usernames
const USERNAME_SELECTORS = [
	'a[href^="/"]',                           // links starting with / (common for user profiles)
	'span.cursor-pointer.hover\\:underline',  // beta site username spans
];

// cIRC popped out into the sidebar: chat, on any page, wherever the rail sits
const CHAT_RAIL = '.circ-rail';

// Containers to search within for USERNAME LINKS ONLY (not @mentions)
// This helps avoid marking non-username links that don't have @ prefix
// @mentions are searched across the whole page since they're explicit
const CONTAINER_HINTS = IS_BETA_SITE ? [
	'#main-content-area',           // beta: chat messages
	'.space-y-1',                   // beta: user list
	CHAT_RAIL,
] : [
	'.chat-main-content',           // main: chat messages
	'.profile-box-inverted',        // main: profile header
	CHAT_RAIL,
];

// Path patterns where links count anywhere on the page (skip container hints)
const PATH_HINTS = [
	'/chat',                        // chat rooms
];

// Containers never searched (applies to both links and @mentions)
const CONTAINER_HINTS_EXCLUDE = [
	'.sidebar',
	'footer',
	`.${UI_PREFIX}-dialog-attribution`,
	`.${UI_PREFIX}-update-banners`,
	'.editor-wrapper',
	'code', 'pre', 'script'
];

/**
 * Whether an element is in a container the finder never searches. The chat
 * rail counts as chat even inside one of those (the sidebar): only an
 * excluded container inside the rail, such as a code block, excludes it.
 * @param {Element} element
 * @returns {boolean}
 */
function isInExcludedContainer(element) {
	const excluded = CONTAINER_HINTS_EXCLUDE.map(sel => element.closest(sel)).filter(Boolean);
	if (!excluded.length) return false;
	const rail = element.closest(CHAT_RAIL);
	// Only one strictly inside the rail: the rail may be the sidebar itself
	return !rail || excluded.some(container => container !== rail && rail.contains(container));
}

// Single-segment site paths that are not usernames
const EXCLUDE_VALUES = [
	'feed', 'topics', 'jukebox', 'notes', 'write',
	'chat', 'messages', 'bookmarks', 'notifications',
	'me', 'guilds', 'support', 'wiki', 'changelog',
	'netiquette',  'faq', 'loading', 'error'
];

// Elements the finder leaves alone, set by skipUsernamesMatching
const skippedUsernameSelectors = [];

/**
 * Leave alone usernames that match a selector, and text inside them: another
 * script's names, or previews styled by hand.
 * @param {string} selector
 */
function skipUsernamesMatching(selector) {
	skippedUsernameSelectors.push(selector);
}

/**
 * Whether an element is, or sits inside, one skipUsernamesMatching named.
 * @param {Element} element
 * @returns {boolean}
 */
function isSkippedUsername(element) {
	return skippedUsernameSelectors.some(sel => element.closest(sel));
}

/**
 * Whether a string can be a username: not an Object.prototype key (case as
 * given), not a reserved site path, no spaces.
 * @param {string} username - with or without its @
 * @returns {boolean}
 */
function isValidUsername(username) {
	if (!username) return false;
	if (username.startsWith('@')) username = username.slice(1);
	// Callers key plain objects by name: one Object.prototype holds, such as
	// __proto__ or toString, would read or write through it
	if (username.trim() in Object.prototype) return false;
	username = username.trim().toLowerCase();

	if (EXCLUDE_VALUES.includes(username)) return false;
	if (username.includes(' ')) return false;

	return true;
}

/**
 * The username an element stands for: its single-segment href, its
 * data-username, or its text.
 * @param {HTMLElement} element
 * @returns {string|null}
 */
function extractUsername(element) {
	// From href like "/username" (but not "/chat/room" or "/static/file.js" or "/guilds/x")
	const href = element.getAttribute('href');
	if (href && href.startsWith('/')) {
		const pathAfterSlash = href.slice(1);
		if (!pathAfterSlash.includes('/') && !pathAfterSlash.includes('.')) {
			const match = href.match(/^\/([^\/\?#]+)/);
			if (match && isValidUsername(match[1])) return match[1];
		}
	}

	// From data attribute
	if (element.dataset.username && isValidUsername(element.dataset.username)) {
		return element.dataset.username;
	}

	// From text content (fallback)
	let text = element.textContent.trim();
	// If text has a space (possibly from icon prefix), try the last part
	if (text.includes(' ')) {
		const parts = text.split(' ');
		text = parts[parts.length - 1]; // Take the last part (username after icon)
	}
	if (text && text.length < 30) {
		if (text.startsWith('@')) text = text.slice(1);
		if (isValidUsername(text)) return text;
	}

	return null;
}

/**
 * Whether an element matching USERNAME_SELECTORS is a username, and not
 * marked yet: in a username container, with a username for a path.
 * @param {HTMLElement} element
 * @returns {boolean}
 */
function isLikelyUsername(element) {
	if (element.hasAttribute(USERNAME_ATTR) || isSkippedUsername(element)) return false;

	// Check text content - if it has a space, only allow if it looks like "icon username"
	const text = element.textContent.trim();
	if (text.includes(' ')) {
		const parts = text.split(' ');
		if (parts.length !== 2 || parts[1].includes(' ') || parts[1].length === 0) {
			return false;
		}
	}

	// Skip links with more than one slash (e.g., /guilds/name, /chat/room)
	const href = element.getAttribute('href') || '';
	const slashCount = (href.match(/\//g) || []).length;
	if (slashCount > 1) {
		return false;
	}

	// Links count only inside the container hints, except on permissive
	// paths. Elements without href (beta site spans) have a selector specific
	// enough on their own
	const hasHref = !!element.getAttribute('href');
	if (CONTAINER_HINTS.length > 0 && hasHref && !isPathMatch(PATH_HINTS)) {
		if (!CONTAINER_HINTS.some(sel => element.closest(sel))) return false;
	}

	if (isInExcludedContainer(element)) return false;

	// For elements with href, validate the path
	if (href) {
		const hrefPath = href.startsWith('/') ? href.slice(1) : href;
		return isValidUsername(hrefPath);
	}

	// For elements without href (e.g., beta site spans), validate text content
	return isValidUsername(text);
}

/**
 * Mark the usernames on the page not marked yet: links, then @mentions.
 * Nothing on an excluded page: the site navigates without reloading, so it
 * is checked on every call.
 * Side effects: sets USERNAME_ATTR on username elements; wraps @mentions in
 * spans, replacing their text nodes.
 * @returns {HTMLElement[]} the elements marked by this call
 */
function findUsernames() {
	if (isHostMatch(HOST_EXCLUDE) || isPathMatch(PATH_EXCLUDE)) return [];

	const found = [];
	document.querySelectorAll(USERNAME_SELECTORS.join(', ')).forEach(el => {
		if (!isLikelyUsername(el)) return;
		const username = extractUsername(el);
		if (!username) return;
		el.setAttribute(USERNAME_ATTR, username);
		found.push(el);
	});
	return found.concat(markMentions());
}

/**
 * Wrap each @mention on the page in a marked span.
 * Side effects: replaces each text node holding a mention with its text and
 * the mention spans.
 * @returns {HTMLElement[]} the spans added
 */
function markMentions() {
	// Search entire page for @mentions (they're explicit, so no risk of false positives)
	const walker = document.createTreeWalker(
		document.body,
		NodeFilter.SHOW_TEXT,
		{
			acceptNode: (node) => {
				const parent = node.parentElement;
				if (!node.textContent.includes('@') || !parent) return NodeFilter.FILTER_REJECT;
				if (parent.closest(USERNAME_SELECTOR) || isSkippedUsername(parent)) return NodeFilter.FILTER_REJECT;
				// Dialog previews manage their own styling
				if (parent.closest(`.${UI_PREFIX}-dialog-preview`)) return NodeFilter.FILTER_REJECT;
				if (['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT'].includes(parent.tagName)) return NodeFilter.FILTER_REJECT;
				if (isInExcludedContainer(parent)) return NodeFilter.FILTER_REJECT;
				return NodeFilter.FILTER_ACCEPT;
			}
		}
	);

	const textNodes = [];
	let node;
	while ((node = walker.nextNode())) textNodes.push(node);

	const spans = [];
	textNodes.forEach(textNode => {
		const text = textNode.textContent;
		// Match @username (alphanumeric, underscore, hyphen)
		const mentionRegex = /@([a-zA-Z0-9_-]+)/g;
		const matches = [];
		let match;
		while ((match = mentionRegex.exec(text)) !== null) {
			// Skip if this looks like an email address (has word chars before the @)
			if (match.index > 0 && /[a-zA-Z0-9._-]/.test(text[match.index - 1])) continue;
			// Skip if followed by a dot and more text (like @site.com)
			if (/^\.[a-zA-Z]/.test(text.slice(match.index + match[0].length))) continue;
			if (!isValidUsername(match[1])) continue;
			matches.push({ full: match[0], username: match[1], index: match.index });
		}
		if (matches.length === 0) return;

		const fragment = document.createDocumentFragment();
		let lastIndex = 0;
		matches.forEach(m => {
			if (m.index > lastIndex) fragment.appendChild(document.createTextNode(text.slice(lastIndex, m.index)));
			const span = document.createElement('span');
			span.textContent = m.full;
			span.setAttribute(USERNAME_ATTR, m.username);
			span.setAttribute(MENTION_ATTR, '');
			fragment.appendChild(span);
			spans.push(span);
			lastIndex = m.index + m.full.length;
		});
		if (lastIndex < text.length) fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
		textNode.parentNode.replaceChild(fragment, textNode);
	});
	return spans;
}

/**
 * The username a marked element stands for.
 * @param {Element} element
 * @returns {string|null}
 */
function usernameOf(element) {
	return element.getAttribute(USERNAME_ATTR);
}

const usernameWatchers = [];
let usernameObserver = null;

/**
 * Start finding usernames, now and as the page changes, and hear about each
 * one marked. The first call starts the search; later ones join it.
 * Side effects: as findUsernames, on the page now and after every change to
 * <body>, for the page's life.
 * @param {function(HTMLElement[]): void} [onFound] - called with the names
 *   marked so far, then with each batch marked later
 */
function watchUsernames(onFound) {
	if (onFound) usernameWatchers.push(onFound);
	if (!usernameObserver) {
		// Only additions can bring new names; the marks themselves are attributes
		usernameObserver = new MutationObserver((mutations) => {
			if (!mutations.some(mutation => mutation.addedNodes.length > 0)) return;
			const found = findUsernames();
			if (found.length) usernameWatchers.forEach(watcher => watcher(found));
		});
		usernameObserver.observe(document.body, { childList: true, subtree: true });
		findUsernames();
	}
	// Every mark so far, not just this call's: rescanUsernames or a direct
	// findUsernames may have marked names before anything watched
	const marked = Array.from(document.querySelectorAll(USERNAME_SELECTOR));
	if (onFound && marked.length) onFound(marked);
}

/**
 * Forget every mark and find the names again: for a mark gone stale, as when
 * the site reuses a link for another user in place, which adds no nodes.
 * Callers that changed the marked elements put them back first.
 * Side effects: unwraps every mention span back to its text, removes every
 * mark, then marks and reports the names as watchUsernames does.
 */
function rescanUsernames() {
	document.querySelectorAll(`[${MENTION_ATTR}]`).forEach(span => {
		span.replaceWith(document.createTextNode(`@${usernameOf(span)}`));
	});
	document.querySelectorAll(USERNAME_SELECTOR).forEach(el => el.removeAttribute(USERNAME_ATTR));
	const found = findUsernames();
	if (found.length) usernameWatchers.forEach(watcher => watcher(found));
}

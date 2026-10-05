// =====================================================
// COLORING THE NAMES
// =====================================================
// src/shared/usernames.js finds and marks the usernames; this styles them.

/**
 * Style one marked username for its user.
 * Side effects: as applyStyles: inline styles, data attributes, icons.
 * @param {HTMLElement} element - marked by the username finder
 */
function styleUsername(element) {
	applyStyles(element, usernameOf(element), {
		matchType: element.hasAttribute(MENTION_ATTR) ? 'mention' : 'nick',
	});
}

/**
 * Style every username marked so far, again: after a settings change, or a
 * theme change. The marks stay, so nothing is searched for again.
 * Side effects: as styleUsername, on every marked name.
 */
function colorizeAll() {
	document.querySelectorAll(USERNAME_SELECTOR).forEach(styleUsername);
}

/**
 * Take nick colors' styling off a name: its text, inline styles and data.
 * Side effects: restores the name's text from before any icons; clears its
 * inline styles and nick colors' data attributes.
 * @param {HTMLElement} element
 */
function unstyleUsername(element) {
	if (element.dataset.originalText) element.textContent = element.dataset.originalText;
	for (const key of ['nickColored', 'mentionColored', 'iconApplied', 'originalText', 'username', 'contrastRatio']) {
		delete element.dataset[key];
	}
	element.style.cssText = '';
}

/**
 * The Refresh Nick Colors command: find every name again from scratch, and
 * color it. Repairs a mark gone stale, which colorizeAll would only restyle.
 * Side effects: unstyles every name, then as rescanUsernames; the watcher
 * from boot styles what it finds.
 */
function refreshNickColors() {
	document.querySelectorAll(USERNAME_SELECTOR).forEach(unstyleUsername);
	rescanUsernames();
}

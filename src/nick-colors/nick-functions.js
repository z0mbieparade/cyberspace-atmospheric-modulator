// =====================================================
// COLORING THE NAMES
// =====================================================
// src/shared/usernames.js finds and marks the usernames; this styles them.

// On a name this script colored, as opposed to the separate Nick Colors script
const COLORED_BY_US_ATTR = `data-${UI_PREFIX}-colored`;

/**
 * Style one marked username for its user, or take its styling off: while
 * nick colors is switched off, or for a non-friend while only friends are
 * colored.
 * Side effects: as applyStyles: inline styles, data attributes, icons; or
 * as unstyleUsername.
 * @param {HTMLElement} element - marked by the username finder
 */
function styleUsername(element) {
	const username = usernameOf(element);
	// Switched off, or a non-friend: left in the site's colors. Only names this
	// script colored lose it. While the separate Nick Colors script runs, none
	// do: it colors the same names, with the same data attributes, skips any
	// already colored, and would not color them again
	if (!featureConfig.nickColors || !shouldColorNick(username)) {
		if (element.hasAttribute(COLORED_BY_US_ATTR) && !standaloneNickColorsRunning()) unstyleUsername(element);
		return;
	}
	applyStyles(element, username, {
		matchType: element.hasAttribute(MENTION_ATTR) ? 'mention' : 'nick',
	});
	element.setAttribute(COLORED_BY_US_ATTR, '');
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
	element.removeAttribute(COLORED_BY_US_ATTR);
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

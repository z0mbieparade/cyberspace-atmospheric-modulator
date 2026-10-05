// =====================================================
// MESSAGE A USER
// =====================================================

// Survive the load of the user's profile, which openMessageToUser navigates
// to. Every script built on src/shared shares them: whichever loads first
// finishes the request, once. Unlike the standalone Nick Colors' own keys,
// so it and this script do not both open C-Mail
const COMPOSE_OPEN_KEY = `${UI_PREFIX}-open-compose`;
const COMPOSE_MESSAGE_KEY = `${UI_PREFIX}-compose-message`;

/**
 * Open a new message to a user on Cyberspace: on their profile, the 'C'
 * shortcut; from elsewhere, load the profile and click C-Mail once it renders.
 * Side effects: may navigate the page; writes sessionStorage for the next load.
 * @param {string} username - without the @
 * @param {string} [message] - pre-filled in the compose box
 */
function openMessageToUser(username, message = null) {
	// This site's own profile page: sessionStorage, which carries the request
	// across the load, belongs to one site, so beta must stay on beta
	const profileUrl = `${window.location.origin}/${encodeURIComponent(username)}`;

	// If we're already on their profile, just trigger the shortcut
	if (isOnProfileOf(username)) {
		logDebug(LOG_PREFIX + ' navigated to user profile, triggering compose shortcut');
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', code: 'KeyC', bubbles: true }));
		if (message) setTimeout(() => fillComposeMessage(message), 300);
		return;
	}

	// Otherwise navigate and trigger after page load
	// Store flag in sessionStorage to trigger compose after navigation
	sessionStorage.setItem(COMPOSE_OPEN_KEY, 'true');
	if (message) {
		sessionStorage.setItem(COMPOSE_MESSAGE_KEY, message);
	}
	window.location.href = profileUrl;
}

/**
 * Tell the user how sendMessageToUser went, when they are still on the page.
 * Side effects: alerts.
 * @param {'sent'|'opened'|'unsure'} result
 * @param {string} username - who it went to, without the @
 * @param {string} sentMessage - shown when it was sent
 */
function reportMessageResult(result, username, sentMessage) {
	if (result === 'sent') alert(sentMessage);
	else if (result === 'unsure') alert(`It may not have sent. Check your C-Mail with @${username} before sending it again.`);
}

/**
 * Send a C-Mail through the API, or else open the compose box with the
 * message filled in (openMessageToUser), for the user to send.
 * Side effects: sends the message, or navigates.
 * @param {string} username - without the @
 * @param {string} message
 * @returns {Promise<'sent'|'opened'|'unsure'>} how it went: 'opened' leaves
 *   the page; 'unsure': it may have been sent, so nothing else was tried
 */
async function sendMessageToUser(username, message) {
	try {
		await sendCmail(username, message);
		return 'sent';
	} catch (e) {
		// The compose box would let the user send it a second time
		if (e instanceof ApiUncertainError) {
			logDebug(LOG_PREFIX + ' Sending through the API may have failed:', e.message);
			return 'unsure';
		}
		logDebug(LOG_PREFIX + ' Sending through the API failed, opening C-Mail instead:', e.message);
		openMessageToUser(username, message);
		return 'opened';
	}
}

/**
 * Put a message in the C-Mail compose box once it appears.
 * Side effects: polls the page for the box, for up to 4 seconds; fills and
 * focuses it.
 * @param {string} message
 * @param {number} [attempts] - tries so far
 */
function fillComposeMessage(message, attempts = 0) {
	logDebug(LOG_PREFIX + ` fillComposeMessage attempt ${attempts}`);
	const input = document.querySelector('input[placeholder="Type a message..."], textarea[placeholder="Type a message..."]');
	if (input) {
		logDebug(LOG_PREFIX + ' Found message input, filling it');
		input.focus();
		input.value = message;
		// Trigger input event so the site's JS knows the value changed
		input.dispatchEvent(new Event('input', { bubbles: true }));
	} else if (attempts < 20) {
		setTimeout(() => fillComposeMessage(message, attempts + 1), 200);
	} else {
		logDebug(LOG_PREFIX + ' Could not find message input, giving up');
	}
}

/**
 * Finish what openMessageToUser started on the page before: open C-Mail on
 * this profile, and pre-fill the message.
 * Side effects: clears the request from sessionStorage; polls the page, then
 * clicks C-Mail and fills its message box.
 */
function resumeMessageToUser() {
	if (sessionStorage.getItem(COMPOSE_OPEN_KEY) !== 'true') return;
	sessionStorage.removeItem(COMPOSE_OPEN_KEY);
	logDebug(LOG_PREFIX + ' Detected openCompose flag, will try to open compose');

	// Wait for the site to be ready by polling for the C-Mail button on profile
	function tryOpenCompose(attempts = 0) {
		logDebug(LOG_PREFIX + ` tryOpenCompose attempt ${attempts}, readyState: ${document.readyState}`);

		// Look for the C-Mail button - need to find the smallest element containing "[C] C-Mail"
		// Use TreeWalker to find text nodes, then get their parent
		let cmailButton = null;
		const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
		let node;
		while (node = walker.nextNode()) {
			const text = node.textContent?.trim() || '';
			if (text.includes('[C]') && text.includes('C-Mail')) {
				// Found the text node, get its parent element
				cmailButton = node.parentElement;
				logDebug(LOG_PREFIX + ` Found text node with C-Mail, parent: ${cmailButton?.tagName}, text: "${text}"`);
				break;
			}
		}

		if (cmailButton) {
			logDebug(LOG_PREFIX + ' Found C-Mail button, clicking it:', cmailButton);
			cmailButton.click();

			// Check if we have a message to pre-fill
			const message = sessionStorage.getItem(COMPOSE_MESSAGE_KEY);
			if (message) {
				sessionStorage.removeItem(COMPOSE_MESSAGE_KEY);
				// Wait for the compose input to appear, then fill it
				setTimeout(() => fillComposeMessage(message), 300);
			}
		} else if (attempts > 30) {
			logDebug(LOG_PREFIX + ' Max attempts reached, giving up');
		} else {
			// Retry after a delay
			logDebug(LOG_PREFIX + ' C-Mail button not found, retrying in 500ms');
			setTimeout(() => tryOpenCompose(attempts + 1), 500);
		}
	}

	// Start trying after initial page load
	logDebug(LOG_PREFIX + ' readyState:', document.readyState);
	if (document.readyState === 'complete') {
		logDebug(LOG_PREFIX + ' Page already complete, starting in 1s');
		setTimeout(tryOpenCompose, 1000);
	} else {
		logDebug(LOG_PREFIX + ' Waiting for load event');
		window.addEventListener('load', () => {
			logDebug(LOG_PREFIX + ' Load event fired, starting in 1s');
			setTimeout(tryOpenCompose, 1000);
		});
	}
}
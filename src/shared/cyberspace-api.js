// =====================================================
// CYBERSPACE API
// =====================================================
// The site's REST API (https://api.cyberspace.online/v1), signed in as the
// user through the session the site already holds. The API's terms ban bots:
// call it only from something the user just chose to do.
//
// The session token is read for each request, from the Firebase sign-in the
// site keeps in IndexedDB, and only ever sent to API_BASE_URL. Never store
// it, log it or put it in an error message.

const API_BASE_URL = 'https://api.cyberspace.online/v1';
// A token this close to expiring may lapse in flight: the site refreshes it
// while it is open, so a later try finds a fresh one
const API_TOKEN_MIN_LIFETIME_MS = 60 * 1000;
// A request still unanswered after this has failed: a caller waiting on it
// must get to its fallback, not wait forever
const API_TIMEOUT_MS = 15 * 1000;

/**
 * An API request that may have reached the server: the connection failed
 * or timed out after it was sent. Retrying it, or a fallback that does the
 * same thing, could do it twice.
 */
class ApiUncertainError extends Error {}

/**
 * The signed-in user's ID token, from the site's Firebase sign-in.
 * @returns {Promise<string|null>} null when signed out, expired, or unreadable
 */
function readSessionToken() {
	return new Promise((resolve) => {
		let request;
		try {
			request = indexedDB.open('firebaseLocalStorageDb');
		} catch (e) {
			resolve(null);
			return;
		}
		// Opening a database that is not there would create it: stop that
		request.onupgradeneeded = () => {
			request.transaction.abort();
			resolve(null);
		};
		request.onerror = () => resolve(null);
		request.onsuccess = () => {
			const db = request.result;
			let entries;
			try {
				entries = db.transaction('firebaseLocalStorage', 'readonly').objectStore('firebaseLocalStorage').getAll();
			} catch (e) {
				db.close();
				resolve(null);
				return;
			}
			entries.onerror = () => {
				db.close();
				resolve(null);
			};
			entries.onsuccess = () => {
				db.close();
				const tokens = entries.result
					.map(entry => entry?.value?.stsTokenManager)
					.filter(manager => typeof manager?.accessToken === 'string'
						&& Number(manager.expirationTime) > Date.now() + API_TOKEN_MIN_LIFETIME_MS);
				resolve(tokens[0]?.accessToken ?? null);
			};
		};
	});
}

/**
 * Call the API as the signed-in user.
 * Side effects: a network request to API_BASE_URL, acting as the user.
 * @param {string} method
 * @param {string} path - after /v1, e.g. '/cmail'
 * @param {Object} [body] - sent as JSON
 * @returns {Promise<*>} the response's data
 * @throws {ApiUncertainError} when the connection failed or timed out: the
 *   server may have acted on it
 * @throws {Error} when signed out, or the server refused it; the message is
 *   for the user
 */
async function apiRequest(method, path, body) {
	const token = await readSessionToken();
	if (!token) throw new Error('Not signed in to Cyberspace.');
	const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
	const data = body === undefined ? undefined : JSON.stringify(body);
	const url = API_BASE_URL + path;

	// The manager's request: the page's fetch may be refused cross-origin
	const response = gmXmlHttpRequest
		? await new Promise((resolve, reject) => {
			gmXmlHttpRequest({
				method, url, headers, data,
				timeout: API_TIMEOUT_MS,
				// A redirect elsewhere would carry the token with it
				redirect: 'error',
				onload: (r) => {
					// Managers without the redirect option follow it. Too late to
					// take the request back; refuse the answer, and treat it as
					// possibly sent, so nothing tries it a second time
					if (r.finalUrl && !r.finalUrl.startsWith(API_BASE_URL)) {
						reject(new ApiUncertainError('Cyberspace answered from another address, so the answer was ignored.'));
						return;
					}
					resolve({ status: r.status, text: r.responseText });
				},
				onerror: () => reject(new ApiUncertainError('Could not reach Cyberspace.')),
				ontimeout: () => reject(new ApiUncertainError('Cyberspace did not answer.')),
			});
		})
		: await fetch(url, { method, headers, body: data, redirect: 'error', signal: AbortSignal.timeout(API_TIMEOUT_MS) })
			.then(async r => ({ status: r.status, text: await r.text() }))
			.catch(() => { throw new ApiUncertainError('Could not reach Cyberspace.'); });

	let json = null;
	try {
		json = JSON.parse(response.text);
	} catch (e) { /* not JSON: the status says enough */ }
	if (response.status < 200 || response.status >= 300) {
		const reason = json?.error?.message || json?.message || `error ${response.status}`;
		throw new Error(`Cyberspace refused it: ${reason}`);
	}
	return json?.data;
}

/**
 * Poke a user as the signed-in user: the same nudge as the [P] Poke button
 * on their profile. Cyberspace allows one an hour, across all users.
 * Side effects: sends the user a poke notification.
 * @param {string} username - without the @
 * @returns {Promise<void>}
 * @throws {ApiUncertainError|Error} as apiRequest
 */
async function pokeUser(username) {
	await apiRequest('POST', `/users/${encodeURIComponent(username)}/poke`);
}

/**
 * Send a C-Mail as the signed-in user, starting the conversation if needed.
 * Side effects: sends the message under the user's name.
 * @param {string} username - without the @
 * @param {string} content
 * @returns {Promise<void>}
 * @throws {ApiUncertainError} only when the message itself may have been
 *   sent: opening the conversation sends nothing, so its failures are plain
 * @throws {Error} as apiRequest, when nothing was sent
 */
async function sendCmail(username, content) {
	let conversation;
	try {
		conversation = await apiRequest('POST', '/cmail', { recipientUsername: username });
	} catch (e) {
		// Opening a conversation twice is harmless: nothing was sent yet
		throw e instanceof ApiUncertainError ? new Error(e.message) : e;
	}
	if (!conversation?.conversationId) throw new Error('Cyberspace did not open the conversation.');
	await apiRequest('POST', `/cmail/${encodeURIComponent(conversation.conversationId)}`, { content });
}

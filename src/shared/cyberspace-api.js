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
 * A request Cyberspace answered with a refusal. status says which, for a
 * caller that acts on one (404: it is gone; 429: too many).
 */
class ApiRefusedError extends Error {
	/**
	 * @param {string} message - for the user
	 * @param {number} status - the HTTP status
	 */
	constructor(message, status) {
		super(message);
		this.status = status;
	}
}

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
 * Call the API as the signed-in user, for the response's data.
 * Side effects: as apiResponse.
 * @param {string} method
 * @param {string} path - after /v1, e.g. '/cmail'
 * @param {Object} [body] - sent as JSON
 * @returns {Promise<*>} the response's data
 * @throws {ApiUncertainError|ApiRefusedError|Error} as apiResponse
 */
async function apiRequest(method, path, body) {
	return (await apiResponse(method, path, body))?.data;
}

/**
 * Call the API as the signed-in user, for the whole response: a list's
 * cursor is beside its data.
 * Side effects: a network request to API_BASE_URL, acting as the user.
 * @param {string} method
 * @param {string} path - after /v1, e.g. '/cmail'
 * @param {Object} [body] - sent as JSON
 * @returns {Promise<Object|null>} the parsed response, { data, cursor? }
 * @throws {ApiUncertainError} when the connection failed or timed out: the
 *   server may have acted on it
 * @throws {ApiRefusedError} when the server refused it; the message is for
 *   the user
 * @throws {Error} when signed out
 */
async function apiResponse(method, path, body) {
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
		throw new ApiRefusedError(`Cyberspace refused it: ${reason}`, response.status);
	}
	return json;
}

/**
 * The signed-in user's username.
 * @returns {Promise<string>}
 * @throws {Error} when not signed in, when Cyberspace refuses, or when its
 *   answer has no username; ApiUncertainError when it cannot be reached
 */
async function fetchOwnUsername() {
	const me = await apiRequest('GET', '/users/me');
	if (typeof me?.username !== 'string' || !me.username) throw new Error('Cyberspace did not say who is signed in.');
	return me.username;
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

// Your private notes (/v1/notes): only you can read them, though the site
// can publish one to your journal. Cyberspace allows 3 saves a minute and
// 30 a day, a new note or a change to one

/**
 * One page of the signed-in user's notes, latest revision of each.
 * @param {string|null} [cursor] - from the previous page
 * @returns {Promise<{notes: Object[], cursor: string|null}>} cursor: null on
 *   the last page
 * @throws {ApiUncertainError|ApiRefusedError|Error} as apiRequest
 */
async function listNotes(cursor = null) {
	const query = cursor ? `?limit=50&cursor=${encodeURIComponent(cursor)}` : '?limit=50';
	const page = await apiResponse('GET', '/notes' + query);
	return { notes: Array.isArray(page?.data) ? page.data : [], cursor: page?.cursor ?? null };
}

/**
 * A note's ID, as a list or a save returns the note. The API docs show no
 * note object, so every name it could have is read: noteId, as the docs'
 * other objects are named (postId, conversationId); postId, since a note
 * is an unpublished entry; and a plain id.
 * @param {Object} note
 * @returns {string|null}
 */
function noteId(note) {
	const id = note?.noteId ?? note?.postId ?? note?.id;
	return typeof id === 'string' && id ? id : null;
}

/**
 * One of the signed-in user's notes, latest revision.
 * @param {string} id
 * @returns {Promise<Object>}
 * @throws {ApiRefusedError} status 404 when it is gone; else as apiRequest
 */
async function getNote(id) {
	return apiRequest('GET', `/notes/${encodeURIComponent(id)}`);
}

/**
 * Save a new private note.
 * Side effects: creates the note on Cyberspace.
 * @param {string} content - at most 32,768 characters
 * @param {string[]} topics - at most 3, lowercase
 * @returns {Promise<Object>} the note
 * @throws {ApiUncertainError|ApiRefusedError|Error} as apiRequest
 */
async function createNote(content, topics) {
	return apiRequest('POST', '/notes', { content, topics });
}

/**
 * Change a note: Cyberspace keeps the earlier text as a revision.
 * Side effects: adds a revision to the note on Cyberspace.
 * @param {string} id
 * @param {string} content - at most 32,768 characters
 * @param {string[]} topics - at most 3, lowercase
 * @returns {Promise<Object>} the note
 * @throws {ApiRefusedError} status 404 when it is gone; else as apiRequest
 */
async function updateNote(id, content, topics) {
	return apiRequest('PATCH', `/notes/${encodeURIComponent(id)}`, { content, topics });
}

/**
 * Delete a note, every revision of it.
 * Side effects: deletes the note on Cyberspace.
 * @param {string} id
 * @returns {Promise<void>}
 * @throws {ApiRefusedError} status 404 when it is gone already; else as
 *   apiRequest
 */
async function deleteNote(id) {
	await apiRequest('DELETE', `/notes/${encodeURIComponent(id)}`);
}

/**
 * Stand-ins for the Cyberspace API in tests: the site's Firebase sign-in
 * that readSessionToken reads, and the userscript manager's requests.
 */

import { vi } from 'vitest';

export const TOKEN = 'token-from-the-site';

/**
 * Stand in the site's Firebase sign-in store, as much of IndexedDB as
 * readSessionToken uses.
 * @param {Array|null} entries - the store's records; null: no such database
 * @returns {Function} the mock a create-on-open is aborted with
 */
export function fakeSignIn(entries) {
	const later = fn => setTimeout(fn, 0);
	// Called when opening would create the database
	const abort = vi.fn();
	global.indexedDB = {
		open: () => {
			const request = {};
			later(() => {
				if (entries === null) {
					request.transaction = { abort };
					request.onupgradeneeded();
					return;
				}
				request.result = {
					close: () => {},
					transaction: () => ({ objectStore: () => ({ getAll: () => {
						const getAll = {};
						later(() => {
							getAll.result = entries;
							getAll.onsuccess();
						});
						return getAll;
					} }) }),
				};
				request.onsuccess();
			});
			return request;
		},
	};
	return abort;
}

export const signedIn = (expiresInMs = 60 * 60 * 1000) => fakeSignIn([
	{ fbase_key: 'firebase:authUser:x', value: { uid: 'u1', stsTokenManager: { accessToken: TOKEN, expirationTime: Date.now() + expiresInMs } } },
]);

/**
 * Answer the manager's requests, and record them.
 * @param {function(Object): {status: number|'error'|'timeout', body?: Object}} answer
 * @returns {Array<Object>} the requests made
 */
export function answerRequests(answer) {
	const requests = [];
	global.gmRequestHandler = (details) => {
		requests.push(details);
		const { status, body } = answer(details);
		if (status === 'error') setTimeout(() => details.onerror(), 0);
		else if (status === 'timeout') setTimeout(() => details.ontimeout(), 0);
		else setTimeout(() => details.onload({ status, responseText: JSON.stringify(body) }), 0);
	};
	return requests;
}

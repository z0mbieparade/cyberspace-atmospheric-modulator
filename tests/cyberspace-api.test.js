/**
 * Cyberspace API tests (src/shared/cyberspace-api.js, sendMessageToUser in
 * src/shared/send-message.js): the session token from the site's Firebase
 * sign-in, the C-Mail calls, and the fall back to the compose box.
 */

import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { dom } from './setup.js';

const TOKEN = 'token-from-the-site';

/**
 * Stand in the site's Firebase sign-in store, as much of IndexedDB as
 * readSessionToken uses.
 * @param {Array|null} entries - the store's records; null: no such database
 * @returns {Function} the mock a create-on-open is aborted with
 */
function fakeSignIn(entries) {
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

const signedIn = (expiresInMs = 60 * 60 * 1000) => fakeSignIn([
	{ fbase_key: 'firebase:authUser:x', value: { uid: 'u1', stsTokenManager: { accessToken: TOKEN, expirationTime: Date.now() + expiresInMs } } },
]);

/**
 * Answer the manager's requests, and record them.
 * @param {function(Object): {status: number|'error'|'timeout', body?: Object}} answer
 * @returns {Array<Object>} the requests made
 */
function answerRequests(answer) {
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

beforeAll(() => {
	// As the core does once it has booted: nick colors marks the names, and the menu listens
	startFeatures();
	initUserMenu();
});

afterEach(() => {
	delete global.indexedDB;
	delete global.gmRequestHandler;
	delete global.alert;
	sessionStorage.clear();
	doc().querySelectorAll('.atmo-dialog-overlay').forEach(o => o.remove());
	vi.restoreAllMocks();
});
const doc = () => dom.window.document;

describe('readSessionToken', () => {
	it('reads the signed-in user\'s token', async () => {
		signedIn();
		expect(await readSessionToken()).toBe(TOKEN);
	});

	it('gives none for a token about to expire', async () => {
		signedIn(30 * 1000);
		expect(await readSessionToken()).toBeNull();
	});

	it('gives none, and creates nothing, when the site has no sign-in store', async () => {
		const abort = fakeSignIn(null);
		expect(await readSessionToken()).toBeNull();
		expect(abort).toHaveBeenCalledTimes(1);
	});
});

describe('sendCmail', () => {
	it('refuses redirects, so the token cannot follow one elsewhere', async () => {
		signedIn();
		const requests = [];
		global.gmRequestHandler = (details) => {
			requests.push(details);
			setTimeout(() => details.onload({ status: 200, finalUrl: 'https://evil.example/v1/cmail', responseText: '{"data":{"conversationId":"c1"}}' }), 0);
		};
		await expect(sendCmail('z0ylent', 'hello')).rejects.toThrow('another address');
		expect(requests[0].redirect).toBe('error');
	});

	it('opens the conversation, then sends into it, as the user', async () => {
		signedIn();
		const requests = answerRequests(({ url }) => url.endsWith('/cmail')
			? { status: 200, body: { data: { conversationId: 'c/1' } } }
			: { status: 201, body: { data: { messageId: 'm1' } } });
		await sendCmail('z0ylent', 'hello');
		expect(requests.map(r => [r.method, r.url, JSON.parse(r.data)])).toEqual([
			['POST', 'https://api.cyberspace.online/v1/cmail', { recipientUsername: 'z0ylent' }],
			['POST', 'https://api.cyberspace.online/v1/cmail/c%2F1', { content: 'hello' }],
		]);
		expect(requests.every(r => r.headers.Authorization === `Bearer ${TOKEN}`)).toBe(true);
	});

	it('says why it was refused, without the token', async () => {
		signedIn();
		answerRequests(() => ({ status: 403, body: { error: { message: 'EMAIL_NOT_VERIFIED' } } }));
		const error = await sendCmail('z0ylent', 'hello').catch(e => e);
		expect(error.message).toBe('Cyberspace refused it: EMAIL_NOT_VERIFIED');
		expect(error.message).not.toContain(TOKEN);
	});

	it('sends nothing when signed out', async () => {
		fakeSignIn([]);
		const requests = answerRequests(() => ({ status: 200, body: {} }));
		await expect(sendCmail('z0ylent', 'hello')).rejects.toThrow('Not signed in to Cyberspace.');
		expect(requests).toEqual([]);
	});
});

describe('sendMessageToUser', () => {
	it('sends through the API when it can', async () => {
		signedIn();
		answerRequests(() => ({ status: 200, body: { data: { conversationId: 'c1' } } }));
		expect(await sendMessageToUser('z0ylent', 'hello')).toBe('sent');
		expect(sessionStorage.getItem(COMPOSE_MESSAGE_KEY)).toBeNull();
	});

	it('does not offer the compose box when the message itself may have gone', async () => {
		signedIn();
		const requests = answerRequests(({ url }) => url.endsWith('/cmail')
			? { status: 200, body: { data: { conversationId: 'c1' } } }
			: { status: 'timeout' });
		expect(await sendMessageToUser('z0ylent', 'hello')).toBe('unsure');
		expect(requests[1].timeout).toBeGreaterThan(0);
		expect(sessionStorage.getItem(COMPOSE_MESSAGE_KEY)).toBeNull();
	});

	it('offers the compose box when only opening the conversation failed', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		signedIn();
		answerRequests(() => ({ status: 'error' }));
		expect(await sendMessageToUser('z0ylent', 'hello')).toBe('opened');
		expect(sessionStorage.getItem(COMPOSE_MESSAGE_KEY)).toBe('hello');
	});

	it('uses the compose shortcut when already on the profile, however its URL is cased', async () => {
		dom.reconfigure({ url: 'https://cyberspace.online/Alice/' });
		try {
			fakeSignIn([]);
			const keys = [];
			doc().addEventListener('keydown', e => keys.push(e.key), { once: true });
			// The site's compose box, as the 'c' shortcut opens it
			const box = doc().createElement('textarea');
			box.placeholder = 'Type a message...';
			doc().body.appendChild(box);
			expect(await sendMessageToUser('alice', 'hello')).toBe('opened');
			expect(keys).toEqual(['c']);
			expect(sessionStorage.getItem(COMPOSE_MESSAGE_KEY)).toBeNull();
			// The message is not lost: it goes into the box
			await vi.waitFor(() => expect(box.value).toBe('hello'));
			box.remove();
		} finally {
			dom.reconfigure({ url: 'https://cyberspace.online/' });
		}
	});

	it('opens the compose box, filled in, when the API cannot', async () => {
		// jsdom cannot navigate; the message is stored for the next page first
		vi.spyOn(console, 'error').mockImplementation(() => {});
		fakeSignIn([]);
		expect(await sendMessageToUser('z0ylent', 'hello')).toBe('opened');
		expect(sessionStorage.getItem(COMPOSE_MESSAGE_KEY)).toBe('hello');
	});
});

describe('sending from a dialog', () => {
	const sendReport = () => doc().querySelector('.atmo-dialog-footer button.save');
	const requestOverride = () => doc().querySelector('[data-field-key="requestOverride"] button');

	it('keeps the report open while it sends, sends it once, then says it was sent', async () => {
		const alertSpy = vi.fn();
		global.alert = alertSpy;
		signedIn();
		const requests = answerRequests(() => ({ status: 200, body: { data: { conversationId: 'c1' } } }));
		showReportIssueDialog();
		const fields = doc().querySelectorAll('.atmo-dialog textarea');
		fields[0].value = 'Names flicker';
		fields[1].value = 'Open chat';
		sendReport().click();
		sendReport().click();
		// Says it is sending, whatever the words
		expect(doc().querySelector('.atmo-dialog [role="status"]').textContent.trim()).not.toBe('');

		await vi.waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Report sent to @z0ylent. Thank you!'));
		expect(requests.length).toBe(2);
		expect(doc().querySelector('.atmo-dialog')).toBeNull();
	});

	it('sends a Request Override once, however often it is clicked', async () => {
		global.alert = vi.fn();
		signedIn();
		const requests = answerRequests(() => ({ status: 200, body: { data: { conversationId: 'c1' } } }));
		const name = doc().createElement('a');
		name.href = '/alice';
		name.setAttribute('data-atmo-user', 'alice');
		doc().body.appendChild(name);
		name.dispatchEvent(new dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 1, clientY: 1 }));
		Array.from(doc().querySelectorAll('[role="menuitem"]')).find(item => item.textContent === 'Color').click();

		const label = requestOverride().textContent;
		requestOverride().click();
		// Shows it is in flight, whatever the words
		expect(requestOverride().textContent).not.toBe(label);
		requestOverride().click();
		await vi.waitFor(() => expect(global.alert).toHaveBeenCalledWith('Request sent to @z0ylent.'));
		// The dialog's version button also checks for an update, on GitHub
		expect(requests.filter(r => r.url.startsWith('https://api.cyberspace.online/')).length).toBe(2);
		expect(requestOverride().textContent).toBe(label);
		name.remove();
	});
});

describe('Poke, in the user menu', () => {
	/**
	 * Open a name's menu and choose Poke.
	 * @param {string} username
	 */
	function poke(username) {
		const name = doc().createElement('a');
		name.href = '/' + username;
		name.setAttribute('data-atmo-user', username);
		doc().body.appendChild(name);
		name.dispatchEvent(new dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 1, clientY: 1 }));
		const item = Array.from(doc().querySelectorAll('[role="menuitem"]')).find(i => i.textContent === 'Poke');
		name.remove();
		return item;
	}

	it('pokes the user once, however often it is chosen, and says so', async () => {
		global.alert = vi.fn();
		signedIn();
		const requests = answerRequests(() => ({ status: 201, body: { data: { poked: true } } }));
		poke('alice').click();
		poke('bob').click();
		expect(global.alert).toHaveBeenCalledWith('Still poking @alice. Wait for that to finish.');
		await vi.waitFor(() => expect(global.alert).toHaveBeenCalledWith('Poked @alice.'));
		const pokes = requests.filter(r => r.url.includes('/poke'));
		expect(pokes.map(r => [r.method, r.url])).toEqual([['POST', 'https://api.cyberspace.online/v1/users/alice/poke']]);
	});

	it('says why Cyberspace refused, as when the hour\'s poke is spent', async () => {
		global.alert = vi.fn();
		signedIn();
		answerRequests(() => ({ status: 429, body: { error: { message: 'Rate limit exceeded' } } }));
		poke('alice').click();
		await vi.waitFor(() => expect(global.alert).toHaveBeenCalledWith('Could not poke @alice. Cyberspace refused it: Rate limit exceeded'));
	});

	it('warns before a second try when it may already have gone', async () => {
		global.alert = vi.fn();
		signedIn();
		answerRequests(() => ({ status: 'timeout' }));
		poke('alice').click();
		await vi.waitFor(() => expect(global.alert.mock.calls[0]?.[0]).toContain('may not have gone through'));
	});
});

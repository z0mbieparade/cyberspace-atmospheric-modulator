/**
 * The username finder's first watcher (src/shared/usernames.js), in a page
 * of its own: names marked before anything watched, as by Refresh Nick
 * Colors while nick colors still waits for its overrides, still reach it.
 */

import { it, expect } from 'vitest';
import { dom } from './setup.js';

it('tells the first watcher about names marked before anything watched', () => {
	dom.window.document.body.innerHTML = '<div class="chat-main-content"><a href="/alice">alice</a></div>';
	rescanUsernames();
	const heard = [];
	watchUsernames(found => heard.push(...found.map(usernameOf)));
	expect(heard).toEqual(['alice']);
});

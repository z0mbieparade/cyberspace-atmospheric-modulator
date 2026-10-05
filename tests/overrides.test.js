/**
 * overrides.json (src/nick-colors/init.js fetchOverrides): every install
 * applies it, so only a name's look gets through, whatever the file holds.
 */

import { it, expect } from 'vitest';
import { dom } from './setup.js';

it('applies only the safe parts of a site-wide override', async () => {
	// The overrides request answers with a hostile entry; anything else, with nothing
	global.gmRequestHandler = (details) => setTimeout(() => details.onload({
		status: 200,
		responseText: details.url.endsWith('overrides.json')
			? JSON.stringify({ alice: { color: '#00ff00', position: 'fixed', zIndex: '9999', backgroundImage: 'url(https://evil.example/t.gif)' } })
			: '{}',
	}), 0);
	const doc = dom.window.document;
	doc.body.innerHTML = '<main><p>hi @alice</p></main>';
	startFeatures();
	await new Promise(resolve => setTimeout(resolve, 30));

	const name = doc.querySelector('[data-atmo-user="alice"]');
	expect(name.style.color).not.toBe('');
	expect(name.style.position).toBe('');
	expect(name.style.zIndex).toBe('');
	expect(name.style.backgroundImage).toBe('');
	delete global.gmRequestHandler;
});

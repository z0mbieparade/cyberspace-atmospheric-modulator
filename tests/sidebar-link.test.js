/**
 * Sidebar link tests (src/sidebar-link.js): after About Cyberspace in the
 * site's sidebar and its mobile bottom bar, named for speech and screen readers, back after the site
 * re-renders the sidebar, and opening the settings tab.
 */

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { dom } from './setup.js';

const doc = dom.window.document;
const link = () => doc.querySelector('[data-atmo-sidebar-link]');

/**
 * The site's collapsed sidebar header, as in its saved settings page.
 * @returns {HTMLElement} the aside
 */
function addSidebar() {
	const aside = doc.createElement('aside');
	aside.className = 'sidebar sidebar-minimized';
	aside.innerHTML = `<div class="sidebar-header">
		<button title="About Cyberspace" aria-label="About Cyberspace"><span class="iconify i-pixel:globe"></span></button>
		<button class="sidebar-toggle" title="Expand sidebar" aria-label="Expand sidebar"></button>
	</div>`;
	doc.body.appendChild(aside);
	return aside;
}

beforeAll(() => initSidebarLink());

afterEach(() => {
	doc.querySelectorAll('aside').forEach(aside => aside.remove());
	sessionStorage.clear();
});

describe('the sidebar link', () => {
	it('sits right under About Cyberspace, once, with a name that starts with its label', async () => {
		addSidebar();
		await Promise.resolve();
		syncSidebarLink();
		expect(doc.querySelectorAll('[data-atmo-sidebar-link]').length).toBe(1);
		expect(link().previousElementSibling.title).toBe('About Cyberspace');
		expect(link().tagName).toBe('BUTTON');

		expect(link().title).toBe(SETTINGS_TAB_TITLE);
		// The version shows with the label, while the sidebar is open
		expect(link().querySelector('.atmo-sidebar-link-label').textContent).toBe(`${SETTINGS_TAB_LABEL} v0.2.3`);
		// Both texts a speech user may see, open and collapsed, are in the name
		expect(link().getAttribute('aria-label')).toContain(link().querySelector('.atmo-sidebar-link-label').textContent);
		expect(link().getAttribute('aria-label')).toContain(link().title);
		expect(link().querySelector('svg').getAttribute('aria-hidden')).toBe('true');
		// The logo's shapes, in the text color: none of the README file's own colors or title
		expect(link().querySelectorAll('svg rect').length).toBe(8);
		expect(link().querySelector('svg style, svg title')).toBeNull();
		// Inline and important, so no theme's !important rule can strip it
		expect(link().style.getPropertyPriority('border-left-style')).toBe('important');
		expect(link().style.getPropertyValue('border-left-style')).toBe('dashed');
	});

	it('sits after About Cyberspace in the mobile bottom bar too, as an icon', () => {
		// The site's mobile bar, as in its saved page
		const bar = doc.createElement('aside');
		bar.className = 'mobile-bottom-nav';
		bar.innerHTML = `<div class="toggle-row">
			<button class="logo-btn" title="About Cyberspace"><span class="iconify i-pixel:globe"></span></button>
			<button class="cmd-btn-collapsed" title="Command Palette (⌘K)"></button>
		</div>`;
		doc.body.appendChild(bar);
		syncSidebarLink();
		syncSidebarLink();
		const mobile = bar.querySelectorAll('[data-atmo-sidebar-link]');
		expect(mobile.length).toBe(1);
		expect(mobile[0].previousElementSibling.title).toBe('About Cyberspace');
		expect(mobile[0].querySelector('.atmo-sidebar-link-label')).toBeNull();
		expect(mobile[0].getAttribute('aria-label')).toContain(SETTINGS_TAB_TITLE);
	});

	it('comes back when the site re-renders the sidebar header', async () => {
		const aside = addSidebar();
		await new Promise(resolve => setTimeout(resolve, 0));
		expect(link()).not.toBeNull();
		// As Vue does: the header's contents replaced, without the link
		const header = aside.querySelector('.sidebar-header');
		header.innerHTML = '<button title="About Cyberspace" aria-label="About Cyberspace"></button>';
		expect(link()).toBeNull();
		await new Promise(resolve => setTimeout(resolve, 0));
		expect(link().previousElementSibling.title).toBe('About Cyberspace');
	});

	it('opens the settings tab at this script\'s section', async () => {
		addSidebar();
		await new Promise(resolve => setTimeout(resolve, 0));
		link().click();
		expect(JSON.parse(sessionStorage.getItem('atmo-settings-focus')).key).toBe(SETTINGS_SECTION_KEY);
	});
});

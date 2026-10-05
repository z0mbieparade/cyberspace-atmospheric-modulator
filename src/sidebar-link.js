// =====================================================
// SIDEBAR LINK
// =====================================================
// A button in the site's sidebar, under About Cyberspace, to this script's
// settings tab. Collapsed, the sidebar shows its icon; open, its label and
// the script's version instead (styles.scss, keyed on the site's
// sidebar-minimized class).

const SIDEBAR_LINK_ATTR = 'data-atmo-sidebar-link';

/**
 * The logo (assets/logo.svg, LOGO_SVG from the build): a pixel waveform, for
 * "modulator". Its shapes only, drawn in the text color like the site's own
 * icons: the file's own colors and title are for the README. Decorative:
 * hidden from assistive tech, as text beside it names what it is on.
 * @param {string} className
 * @returns {string} HTML
 */
function logoIconHtml(className) {
	return `<svg class="${className}" viewBox="0 0 16 16" shape-rendering="crispEdges" fill="currentColor" aria-hidden="true" focusable="false">${LOGO_SVG.match(/<rect[^>]*\/>/g).join('')}</svg>`;
}

/**
 * Put the link under About Cyberspace, if the sidebar is there and the link
 * is not. Safe to call on every mutation: once it is in, it writes nothing.
 * Side effects: adds the button to the site's sidebar header.
 */
function syncSidebarLink() {
	const about = document.querySelector('aside.sidebar button[title="About Cyberspace"]');
	if (!about || about.parentElement.querySelector(`[${SIDEBAR_LINK_ATTR}]`)) return;
	const link = document.createElement('button');
	link.type = 'button';
	link.setAttribute(SIDEBAR_LINK_ATTR, '');
	// The About button's look: the site's own utility classes
	link.className = 'atmo-sidebar-link no-underline hover:opacity-70 transition-opacity bg-transparent py-1 cursor-pointer w-full';
	link.title = SETTINGS_TAB_TITLE;
	// The dashed border marks it as the userscript's, not the site's. Inline
	// and important: a theme strips every sidebar button's border with an
	// !important rule (brutalist: [data-theme="brutalist"] .sidebar button),
	// and only an inline !important outranks that, whatever its selector
	link.style.setProperty('border-width', '1px', 'important');
	link.style.setProperty('border-style', 'dashed', 'important');
	link.style.setProperty('border-color', 'var(--color-border, currentColor)', 'important');
	const label = `${SETTINGS_TAB_LABEL} v${VERSION}`;
	// Holds both texts a speech user may see and say (WCAG 2.5.3): the label
	// while the sidebar is open, the tooltip while it is collapsed
	link.setAttribute('aria-label', `${label}: ${SETTINGS_TAB_TITLE}`);
	link.innerHTML = `${logoIconHtml('atmo-sidebar-link-icon w-5 h-5')}<span class="atmo-sidebar-link-label">${escapeHtml(label)}</span>`;
	link.addEventListener('click', () => openSettingsSection(SETTINGS_SECTION_KEY));
	about.after(link);
}

/**
 * Add the sidebar link, and put it back whenever the site re-renders the sidebar.
 * Side effects: adds the link; observes <body> for the page's life.
 */
function initSidebarLink() {
	syncSidebarLink();
	new MutationObserver(syncSidebarLink).observe(document.body, { childList: true, subtree: true });
}

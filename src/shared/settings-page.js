// =====================================================
// SETTINGS PAGE: a "Userscripts" tab on the site's /settings pages
// =====================================================
// The site has one route per settings tab and no catch-all to borrow
// (/settings/<other> would match its /:username/:postId page), so the tab is
// an anchor on whatever tab is showing: /settings/<tab>#userscripts, or the
// hash a script names (configureSettingsTab). Opening
// it hides that tab's content and shows a panel with one section per
// installed script. Every script running this file shares the tab and the
// panel through the DOM; each adds only its own section.
//
// The site re-renders the settings page on navigation, which drops anything
// added to it, so a MutationObserver puts the tab back.
//
// Requires ui-dialog.js (uiClass, warningBoxHtml, attributionHtml) and
// theme-colors.js (initThemeVariables) before this
// file, and update-check.js (bindVersionLink) in the bundle.

const SETTINGS_PANEL_ID = `${UI_PREFIX}-settings-panel`;
// Marks what we add, and the site elements we change, for undoing it
const SETTINGS_TAB_ATTR = `data-${UI_PREFIX}-settings-tab`;
const SETTINGS_SECTION_ATTR = `data-${UI_PREFIX}-settings-section`;
// A section's order, on its element: every script sorts by it, then by key
const SETTINGS_SECTION_ORDER_ATTR = `data-${UI_PREFIX}-settings-section-order`;
const SETTINGS_HIDDEN_ATTR = `data-${UI_PREFIX}-settings-hidden`;
const SETTINGS_SAVED_CLASS_ATTR = `data-${UI_PREFIX}-settings-class`;

// This script's sections: { key, title, description, order, startsOpen, render(container) }
const settingsSections = [];
// Settings dialogs showing the sections (renderSettingsSections), besides
// the tab's panel
const settingsSectionHosts = new Set();
// Which of this script's sections are folded open, by key: kept in GM storage,
// so each stays the way the user left it. Requires 'settingsSectionsOpen' in
// GM_STORAGE_KEYS
const SETTINGS_OPEN_KEY = 'settingsSectionsOpen';
// On a section whose fold shows its saved state: one drawn before async
// storage loaded gets it on the next sync
const SETTINGS_FOLD_SYNCED_ATTR = `data-${UI_PREFIX}-settings-fold-synced`;
// Sections a link opened on this page (focusSettingsSection): they stay open
// when the saved states arrive from async storage, until the user folds them
const settingsSectionsOpenedByLink = new Set();
let settingsPageWatched = false;
// The tab's name lives on <html>, not in this script: every script on the
// page reads the same one, so they cannot each rewrite the tab with their own
const SETTINGS_TAB_LABEL_ATTR = `data-${UI_PREFIX}-settings-tab-label`;
const SETTINGS_TAB_TITLE_ATTR = `data-${UI_PREFIX}-settings-tab-title`;
const SETTINGS_TAB_HASH_ATTR = `data-${UI_PREFIX}-settings-tab-hash`;
// The hash when no script names one
const DEFAULT_SETTINGS_TAB_HASH = 'userscripts';
const SETTINGS_TAB_WARNING_ATTR = `data-${UI_PREFIX}-settings-tab-warning`;
const SETTINGS_TAB_ATTRIBUTION_ATTR = `data-${UI_PREFIX}-settings-tab-attribution`;
// Which script configured the tab: only it binds the notice's version button,
// since its button opens that script's install page
const SETTINGS_TAB_OWNER_ATTR = `data-${UI_PREFIX}-settings-tab-owner`;
// On a version button, the script that bound it
const SETTINGS_VERSION_BOUND_ATTR = `data-${UI_PREFIX}-version-bound`;
// The notice at the top of the panel (warning, attribution row), and the
// HTML it was last written from (so it is rewritten only when that changes)
const SETTINGS_NOTICE_CLASS = `${UI_PREFIX}-settings-notice`;
const SETTINGS_NOTICE_HTML_ATTR = `data-${UI_PREFIX}-settings-notice-html`;

/**
 * The tab's URL hash, as named by configureSettingsTab.
 * @returns {string} e.g. '#userscripts'
 */
function settingsTabHash() {
	return '#' + (document.documentElement.getAttribute(SETTINGS_TAB_HASH_ATTR) || DEFAULT_SETTINGS_TAB_HASH);
}

/**
 * Name the settings tab, for every script on the page; the last to call this
 * names it. A script that never calls it leaves the name alone, and with no
 * name set the tab reads "Userscripts" at #userscripts.
 * Side effects: sets attributes on <html>, re-syncs the page, and starts
 * watchSettingsPage once per page: a MutationObserver on document.body plus
 * click, hashchange and popstate listeners, kept for the page's life.
 * @param {{label: string, title?: string, hash?: string, warning?: string, attribution?: string[]}} text -
 *   label: the visible tab text; title: a longer description, shown on hover
 *   and read as part of its name; hash: the tab's URL hash, without the '#';
 *   warning, attribution: as in a dialog's footer (createDialog), shown at
 *   the top of the panel. HTML written by the script: not escaped
 */
function configureSettingsTab({ label, title = '', hash = DEFAULT_SETTINGS_TAB_HASH, warning = '', attribution = [] }) {
	document.documentElement.setAttribute(SETTINGS_TAB_LABEL_ATTR, label);
	document.documentElement.setAttribute(SETTINGS_TAB_TITLE_ATTR, title);
	document.documentElement.setAttribute(SETTINGS_TAB_HASH_ATTR, hash);
	document.documentElement.setAttribute(SETTINGS_TAB_WARNING_ATTR, warning);
	document.documentElement.setAttribute(SETTINGS_TAB_ATTRIBUTION_ATTR, JSON.stringify(attribution));
	document.documentElement.setAttribute(SETTINGS_TAB_OWNER_ATTR, UI_ID_NAMESPACE);
	// The owner binds the notice's version button after any rewrite, so it
	// must watch the page even with no section of its own
	watchSettingsPage();
	syncSettingsPage();
}

/**
 * Set an attribute only when it differs: every write is a mutation, and the
 * observer would sync again, forever.
 * @param {Element} el
 * @param {string} name
 * @param {string|null} value - null removes it
 */
function setAttributeIfChanged(el, name, value) {
	if (value === null) {
		if (el.hasAttribute(name)) el.removeAttribute(name);
	} else if (el.getAttribute(name) !== value) {
		el.setAttribute(name, value);
	}
}

/**
 * Add a section to the Userscripts settings tab.
 * @param {{key: string, title: string, description?: string, icon?: string, order?: number, startsOpen?: boolean, isShown?: function(): boolean, render: function(HTMLElement): void}} section -
 *   key: unique per script; order: lower comes first, default 0, with ties
 *   sorted by key; startsOpen: unfolded until the user folds or unfolds it,
 *   default false; description: plain text
 *   under the heading, in the site's own style; icon: HTML written by the
 *   script, shown before the title as given: mark it aria-hidden yourself,
 *   as the title already names the section; isShown: whether the section
 *   is on the tab now, default always, checked on every syncSettingsPage;
 *   render: fills the section's body (a .atmo-panel), called once each time
 *   the section is added
 */
function registerSettingsSection(section) {
	settingsSections.push(section);
	watchSettingsPage();
	syncSettingsPage();
}

/**
 * The saved fold states: { key: open }, or {} when none or unreadable.
 * @returns {Object}
 */
function readSettingsSectionsOpen() {
	try {
		const open = JSON.parse(_GM_getValue(SETTINGS_OPEN_KEY, '{}'));
		return open && typeof open === 'object' && !Array.isArray(open) ? open : {};
	} catch (e) {
		return {};
	}
}

/**
 * Whether a section is folded open: as the user last left it, or its
 * startsOpen until then.
 * @param {{key: string, startsOpen?: boolean}} section
 * @returns {boolean}
 */
function isSettingsSectionOpen(section) {
	const open = readSettingsSectionsOpen();
	return typeof open[section.key] === 'boolean' ? open[section.key] : !!section.startsOpen;
}

/**
 * Whether a section should be folded open: a link opened it on this page, or
 * as saved (isSettingsSectionOpen).
 * @param {{key: string, startsOpen?: boolean}} section
 * @returns {boolean}
 */
function settingsSectionShouldBeOpen(section) {
	return settingsSectionsOpenedByLink.has(section.key) || isSettingsSectionOpen(section);
}

/**
 * The button that folds the section holding el: where focus can go when a
 * section's contents are redrawn and nothing in them is left to take it.
 * @param {Element} el - the section, or anything inside it
 * @returns {HTMLButtonElement|null}
 */
function settingsSectionFoldButton(el) {
	return el.closest(`[${SETTINGS_SECTION_ATTR}]`)?.querySelector(':scope > h3 > button') ?? null;
}

/**
 * Put a dot on a section's heading, for something waiting in it, or take
 * it off. The dot carries its label as hidden text, so the heading's
 * button says it to a screen reader too, and as a tooltip.
 * Side effects: adds, updates or removes the dot in the section's heading.
 * @param {Element} el - the section, or anything inside it, as its body
 * @param {string|null} label - e.g. 'update available'; null to take it off
 */
function setSettingsSectionBadge(el, label) {
	const toggle = settingsSectionFoldButton(el);
	if (!toggle) return;
	let badge = toggle.querySelector('.' + uiClass('settings-badge'));
	if (!label) {
		badge?.remove();
		return;
	}
	if (!badge) {
		badge = document.createElement('span');
		badge.className = uiClass('settings-badge');
		toggle.append(badge);
	}
	badge.title = label;
	badge.textContent = '';
	const text = document.createElement('span');
	text.className = uiClass('settings-badge-text');
	text.textContent = ` (${label})`;
	badge.append(text);
}

/**
 * Fold a section open or shut.
 * Side effects: sets its button's aria-expanded and its contents' hidden.
 * @param {HTMLElement} section - the section element
 * @param {boolean} isOpen
 */
function setSettingsSectionOpen(section, isOpen) {
	settingsSectionFoldButton(section).setAttribute('aria-expanded', String(isOpen));
	section.querySelector(':scope > h3 + div').hidden = !isOpen;
}

/**
 * Remember whether a section is folded open. Before async storage loads,
 * nothing: a write then would replace every saved state with this one.
 * Side effects: writes SETTINGS_OPEN_KEY to GM storage.
 * @param {string} key
 * @param {boolean} isOpen
 */
function saveSettingsSectionOpen(key, isOpen) {
	if (!isGMStorageReady()) return;
	const open = readSettingsSectionsOpen();
	if (open[key] === isOpen) return;
	open[key] = isOpen;
	_GM_setValue(SETTINGS_OPEN_KEY, JSON.stringify(open));
}

/**
 * Put this script's shown sections in host, in order, and take out the
 * ones no longer shown: the settings tab's panel, or a settings dialog
 * (renderSettingsSections), built the same way in both.
 * Side effects: adds, renders, folds or removes section elements in host.
 * @param {HTMLElement} host
 */
function syncSettingsSections(host) {
	for (const section of settingsSections) {
		const existing = host.querySelector(`[${SETTINGS_SECTION_ATTR}="${section.key}"]`);
		const shown = !section.isShown || section.isShown();
		if (!shown) {
			existing?.remove();
			continue;
		}
		if (existing) {
			if (!existing.hasAttribute(SETTINGS_FOLD_SYNCED_ATTR) && isGMStorageReady()) {
				setSettingsSectionOpen(existing, settingsSectionShouldBeOpen(section));
				existing.setAttribute(SETTINGS_FOLD_SYNCED_ATTR, '');
			}
			continue;
		}
		// The site's own settings box and heading; our styles apply only
		// inside the body, so the heading keeps the site's look
		const el = document.createElement('section');
		el.setAttribute(SETTINGS_SECTION_ATTR, section.key);
		const order = section.order ?? 0;
		el.setAttribute(SETTINGS_SECTION_ORDER_ATTR, String(order));
		el.className = 'terminal-box p-4 mb-3';
		// The site's heading, holding a button that folds the section under it:
		// the page holds several long sections. A heading inside <summary>
		// would lose its heading role, so this is the disclosure pattern
		const heading = document.createElement('h3');
		// The site tightens the gap when a description follows
		heading.className = `text-xs ${section.description ? 'mb-2' : 'mb-3'} uppercase tracking-wider`;
		const toggle = document.createElement('button');
		toggle.type = 'button';
		toggle.className = uiClass('settings-fold');
		const marker = document.createElement('span');
		marker.className = uiClass('settings-fold-marker');
		marker.setAttribute('aria-hidden', 'true');
		const title = document.createElement('span');
		title.textContent = section.title;
		toggle.append(marker, title);
		// Decorative, before the title: the script's own HTML
		if (section.icon) title.insertAdjacentHTML('beforebegin', section.icon);
		heading.append(toggle);
		el.append(heading);
		const fold = document.createElement('div');
		fold.id = uiId('settings-fold');
		toggle.setAttribute('aria-controls', fold.id);
		if (section.description) {
			// The site's own description style, as under its settings headings
			const description = document.createElement('p');
			description.className = 'text-fg-dim text-sm mb-3';
			description.textContent = section.description;
			fold.append(description);
		}
		const body = document.createElement('div');
		body.className = uiClass('panel');
		fold.append(body);
		el.append(fold);
		// Until storage loads (async GM storage), the saved state is unknown:
		// the default for now, and the saved one once syncSettingsPage runs again
		setSettingsSectionOpen(el, settingsSectionShouldBeOpen(section));
		if (isGMStorageReady()) el.setAttribute(SETTINGS_FOLD_SYNCED_ATTR, '');
		toggle.addEventListener('click', () => {
			settingsSectionsOpenedByLink.delete(section.key);
			const open = toggle.getAttribute('aria-expanded') !== 'true';
			setSettingsSectionOpen(el, open);
			saveSettingsSectionOpen(section.key, open);
		});
		// Sorted by order, then key, so every script inserts in the same order
		const next = Array.from(host.children).find((other) => {
			const otherKey = other.getAttribute(SETTINGS_SECTION_ATTR);
			if (otherKey === null) return false;
			const otherOrder = Number(other.getAttribute(SETTINGS_SECTION_ORDER_ATTR)) || 0;
			return otherOrder > order || (otherOrder === order && otherKey > section.key);
		});
		host.insertBefore(el, next || null);
		section.render(body);
	}
}

/**
 * Show this script's sections in host, as the settings tab shows them,
 * and keep them in step with it while host is on the page.
 * Side effects: renders the sections into host; syncSettingsPage then
 * updates it too, until host leaves the page.
 * @param {HTMLElement} host - e.g. a dialog's content
 */
function renderSettingsSections(host) {
	settingsSectionHosts.add(host);
	syncSettingsSections(host);
}

/**
 * Re-render one of this script's sections, every copy of it, from the
 * current settings: after they changed outside it, as an import or a theme
 * change does. Not from a change made in the section itself: that would
 * redraw the form being used and drop its focus. A section that auto-saves its whole
 * form would otherwise write back the values it read when it rendered.
 * Side effects: replaces the section, when it is on the page.
 * @param {string} key - as given to registerSettingsSection
 */
function refreshSettingsSection(key) {
	// On the tab and in an open dialog alike
	document.querySelectorAll(`[${SETTINGS_SECTION_ATTR}="${key}"]`).forEach(el => el.remove());
	syncSettingsPage();
}

/**
 * Redraw this script's sections on the settings tab from the current
 * settings: after a settings dialog closed, whose changes they do not show
 * yet. While the dialog was open its overlay kept them out of reach, so
 * they could not write older values back meanwhile. Another script's
 * sections in the shared panel are left alone. Focus in a redrawn section
 * goes back to the same field, else to the section's fold button.
 * Side effects: replaces this script's sections on the tab, when it is on
 * the page; may move focus.
 */
function refreshSettingsTabSections() {
	const panel = document.getElementById(SETTINGS_PANEL_ID);
	if (!panel) return;
	const ours = new Set(settingsSections.map(section => section.key));
	// Where focus is, as the dialog's close just put it back
	const active = document.activeElement;
	const focusedSection = panel.contains(active) ? active.closest(`[${SETTINGS_SECTION_ATTR}]`) : null;
	const focusKey = focusedSection?.getAttribute(SETTINGS_SECTION_ATTR);
	const fieldKey = focusedSection ? active.closest('[data-field-key]')?.dataset.fieldKey : undefined;
	panel.querySelectorAll(`[${SETTINGS_SECTION_ATTR}]`).forEach(el => {
		if (ours.has(el.getAttribute(SETTINGS_SECTION_ATTR))) el.remove();
	});
	syncSettingsPage();
	if (!focusKey || !ours.has(focusKey)) return;
	const section = panel.querySelector(`[${SETTINGS_SECTION_ATTR}="${focusKey}"]`);
	const field = fieldKey && section?.querySelector(`[data-field-key="${fieldKey}"] :is(input, select, textarea, button)`);
	(field || (section && settingsSectionFoldButton(section)))?.focus();
}

// A section to scroll to once it renders, after openSettingsSection had to
// load the settings page first. In sessionStorage: it outlives that load
const SETTINGS_FOCUS_KEY = `${UI_PREFIX}-settings-focus`;
// A request older than this was abandoned (the load was stopped, or went
// elsewhere): it must not jump a later visit to the tab
const SETTINGS_FOCUS_TTL_MS = 30 * 1000;

/**
 * Whether this is one of the site's settings pages, with its tab bar rendered.
 * @returns {boolean}
 */
function isSettingsPage() {
	return location.pathname.startsWith('/settings/') && findSettingsTabBars().length > 0;
}

/**
 * Open the settings tab in place, by its hash.
 * Side effects: changes location.hash, and syncs the page.
 */
function showSettingsTab() {
	// A plain hash change: the site's router keeps the route, and hashchange
	// syncs too. Sync directly as well, in case the hash was already set
	if (location.hash !== settingsTabHash()) location.hash = settingsTabHash();
	syncSettingsPage();
}

/**
 * Where to load the settings tab from another page: the site's last-used
 * settings tab (bare /settings would redirect there, dropping the hash).
 * @returns {string} a /settings/<tab> path with the tab's hash
 */
function settingsTabUrl() {
	const lastTab = localStorage.getItem('lastSettingsTab');
	const tabPath = lastTab && /^\/settings\/[a-z]+$/.test(lastTab) ? lastTab : '/settings/account';
	return tabPath + settingsTabHash();
}

/**
 * Show one of this script's sections on the settings tab: in place on a
 * settings page, else by loading settingsTabUrl() and scrolling there once
 * the section renders.
 * Side effects: may navigate the page; scrolls to and focuses the section's heading.
 * @param {string} key - as given to registerSettingsSection
 */
function openSettingsSection(key) {
	if (isSettingsPage()) {
		showSettingsTab();
		focusSettingsSection(key);
		return;
	}
	sessionStorage.setItem(SETTINGS_FOCUS_KEY, JSON.stringify({ key, expires: Date.now() + SETTINGS_FOCUS_TTL_MS }));
	location.assign(settingsTabUrl());
}

/**
 * The section openSettingsSection asked to focus, if the request is recent.
 * Side effects: drops an expired or unreadable request.
 * @returns {string|null} the section key
 */
function readPendingFocus() {
	const raw = sessionStorage.getItem(SETTINGS_FOCUS_KEY);
	if (!raw) return null;
	try {
		const { key, expires } = JSON.parse(raw);
		if (typeof key === 'string' && Date.now() < expires) return key;
	} catch (e) { /* unreadable: drop it */ }
	sessionStorage.removeItem(SETTINGS_FOCUS_KEY);
	return null;
}

/**
 * Unfold a section, scroll it into view and move focus to its heading.
 * Side effects: opens the section's fold, keeps it open on this page when
 * saved states load, and saves it open once storage is ready, as a click
 * would; makes the heading focusable from script (tabIndex -1), scrolls, and moves focus.
 * @param {string} key
 * @param {ParentNode} [root] - where to look: a settings dialog, else the page
 * @returns {boolean} whether the section is shown and was focused
 */
function focusSettingsSection(key, root = document) {
	const heading = root.querySelector(`[${SETTINGS_SECTION_ATTR}="${key}"] > h3`);
	// A heading in the closed panel cannot take focus
	if (!heading || heading.closest('[hidden]')) return false;
	const section = heading.parentElement;
	settingsSectionsOpenedByLink.add(key);
	setSettingsSectionOpen(section, true);
	// Before async storage loads, the write waits for it
	whenGMStorageReady(() => saveSettingsSectionOpen(key, true));
	// Focusable from script only, so screen readers announce where they landed
	heading.tabIndex = -1;
	heading.scrollIntoView?.({ block: 'start' });
	heading.focus();
	return true;
}

/**
 * Start keeping the tab in place. Idempotent.
 * Side effects: a MutationObserver on document.body, and click, hashchange
 * and popstate listeners.
 */
function watchSettingsPage() {
	if (settingsPageWatched) return;
	settingsPageWatched = true;

	let scheduled = false;
	const schedule = () => {
		if (scheduled) return;
		scheduled = true;
		// Batch a re-render's mutations; our own changes settle in one pass,
		// since a second sync finds nothing left to do
		setTimeout(() => {
			scheduled = false;
			syncSettingsPage();
		}, 0);
	};
	new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
	// Sections drawn before async storage loaded get their saved folds then
	whenGMStorageReady(schedule);
	window.addEventListener('hashchange', schedule);
	window.addEventListener('popstate', schedule);

	document.addEventListener('click', (e) => {
		const link = e.target.closest && e.target.closest('a');
		if (!link || !link.closest('main')) return;
		if (link.hasAttribute(SETTINGS_TAB_ATTR)) {
			e.preventDefault();
			showSettingsTab();
			return;
		}
		// A modified click opens a new browser tab and this page stays put
		if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
		// The site's own tabs navigate with history.pushState, which fires
		// no event; leave the Userscripts tab now rather than miss it
		if (/^\/settings\//.test(link.getAttribute('href') || '')) {
			syncSettingsPage(false);
		}
	}, true);
}

/**
 * The site's tab bars: the elements holding a link to /settings/account.
 * @returns {HTMLElement[]} the mobile grid and the desktop row, when rendered
 */
function findSettingsTabBars() {
	return Array.from(document.querySelectorAll('main a[href="/settings/account"]'))
		.map(link => link.parentElement)
		.filter((bar, i, all) => bar && all.indexOf(bar) === i);
}

/**
 * The class list of a site tab link, without the router's state classes.
 * @param {HTMLAnchorElement} link
 * @returns {string}
 */
function siteTabClass(link) {
	return (link.getAttribute(SETTINGS_SAVED_CLASS_ATTR) ?? link.className)
		.split(/\s+/).filter(c => c && !c.startsWith('router-link')).join(' ');
}

/**
 * Make the page match the URL: add the tab where it is missing, and show
 * either the Userscripts panel or the site's tab content.
 * @param {boolean} [active] - override, for a navigation the URL does not show yet
 */
function syncSettingsPage(active = location.pathname.startsWith('/settings/') && location.hash === settingsTabHash()) {
	// The sections in an open settings dialog follow too, on any page
	for (const host of settingsSectionHosts) {
		if (host.isConnected) syncSettingsSections(host);
		else settingsSectionHosts.delete(host);
	}
	const bars = findSettingsTabBars();
	if (!bars.length) return;

	for (const bar of bars) {
		const siteLinks = Array.from(bar.querySelectorAll(`a[href^="/settings/"]:not([${SETTINGS_TAB_ATTR}])`));
		// The site marks its current tab with aria-current; one we demoted
		// carries the class we saved from it instead
		const routerCurrent = siteLinks.find(l => l.getAttribute('aria-current') === 'page');
		const demoted = siteLinks.filter(l => l.hasAttribute(SETTINGS_SAVED_CLASS_ATTR));
		const idle = siteLinks.find(l => l !== routerCurrent && !demoted.includes(l));
		if (!idle) continue;

		let tab = bar.querySelector(`a[${SETTINGS_TAB_ATTR}]`);
		if (!tab) {
			tab = document.createElement('a');
			tab.setAttribute(SETTINGS_TAB_ATTR, '');
			// After the last site tab: a filler cell (the mobile grid has one)
			// stays last
			siteLinks[siteLinks.length - 1].after(tab);
		}
		tab.href = location.pathname + settingsTabHash();
		// Written only when it differs: a rewrite is a mutation, which syncs again
		const label = document.documentElement.getAttribute(SETTINGS_TAB_LABEL_ATTR) || 'Userscripts';
		const title = document.documentElement.getAttribute(SETTINGS_TAB_TITLE_ATTR) || '';
		if (tab.textContent !== label) tab.textContent = label;
		// The hover title is mouse-only, so the name carries it too, starting
		// with the visible label so speech users can say what they see
		setAttributeIfChanged(tab, 'title', title || null);
		setAttributeIfChanged(tab, 'aria-label', title ? `${label}, ${title}` : null);

		if (active) {
			// Ours takes the active tab's look; the site's active tab takes an
			// idle one's, saved so it can be put back
			const current = routerCurrent || demoted[0];
			if (current) {
				if (!current.hasAttribute(SETTINGS_SAVED_CLASS_ATTR)) current.setAttribute(SETTINGS_SAVED_CLASS_ATTR, current.className);
				tab.className = siteTabClass(current);
				current.className = siteTabClass(idle);
				current.removeAttribute('aria-current');
			}
			tab.setAttribute('aria-current', 'page');
		} else {
			for (const link of demoted) {
				// If the router has made another tab current meanwhile (Back,
				// Forward), it has restyled this one already: just forget it
				if (!routerCurrent) {
					link.className = link.getAttribute(SETTINGS_SAVED_CLASS_ATTR);
					link.setAttribute('aria-current', 'page');
				}
				link.removeAttribute(SETTINGS_SAVED_CLASS_ATTR);
			}
			tab.className = siteTabClass(idle);
			tab.removeAttribute('aria-current');
		}
	}

	// The tab content: everything after the tab bars in their container
	const container = bars[0].parentElement;
	let panel = document.getElementById(SETTINGS_PANEL_ID);
	let created = false;
	if (!panel || panel.parentElement !== container) {
		panel?.remove();
		panel = document.createElement('div');
		panel.id = SETTINGS_PANEL_ID;
		panel.className = 'mb-6';
		bars[bars.length - 1].after(panel);
		created = true;
	}
	// Each time the tab is shown: its controls are drawn in the --atmo-*
	// colors, which nothing else may have published yet (a script with no
	// menu or dialog open), and the theme may have changed on another tab
	if (active && (created || panel.hidden)) initThemeVariables();
	panel.hidden = !active;

	// The notice stays first: the panel is long, and it says where to report
	// problems. Written only when it changes, like the tab's name
	const root = document.documentElement;
	let attribution = [];
	try { attribution = JSON.parse(root.getAttribute(SETTINGS_TAB_ATTRIBUTION_ATTR) || '[]'); } catch (e) { /* none */ }
	const noticeHtml = (root.getAttribute(SETTINGS_TAB_WARNING_ATTR) ? warningBoxHtml(root.getAttribute(SETTINGS_TAB_WARNING_ATTR)) : '')
		+ attributionHtml(attribution);
	let notice = panel.querySelector(':scope > .' + SETTINGS_NOTICE_CLASS);
	if (!noticeHtml) {
		notice?.remove();
	} else {
		if (!notice) {
			notice = document.createElement('div');
			// .atmo-panel, so the shared warning and attribution styles apply
			notice.className = `${SETTINGS_NOTICE_CLASS} ${uiClass('panel')} mb-3`;
		}
		if (panel.firstElementChild !== notice) panel.prepend(notice);
		if (notice.getAttribute(SETTINGS_NOTICE_HTML_ATTR) !== noticeHtml) {
			notice.setAttribute(SETTINGS_NOTICE_HTML_ATTR, noticeHtml);
			notice.innerHTML = noticeHtml;
		}
		// Whichever script wrote the notice, the one that configured the tab
		// binds its version button; its own observer gets here after a rewrite
		const versionLink = notice.querySelector('.' + uiClass('version-link'));
		if (versionLink && root.getAttribute(SETTINGS_TAB_OWNER_ATTR) === UI_ID_NAMESPACE
			&& !versionLink.hasAttribute(SETTINGS_VERSION_BOUND_ATTR)) {
			versionLink.setAttribute(SETTINGS_VERSION_BOUND_ATTR, UI_ID_NAMESPACE);
			bindVersionLink(versionLink);
		}
	}

	// Hidden with an important inline display rather than the hidden
	// attribute: a display class on the site's element (flex, grid) would
	// beat the attribute's stylesheet rule. The inline value is saved to put back
	for (const child of Array.from(container.children)) {
		if (bars.includes(child) || child === panel) continue;
		if (active && !child.hasAttribute(SETTINGS_HIDDEN_ATTR)) {
			child.setAttribute(SETTINGS_HIDDEN_ATTR, child.style.getPropertyValue('display'));
			child.style.setProperty('display', 'none', 'important');
		} else if (!active && child.hasAttribute(SETTINGS_HIDDEN_ATTR)) {
			const display = child.getAttribute(SETTINGS_HIDDEN_ATTR);
			if (display) child.style.setProperty('display', display);
			else child.style.removeProperty('display');
			child.removeAttribute(SETTINGS_HIDDEN_ATTR);
		}
	}

	syncSettingsSections(panel);

	// Arrived from openSettingsSection on another page
	const pending = readPendingFocus();
	if (pending && active && focusSettingsSection(pending)) {
		sessionStorage.removeItem(SETTINGS_FOCUS_KEY);
	}
}

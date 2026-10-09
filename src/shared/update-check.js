// =====================================================
// UPDATE CHECK
// =====================================================
// Finds out whether a newer release of the script is published, and says so
// with a banner at the top of the page and in the dialog footer's version
// button. Any script built on these files shares the atmo- UI, so a stale
// install of one could restyle another; prompting for updates keeps them on
// the same shared version.
//
// Requires, from the script:
//   SCRIPT_NAME        e.g. 'Nick Colors', shown in the banner
//   logDebug()
//   'dismissedUpdateVersion' in GM_STORAGE_KEYS: async GM storage
//                      (Greasemonkey 4) only loads listed keys, and an
//                      unlisted one would bring the banner back after x
//   @grant GM_xmlhttpRequest and GM.xmlHttpRequest, and @connect for the
//                      update URL's host; without them the check uses fetch
// Optional, from the script:
//   CHANGELOG_URL      the raw CHANGELOG.md: the banner shows each newer
//                      version's one-line summary, a "> " line under its
//                      "## [x.y.z]" heading
// From the build: VERSION, and SCRIPT_URL from the header's @downloadURL.
// From the shared files: gm-storage.js and ui-dialog.js before this one, and
// theme-colors.js anywhere (the banner's colors).


// null = not checked yet, false = up to date, or the newer version string
let UPDATE_AVAILABLE = null;

// Tampermonkey names it GM_xmlhttpRequest, Greasemonkey 4 GM.xmlHttpRequest
const gmXmlHttpRequest = (typeof GM_xmlhttpRequest !== 'undefined')
	? GM_xmlhttpRequest
	: (typeof GM !== 'undefined' && typeof GM.xmlHttpRequest === 'function')
		? GM.xmlHttpRequest
		: null;

/**
 * GET a URL as text, through the manager when it grants requests (no CORS),
 * else with fetch.
 * @param {string} url
 * @returns {Promise<string>}
 * @throws {Error} rejects when the request fails
 */
function fetchText(url) {
	// Inside a promise, so a missing fetch rejects instead of throwing into the caller
	if (!gmXmlHttpRequest) return Promise.resolve().then(() => fetch(url)).then(r => r.text());
	return new Promise((resolve, reject) => {
		gmXmlHttpRequest({
			method: 'GET',
			url,
			onload: (response) => resolve(response.responseText),
			onerror: (e) => reject(e instanceof Error ? e : new Error(`Request failed: ${url}`)),
		});
	});
}

/**
 * The URL to install the script from: what the manager recorded at install,
 * else SCRIPT_URL.
 * @returns {string}
 */
function getScriptURL() {
	const script = (typeof GM_info !== 'undefined' && GM_info.script) ? GM_info.script : null;
	return (script && (script.downloadURL || script.updateURL)) || SCRIPT_URL;
}

function getDismissedUpdateVersion() {
	return _GM_getValue('dismissedUpdateVersion', '') || '';
}

/**
 * @param {string} version - the release the user chose not to be told about again
 */
function saveDismissedUpdateVersion(version) {
	_GM_setValue('dismissedUpdateVersion', version);
}

/**
 * Compare dotted versions numerically, segment by segment.
 * @param {string} a
 * @param {string} b
 * @returns {number} -1, 0 or 1
 */
function compareVersions(a, b) {
	// Tolerate a leading 'v' - a '@version v1.3.4' header would otherwise read as 0.3.4
	// and silently never register as an update
	const split = (version) => String(version ?? '').trim().replace(/^v/i, '').split('.');
	const segmentsA = split(a);
	const segmentsB = split(b);
	const segmentCount = Math.max(segmentsA.length, segmentsB.length);

	for (let i = 0; i < segmentCount; i++) {
		const valueA = parseInt(segmentsA[i], 10) || 0;
		const valueB = parseInt(segmentsB[i], 10) || 0;
		if (valueA !== valueB) return valueA < valueB ? -1 : 1;
	}
	return 0;
}

/**
 * @param {string} remoteVersion
 * @param {string} localVersion
 * @returns {boolean}
 */
function isNewerVersion(remoteVersion, localVersion) {
	return compareVersions(remoteVersion, localVersion) > 0;
}

/**
 * Record whether a fetched copy of the script is newer than this one.
 * Side effects: sets UPDATE_AVAILABLE; leaves it alone when the text has no @version.
 * @param {string} scriptText
 */
function applyUpdateCheckResult(scriptText) {
	const match = scriptText.match(/@version\s+(\S+)/);
	if (!match) return;
	const remoteVersion = match[1];
	UPDATE_AVAILABLE = isNewerVersion(remoteVersion, VERSION) ? remoteVersion : false;
}

// The one check per page load: every caller (the banner, each version
// button) shares it, so none of them sends a request of its own
let updateCheck = null;

/**
 * Fetch the published script and record whether it is newer, once per page
 * load; later calls get the same result. Without manager requests the fetch
 * uses SCRIPT_URL, which avoids the github.com redirect that breaks CORS.
 * Side effects: sets UPDATE_AVAILABLE. Never rejects: a failed check is
 * logged, and not retried until the next load.
 * @returns {Promise<void>}
 */
function checkForUpdates() {
	if (!updateCheck) {
		const updateURL = gmXmlHttpRequest ? getScriptURL() : SCRIPT_URL;
		updateCheck = fetchText(updateURL)
			.then(applyUpdateCheckResult)
			.catch(e => logDebug(LOG_PREFIX + ' Update check failed:', e));
	}
	return updateCheck;
}

// Summaries the banner shows; more get a line saying how many more
const UPDATE_SUMMARIES_SHOWN = 3;
// Each summary is one line: a longer one is cut
const UPDATE_SUMMARY_MAX_LENGTH = 160;
// The changelog is extra: a slow one must not hold the banner back, and a
// request that never answers (fetchText has no timeout) must not hide it
const UPDATE_CHANGELOG_TIMEOUT_MS = 5000;

/**
 * The one-line summaries a changelog gives each version after `since`, up
 * to and including `upTo`: the "> " line under a "## [x.y.z]" heading.
 * @param {string} text - CHANGELOG.md
 * @param {string|null} [since] - the installed version; null for every
 *   version from the first
 * @param {string|null} [upTo] - the published version; null for no limit
 * @returns {{version: string, summary: string}[]} newest first; a version
 *   without a summary line, or not numbered (Unreleased), is left out. The
 *   list ends at a heading newer than the one before it: a changelog lists
 *   newest first, so that starts an older project's history, whose version
 *   numbers are not this script's (Nick Colors 1.x under its 0.x)
 */
function changelogSummaries(text, since = null, upTo = null) {
	const summaries = [];
	let previous = null;
	for (const [, version, summary] of String(text).replace(/\r\n?/g, '\n').matchAll(/^## \[([^\]\n]+)\][^\n]*\n+(?:> ?([^\n]+))?/gm)) {
		if (!/^\d+(\.\d+)*$/.test(version)) continue;
		if (previous && isNewerVersion(version, previous)) break;
		previous = version;
		if (!summary?.trim()) continue;
		if ((since && !isNewerVersion(version, since)) || (upTo && isNewerVersion(version, upTo))) continue;
		const line = summary.trim();
		summaries.push({ version, summary: line.length > UPDATE_SUMMARY_MAX_LENGTH ? line.slice(0, UPDATE_SUMMARY_MAX_LENGTH - 1) + '…' : line });
	}
	return summaries.sort((a, b) => compareVersions(b.version, a.version));
}

// The one changelog fetch per page load, shared by the banner and anything
// else that lists versions
let changelogFetch = null;

/**
 * Every version's summary from CHANGELOG_URL, once per page load; later
 * calls get the same result.
 * @returns {Promise<{version: string, summary: string}[]|null>} newest
 *   first; null without CHANGELOG_URL, or when it cannot be had in time.
 *   Never rejects
 */
function fetchChangelogSummaries() {
	if (typeof CHANGELOG_URL === 'undefined' || !CHANGELOG_URL) return Promise.resolve(null);
	if (!changelogFetch) {
		const timeout = new Promise(resolve => setTimeout(() => resolve(null), UPDATE_CHANGELOG_TIMEOUT_MS));
		changelogFetch = Promise.race([fetchText(CHANGELOG_URL), timeout])
			.then(text => (text ? changelogSummaries(text) : null))
			.catch(e => {
				logDebug(LOG_PREFIX + ' Changelog failed:', e);
				return null;
			});
	}
	return changelogFetch;
}

/**
 * What each version since this one brings, up to the published one.
 * @param {string} newVersion - the published version
 * @returns {Promise<{version: string, summary: string}[]>} newest first;
 *   empty without the changelog. Never rejects
 */
function fetchUpdateSummaries(newVersion) {
	return fetchChangelogSummaries().then(all => (all || [])
		.filter(({ version }) => isNewerVersion(version, VERSION) && !isNewerVersion(version, newVersion)));
}

// Banners from every script go in one container, so two updates stack
// instead of covering each other
const UPDATE_BANNERS_ID = `${UI_PREFIX}-update-banners`;
// Per script, so one script's banner never stands in for another's
const UPDATE_BANNER_ID = `${UI_ID_NAMESPACE}-update-banner`;

/**
 * Whether the banner would show for a version: newer than this one, newer
 * than any dismissed, and not showing already.
 * @param {string|false|null} newVersion
 * @returns {boolean}
 */
function updateBannerWanted(newVersion) {
	return !!newVersion && isNewerVersion(newVersion, VERSION)
		&& isNewerVersion(newVersion, getDismissedUpdateVersion())
		&& !document.getElementById(UPDATE_BANNER_ID);
}

/**
 * Show the update banner for a newer version.
 *
 * Two ways out, and they mean different things:
 *   LATER - hides it for now; it comes back on the next page load
 *   x     - records the version, so it stays hidden until something newer ships
 * Side effects: sets the --atmo-* theme variables, and adds the banner (and the
 * shared container) to document.body.
 * @param {string} newVersion - the published version
 * @param {{version: string, summary: string}[]} [summaries] - what each
 *   newer version brings, newest first (fetchUpdateSummaries)
 * @returns {HTMLElement|null} the banner, or null when it is not newer, was
 *   dismissed, or is already showing
 */
function showUpdateBanner(newVersion, summaries = []) {
	if (!updateBannerWanted(newVersion)) return null;

	// The banner is drawn in the --atmo-warn colors, which may not be set yet:
	// a script may show it before opening any dialog
	initThemeVariables();

	let container = document.getElementById(UPDATE_BANNERS_ID);
	if (!container) {
		container = document.createElement('div');
		container.id = UPDATE_BANNERS_ID;
		container.className = uiClass('update-banners');
		document.body.appendChild(container);
	}

	const banner = document.createElement('div');
	banner.id = UPDATE_BANNER_ID;
	banner.className = uiClass('update-banner');
	banner.setAttribute('role', 'status');
	banner.innerHTML = `
		<span class="${uiClass('update-banner-icon')}" aria-hidden="true">▲</span>
		<div class="${uiClass('update-banner-text')}">
			<strong>${SCRIPT_NAME} v${escapeHtml(newVersion)}</strong> is available &mdash; you're on v${VERSION}
			${updateSummariesHtml(summaries)}
		</div>
		<span class="${uiClass('update-banner-actions')}">
			<button type="button" class="${uiClass('update-banner-update')} link-brackets" title="Open the new version to install it"><span class="inner">UPDATE</span></button>
			<button type="button" class="${uiClass('update-banner-later')} link-brackets" title="Hide until the next page load"><span class="inner">LATER</span></button>
			<button type="button" class="${uiClass('update-banner-dismiss')} link-brackets" aria-label="Don't show again for v${escapeHtml(newVersion)}"><span class="inner" aria-hidden="true">&times;</span></button>
		</span>
	`;
	container.appendChild(banner);

	// Next frame, so the transition has a starting value to animate from
	requestAnimationFrame(() => banner.classList.add(uiClass('update-banner-visible')));

	const hide = () => {
		banner.classList.remove(uiClass('update-banner-visible'));
		// Outlives the CSS transition; remove() is safe to call twice
		setTimeout(() => {
			banner.remove();
			if (!container.children.length) container.remove();
		}, 400);
	};

	banner.querySelector('.' + uiClass('update-banner-update')).addEventListener('click', () => {
		window.open(getScriptURL(), '_blank');
		hide();
	});
	banner.querySelector('.' + uiClass('update-banner-later')).addEventListener('click', hide);
	banner.querySelector('.' + uiClass('update-banner-dismiss')).addEventListener('click', () => {
		saveDismissedUpdateVersion(newVersion);
		hide();
	});

	return banner;
}

/**
 * The banner's list of what each newer version brings.
 * @param {{version: string, summary: string}[]} summaries - newest first
 * @returns {string} HTML; '' for none. The summaries come from the network,
 *   so they are escaped
 */
function updateSummariesHtml(summaries) {
	if (!summaries.length) return '';
	const shown = summaries.slice(0, UPDATE_SUMMARIES_SHOWN).map(({ version, summary }) =>
		`<li>v${escapeHtml(version)}: ${escapeHtml(summary)}</li>`);
	const more = summaries.length - UPDATE_SUMMARIES_SHOWN;
	if (more > 0) shown.push(`<li>and ${more} more ${more === 1 ? 'update' : 'updates'}</li>`);
	return `<ul class="${uiClass('update-banner-news')}">${shown.join('')}</ul>`;
}

/**
 * Check for an update and show the banner if there is one, with what each
 * newer version brings. Call once at boot.
 * @returns {Promise<void>}
 */
function startUpdateCheck() {
	return checkForUpdates().then(async () => {
		// Not for a dismissed version: its changelog would be fetched for nothing
		if (updateBannerWanted(UPDATE_AVAILABLE)) showUpdateBanner(UPDATE_AVAILABLE, await fetchUpdateSummaries(UPDATE_AVAILABLE));
	});
}

/**
 * The version button, for an attribution row: a dialog's footer, or the top
 * of the settings tab. createDialog and settings-page.js bind it (bindVersionLink).
 * @returns {string} HTML
 */
function versionLinkHtml() {
	return `<button type="button" class="${uiClass('version-link')}${UPDATE_AVAILABLE ? ' ' + uiClass('update-available') : ''}">v${VERSION}</button>`;
}

/**
 * Make a version button open the script's install page, and show whether an
 * update is out.
 * Side effects: adds a click listener; sets the button's class and title,
 * now and when the update check (shared, once per page load) resolves.
 * @param {HTMLButtonElement} versionLink
 */
function bindVersionLink(versionLink) {
	// The title is the button's description; its name stays the visible
	// "v1.2.3", which is what a speech user says (WCAG 2.5.3)
	// Applied now and again when the check resolves: the button's markup may
	// have been written before the check ran
	const describe = () => {
		versionLink.classList.toggle(uiClass('update-available'), !!UPDATE_AVAILABLE);
		versionLink.title = UPDATE_AVAILABLE ? `Update available: v${UPDATE_AVAILABLE} (click to update)` : 'Up to date';
	};
	describe();
	versionLink.addEventListener('click', () => {
		window.open(getScriptURL(), '_blank');
	});
	checkForUpdates().then(describe);
}

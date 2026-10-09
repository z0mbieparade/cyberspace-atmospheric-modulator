// =====================================================
// CHANGELOG: each version's summary, at the bottom of the settings tab
// =====================================================
// The update banner's lines, kept where someone who dismissed it can look:
// every version's one-line summary from the changelog
// (fetchChangelogSummaries, src/shared/update-check.js), the installed one
// and any newer one marked.

const CHANGELOG_SECTION_KEY = 'atmospheric-modulator-changelog';
// The changelog as GitHub shows it, for people
const CHANGELOG_PAGE_URL = 'https://github.com/z0mbieparade/cyberspace-atmospheric-modulator/blob/main/CHANGELOG.md';

/**
 * Add the Changelog section to the settings tab. The core calls it once,
 * at boot.
 * Side effects: as registerSettingsSection.
 */
function registerChangelogSection() {
	// The very bottom: after Backup & Troubleshooting (order 1)
	registerSettingsSection({ key: CHANGELOG_SECTION_KEY, title: 'Changelog', order: 2, render: renderChangelogSection });
}

/**
 * Fill the Changelog section: a note while the changelog loads, then the
 * list, or a link to the changelog when it cannot be had.
 * Side effects: fills body, now and once the changelog and update check
 * answer; may fetch both (once per page load).
 * @param {HTMLElement} body - the section body from registerSettingsSection
 * @returns {Promise<void>}
 */
async function renderChangelogSection(body) {
	body.textContent = '';
	// Announces the list when it arrives, and a failure
	const status = document.createElement('p');
	status.className = 'hint';
	status.setAttribute('role', 'status');
	status.textContent = 'Loading the changelog…';
	body.append(status);

	const [summaries] = await Promise.all([fetchChangelogSummaries(), checkForUpdates()]);
	// A dot on the heading until the update is installed, banner dismissed
	// or not: the section is where to find it again. From the update check
	// alone, so a changelog that fails to load does not hide it
	setSettingsSectionBadge(body, UPDATE_AVAILABLE ? `update to v${UPDATE_AVAILABLE} available` : null);
	if (!summaries?.length) {
		status.textContent = 'Could not load the list of changes.';
		body.append(changelogLink());
		return;
	}
	// UPDATE_AVAILABLE: the newer version, false when up to date, null when
	// the check failed, which is not the same as up to date
	status.textContent = UPDATE_AVAILABLE ? `Version ${UPDATE_AVAILABLE} is available; you have ${VERSION}.`
		: UPDATE_AVAILABLE === false ? `You have the latest version, ${VERSION}.`
		: `Could not check for updates; you have ${VERSION}.`;
	const list = document.createElement('ul');
	list.className = uiClass('changelog');
	for (const { version, summary } of summaries) {
		const item = document.createElement('li');
		const name = document.createElement('strong');
		name.textContent = `v${version}`;
		item.append(name, `${changelogMark(version)}: ${summary}`);
		list.append(item);
	}
	body.append(list);
	if (UPDATE_AVAILABLE) {
		const update = document.createElement('div');
		update.innerHTML = createInputRow({
			type: 'button',
			id: uiId('changelog-update'),
			label: 'Open the new version to install it',
			buttonText: `Update to v${escapeHtml(UPDATE_AVAILABLE)}`,
		});
		update.querySelector('button').addEventListener('click', () => window.open(getScriptURL(), '_blank'));
		body.append(update);
	}
	body.append(changelogLink());
}

/**
 * How a listed version stands against this one. A newer version is an
 * update only when the update check found it: the changelog and the
 * script are fetched apart, and either may fail or be cached older.
 * @param {string} version
 * @returns {string} ' (installed)', ' (update available)', ' (newer)' or ''
 */
function changelogMark(version) {
	if (version === VERSION) return ' (installed)';
	if (!isNewerVersion(version, VERSION)) return '';
	return UPDATE_AVAILABLE && !isNewerVersion(version, UPDATE_AVAILABLE) ? ' (update available)' : ' (newer)';
}

/**
 * A link to the full changelog.
 * @returns {HTMLParagraphElement}
 */
function changelogLink() {
	const paragraph = document.createElement('p');
	const link = document.createElement('a');
	link.href = CHANGELOG_PAGE_URL;
	link.target = '_blank';
	link.rel = 'noopener noreferrer';
	link.textContent = 'Read the full changelog on GitHub';
	paragraph.append(link);
	return paragraph;
}

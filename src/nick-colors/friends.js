// =====================================================
// WHOSE NICKS GET COLORED
// =====================================================
// Every name, every ★ choom's, or only ★★ best chooms' (CHOOM_AUDIENCES):
// the choice at the top of the Nick Colors section. The chooms themselves
// are the core's (chooms.js). A name outside the choice is not colored: no
// hashed color, custom color or site-wide override. A custom color stays
// saved, and comes back once its user is in it. Kept apart from
// siteConfig, so Reset to Preset leaves it alone.

// How to reach a name's Color dialog: for the settings hint, the help dialog
// and the console. Edit Color shows only for the names that get colored,
// and is not named for the rest: a step to color one would be a choice the
// user may not want
const COLOR_MENU_HOWTO = 'choose "Edit Color"';

// A CHOOM_AUDIENCES value
let nickColorFor = 'everyone';

/**
 * Whose nicks get colored, from storage or a settings file.
 * @param {*} data - { colorFor }; or, saved before the choice, { enabled },
 *   true for only chooms colored, as the choom list's saved key held it
 * @returns {string} a CHOOM_AUDIENCES value
 */
function sanitizeNickColorFor(data) {
	if (isAudience(data?.colorFor)) return data.colorFor;
	return data?.enabled === true ? 'all' : 'everyone';
}

/**
 * Read whose nicks get colored from storage. Saved before the choice, it
 * was the choom list's switch (enabled): read from there, and saved apart.
 * Saved only when that switch was read: before async storage (Greasemonkey
 * 4) has loaded, or when it failed to, every read is the default, and
 * saving one would put Everyone over the choice it has not read. Nothing
 * read, the default stands, unsaved; onStorageReady reads again once loaded.
 * Side effects: sets nickColorFor; may save it, and save the choom list
 * again without the old switch.
 */
function loadNickColorFor() {
	const saved = _GM_getValue('nickColorFor', null);
	if (isAudience(saved)) {
		nickColorFor = saved;
		return;
	}
	let legacy = null;
	try {
		legacy = JSON.parse(_GM_getValue('nickFriends', 'null'));
	} catch (e) { /* unreadable: the default */ }
	nickColorFor = sanitizeNickColorFor(legacy);
	if (typeof legacy?.enabled === 'boolean' && isGMStorageReady()) {
		_GM_setValue('nickColorFor', nickColorFor);
		// And the old switch goes from the list's key, so it is read once: a
		// later load that read the list but not this key would otherwise
		// migrate it again, over a choice made since
		replaceChooms(choomList());
	}
}
loadNickColorFor();

/**
 * Whether to color username's names: whether they are among whose get colored.
 * @param {string} username
 * @returns {boolean}
 */
function shouldColorNick(username) {
	return isInAudience(nickColorFor, choomLevel(username));
}

/**
 * Whether only some names are colored: chooms, or best chooms.
 * @returns {boolean}
 */
function colorsOnlyChooms() {
	return nickColorFor !== 'everyone';
}

/**
 * Store whose nicks get colored.
 * Side effects: sets nickColorFor; writes storage.
 * @param {string} colorFor - a CHOOM_AUDIENCES value; anything else is everyone
 */
function replaceNickColorFor(colorFor) {
	nickColorFor = isAudience(colorFor) ? colorFor : 'everyone';
	_GM_setValue('nickColorFor', nickColorFor);
}

/**
 * Set whose names are colored. Narrowed so that nobody would be colored, the
 * signed-in user is added, so their own name stays colored.
 * Side effects: saves it; restyles every name and the Users section's
 * previews; may add the signed-in user (addOwnNameAsFirstChoom).
 * @param {string} colorFor - a CHOOM_AUDIENCES value
 */
function setNickColorFor(colorFor) {
	replaceNickColorFor(colorFor);
	colorizeAll();
	if (!anyoneColored()) addOwnNameAsFirstChoom();
}

/**
 * Whether any name would be colored: with only chooms colored and none of
 * them among whose get colored, none would.
 * @returns {boolean}
 */
function anyoneColored() {
	return !colorsOnlyChooms() || choomList().users.some(shouldColorNick);
}

/**
 * Add the signed-in user, as close as the choice takes, while nobody is
 * colored. Signed out, or with the API out of reach, nothing changes:
 * they can add themselves.
 * Side effects: asks the Cyberspace API who is signed in; as setChoomLevel.
 * @param {function(): Promise<string>} [lookup] - finds the signed-in username
 * @returns {Promise<void>}
 */
async function addOwnNameAsFirstChoom(lookup = fetchOwnUsername) {
	let username;
	try {
		username = await lookup();
	} catch (e) {
		logDebug(NICK_LOG_PREFIX + ' Could not add you as your first choom:', e.message);
		return;
	}
	if (!isValidUsername(username)) {
		logDebug(NICK_LOG_PREFIX + ' Could not add you as your first choom: Cyberspace gave the name', JSON.stringify(username));
		return;
	}
	// Everyone is colored again, or someone colored was added, while the lookup ran
	if (anyoneColored()) return;
	// As close as the choice takes: their name is then one it colors
	setChoomLevel(username, nickColorFor === 'best' ? CHOOM_LEVEL_BEST : CHOOM_LEVEL_CHOOM);
}

/**
 * The Whose nicks get colored choice, at the top of the Nick Colors section.
 * The Users section's stars add and remove chooms.
 * Side effects: renders into container; a choice saves and recolors at
 * once, as every setting there does (setNickColorFor).
 * @param {HTMLElement} container
 */
function renderNickColorForSettings(container) {
	createSettingsEngine({
		container,
		values: { colorFor: nickColorFor },
		schema: [
			{ key: 'colorFor', type: 'select', label: 'Whose nicks get colored', options: CHOOM_AUDIENCES },
		],
		onChange: (key, value) => {
			if (key === 'colorFor') setNickColorFor(value);
		},
	}).render();
}

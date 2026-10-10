// =====================================================
// FRIENDS: ONLY COLOR THE NAMES YOU PICK
// =====================================================
// Users see "chooms", the site's cyberpunk slang for friends. The code says
// friends. The saved keys say friends too, and must stay so: 'nickFriends'
// in GM storage and in settings files is published in users' saves, and a
// rename would empty every saved list and every older backup's.
// With only chooms colored (the switch under nick colors' own), a name is colored only while its user is
// on the list: no hashed color, custom color or site-wide override for
// anyone else. A custom color stays saved when its user leaves the list, and
// comes back when they rejoin. Kept apart from siteConfig, so Reset to
// Preset leaves it alone.

// How to reach a name's Color dialog, either way the switch is: for the
// settings hint, the help dialog and the console
const COLOR_MENU_HOWTO = 'choose Color, or while only ★ chooms are colored, "Add Color" and then "Edit Color"';

// { enabled: boolean, users: usernames in the site's case, as colors and
// notes are saved under them; compared without case }
let nickFriends = { enabled: false, users: [] };

/**
 * Read the friends list from storage.
 * Side effects: replaces nickFriends.
 */
function loadNickFriends() {
	try {
		nickFriends = sanitizeNickFriends(JSON.parse(_GM_getValue('nickFriends', '{}')));
	} catch (e) {
		nickFriends = sanitizeNickFriends(null);
	}
}
loadNickFriends();

/**
 * Write the friends list to storage.
 */
function saveNickFriends() {
	_GM_setValue('nickFriends', JSON.stringify(nickFriends));
}

/**
 * Replace the friends list and the toggle, and save.
 * Side effects: replaces nickFriends and saves it.
 * @param {*} friends - { enabled, users }, checked here; null for the defaults
 */
function replaceNickFriends(friends) {
	nickFriends = sanitizeNickFriends(friends);
	saveNickFriends();
}

/**
 * Whether username is on the friends list.
 * @param {string} username
 * @returns {boolean}
 */
function isNickFriend(username) {
	const name = String(username).toLowerCase();
	return nickFriends.users.some(user => user.toLowerCase() === name);
}

/**
 * Take the page's spelling for a friend saved lowercase by an earlier build,
 * so a color or note added from the Users section is saved under the name
 * the page looks up.
 * Side effects: may save the friends list.
 * @param {string} username - as the page shows it
 */
function adoptFriendSpelling(username) {
	if (username === username.toLowerCase()) return;
	const at = nickFriends.users.indexOf(username.toLowerCase());
	if (at === -1) return;
	const users = nickFriends.users.slice();
	users[at] = username;
	replaceNickFriends({ ...nickFriends, users });
}

/**
 * Whether to color username's names: everyone's while the toggle is off.
 * @param {string} username
 * @returns {boolean}
 */
function shouldColorNick(username) {
	return !nickFriends.enabled || isNickFriend(username);
}

/**
 * Put username on the list, or take them off, and show it on the page.
 * Side effects: saves the list; restyles every name; redraws the Users section.
 * @param {string} username
 * @param {boolean} friend - true to add, false to remove
 */
function setNickFriend(username, friend) {
	const name = String(username).toLowerCase();
	const users = nickFriends.users.filter(user => user.toLowerCase() !== name);
	if (friend) users.push(String(username));
	replaceNickFriends({ ...nickFriends, users });
	colorizeAll();
	refreshUserList(username);
}

/**
 * Turn only-chooms coloring on or off. Turned on with nobody on the list,
 * the signed-in user becomes the first friend, so their own name stays colored.
 * Side effects: saves it; restyles every name; may add the signed-in user
 * (addOwnNameAsFirstFriend).
 * @param {boolean} enabled
 */
function setOnlyColorFriends(enabled) {
	replaceNickFriends({ ...nickFriends, enabled });
	colorizeAll();
	if (enabled && !nickFriends.users.length) addOwnNameAsFirstFriend();
}

/**
 * Add the signed-in user to an empty friends list. Signed out, or with the
 * API out of reach, the list stays empty: they can add themselves.
 * Side effects: asks the Cyberspace API who is signed in; as setNickFriend.
 * @param {function(): Promise<string>} [lookup] - finds the signed-in username
 * @returns {Promise<void>}
 */
async function addOwnNameAsFirstFriend(lookup = fetchOwnUsername) {
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
	// The switch went off, or someone was added, while the lookup ran
	if (!nickFriends.enabled || nickFriends.users.length) return;
	setNickFriend(username, true);
}

/**
 * The Only my chooms switch, under nick colors' own switch in the script's
 * main settings (renderSwitchDetail). The Users section's star adds and
 * removes friends.
 * Side effects: renders into container; the switch turns the mode on or
 * off at once, as every setting there saves as it is made.
 * @param {HTMLElement} container
 */
function renderNickFriendsSettings(container) {
	const engine = createSettingsEngine({
		container,
		values: { onlyColorFriends: nickFriends.enabled },
		schema: [
			{ key: 'onlyColorFriends', type: 'toggle', label: 'Only my ★ chooms get their own color', default: false },
			{ type: 'hint', text: 'Everyone else keeps the site\'s default colors. While on, right-click or long-press a username and choose "Add Color" to add a choom; the CHOOMS section lists them below.' },
		],
		onChange: (key, value) => {
			if (key === 'onlyColorFriends') setOnlyColorFriends(value);
		},
	});
	engine.render();
}

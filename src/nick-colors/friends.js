// =====================================================
// FRIENDS: ONLY COLOR THE NAMES YOU PICK
// =====================================================
// With "Only color my friends" on, a name is colored only while its user is
// on the list: no hashed color, custom color or site-wide override for
// anyone else. A custom color stays saved when its user leaves the list, and
// comes back when they rejoin. Kept apart from siteConfig, so Reset to
// Preset leaves it alone.

// How to reach a name's Color dialog, either way the switch is: for the
// settings hint, the help dialog and the console
const COLOR_MENU_HOWTO = 'choose Color, or while only friends are colored, Add Color and then Edit Color';

// { enabled: boolean, users: lowercased usernames }
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
	return nickFriends.users.includes(String(username).toLowerCase());
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
 * Side effects: saves the list; restyles every name; redraws the Friends part
 * of the settings (refreshFriendsSettings).
 * @param {string} username
 * @param {boolean} friend - true to add, false to remove
 */
function setNickFriend(username, friend) {
	const name = String(username).toLowerCase();
	const users = nickFriends.users.filter(user => user !== name);
	if (friend) users.push(name);
	replaceNickFriends({ ...nickFriends, users });
	colorizeAll();
	refreshFriendsSettings();
}

/**
 * Redraw only the Friends part of the Nick Colors settings, when it is on the
 * page. Rebuilding the whole section would drop focus from wherever the user
 * is in it, and the first-friend lookup can answer seconds later.
 * Side effects: replaces the Friends part's contents.
 */
function refreshFriendsSettings() {
	const friends = document.querySelector(`[${SETTINGS_SECTION_ATTR}="${SETTINGS_SECTION_KEY}"] .${uiClass('friends')}`);
	if (!friends) return;
	friends.textContent = '';
	renderNickFriendsSettings(friends);
}

/**
 * Turn "Only color my friends" on or off. Turned on with nobody on the list,
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
 * Side effects: asks the Cyberspace API who is signed in; as setNickFriend;
 * keeps focus on the switch when it had it, as the Friends part is redrawn.
 * @param {function(): Promise<string>} [lookup] - finds the signed-in username
 * @returns {Promise<void>}
 */
async function addOwnNameAsFirstFriend(lookup = fetchOwnUsername) {
	let username;
	try {
		username = await lookup();
	} catch (e) {
		logDebug(NICK_LOG_PREFIX + ' Could not add you as your first friend:', e.message);
		return;
	}
	if (!isValidUsername(username)) {
		logDebug(NICK_LOG_PREFIX + ' Could not add you as your first friend: Cyberspace gave the name', JSON.stringify(username));
		return;
	}
	// The switch went off, or someone was added, while the lookup ran
	if (!nickFriends.enabled || nickFriends.users.length) return;
	const hadFocus = !!document.activeElement?.closest?.('.' + uiClass('friends'));
	setNickFriend(username, true);
	if (hadFocus) focusFriendsSwitch();
}

/**
 * Focus the Only color my friends switch in the settings section.
 * Side effects: moves focus.
 */
function focusFriendsSwitch() {
	document.querySelector(`[${SETTINGS_SECTION_ATTR}="${SETTINGS_SECTION_KEY}"] .${uiClass('friends')} input[type="checkbox"]`)?.focus();
}

/**
 * The Friends part of the Nick Colors settings: the toggle, and while it is
 * on, the list with an × for each name.
 * Side effects: renders into container and gives it the friends class, for
 * focusAfterFriendRemoved; the controls change the list as above.
 * @param {HTMLElement} container
 */
function renderNickFriendsSettings(container) {
	container.classList.add(uiClass('friends'));
	const engine = createSettingsEngine({
		container,
		values: { onlyColorFriends: nickFriends.enabled },
		schema: [{ type: 'section', label: 'Friends', fields: [
			{ key: 'onlyColorFriends', type: 'toggle', label: 'Only color my friends', default: false },
			{ type: 'hint', text: 'Leaves everyone else in the site\'s colors. Turned on with nobody listed, it adds you first. While it is on, right-click or long-press a username and choose Add Color to add a friend.' },
			{ key: 'friendList', type: 'custom', showWhen: { field: 'onlyColorFriends', is: true }, render: renderNickFriendList },
		] }],
		onChange: (key, value) => {
			if (key === 'onlyColorFriends') setOnlyColorFriends(value);
		},
	});
	engine.render();
}

/**
 * Put focus back after an × redrew the Friends part: on the × now in that
 * place, or the one before it, or the switch.
 * Side effects: moves focus.
 * @param {number} at - where the removed friend was in the list
 */
function focusAfterFriendRemoved(at) {
	const section = document.querySelector(`[${SETTINGS_SECTION_ATTR}="${SETTINGS_SECTION_KEY}"]`);
	if (!section) return;
	const buttons = section.querySelectorAll('.' + uiClass('friend-list') + ' button');
	const next = buttons[Math.min(at, buttons.length - 1)];
	if (next) next.focus();
	else focusFriendsSwitch();
}

/**
 * The friends list: the names wrap, each with an × that removes it.
 * @returns {HTMLElement}
 */
function renderNickFriendList() {
	const wrapper = document.createElement('div');
	if (!nickFriends.users.length) {
		wrapper.className = 'hint';
		wrapper.textContent = 'No friends yet: every name is in the site\'s colors.';
		return wrapper;
	}
	const list = document.createElement('ul');
	list.className = uiClass('friend-list');
	for (const user of nickFriends.users) {
		const item = document.createElement('li');
		const name = document.createElement('span');
		name.textContent = '@' + user;
		const remove = document.createElement('button');
		remove.type = 'button';
		remove.className = uiClass('friend-remove');
		remove.textContent = '×';
		remove.title = `Remove @${user} from friends`;
		remove.setAttribute('aria-label', `Remove @${user} from friends`);
		remove.addEventListener('click', () => {
			const at = nickFriends.users.indexOf(user);
			setNickFriend(user, false);
			focusAfterFriendRemoved(at);
		});
		item.append(name, remove);
		list.appendChild(item);
	}
	wrapper.appendChild(list);
	return wrapper;
}

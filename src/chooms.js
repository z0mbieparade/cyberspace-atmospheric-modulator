// =====================================================
// CHOOMS: THE USERS YOU STAR
// =====================================================
// "Chooms" is the site's cyberpunk slang for friends. A ★ choom is someone
// you see around; a ★★ best choom is a bestie. Features ask how close a
// user is (choomLevel): nick colors colors only some of them, nick effects
// plays for some. The list is the core's, so it works whichever of those
// features is on. The stars and the menu items show while one that uses
// chooms is on (registerFeature's usesChooms).
// The saved key says friends, and must stay so: 'nickFriends' in GM storage
// is published in users' saves, and a rename would empty every saved list.

// How close a user is: not a choom, a ★ choom, or a ★★ best choom
const CHOOM_LEVEL_NONE = 0;
const CHOOM_LEVEL_CHOOM = 1;
const CHOOM_LEVEL_BEST = 2;

// Who a feature is for, by how close they are: the least choom level each
// choice takes. Nick colors colors their names, nick effects plays for
// them. The values are saved in users' settings: never change one
const CHOOM_AUDIENCES = [
	{ value: 'best', label: '★★ Best chooms', level: CHOOM_LEVEL_BEST },
	{ value: 'all', label: 'Every ★ choom', level: CHOOM_LEVEL_CHOOM },
	{ value: 'everyone', label: 'Everyone', level: CHOOM_LEVEL_NONE },
];

// users: usernames in the site's case, as colors and notes are saved under
// them, compared without case; besties: the best chooms among users,
// spelled as there
let chooms = { users: [], besties: [] };

// Called after the list changes, with the user it changed for
const choomsListeners = [];

/**
 * Whether a user is in an audience.
 * @param {string} audience - a CHOOM_AUDIENCES value
 * @param {number} level - the user's, from choomLevel
 * @returns {boolean}
 * @throws {TypeError} for an audience that is not a CHOOM_AUDIENCES value:
 *   check one from storage with isAudience first
 */
function isInAudience(audience, level) {
	return level >= CHOOM_AUDIENCES.find(choice => choice.value === audience).level;
}

/**
 * Whether value is a CHOOM_AUDIENCES value.
 * @param {*} value
 * @returns {boolean}
 */
function isAudience(value) {
	return CHOOM_AUDIENCES.some(choice => choice.value === value);
}

/**
 * Valid usernames from a saved list, unique without case, in the case given.
 * @param {*} names - an array, or anything else for none
 * @returns {string[]}
 */
function cleanChoomNames(names) {
	if (!Array.isArray(names)) return [];
	// Normalized before the check, so the name stored is the one checked
	const clean = names
		.filter(user => typeof user === 'string')
		.map(user => user.trim().replace(/^@/, ''))
		.filter(user => isValidUsername(user));
	const seen = new Set();
	return clean.filter(user => !seen.has(user.toLowerCase()) && seen.add(user.toLowerCase()));
}

/**
 * The choom list from storage or a settings file: valid usernames, unique
 * without case, in the case given. Best chooms are chooms too: one not
 * among users is dropped, and takes the spelling users has.
 * @param {*} data - { users, besties }; besties is missing from lists saved
 *   before best chooms. Anything else in it, as nick colors' colorFor, is
 *   not the list's
 * @returns {{users: string[], besties: string[]}}
 */
function sanitizeChooms(data) {
	const users = cleanChoomNames(data?.users);
	const spelling = new Map(users.map(user => [user.toLowerCase(), user]));
	const besties = cleanChoomNames(data?.besties)
		.filter(user => spelling.has(user.toLowerCase()))
		.map(user => spelling.get(user.toLowerCase()));
	return { users, besties };
}

/**
 * Read the list from storage.
 * Side effects: replaces chooms.
 */
function loadChooms() {
	try {
		chooms = sanitizeChooms(JSON.parse(_GM_getValue('nickFriends', '{}')));
	} catch (e) {
		chooms = sanitizeChooms(null);
	}
}
// At load, as every feature reads its settings: with sync storage
// (Tampermonkey) nothing reads it again
loadChooms();

/**
 * Replace the list, and save it.
 * Side effects: replaces chooms; writes storage.
 * @param {*} data - checked here; null for none
 */
function replaceChooms(data) {
	chooms = sanitizeChooms(data);
	_GM_setValue('nickFriends', JSON.stringify(chooms));
}

/**
 * The chooms, for a backup, the debug log or the Users section.
 * @returns {{users: string[], besties: string[]}} a copy
 */
function choomList() {
	return { users: [...chooms.users], besties: [...chooms.besties] };
}

/**
 * How close a user is.
 * @param {string} username - in any case
 * @returns {number} CHOOM_LEVEL_NONE, CHOOM_LEVEL_CHOOM or CHOOM_LEVEL_BEST
 */
function choomLevel(username) {
	const name = String(username).toLowerCase();
	if (chooms.besties.some(user => user.toLowerCase() === name)) return CHOOM_LEVEL_BEST;
	return chooms.users.some(user => user.toLowerCase() === name) ? CHOOM_LEVEL_CHOOM : CHOOM_LEVEL_NONE;
}

/**
 * Hear about every change to the list: nick colors restyles names.
 * @param {function(string): void} listener - gets the user it changed for
 */
function onChoomsChanged(listener) {
	choomsListeners.push(listener);
}

/**
 * Make a user a choom, a best choom, or neither. Taken off the list, a best
 * choom is no longer one either. A choom keeps the spelling saved: a
 * mention typed in another case must not replace it, or their color and
 * notes would be saved under a name the page never shows.
 * Side effects: saves the list; tells each onChoomsChanged listener;
 * redraws the Users section.
 * @param {string} username
 * @param {number} level - CHOOM_LEVEL_NONE, _CHOOM or _BEST
 */
function setChoomLevel(username, level) {
	const name = String(username).toLowerCase();
	const spelling = chooms.users.find(user => user.toLowerCase() === name) ?? String(username);
	const others = (list) => list.filter(user => user.toLowerCase() !== name);
	const users = others(chooms.users);
	const besties = others(chooms.besties);
	if (level >= CHOOM_LEVEL_CHOOM) users.push(spelling);
	if (level === CHOOM_LEVEL_BEST) besties.push(spelling);
	replaceChooms({ users, besties });
	choomsListeners.forEach(listener => listener(username));
	refreshUserList(username);
}

/**
 * Take the page's spelling for a choom saved lowercase by an earlier build,
 * so a color or note added from the Users section is saved under the name
 * the page looks up.
 * Side effects: may save the list.
 * @param {string} username - as the page shows it
 */
function adoptChoomSpelling(username) {
	if (username === username.toLowerCase()) return;
	const at = chooms.users.indexOf(username.toLowerCase());
	if (at === -1) return;
	const users = chooms.users.slice();
	users[at] = username;
	// sanitizeChooms gives besties the new spelling from users
	replaceChooms({ ...chooms, users });
}

/**
 * Whether a feature that uses chooms is on, so the stars and menu items show.
 * @returns {boolean}
 */
function choomsInUse() {
	return FEATURES.some(feature => feature.usesChooms && featureConfig[feature.key]);
}

/**
 * Whether a user has one of the two stars: choom, one star or two; best,
 * two.
 * @param {string} username
 * @param {'choom'|'best'} star
 * @returns {boolean}
 */
function hasStar(username, star) {
	return choomLevel(username) >= (star === 'best' ? CHOOM_LEVEL_BEST : CHOOM_LEVEL_CHOOM);
}

/**
 * Turn one of the two stars on or off, for the Users section's stars and the
 * user menu alike: on, Best choom brings Choom with it; off, Choom takes
 * Best with it.
 * Side effects: as setChoomLevel.
 * @param {string} username
 * @param {'choom'|'best'} star
 */
function toggleStar(username, star) {
	const on = hasStar(username, star);
	if (star === 'best') setChoomLevel(username, on ? CHOOM_LEVEL_CHOOM : CHOOM_LEVEL_BEST);
	else setChoomLevel(username, on ? CHOOM_LEVEL_NONE : CHOOM_LEVEL_CHOOM);
}

/**
 * The two stars before a name in the Users section, each a toggle button:
 * bright ★ when on, dim ☆ when off. The first is choom, the second best
 * choom, as the user menu's items: adding a best choom adds both, removing
 * a choom removes both.
 * @param {string} username
 * @returns {Node[]}
 */
function choomStars(username) {
	const stars = document.createElement('span');
	stars.className = uiClass('choom-stars');
	stars.append(
		choomStarButton(username, 'Choom', 'friend', hasStar(username, 'choom'),
			() => toggleStar(username, 'choom'),
			on => on ? 'Remove Choom' : 'Add Choom'),
		choomStarButton(username, 'Best choom', 'best-friend', hasStar(username, 'best'),
			() => toggleStar(username, 'best'),
			on => on ? 'Remove Best Choom' : 'Add Best Choom'),
	);
	// One cell for both: two parts in one column would take two grid rows
	return [userListColumn(stars, 'mark')];
}

/**
 * One star toggle for choomStars.
 * @param {string} username
 * @param {string} name - what it marks, for its accessible name: "Choom @pat"
 * @param {string} control - its data-entry-control, so focus stays on it
 *   when the list redraws
 * @param {boolean} on - whether it is pressed
 * @param {function(): void} toggle - changes the level
 * @param {function(boolean): string} action - gets on; what a click does, for its title
 * @returns {HTMLButtonElement}
 */
function choomStarButton(username, name, control, on, toggle, action) {
	const star = document.createElement('button');
	star.type = 'button';
	star.className = uiClass('choom-toggle');
	// Its name stays put; aria-pressed says which way it is
	star.setAttribute('aria-label', `${name} @${username}`);
	star.setAttribute('aria-pressed', String(on));
	star.title = action(on);
	star.textContent = on ? '★' : '☆';
	star.dataset.entryControl = control;
	star.addEventListener('click', () => toggle());
	return star;
}

/**
 * Add the choom menu items and the Users section's stars. The core calls
 * it once, at boot.
 * Side effects: registers two user menu items and a Users section source.
 */
function initChooms() {
	// Two checkbox items, as the Chooms section's two stars (toggleStar)
	const choom = { order: 20, group: USER_MENU_GROUPS.chooms, showFor: () => choomsInUse() };
	registerUserMenuItem({ ...choom, label: '★ Choom', checkedFor: username => hasStar(username, 'choom'), onSelect: username => toggleStar(username, 'choom') });
	registerUserMenuItem({ ...choom, order: 21, label: '★★ Best choom', checkedFor: username => hasStar(username, 'best'), onSelect: username => toggleStar(username, 'best') });
	registerUserListSource({
		order: 5,
		isShown: choomsInUse,
		usernames: () => chooms.users,
		parts: choomStars,
	});
}

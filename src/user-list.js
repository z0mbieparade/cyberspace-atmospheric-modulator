// =====================================================
// USERS: every user you have customized, on the settings tab
// =====================================================
// Titled "Chooms" on the tab; the code calls it the Users section.
// One row per user with a custom color, a note or a friend mark, sorted by
// name. Features fill the rows (registerUserListSource): nick colors draws
// the name as the page draws it and adds the choom star; nick notes adds the note.
// Each shows only while its feature is on.

const USER_LIST_SECTION_KEY = 'atmospheric-modulator-users';
const USER_LIST_SECTION_TITLE = 'Chooms';

const userListSources = [];

// The Users rows' columns, so every row lines up whichever parts it has. A
// source puts each part it returns in one, with userListColumn
const USER_LIST_COLUMNS = ['mark', 'name', 'text', 'edit', 'delete'];

// The section's body while it is on the page, for refreshUserList
let userListBody = null;

/**
 * Add what a feature shows in the Users section.
 * Side effects: re-syncs the settings page and redraws the list.
 * @param {{order?: number, isShown: function(): boolean, usernames: function(): string[], name?: function(string): Node, parts: function(string): Node[], actions?: function(): Node[]}} source -
 *   order: lower comes first, default 0; isShown: whether it shows now (its
 *   feature's switch); usernames: the users it has something for; name: the
 *   row's name, for the first source that has one, else plain text; parts:
 *   what it shows in a row, for every listed user, maybe nothing, each put
 *   in its column with userListColumn; actions: what it shows below the
 *   list, with data-user-list-action on each button so a redraw keeps focus
 */
function registerUserListSource(source) {
	userListSources.push(source);
	userListSources.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
	syncSettingsPage();
	refreshUserList();
}

/**
 * Put a part of a Users row in its column.
 * Side effects: adds the column's class to part.
 * @param {HTMLElement} part
 * @param {string} column - one of USER_LIST_COLUMNS
 * @returns {HTMLElement} part
 */
function userListColumn(part, column) {
	part.classList.add(uiClass('user-col-' + column));
	return part;
}

/**
 * Which column a part is in, by USER_LIST_COLUMNS order; last when none.
 * @param {HTMLElement} part
 * @returns {number}
 */
function userListColumnIndex(part) {
	const at = USER_LIST_COLUMNS.findIndex(column => part.classList.contains(uiClass('user-col-' + column)));
	return at === -1 ? USER_LIST_COLUMNS.length : at;
}

/**
 * Add the Users section to the settings tab: shown while any feature has a
 * part in it. The core calls it once, at boot.
 * Side effects: as registerSettingsSection.
 */
function registerUserListSection() {
	registerSettingsSection({ key: USER_LIST_SECTION_KEY, title: USER_LIST_SECTION_TITLE, isShown: userListShown, render: renderUserList });
}

/**
 * Whether any feature has something for the Users section now.
 * @returns {boolean}
 */
function userListShown() {
	return userListSources.some(source => source.isShown());
}

/**
 * Fill the Users section.
 * Side effects: replaces body's contents; remembers body for refreshUserList.
 * @param {HTMLElement} body - the section body from registerSettingsSection
 */
function renderUserList(body) {
	userListBody = body;
	body.textContent = '';
	const sources = userListSources.filter(source => source.isShown());
	// One row per user, whatever the case each source stores the name in.
	// Friends saved by an earlier build are lowercased; colors and notes keep
	// the site's case, so a spelling with capitals is the one their data is under
	const usernames = new Map();
	for (const source of sources) {
		for (const username of source.usernames()) {
			const key = username.toLowerCase();
			const seen = usernames.get(key);
			if (!seen || (seen === key && username !== key)) usernames.set(key, username);
		}
	}
	const sorted = Array.from(usernames.values()).sort((a, b) => a.localeCompare(b));
	const list = entryList(sorted.map(username => {
		const named = sources.find(source => source.name);
		let name = named?.name(username);
		if (!name) {
			name = document.createElement('strong');
			name.textContent = username;
		}
		return {
			key: username,
			// In column order, so the keyboard meets them as the eye does
			parts: [userListColumn(name, 'name'), ...sources.flatMap(source => source.parts(username))]
				.sort((a, b) => userListColumnIndex(a) - userListColumnIndex(b)),
		};
	}), 'Nobody yet. Right-click or long-press a username to give it a color or a note.');
	list.classList.add(uiClass('user-list'));
	body.appendChild(list);
	const actions = sources.flatMap(source => source.actions?.() ?? []);
	if (actions.length) {
		const footer = document.createElement('div');
		footer.className = uiClass('user-list-actions');
		footer.append(...actions);
		body.appendChild(footer);
	}
}

/**
 * Redraw the Users section, when it is on the page, keeping focus as
 * redrawEntryList does.
 * Side effects: replaces the list; may move focus.
 * @param {string} [focusUser] - the user the change was about
 */
function refreshUserList(focusUser) {
	if (!userListBody?.isConnected) return;
	const body = userListBody;
	// A button below the list is in no row, so redrawEntryList leaves focus
	// on the button the redraw drops
	const active = document.activeElement;
	const action = body.contains(active) ? active.dataset.userListAction : undefined;
	redrawEntryList(body, () => renderUserList(body), focusUser, settingsSectionFoldButton(body));
	if (action) body.querySelector(`[data-user-list-action="${action}"]`)?.focus();
}

// =====================================================
// USER MENU
// =====================================================
// Right-click or long-press a username for a menu of what to do with that
// user. Features add the items. The usernames are the ones
// src/shared/usernames.js marks, once a feature has started it, and the
// elements that stand for a user without being a name on the page
// (standForUser), such as a row's name in the Chooms section.

// A press this long on a name is a hold
const USER_MENU_HOLD_MS = 500;
// After a hold, the browser may still send a click to the name under the
// finger. Swallowed for this long, so the menu does not follow the link
const USER_MENU_CLICK_GUARD_MS = 600;

const userMenuItems = [];

// The menu's groups, each under a rule, in this order by their items' order:
// what is saved about the user, how close they are, and where to go
const USER_MENU_GROUPS = { edit: 'edit', chooms: 'chooms', go: 'go' };

// Elements that are not a name on the page but stand for a user, such as a
// row's name in the Chooms section, to the user: each opens that user's menu
// too. Held here, not in an attribute, which page content could carry too.
// Apart from USERNAME_ATTR, so nick colors does not restyle them as names
const userMenuElements = new WeakMap();

/**
 * Let an element of the script's own open a user's menu, as their name on
 * the page does.
 * Side effects: remembers el for as long as it exists.
 * @param {HTMLElement} el
 * @param {string} username
 */
function standForUser(el, username) {
	userMenuElements.set(el, username);
}

/**
 * Add an item to the user menu.
 * @param {{label: string, order?: number, group?: string, onSelect: function(string, HTMLElement): void, showFor?: function(string): boolean, checkedFor?: function(string): boolean}} item -
 *   order: lower comes first, default 0; group: USER_MENU_GROUPS, a rule
 *   between groups; onSelect: gets the username and the element the menu
 *   was opened on; showFor: whether to list it for this username, default
 *   always; checkedFor: makes it a checkbox item, on for this username or not
 */
function registerUserMenuItem(item) {
	userMenuItems.push(item);
	userMenuItems.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/**
 * The username element an event started on, or the element standing for a
 * user (standForUser), if any: the nearest, from the event's target out.
 * @param {Event} e
 * @returns {HTMLElement|null}
 */
function findUserMenuTarget(e) {
	if (!(e.target instanceof Element)) return null;
	for (let el = e.target; el; el = el.parentElement) {
		if (userMenuElements.has(el) || el.matches(USERNAME_SELECTOR)) return el;
	}
	return null;
}

/**
 * The user an element from findUserMenuTarget stands for.
 * @param {HTMLElement} target
 * @returns {string}
 */
function userMenuUsername(target) {
	return userMenuElements.get(target) ?? usernameOf(target);
}

/**
 * Open the user menu for a username element.
 * Side effects: opens the menu.
 * @param {HTMLElement} target - from findUserMenuTarget
 * @param {{x: number, y: number}|null} point - where the pointer was, or null
 *   (keyboard, touch) to open under the element
 * @param {boolean} fromKeyboard - focus the first item, as a keyboard user expects
 */
function openUserMenu(target, point, fromKeyboard) {
	const username = userMenuUsername(target);
	const rect = target.getBoundingClientRect();
	showMenu({
		label: `@${username}`,
		items: userMenuItems
			.filter(item => !item.showFor || item.showFor(username))
			.map(item => ({
				label: item.label,
				group: item.group,
				checked: item.checkedFor?.(username),
				onSelect: () => item.onSelect(username, target),
			})),
		x: point ? point.x : rect.left,
		y: point ? point.y : rect.bottom,
		opener: target,
		focusFirst: fromKeyboard,
	});
}

/**
 * Listen for right-click and long-press on usernames, and add the items
 * every user has.
 * Side effects: adds document listeners; registers Poke and Profile.
 */
function initUserMenu() {
	// Whom a poke in flight is for: a second one now would come back refused
	// by the hourly limit, a confusing answer while the first is unknown
	let poking = null;
	registerUserMenuItem({
		label: 'Poke',
		order: 90,
		group: USER_MENU_GROUPS.go,
		// The profile has its own [P] Poke button
		showFor: username => !isOnProfileOf(username),
		onSelect: async (username) => {
			if (poking) {
				alert(`Still poking @${poking}. Wait for that to finish.`);
				return;
			}
			poking = username;
			try {
				await pokeUser(username);
				alert(`Poked @${username}.`);
			} catch (e) {
				alert(e instanceof ApiUncertainError
					? `The poke to @${username} may not have gone through. Cyberspace allows one an hour, so trying again may be refused even if it did.`
					: `Could not poke @${username}. ${e.message}`);
			} finally {
				poking = null;
			}
		},
	});

	registerUserMenuItem({
		label: 'Profile',
		order: 100,
		group: USER_MENU_GROUPS.go,
		showFor: username => !isOnProfileOf(username),
		onSelect: (username, target) => {
			// The name's own link goes through the site's router, without a reload
			// Compared, not put in a selector: a name with a quote would break it
			if (target.matches('a') && target.getAttribute('href') === '/' + username) target.click();
			else window.location.assign('/' + encodeURIComponent(username));
		},
	});

	// Whether the keyboard or a pointer was used last. A contextmenu from the
	// menu key or Shift+F10 can carry coordinates (some browsers fill in the
	// focused element's), so they cannot tell the two apart
	let lastInputWasKey = false;
	document.addEventListener('keydown', () => { lastInputWasKey = true; }, true);
	document.addEventListener('pointerdown', () => { lastInputWasKey = false; }, true);

	document.addEventListener('contextmenu', (e) => {
		const target = findUserMenuTarget(e);
		if (!target) return;
		e.preventDefault();
		const fromKeyboard = lastInputWasKey;
		openUserMenu(target, fromKeyboard ? null : { x: e.clientX, y: e.clientY }, fromKeyboard);
	});

	let clickGuardUntil = 0;
	document.addEventListener('click', (e) => {
		if (Date.now() < clickGuardUntil && findUserMenuTarget(e)) {
			e.preventDefault();
			e.stopPropagation();
		}
	}, true);

	attachLongPress({
		findTarget: findUserMenuTarget,
		getDuration: () => USER_MENU_HOLD_MS,
		// A subtle dim while pressed
		onPress: (target) => {
			target.style.transition = 'opacity 0.15s, transform 0.15s';
			target.style.opacity = '0.7';
			target.style.transform = 'scale(0.97)';
		},
		onHold: (target) => openUserMenu(target, null, false),
		onRelease: (target, held) => {
			target.style.opacity = '';
			target.style.transform = '';
			if (held) clickGuardUntil = Date.now() + USER_MENU_CLICK_GUARD_MS;
		},
	});
}

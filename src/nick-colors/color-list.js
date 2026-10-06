// =====================================================
// USERS SECTION: nick colors' part
// =====================================================
// In the Users section (src/user-list.js): each user's name drawn as the page
// draws it, which opens the Color dialog, and the star before it that marks them a choom
// (a friend, in the code) or not, and adds or removes them. Below the list,
// the Reset Custom User Styles button.

/**
 * Open the Color dialog for a user, as the menu does.
 * Side effects: opens a dialog.
 * @param {string} username
 */
function editNickColor(username) {
	// Raw styles, so the sliders show the saved values before range mapping
	createUserSettingsPanel(username, getRawStylesForPicker(username));
}

/**
 * A user's name for their row: a button that opens the Color dialog, with
 * the name inside drawn as the page draws it (drawNickPreview). The style
 * goes on the inner text, so a background color covers the name, not the
 * button's whole cell.
 * @param {string} username
 * @returns {HTMLElement}
 */
function nickColorListName(username) {
	const button = document.createElement('button');
	button.type = 'button';
	button.className = uiClass('color-name');
	// The control, for redrawEntryList: focus comes back to it after a save
	button.dataset.entryControl = 'color';
	const name = document.createElement('span');
	name.className = uiClass('color-preview');
	name.dataset.previewUser = username;
	name.textContent = username;
	button.appendChild(name);
	drawNickPreview(name, username);
	button.addEventListener('click', () => editNickColor(username));
	return button;
}

/**
 * The star before a name: bright ★ for a choom, dim ☆ for anyone else, and a
 * toggle button that adds or removes them.
 * @param {string} username
 * @returns {Node[]}
 */
function nickColorListParts(username) {
	const isChoom = isNickFriend(username);
	const star = document.createElement('button');
	star.type = 'button';
	star.className = uiClass('choom-toggle');
	// Its name stays put; aria-pressed says which way it is
	star.setAttribute('aria-label', `Choom @${username}`);
	star.setAttribute('aria-pressed', String(isChoom));
	star.title = isChoom ? 'Remove from chooms' : 'Add to chooms';
	star.textContent = isChoom ? '★' : '☆';
	// One control whichever way it is: focus stays on it when it flips
	star.dataset.entryControl = 'friend';
	star.addEventListener('click', () => setNickFriend(username, !isChoom));
	return [userListColumn(star, 'mark')];
}

/**
 * Below the list, under its own heading: the button that resets every
 * custom nick color.
 * Side effects: the button asks, then clears them (confirmClearCustomNickColors).
 * @returns {Node[]}
 */
function nickColorListActions() {
	const holder = document.createElement('div');
	holder.className = uiClass('settings-section');
	holder.innerHTML = '<h4>Reset User Specific Styles</h4>' + createInputRow({
		type: 'button',
		id: uiId('nick-colors-clear-custom'),
		// Deletes styles made by hand, which no preset brings back: in the
		// error color, and asks first
		classes: uiClass('danger'),
		label: 'Remove the custom color, icons and style set for each user. ★\'s notes and other settings stay.',
		buttonText: 'Reset Custom User Styles',
	});
	const button = holder.querySelector('button');
	button.dataset.userListAction = 'clear-custom-nick-colors';
	button.addEventListener('click', confirmClearCustomNickColors);
	return [holder];
}

/**
 * Draw the list's names again, in place: the settings, the theme or the
 * Only color my chooms switch changed how names look. Rows and focus stay.
 * Side effects: restyles each preview name.
 */
function restyleNickColorList() {
	document.querySelectorAll(`[${SETTINGS_SECTION_ATTR}="${USER_LIST_SECTION_KEY}"] .${uiClass('color-preview')}`).forEach(name => {
		drawNickPreview(name, name.dataset.previewUser);
	});
}

/**
 * Draw a list name as the page draws that user: in their saved style, or
 * in the site's colors while only chooms are colored and they are not one.
 * Their saved style stays saved either way.
 * Side effects: sets or clears the name's inline styles and nick colors'
 * data; sets its button's title.
 * @param {HTMLElement} name - the preview span
 * @param {string} username
 */
function drawNickPreview(name, username) {
	const shown = shouldColorNick(username);
	if (shown) applyStyles(name, username);
	else unstyleUsername(name);
	// In choom mode a non-choom's color is saved but not shown: say so
	const button = name.closest('button');
	if (button) button.title = shown ? 'Edit color' : 'Edit color (shows once they are a choom)';
}

// =====================================================
// MENU
// =====================================================
// A small popup menu at a point, as a right-click menu. One open at a time.

let openMenu = null;

/**
 * Close the open menu, if any.
 * Side effects: removes the menu and its listeners; with returnFocus, moves
 * focus back to where it was opened from.
 * @param {{returnFocus?: boolean}} [options]
 */
function closeMenu({ returnFocus = false } = {}) {
	if (!openMenu) return;
	const { el, cleanup, opener } = openMenu;
	openMenu = null;
	cleanup();
	el.remove();
	if (returnFocus) opener?.focus?.();
}

/**
 * Open a menu at a point, clamped into the viewport. Keyboard: arrows,
 * Home and End move; Enter or Space choose; Escape closes; Tab closes and
 * moves on. A click elsewhere, scrolling or resizing closes it.
 * The item under the pointer takes focus, so it and the keyboard agree.
 * Side effects: closes any open menu; adds the menu to <body> and focuses
 * it, or its first item; sets the --atmo-* theme colors.
 * @param {{label: string, items: Array<{label: string, onSelect: Function}>, x: number, y: number, opener?: HTMLElement, focusFirst?: boolean}} menu -
 *   label: the menu's accessible name; items: in order, onSelect runs after
 *   the menu closes; x, y: viewport coordinates of its top left corner;
 *   opener: gets focus back on Escape; focusFirst: focus the first item, for
 *   a menu opened from the keyboard. Otherwise the menu itself takes focus,
 *   and no item is shown as current until the pointer or an arrow picks one
 * @returns {HTMLElement} the menu
 */
function showMenu({ label, items, x, y, opener = null, focusFirst = true }) {
	closeMenu();
	initThemeVariables();

	const el = document.createElement('div');
	el.className = uiClass('menu');
	el.setAttribute('role', 'menu');
	el.setAttribute('aria-label', label);
	// Focusable from script: it holds focus until an item is picked
	el.tabIndex = -1;
	const buttons = items.map((item) => {
		const button = document.createElement('button');
		button.type = 'button';
		button.className = uiClass('menu-item');
		button.setAttribute('role', 'menuitem');
		// Roving focus: arrows move between items, Tab leaves the menu
		button.tabIndex = -1;
		button.textContent = item.label;
		button.addEventListener('mouseenter', () => button.focus());
		button.addEventListener('click', () => {
			// Focus back on the opener first: a dialog the item opens returns
			// focus to whatever had it, and the menu's button is gone
			closeMenu({ returnFocus: true });
			item.onSelect();
		});
		el.append(button);
		return button;
	});
	document.body.append(el);

	// Measured once in the page, so it opens inward near the right or bottom edge
	const rect = el.getBoundingClientRect();
	el.style.left = Math.max(0, Math.min(x, window.innerWidth - rect.width)) + 'px';
	el.style.top = Math.max(0, Math.min(y, window.innerHeight - rect.height)) + 'px';

	el.addEventListener('keydown', (e) => {
		const index = buttons.indexOf(document.activeElement);
		const moveTo = {
			ArrowDown: (index + 1) % buttons.length,
			// From the menu itself (index -1), up goes to the last item
			ArrowUp: index < 0 ? buttons.length - 1 : (index - 1 + buttons.length) % buttons.length,
			Home: 0,
			End: buttons.length - 1,
		}[e.key];
		if (moveTo !== undefined) {
			e.preventDefault();
			buttons[moveTo].focus();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			// A dialog under the menu must not close too
			e.stopPropagation();
			closeMenu({ returnFocus: true });
		} else if (e.key === 'Tab') {
			// Focus back on the opener before the browser moves it, so Tab
			// goes on from there rather than from the menu at the end of <body>
			closeMenu({ returnFocus: true });
		}
	});

	const onPointerDown = (e) => {
		if (!el.contains(e.target)) closeMenu();
	};
	const onViewportChange = () => closeMenu();
	// Capture: the site may stop the event before it bubbles to the document
	document.addEventListener('pointerdown', onPointerDown, true);
	window.addEventListener('scroll', onViewportChange, true);
	window.addEventListener('resize', onViewportChange);
	window.addEventListener('blur', onViewportChange);
	openMenu = {
		el,
		opener,
		cleanup: () => {
			document.removeEventListener('pointerdown', onPointerDown, true);
			window.removeEventListener('scroll', onViewportChange, true);
			window.removeEventListener('resize', onViewportChange);
			window.removeEventListener('blur', onViewportChange);
		},
	};

	if (focusFirst && buttons.length) buttons[0].focus();
	else el.focus();
	return el;
}

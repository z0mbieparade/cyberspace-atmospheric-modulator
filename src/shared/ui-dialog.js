// =====================================================
// UI: DIALOG AND INPUT ROWS
// =====================================================
//
// Requires theme-colors.js (initThemeVariables) and update-check.js
// (bindVersionLink) in the bundle; function declarations hoist, so they may
// come after this file.
// Optional: dialogDefaults(), returning defaults every createDialog merges in
// (see createDialog). It may be defined later for the same reason.

// Every shared class and custom property is atmo-prefixed, in every script, so
// the shared UI looks the same wherever it appears (src/shared/_ui.scss sets
// its $p to the same)
const UI_PREFIX = 'atmo';

// Two scripts built on these files can have dialogs open at once, each with
// its own id counters, so ids carry a per-script random part to stay unique
const UI_ID_NAMESPACE = `${UI_PREFIX}-${Math.random().toString(36).slice(2, 8)}`;
let uiIdCount = 0;

/**
 * A page-unique element id.
 * @param {string} name - what the element is, e.g. 'dialog-title'
 * @returns {string}
 */
function uiId(name) {
	return `${UI_ID_NAMESPACE}-${name}-${++uiIdCount}`;
}

/**
 * Prefix CSS class names with UI_PREFIX.
 * @param {...string} names - e.g. 'dialog', 'flex'
 * @returns {string} e.g. 'atmo-dialog atmo-flex'
 */
function uiClass(...names) {
	return names.map(name => `${UI_PREFIX}-${name}`).join(' ');
}

/**
 * Escape text for an HTML text node or a quoted attribute value.
 * @param {*} value - stringified; null and undefined become ''
 * @returns {string}
 */
function escapeHtml(value) {
	return String(value ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

/**
 * Markup for one input row.
 *
 * label, hint and options are HTML, written by the script. value,
 * placeholder and defaultLabel are escaped, so they may hold user data.
 * @param {Object} opts
 * @param {string} [opts.label=''] - HTML; with none, opts.ariaLabel names the field
 * @param {string} opts.id - the input's id; its label points at it
 * @param {string} [opts.type='text'] - text, textarea, select, toggle, tristate or button
 * @param {string} [opts.value=''] - for text and textarea
 * @param {string} [opts.placeholder='']
 * @param {string} [opts.hint=''] - HTML shown below a stacked input
 * @param {string} [opts.classes=''] - extra classes on the row
 * @param {string} [opts.options] - <option> HTML, for select
 * @param {boolean} [opts.checked=false] - for toggle
 * @param {boolean} [opts.disabled=false] - for toggle
 * @param {boolean|null} [opts.state=null] - for tristate: null is auto
 * @param {string} [opts.defaultLabel=''] - for tristate: what auto resolves to
 * @param {string} [opts.buttonText=''] - for button
 * @param {boolean} [opts.stacked=false] - label above the input
 * @param {string} [opts.ariaLabel] - plain-text name for a stacked input or a
 *   toggle with no visible label: a placeholder or a heading above is not a
 *   label (WCAG 1.3.1, 4.1.2)
 * @returns {string} HTML, or '' for an unknown type
 */
function createInputRow(opts) {
	const {
		label = '', id, type = 'text', value = '', placeholder = '', hint = '', classes = '',
		options, checked = false, disabled = false, state = null, defaultLabel = '', buttonText = '',
		stacked = false, ariaLabel = ''
	} = opts;
	const extra = classes ? ' ' + classes : '';
	const nameAttr = !label && ariaLabel ? ` aria-label="${escapeHtml(ariaLabel)}"` : '';

	if (stacked || ['text', 'textarea', 'select'].includes(type)) {
		let inputHtml;
		if (type === 'textarea') {
			inputHtml = `<textarea id="${id}"${nameAttr} placeholder="${escapeHtml(placeholder)}">${escapeHtml(value)}</textarea>`;
		} else if (type === 'select' && options) {
			inputHtml = `<select id="${id}"${nameAttr}>${options}</select>`;
		} else {
			inputHtml = `<input type="${type}" id="${id}"${nameAttr} value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}">`;
		}
		return `
			<div class="${uiClass('input-row-stacked')}${extra}">
				${label ? `<label for="${id}">${label}</label>` : ''}
				${inputHtml}
				${hint ? `<div class="hint">${hint}</div>` : ''}
			</div>
		`;
	}

	if (type === 'toggle' || type === 'tristate') {
		const isTristate = type === 'tristate';
		const isChecked = isTristate ? state === true : checked;
		const stateText = isTristate ? tristateText(state) : String(isChecked);
		const thumbPos = isTristate ? tristateThumbPos(state) : (isChecked ? 'pos-end' : 'pos-start');
		const rowClass = uiClass('input-row', 'flex', 'items-center', 'justify-between', 'gap-4', 'toggle')
			+ (isTristate ? ' ' + uiClass('tristate-toggle') : '');
		// The name comes from the first label alone: the visual label is
		// aria-hidden, so its true/false text is not read as part of the name.
		// A tristate is a plain checkbox (indeterminate = auto, set by
		// syncTristate); a toggle is a switch
		return `
			<div class="${rowClass}${extra}">
				<label for="${id}">${label}${isTristate && defaultLabel ? ` <span class="${uiClass('text-dim')}">(default: ${escapeHtml(defaultLabel)})</span>` : ''}</label>
				<input type="checkbox" id="${id}" class="${uiClass('sr-only')}"${nameAttr}${isTristate ? '' : ' role="switch"'} ${isChecked ? 'checked' : ''} ${disabled ? 'disabled' : ''}>
				<label for="${id}" class="${uiClass('toggle-label')}" aria-hidden="true">
					<span class="${uiClass('toggle-value')}">${stateText}</span>
					<span class="${uiClass('toggle-track')}${isChecked ? ' active' : ''}">
						<span class="${uiClass('toggle-thumb')} ${thumbPos}"></span>
					</span>
				</label>
			</div>
		`;
	}

	if (type === 'button') {
		// The row text describes the button rather than naming it: a speech
		// user says the button's own visible text (WCAG 2.5.3)
		return `
			<div class="${uiClass('input-row', 'flex', 'items-center', 'justify-between', 'gap-4')}${extra}">
				<label id="${id}-description">${label}</label>
				<button type="button" id="${id}" class="${uiClass('inline-btn', 'flex-shrink-0')}" aria-describedby="${id}-description">${buttonText}</button>
			</div>
		`;
	}

	return '';
}

/**
 * @param {boolean|null} state
 * @returns {string} the tristate's visible value
 */
function tristateText(state) {
	return state === true ? 'true' : state === false ? 'false' : 'auto';
}

/**
 * @param {boolean|null} state
 * @returns {string} the tristate thumb's position class
 */
function tristateThumbPos(state) {
	return state === true ? 'pos-end' : state === false ? 'pos-start' : 'pos-middle';
}

/**
 * Make a toggle row's visuals match its checkbox.
 * Side effects: updates the row's value text, track and thumb.
 * @param {HTMLInputElement} checkbox - from a createInputRow toggle
 */
function syncToggle(checkbox) {
	const row = checkbox.closest('.' + uiClass('toggle'));
	if (!row) return;
	const isChecked = checkbox.checked;
	row.querySelector('.' + uiClass('toggle-value')).textContent = String(isChecked);
	row.querySelector('.' + uiClass('toggle-track')).classList.toggle('active', isChecked);
	const thumb = row.querySelector('.' + uiClass('toggle-thumb'));
	thumb.classList.toggle('pos-end', isChecked);
	thumb.classList.toggle('pos-start', !isChecked);
}

/**
 * Set a tristate row's checkbox and visuals to a state.
 * Side effects: sets checked and indeterminate (read as "mixed" for auto),
 * and updates the row's value text, track and thumb.
 * @param {HTMLInputElement} checkbox - from a createInputRow tristate
 * @param {boolean|null} state - null is auto
 */
function syncTristate(checkbox, state) {
	checkbox.checked = state === true;
	checkbox.indeterminate = state === null;
	const row = checkbox.closest('.' + uiClass('tristate-toggle'));
	if (!row) return;
	row.querySelector('.' + uiClass('toggle-value')).textContent = tristateText(state);
	row.querySelector('.' + uiClass('toggle-track')).classList.toggle('active', state === true);
	const thumb = row.querySelector('.' + uiClass('toggle-thumb'));
	thumb.classList.remove('pos-start', 'pos-middle', 'pos-end');
	thumb.classList.add(tristateThumbPos(state));
}

// The author links every script's attribution row starts with
const AUTHOR_LINKS = [
	'created by <a href="/z0ylent">@z0ylent</a>',
	'<a href="https://z0m.bi" target="_blank" rel="noopener noreferrer">https://z0m.bi</a>',
];

/**
 * The footer warning every script shows, so the wording stays identical.
 * @param {string} howToReport - HTML: where this script wants issue reports
 * @returns {string} HTML
 */
function userscriptWarning(howToReport) {
	return `This is a custom userscript. Do NOT report issues to the creator of Cyberspace. ${howToReport}`;
}

/**
 * The warning box, as in a dialog's footer and at the top of the settings tab.
 * @param {string} html - the warning, written by the script (not escaped)
 * @returns {string} HTML
 */
function warningBoxHtml(html) {
	return `<div class="${uiClass('dialog-warning')} hint">${html}</div>`;
}

// A pixel trash can, in the text color. Decorative: the button is named
const TRASH_ICON_SVG = '<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" shape-rendering="crispEdges" aria-hidden="true" focusable="false">'
	+ '<rect x="5" y="1" width="6" height="2"/><rect x="2" y="3" width="12" height="2"/><rect x="3" y="6" width="2" height="8"/>'
	+ '<rect x="11" y="6" width="2" height="8"/><rect x="3" y="13" width="10" height="2"/><rect x="7" y="7" width="2" height="5"/></svg>';

/**
 * A button that is only an icon, named and titled by label.
 * @param {string} svg - the icon, decorative (aria-hidden)
 * @param {string} label
 * @param {Function} onClick
 * @param {'danger'} [tone] - danger: the error color on hover, for a delete
 * @returns {HTMLButtonElement}
 */
function iconButton(svg, label, onClick, tone) {
	const button = document.createElement('button');
	button.type = 'button';
	button.className = tone ? uiClass('icon-btn', tone) : uiClass('icon-btn');
	button.title = label;
	button.setAttribute('aria-label', label);
	button.innerHTML = svg;
	button.addEventListener('click', onClick);
	return button;
}

/**
 * An entry list (as the Users section): one row per entry, with its parts;
 * or, with no entries, a hint saying so.
 * @param {{key: string, parts: Node[]}[]} entries - key: the row's
 *   data-entry-key; parts: what the row shows. A control in it may carry
 *   data-entry-control, naming it for redrawEntryList
 * @param {string} emptyText - the hint when there are none
 * @returns {HTMLElement} a .atmo-entry-list, or the hint
 */
function entryList(entries, emptyText) {
	if (!entries.length) {
		const empty = document.createElement('div');
		empty.className = 'hint';
		empty.textContent = emptyText;
		return empty;
	}
	const list = document.createElement('ul');
	list.className = uiClass('entry-list');
	for (const entry of entries) {
		const item = document.createElement('li');
		item.dataset.entryKey = entry.key;
		item.append(...entry.parts);
		list.appendChild(item);
	}
	return list;
}

/**
 * Redraw the entry lists in container. When focus was in them, or nowhere
 * (on <body>, where a browser may leave it after a click), put it back: on
 * the same control (data-entry-control) of focusKey's row, else its first button, else the first
 * button of the row now in its place, else fallback. The redraw drops the
 * button that had it. Without focusKey, the row that had focus is used, and
 * focus nowhere stays nowhere. Focus elsewhere, as after a dialog opened
 * from the page, stays where it is.
 * Side effects: runs redraw; may move focus.
 * @param {HTMLElement} container - holds the lists
 * @param {Function} redraw - replaces container's contents
 * @param {string} [focusKey] - the row the change was about; none, to keep
 *   focus on whichever row has it
 * @param {HTMLElement|null} [fallback] - focused when no row is left
 */
function redrawEntryList(container, redraw, focusKey, fallback = null) {
	const previousKeys = Array.from(container.querySelectorAll('li[data-entry-key]'), li => li.dataset.entryKey);
	const active = document.activeElement;
	const focusInList = !!active && active !== document.body && container.contains(active);
	const focusNowhere = !active || active === document.body;
	// Without a key, the row and button that have focus, so a redraw for some
	// other reason (a load finishing) does not drop it
	const key = focusKey ?? (focusInList ? active.closest('li[data-entry-key]')?.dataset.entryKey : undefined);
	const control = focusInList ? active.dataset.entryControl || null : null;
	redraw();
	if (key === undefined || !(focusInList || focusNowhere)) return;
	const rows = Array.from(container.querySelectorAll('li[data-entry-key]'));
	const row = rows.find(li => li.dataset.entryKey === key)
		|| rows[Math.min(previousKeys.indexOf(key), rows.length - 1)];
	const sameControl = control && row?.querySelector(`[data-entry-control="${control}"]`);
	(sameControl || row?.querySelector('button') || fallback)?.focus();
}

/**
 * Ask before a change that cannot be undone. Cancel comes first, so a
 * hurried Enter does not confirm.
 * Side effects: opens a dialog; confirming closes it, then runs onConfirm.
 * @param {{title: string, message: string, confirmLabel: string, tone?: 'danger'|'caution', onConfirm: Function}} confirm -
 *   message: what will be lost, as warning-box HTML written by the script
 *   (not escaped); tone: the confirm button's color, error ('danger') or
 *   warning ('caution')
 */
function confirmAction({ title, message, confirmLabel, tone = 'danger', onConfirm }) {
	createDialog({
		title,
		width: '400px',
		onHelp: null,
		warning: '',
		attribution: [],
		content: warningBoxHtml(message),
		buttons: [
			{ label: 'CANCEL', class: 'cancel', onClick: (close) => close() },
			{ label: confirmLabel, class: uiClass(tone), onClick: (close) => {
				close();
				onConfirm();
			} },
		],
	});
}

/**
 * The attribution row: author links, repo, version, divided by rules. As in a
 * dialog's footer and at the top of the settings tab.
 * @param {string[]} items - HTML, written by the script (not escaped)
 * @returns {string} HTML, or '' for no items
 */
function attributionHtml(items) {
	if (!items.length) return '';
	return `<div class="${uiClass('dialog-attribution')} hint">${items.map(item => `<span>${item}</span>`).join('')}</div>`;
}

/**
 * The attribution row's icon link to a script's source repository.
 * @param {string} url
 * @returns {string} HTML
 */
function repoLinkHtml(url) {
	return `<a class="github-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" aria-label="GitHub"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" height="14px" aria-hidden="true"> <path fill="currentColor" d="M5 2h4v2H7v2H5V2Zm0 10H3V6h2v6Zm2 2H5v-2h2v2Zm2 2v-2H7v2H3v-2H1v2h2v2h4v4h2v-4h2v-2H9Zm0 0v2H7v-2h2Zm6-12v2H9V4h6Zm4 2h-2V4h-2V2h4v4Zm0 6V6h2v6h-2Zm-2 2v-2h2v2h-2Zm-2 2v-2h2v2h-2Zm0 2h-2v-2h2v2Zm0 0h2v4h-2v-4Z"/> </svg></a>`;
}

// Elements Tab can land on, for the focus trap
const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Whether el can take focus: neither it nor an ancestor up to root is
 * hidden or display: none (the settings engine hides fields that way).
 * @param {HTMLElement} el
 * @param {HTMLElement} root
 * @returns {boolean}
 */
function isRendered(el, root) {
	for (let node = el; node && node !== root; node = node.parentElement) {
		if (node.hidden || getComputedStyle(node).display === 'none') return false;
	}
	return true;
}

/**
 * Open a modal dialog.
 *
 * Accessibility: role="dialog" with aria-modal, labelled by its title. Focus
 * moves into the dialog, Tab stays inside it, Escape closes it, and focus
 * returns to where it was.
 *
 * Every option except content may also come from the optional global
 * dialogDefaults(); options given here win. Pass onHelp: null to drop a
 * default help button, or warning: '' and attribution: [] to drop a default
 * footer.
 * Side effects: refreshes the --atmo-* theme variables, appends the overlay to
 * document.body and moves focus.
 * @param {Object} opts
 * @param {string} opts.title - HTML
 * @param {string} opts.content - HTML
 * @param {Array<{label: string, class?: string, onClick?: Function}>} [opts.buttons] -
 *   footer buttons, in order; onClick gets close()
 * @param {string} [opts.width='400px'] - CSS min-width; max is 100px more
 * @param {string} [opts.preview] - HTML for a strip above the content
 * @param {string} [opts.warning] - HTML for the warning box in the footer
 * @param {string[]} [opts.attribution] - HTML items for the attribution row,
 *   usually [...AUTHOR_LINKS, versionLinkHtml()]
 * @param {string} [opts.footerHtml] - more HTML above the footer buttons
 * @param {Function} [opts.onClose]
 * @param {Function} [opts.onSettings] - shows a SETTINGS button that closes this and calls it
 * @param {Function|null} [opts.onHelp] - shows a ? button that calls it
 * @param {Function} [opts.onOpen] - called with the dialog API once it is in the document
 * @returns {{el: HTMLElement, close: Function, querySelector: Function, querySelectorAll: Function}}
 */
function createDialog(opts) {
	const defaults = typeof dialogDefaults === 'function' ? dialogDefaults() : {};
	const {
		title, content, buttons = [], width = '400px', preview = '', footerHtml = '',
		warning = '', attribution = [], onClose, onSettings, onHelp, onOpen,
	} = { ...defaults, ...opts };

	// Theme colors may have changed since the last dialog
	initThemeVariables();

	const footerParts = [
		warning ? warningBoxHtml(warning) : '',
		attributionHtml(attribution),
		footerHtml,
	].filter(Boolean).join('');

	const titleId = uiId('dialog-title');
	const overlay = document.createElement('div');
	overlay.className = uiClass('dialog-overlay');
	overlay.innerHTML = `
		<div class="${uiClass('dialog')}" role="dialog" aria-modal="true" aria-labelledby="${titleId}" tabindex="-1"
			style="min-width: ${width}; max-width: calc(${width} + 100px);">
			<div class="${uiClass('dialog-header', 'flex', 'justify-between')}">
				<h3 id="${titleId}">${title}</h3>
				<div class="spacer"></div>
				${onSettings ? `<button type="button" class="${uiClass('header-settings')} link-brackets"><span class="inner">SETTINGS</span></button>` : ''}
				${onHelp ? `<button type="button" class="${uiClass('header-help')} link-brackets" aria-label="Help"><span class="inner" aria-hidden="true">?</span></button>` : ''}
				<button type="button" class="${uiClass('header-close')} link-brackets" aria-label="ESC, close"><span class="inner" aria-hidden="true">ESC</span></button>
			</div>
			${preview ? `<div class="${uiClass('dialog-preview')}">${preview}</div>` : ''}
			<div class="${uiClass('dialog-content')}">
				${content}
			</div>
			<div class="${uiClass('dialog-footer')}">
				${footerParts}
				${buttons.length ? `${footerParts ? '<hr />' : ''}
				<div class="buttons ${uiClass('flex', 'flex-wrap', 'items-center', 'gap-2')}">
					${buttons.map(b => `<button type="button" class="${b.class || ''} link-brackets"><span class="inner">${b.label}</span></button>`).join('')}
				</div>` : ''}
			</div>
		</div>
	`;
	const dialogEl = overlay.firstElementChild;
	const returnFocusTo = document.activeElement;

	let closed = false;
	const close = () => {
		if (closed) return;
		closed = true;
		overlay.remove();
		if (returnFocusTo && typeof returnFocusTo.focus === 'function' && returnFocusTo.isConnected) {
			returnFocusTo.focus();
		}
		onClose?.();
	};

	// Footer buttons render in order, so bind them by position
	const footerButtons = dialogEl.querySelectorAll(`.${uiClass('dialog-footer')} .buttons > button`);
	buttons.forEach((b, i) => {
		if (b.onClick) footerButtons[i].addEventListener('click', () => b.onClick(close));
	});

	dialogEl.querySelector('.' + uiClass('header-close')).addEventListener('click', close);
	if (onSettings) {
		dialogEl.querySelector('.' + uiClass('header-settings')).addEventListener('click', () => {
			close();
			onSettings();
		});
	}
	if (onHelp) dialogEl.querySelector('.' + uiClass('header-help')).addEventListener('click', onHelp);
	const versionLink = dialogEl.querySelector('.' + uiClass('version-link'));
	if (versionLink) bindVersionLink(versionLink);

	// Close on a click on the backdrop only when the press also started there:
	// dragging a slider out of the dialog must not close it
	let mouseDownOnOverlay = false;
	overlay.addEventListener('mousedown', (e) => {
		mouseDownOnOverlay = e.target === overlay;
	});
	overlay.addEventListener('click', (e) => {
		if (e.target === overlay && mouseDownOnOverlay) close();
		mouseDownOnOverlay = false;
	});

	overlay.addEventListener('keydown', (e) => {
		if (e.key === 'Escape') {
			// One Escape closes this dialog only: the site's own document-level
			// handlers (closing a site modal underneath) must not see it too
			e.stopPropagation();
			close();
			return;
		}
		if (e.key !== 'Tab') return;
		const focusable = Array.from(dialogEl.querySelectorAll(FOCUSABLE_SELECTOR))
			.filter(el => isRendered(el, dialogEl) && el.getAttribute('aria-hidden') !== 'true');
		if (!focusable.length) {
			e.preventDefault();
			dialogEl.focus();
			return;
		}
		const first = focusable[0];
		const last = focusable[focusable.length - 1];
		if (e.shiftKey && (document.activeElement === first || document.activeElement === dialogEl)) {
			e.preventDefault();
			last.focus();
		} else if (!e.shiftKey && document.activeElement === last) {
			e.preventDefault();
			first.focus();
		}
	});

	document.body.appendChild(overlay);
	// The dialog itself takes focus, so screen readers announce its title
	// before the first field
	dialogEl.focus();

	const api = {
		el: overlay,
		close,
		querySelector: (sel) => overlay.querySelector(sel),
		querySelectorAll: (sel) => overlay.querySelectorAll(sel),
	};
	onOpen?.(api);
	return api;
}

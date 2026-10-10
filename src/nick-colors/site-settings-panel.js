// =====================================================
// SETTINGS PANEL
// =====================================================

// This script's section of the site's Settings > AtmoMod tab
// Section keys are page-wide, shared by every script on the tab; prefixed with
// this script's name so another script's 'nick-colors' cannot collide with it
const SETTINGS_SECTION_KEY = 'atmospheric-modulator-nick-colors';

/**
 * The form's two contrast fields for a stored contrastThreshold, where 0
 * means off: the toggle, and the slider, kept at 4.5 while off so switching
 * it back on starts there.
 * @param {number} [threshold] - from siteConfig or a preset; missing means 4.5
 * @returns {{contrastEnabled: boolean, contrastThreshold: number}}
 */
function contrastFields(threshold = 4.5) {
	return { contrastEnabled: threshold > 0, contrastThreshold: threshold > 0 ? threshold : 4.5 };
}

/**
 * The preset button for a theme: its preset's name, lowercased,
 * whether the theme is given by that name or by its site id (Top8 is
 * 'myspace'). '' when no preset matches, so no button is pressed.
 * @param {string} themeName - a preset name or a data-theme value
 * @returns {string}
 */
function presetKey(themeName) {
	const preset = findThemeEntry(PRESET_THEMES, themeName);
	const name = Object.keys(PRESET_THEMES).find(key => PRESET_THEMES[key] === preset);
	return name ? name.toLowerCase() : '';
}

/**
 * The global settings form's markup.
 * @returns {{presets: string, preview: string, content: string}} HTML: the
 *   preset buttons, the strip of preview nicks, and the rest of the form
 *   (filled in by buildSiteSettingsForm). Apart, so the section can
 *   put the presets and a line naming the preview between them
 */
function siteSettingsMarkup() {
	const eff = getEffectiveSiteConfig();
	const theme = getThemeColors(null, 'hsl');
	return {
		presets: presetButtonsHtml(),
		preview: `<div class="preview-row" data-settings-preview></div>
			<div class="preview-row preview-inverted" data-settings-preview-inverted></div>`,
		content: `
			${createDebugPre({
				'Site Theme': Object.entries(theme).length ? 
					'<span>' + Object.entries(theme).filter(([key, value]) => key.match(/^info|error|warn|success/i) ? false : true).map(([key, value]) => `${key}: ${parseColor(value, 'hsl-string') + ` <span style="border: 1px solid var(--atmo-border); color: ${parseColor(value, 'hsl-string')}">███</span>`}`).join('</span><br /><span>') + '</span>' : 
					'not detected',
				'Effective Config': `H:${eff.minHue}-${eff.maxHue} S:${eff.minSaturation}-${eff.maxSaturation} L:${eff.minLightness}-${eff.maxLightness}`,
				'Contrast Threshold': eff.contrastThreshold,
				'Custom Colors Saved': Object.keys(customNickColors).length
			})}
			<hr />
			<div data-settings-engine></div>
		`,
	};
}

/**
 * The preset buttons, as the site's theme buttons on its Appearance tab,
 * each in its own theme's colors (THEME_COLORS), and the Follow site theme
 * switch beside their label. None is pressed until one is chosen, Reset to
 * Preset picks one, or the switch follows the site theme's.
 * @returns {string} HTML
 */
function presetButtonsHtml() {
	// Page-unique: the dialog and the settings page section can both be open
	const labelId = uiId('settings-preset');
	const buttons = Object.keys(PRESET_THEMES).map(name => {
		const colors = findThemeEntry(THEME_COLORS, name)?.colors;
		const style = colors ? ` style="--${UI_PREFIX}-chip-fg: ${escapeHtml(colors.fg)}; --${UI_PREFIX}-chip-bg: ${escapeHtml(colors.bg)}"` : '';
		return `
		<button type="button" class="${uiClass('chip', 'chip-themed')}" data-preset="${escapeHtml(name.toLowerCase())}" aria-pressed="false"${style}>
			<span>${escapeHtml(name)}</span>
			<span class="${uiClass('chip-check')}" aria-hidden="true">✓</span>
		</button>`;
	}).join('');
	return `
		<div class="${uiClass('input-row-stacked')} nc-settings-preset">
			<div class="${uiClass('flex', 'items-center', 'justify-between', 'gap-4')}">
				<span id="${labelId}">Preset theme</span>
				${createInputRow({ type: 'toggle', id: uiId('settings-follow-theme'), label: 'Follow site theme', checked: !!siteConfig.followSiteTheme, classes: 'nc-settings-follow-theme' })}
			</div>
			<div class="${uiClass('chip-row')}" role="group" aria-labelledby="${labelId}">${buttons}</div>
		</div>`;
}

/**
 * Fill Nick Colors' section of the site's Settings > AtmoMod tab. The
 * site's own settings save as they change, so this form does too.
 * Side effects: fills body; every change writes siteConfig and recolors the page.
 * @param {HTMLElement} body - the section body from registerSettingsSection
 */
function renderSiteSettingsSection(body) {
	const { presets, preview, content } = siteSettingsMarkup();
	const resetId = uiId('nick-colors-reset');
	body.innerHTML = `
		<div class="hint">Changes save as you make them. Per-user colors: right-click a username and ${COLOR_MENU_HOWTO}.<br />
		<br />
		Select a Preset theme below to create a starting point to adjust colors from, or toggle on "Follow site theme" to have the preset follow you when you change your site's theme.</div>
		${presets}
		<div class="hint nc-settings-preview-label" data-settings-preview-label>Nick color examples on your theme's background and inverted, from your settings below.</div>
		<div class="atmo-dialog-preview nc-settings-preview">${preview}</div>
		${content}
		<hr />
		<div class="${uiClass('settings-section')}">
			<h4>Reset Nick Color Theme</h4>
			${createInputRow({
				type: 'button',
				id: resetId,
				// Undoes the section's settings: in the warning color, and asks first
				classes: uiClass('caution'),
				label: 'Put the color settings back to the selected preset, or with none selected to the site theme\'s. Chooms, per-user colors and notes stay.',
				buttonText: 'Reset to Preset',
			})}
		</div>
	`;
	const form = buildSiteSettingsForm(body, {
		onImported: () => renderSiteSettingsSection(body),
	});
	keepFocusClearOfPreview(body);
	const resetButton = body.querySelector('#' + resetId);
	resetButton.addEventListener('click', () => confirmAction({
		title: 'Reset to preset?',
		message: `This puts the nick color settings back to the selected preset, or with none selected to the site theme's. Chooms, per-user colors, notes and the ${SETTINGS_TITLE} section stay.`,
		confirmLabel: 'RESET',
		tone: 'caution',
		onConfirm: () => {
			form.reset();
			// Answered after the section redrew (the theme changed meanwhile):
			// the reset went to the old form, so show what it saved
			if (!resetButton.isConnected) refreshSettingsSection(SETTINGS_SECTION_KEY);
		},
	}));
}

/**
 * Keep a focused control out from under the stuck nick color examples.
 * Focus moving up, as with Shift+Tab, scrolls the control to the top edge,
 * where the examples stick, and they would hide it.
 * Side effects: listens for focus in body, once, and marks it
 * data-nc-focus-clear; scrolls the page, or the dialog, until a covered
 * control's field and focus ring sit just below the examples.
 * @param {HTMLElement} body - the section body renderSiteSettingsSection filled
 */
function keepFocusClearOfPreview(body) {
	// An import redraws the same body: one listener is enough
	if (body.dataset.ncFocusClear) return;
	body.dataset.ncFocusClear = 'true';
	body.addEventListener('focusin', (event) => {
		const control = event.target;
		// The browser scrolls a focused control into view after focusin, so
		// measure where that leaves it
		requestAnimationFrame(() => {
			const preview = body.querySelector('.nc-settings-preview');
			if (!preview || document.activeElement !== control) return;
			// Only what comes after the examples scrolls under them
			if (!(preview.compareDocumentPosition(control) & Node.DOCUMENT_POSITION_FOLLOWING)) return;
			// A toggle or slider focuses a hidden input and draws its ring on
			// the track or thumb: the field holds both
			const field = control.closest('[data-field-key]') || control;
			const examples = preview.getBoundingClientRect();
			// Refocused, as when the window is, after scrolling away from it:
			// above the examples, not under them
			if (field.getBoundingClientRect().bottom <= examples.top) return;
			const covered = examples.bottom - visibleTop(field);
			if (covered > 0) scrollContainerOf(control).scrollTop -= covered;
		});
	});
}

/**
 * The top of an element as drawn, with any outline in it, as a focus ring.
 * @param {HTMLElement} element
 * @returns {number} viewport y
 */
function visibleTop(element) {
	let top = element.getBoundingClientRect().top;
	for (const part of [element, ...element.querySelectorAll('*')]) {
		const style = getComputedStyle(part);
		if (!style.outlineStyle || style.outlineStyle === 'none') continue;
		const outline = (parseFloat(style.outlineWidth) || 0) + (parseFloat(style.outlineOffset) || 0);
		top = Math.min(top, part.getBoundingClientRect().top - outline);
	}
	return top;
}

/**
 * The nearest ancestor that scrolls element: a dialog's content, or the page.
 * @param {HTMLElement} element
 * @returns {Element}
 */
function scrollContainerOf(element) {
	for (let node = element.parentElement; node; node = node.parentElement) {
		const { overflowY } = getComputedStyle(node);
		if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) return node;
	}
	return document.scrollingElement || document.documentElement;
}

/**
 * Ask, then remove every per-user style set with Color: color, icons, style.
 * Side effects: opens a dialog; confirming clears customNickColors, saves it,
 * recolors the page and redraws the Users section.
 */
function confirmClearCustomNickColors() {
	const count = Object.keys(customNickColors).length;
	confirmAction({
		title: 'Reset custom user styles?',
		message: `This removes the custom color, icons and style set for ${count === 1 ? '1 user' : `${count} users`}, and cannot be undone. A name with a site-wide override goes back to it. Notes stay. To keep a copy, choose Save Settings File under ${BACKUP_SECTION_TITLE} first.`,
		confirmLabel: 'RESET CUSTOM SETTINGS',
		tone: 'danger',
		onConfirm: () => {
			replaceCustomNickColors({});
			colorizeAll();
			refreshUserList();
		},
	});
}

/**
 * Wire up the global settings form in root: previews, the preset buttons,
 * and the settings engine.
 * Side effects: fills root's form; every change writes siteConfig and
 * recolors the page.
 * @param {HTMLElement} root - holds siteSettingsMarkup()'s presets, preview and content
 * @param {{onImported: Function}} options - onImported: called after a
 *   successful import, to show the imported settings
 * @returns {{engine: Object, save: Function, reset: Function}}
 */
function buildSiteSettingsForm(root, { onImported }) {
	const eff = getEffectiveSiteConfig();
	const theme = getThemeColors(null, 'hsl');
	const {
		settings: defaultSettings,
		colorVariables: defaultColors
	} = getThemeDefaultSettings();
	// Off until the form is set up: its own initial updates are not changes
	let ready = false;

	const engineContainer = root.querySelector('[data-settings-engine]');
	const presetButtons = Array.from(root.querySelectorAll('.nc-settings-preset [data-preset]'));
	const followTheme = root.querySelector('.nc-settings-follow-theme input[type="checkbox"]');
	// The site theme when this form opened: its ranges are that theme's
	let formTheme = siteThemeName || '';
	// Inside save(), choosing the new theme's preset saves again on the tab
	let saving = false;
	// The chosen preset's key, lowercased; '' for none, as the site theme
	let selectedPreset = '';
	/**
	 * Show a preset as the chosen one.
	 * Side effects: sets selectedPreset and each button's aria-pressed.
	 * @param {string} key - from presetKey; '' for none
	 */
	const showPreset = (key) => {
		selectedPreset = key;
		for (const button of presetButtons) button.setAttribute('aria-pressed', String(button.dataset.preset === key));
	};
	const previewRow = root.querySelector('[data-settings-preview]');
	const previewRowInverted = root.querySelector('[data-settings-preview-inverted]');

	/**
	 * Store the form's values as siteConfig and recolor the page.
	 */
	function save() {
		// Following, and the theme changed since this form opened (a dialog
		// left open, a confirm answered after the section redrew): its ranges
		// are the old theme's. Saving would put them back, so take the new
		// theme's first
		if (followTheme.checked && (siteThemeName || '') !== formTheme && !saving) {
			formTheme = siteThemeName || '';
			saving = true;
			try {
				choosePreset(presetKey(formTheme));
			} finally {
				saving = false;
			}
		}
		// The switch is outside the engine's form
		siteConfig = { ...engine.getValues(), followSiteTheme: followTheme.checked, followedTheme: followTheme.checked ? formTheme : '' };
		saveSiteConfig();
		colorizeAll();
	}

	/**
	 * Reset the form to the selected preset theme (or the site theme if none,
	 * or while following it).
	 */
	function reset() {
		// Following: the site theme's preset now, which may not be the one
		// pressed when this form opened
		if (followTheme.checked) formTheme = siteThemeName || '';
		const selectedTheme = (followTheme.checked ? formTheme : selectedPreset) || siteThemeName || '';
		const themeDefaults = getThemeDefaultSettings(selectedTheme);
		const resetSettings = themeDefaults.settings;
		const resetColors = themeDefaults.colorVariables;
		engine.setValues({
			...resetSettings,
			...contrastFields(resetSettings.contrastThreshold),
			hueRange: [resetSettings.minHue, resetSettings.maxHue],
			satRange: [resetSettings.minSaturation, resetSettings.maxSaturation],
			litRange: [resetSettings.minLightness, resetSettings.maxLightness],
			singleColorHue: resetColors.fg?.h ?? resetSettings.singleColorHue,
			singleColorSat: resetColors.fg?.s ?? resetSettings.singleColorSat,
			singleColorLit: resetColors.fg?.l ?? resetSettings.singleColorLit,
		}, true);
		showPreset(presetKey(selectedTheme));
		updatePreview();
	}

	const previewNames = [
		'z0ylent', 'fr33Kevin', 'triNity', 'an0nym0us', 'ZeR0C00L',
		'l1sb3th', 'enki', 'genghis_khan', 'acidBurn', 'neo', 'N3tRuNn3r', 
		'ByteMe99', 'CyB3rPuNk'
	];

	previewNames.forEach(name => {
		const span = document.createElement('span');
		span.className = 'preview-nick';
		span.textContent = name;
		previewRow.appendChild(span);
	});
	// Also add to inverted row
	previewNames.forEach(name => {
		const span = document.createElement('span');
		span.className = 'preview-nick';
		span.textContent = name;
		previewRowInverted.appendChild(span);
	});

	// Define the settings schema
	const schema = [
		{ type: 'section', label: 'Monochrome Mode', fields: [
			{ key: 'useSingleColor', type: 'toggle', label: 'Use monochrome mode', default: false },
			{ type: 'hint', text: 'All usernames will use the same color. Per-user color customization is disabled.',
				showWhen: { field: 'useSingleColor', is: true } },
			{ key: 'singleColorHue', type: 'slider', label: 'Hue', min: 0, max: 360,
				default: defaultColors.fg?.h ?? 180, simple: false,
				showWhen: { field: 'useSingleColor', is: true } },
			{ key: 'singleColorSat', type: 'slider', label: 'Saturation', min: 0, max: 100,
				default: defaultColors.fg?.s ?? 85, simple: false,
				showWhen: { field: 'useSingleColor', is: true } },
			{ key: 'singleColorLit', type: 'slider', label: 'Lightness', min: 0, max: 100,
				default: defaultColors.fg?.l ?? 65, simple: false,
				showWhen: { field: 'useSingleColor', is: true } },
			{ key: 'singleColorCustom', type: 'text', label: 'Or use a custom color:',
				placeholder: '#ff6b6b or hsl(280, 90%, 65%)', default: '',
				showWhen: { field: 'useSingleColor', is: true } },
		]},

		{ type: 'section', label: `Hue Range${theme.fg ? '' : ' <span class="atmo-text-dim">(no site theme)</span>'}`, showWhen: { field: 'useSingleColor', is: false }, fields: [
			{ key: 'useSiteThemeHue', type: 'toggle',
				label: `Use site theme foreground hue${theme.fg ? ` <span style="color:hsl(${theme.fg.h}, 100%, 50%)">(${theme.fg.h}°)</span>` : ''}`,
				default: false, disabled: !theme.fg,
				showWhen: { field: 'useSingleColor', is: false } },
			{ key: 'hueSpread', type: 'slider', label: 'Hue spread (±°)', min: 5, max: 180, default: 30,
				showWhen: { all: [{ field: 'useSingleColor', is: false }, { field: 'useSiteThemeHue', is: true }] } },
			{ key: 'hueRange', type: 'range', label: 'Hue Range', min: 0, max: 360, default: [0, 360],
				showWhen: { field: 'useSingleColor', is: false } },
		]},

		{ type: 'section', label: 'Saturation Range', showWhen: { field: 'useSingleColor', is: false }, fields: [
			{ key: 'useSiteThemeSat', type: 'toggle',
				label: `Use site theme foreground saturation${theme?.fg ? ` <span style="color:${theme.fg}">(${theme.fg.s}%)</span>` : ''}`,
				default: false, disabled: !theme.fg,
				showWhen: { field: 'useSingleColor', is: false } },
			{ key: 'satSpread', type: 'slider', label: 'Saturation spread (±%)', min: 0, max: 50, default: 15,
				showWhen: { all: [{ field: 'useSingleColor', is: false }, { field: 'useSiteThemeSat', is: true }] } },
			{ key: 'satRange', type: 'range', label: 'Saturation Range', min: 0, max: 100, default: [70, 100],
				showWhen: { field: 'useSingleColor', is: false } },
		]},

		{ type: 'section', label: 'Lightness Range', showWhen: { field: 'useSingleColor', is: false }, fields: [
			{ key: 'useSiteThemeLit', type: 'toggle',
				label: `Use site theme foreground lightness${theme?.fg ? ` <span style="color:${theme.fg}">(${theme.fg.l}%)</span>` : ''}`,
				default: false, disabled: !theme.fg,
				showWhen: { field: 'useSingleColor', is: false } },
			{ key: 'litSpread', type: 'slider', label: 'Lightness spread (±%)', min: 0, max: 50, default: 10,
				showWhen: { all: [{ field: 'useSingleColor', is: false }, { field: 'useSiteThemeLit', is: true }] } },
			{ key: 'litRange', type: 'range', label: 'Lightness Range', min: 0, max: 100, default: [55, 75],
				showWhen: { field: 'useSingleColor', is: false } },
		]},

		{ type: 'section', label: 'Contrast', fields: [
			{ key: 'contrastEnabled', type: 'toggle', label: 'Enable contrast auto-inversion', default: true },
			{ type: 'hint', text: 'Auto-invert colors when WCAG contrast ratio is below threshold (3 = large text, 4.5 = AA, 7 = AAA)',
				showWhen: { field: 'contrastEnabled', is: true } },
			{ key: 'contrastThreshold', type: 'slider', label: 'Contrast Threshold (WCAG ratio)',
				min: 1, max: 21, step: 0.5, default: 4.5,
				showWhen: { field: 'contrastEnabled', is: true } },
		]},

		{ type: 'section', label: 'Style Variation', fields: [
			{ type: 'hint', text: 'Add non-color variation to usernames (useful for limited color ranges)' },
			{ key: 'varyWeight', type: 'toggle', label: 'Vary font weight', default: false },
			{ key: 'varyItalic', type: 'toggle', label: 'Vary italic', default: false },
			{ key: 'varyCase', type: 'toggle', label: 'Vary small-caps', default: false },
			{ key: 'prependIcon', type: 'toggle', label: 'Prepend icon', default: false },
			{ key: 'appendIcon', type: 'toggle', label: 'Append icon', default: false },
			{ key: 'iconSet', type: 'text', label: 'Icon set (space-separated)',
				placeholder: '● ○ ◆ ◇ ■ □ ▲ △ ★ ☆',
				default: '● ○ ◆ ◇ ■ □ ▲ △ ★ ☆ ♦ ♠ ♣ ♥ ☢ ☣ ☠ ⚙ ⬡ ⬢ ♻ ⚛ ⚠ ⛒',
				showWhen: { any: [{ field: 'prependIcon', is: true }, { field: 'appendIcon', is: true }] } },
		]},

		// Backup and troubleshooting cover the whole script, in its own section
		{ type: 'section', label: 'Moving from Nick Colors', noHr: true, fields: [
			{ type: 'button', label: 'Bring your colors and notes over from the separate Nick Colors userscript', id: 'settings-import-nick-colors', buttonText: 'Import from Nick Colors',
				onClick: () => showNickColorsImportDialog(onImported) },
		]},
	];

	// Create the settings engine with initial values
	const initialValues = {
		...eff,
		// Map the min/max values to range arrays
		hueRange: [eff.minHue, eff.maxHue],
		satRange: [eff.minSaturation, eff.maxSaturation],
		litRange: [eff.minLightness, eff.maxLightness],
		...contrastFields(eff.contrastThreshold),
	};

	const engine = createSettingsEngine({
		schema,
		values: initialValues,
		defaults: defaultSettings,
		onChange: (key, value) => {
			// Handle special cases
			if (key === 'useSingleColor' && value && ready) seedSingleColor();
			if (key === 'useSiteThemeHue' || key === 'hueSpread') {
				updateRangeFromSpread('hue');
			}
			if (key === 'useSiteThemeSat' || key === 'satSpread') {
				updateRangeFromSpread('sat');
			}
			if (key === 'useSiteThemeLit' || key === 'litSpread') {
				updateRangeFromSpread('lit');
			}
			updateGradients();
			updatePreview();
			if (ready) save();
		},
		container: engineContainer
	});

	engine.render();

	/**
	 * Start monochrome on the site theme's text color, unless one was chosen.
	 * Every save stores the single color, so a color still at
	 * DEFAULT_SITE_CONFIG's cyan was never chosen, only saved.
	 * Side effects: sets the form's single color, without saving it.
	 */
	function seedSingleColor() {
		if (!theme.fg || engine.getFieldValue('singleColorCustom')) return;
		const unchosen = ['singleColorHue', 'singleColorSat', 'singleColorLit']
			.every(key => engine.getFieldValue(key) === DEFAULT_SITE_CONFIG[key]);
		if (!unchosen) return;
		engine.setValues({
			singleColorHue: Math.round(theme.fg.h),
			singleColorSat: Math.round(theme.fg.s),
			singleColorLit: Math.round(theme.fg.l),
		});
	}

	// Update range slider from spread value (when using site theme)
	function updateRangeFromSpread(type) {
		if (!theme.fg) return;

		const useTheme = engine.getFieldValue(`useSiteTheme${type.charAt(0).toUpperCase() + type.slice(1)}`);
		if (!useTheme) return;

		const spread = engine.getFieldValue(`${type}Spread`);
		const rangeField = engine.getField(`${type}Range`);

		if (type === 'hue') {
			const minHue = (theme.fg.h - spread + 360) % 360;
			const maxHue = (theme.fg.h + spread) % 360;
			rangeField?.setValues([minHue, maxHue]);
		} else if (type === 'sat') {
			const minSat = Math.max(0, theme.fg.s - spread);
			const maxSat = Math.min(100, theme.fg.s + spread);
			rangeField?.setValues([minSat, maxSat]);
		} else if (type === 'lit') {
			const minLit = Math.max(0, theme.fg.l - spread);
			const maxLit = Math.min(100, theme.fg.l + spread);
			rangeField?.setValues([minLit, maxLit]);
		}
	}

	// Disable range sliders the site theme controls
	function updateSliderState(fieldKey, disabled) {
		engine.getField(fieldKey)?.setDisabled?.(disabled);
	}

	// Update gradients on all sliders
	function updateGradients() {
		const hueRange = engine.getField('hueRange');
		const satRange = engine.getField('satRange');
		const litRange = engine.getField('litRange');
		const hueSingle = engine.getField('singleColorHue');
		const satSingle = engine.getField('singleColorSat');
		const litSingle = engine.getField('singleColorLit');

		if (!hueRange || !satRange || !litRange) return;

		const [minH, maxH] = hueRange.getValues?.() || [0, 360];
		const [minS, maxS] = satRange.getValues?.() || [70, 100];
		const [minL, maxL] = litRange.getValues?.() || [55, 75];
		const midH = (minH + maxH) / 2, midS = (minS + maxS) / 2, midL = (minL + maxL) / 2;

		// Hue gradient
		const hueStops = Array.from({ length: 13 }, (_, i) => {
			const hue = i * 30;
			return [hue, midS, midL, 1, (i * 30 / 360) * 100];
		});
		hueRange.setGradient?.(hueStops);
		satRange.setGradient?.([[midH, 0, midL, 1, 0], [midH, 100, midL, 1, 100]]);
		litRange.setGradient?.([[midH, midS, 0, 1, 0], [midH, midS, 50, 1, 50], [midH, midS, 100, 1, 100]]);

		// Range thumb colors
		hueRange.setThumbColor?.([
			`hsl(${minH}, ${midS}%, ${midL}%)`,
			`hsl(${maxH}, ${midS}%, ${midL}%)`
		]);
		satRange.setThumbColor?.([
			`hsl(${midH}, ${minS}%, ${midL}%)`,
			`hsl(${midH}, ${maxS}%, ${midL}%)`
		]);
		litRange.setThumbColor?.([
			`hsl(${midH}, ${midS}%, ${minL}%)`,
			`hsl(${midH}, ${midS}%, ${maxL}%)`
		]);

		// Single color sliders
		if (hueSingle && satSingle && litSingle) {
			const h = hueSingle.getValue?.() ?? 180;
			const s = satSingle.getValue?.() ?? 85;
			const l = litSingle.getValue?.() ?? 65;

			const fullHueStops = Array.from({ length: 13 }, (_, i) => {
				const hue = i * 30;
				return [hue, s, l, 1, (hue / 360) * 100];
			});
			hueSingle.setGradient?.(fullHueStops);
			satSingle.setGradient?.([[h, 0, l, 1, 0], [h, 100, l, 1, 100]]);
			litSingle.setGradient?.([[h, s, 0, 1, 0], [h, s, 50, 1, 50], [h, s, 100, 1, 100]]);

			// Single slider thumb colors
			hueSingle.setThumbColor?.(`hsl(${h}, ${s}%, ${l}%)`);
			satSingle.setThumbColor?.(`hsl(${h}, ${s}%, ${l}%)`);
			litSingle.setThumbColor?.(`hsl(${h}, ${s}%, ${l}%)`);
		}

		// Update slider disabled states
		updateSliderState('hueRange', engine.getFieldValue('useSiteThemeHue'));
		updateSliderState('satRange', engine.getFieldValue('useSiteThemeSat'));
		updateSliderState('litRange', engine.getFieldValue('useSiteThemeLit'));
	}

	// Build effective config from engine values
	function getEffective() {
		const s = engine.getValues();
		const result = { ...s };

		// Map range arrays back to min/max
		if (s.hueRange) {
			result.minHue = s.hueRange[0];
			result.maxHue = s.hueRange[1];
		}
		if (s.satRange) {
			result.minSaturation = s.satRange[0];
			result.maxSaturation = s.satRange[1];
		}
		if (s.litRange) {
			result.minLightness = s.litRange[0];
			result.maxLightness = s.litRange[1];
		}

		return result;
	}

	// Update preview nicks
	function updatePreview() {
		updateGradients();
		const effConfig = getEffective();
		// Use selected preset theme for preview, or fall back to site theme
		const previewTheme = selectedPreset || siteThemeName || '';

		previewRow.querySelectorAll('.preview-nick').forEach((el, i) => {
			const username = previewNames[i];
			applyStyles(el, username, {
				effectiveConfig: effConfig,
				themeName: previewTheme,
				isInverted: false,
				debugData: DEBUG
			});
		});

		// Update inverted preview
		previewRowInverted.querySelectorAll('.preview-nick').forEach((el, i) => {
			const username = previewNames[i];
			applyStyles(el, username, {
				effectiveConfig: effConfig,
				themeName: previewTheme,
				isInverted: true,
				debugData: DEBUG
			});
		});
	}

	// Preset theme selection
	/**
	 * Show a preset as chosen and put its ranges in the form.
	 * Side effects: as showPreset; sets the form's ranges and contrast,
	 * which saves them on the settings tab; redraws the preview.
	 * @param {string} key - from presetKey; '' leaves the ranges alone
	 */
	const choosePreset = (key) => {
		showPreset(key);
		const ranges = presetRanges(key);
		if (!ranges) return;
		engine.setValues({
			hueRange: [ranges.minHue, ranges.maxHue],
			satRange: [ranges.minSaturation, ranges.maxSaturation],
			litRange: [ranges.minLightness, ranges.maxLightness],
			...contrastFields(ranges.contrastThreshold),
		}, true);
		updatePreview();
	};
	for (const button of presetButtons) button.addEventListener('click', () => {
		// A preset chosen by hand: the next theme change must not replace it
		if (followTheme.checked) {
			followTheme.checked = false;
			syncToggle(followTheme);
		}
		choosePreset(button.dataset.preset);
	});
	followTheme.addEventListener('change', () => {
		syncToggle(followTheme);
		formTheme = siteThemeName || '';
		if (followTheme.checked) choosePreset(presetKey(formTheme));
		// The switch itself, also where the site theme has no preset
		if (ready) save();
	});
	if (followTheme.checked) showPreset(presetKey(siteThemeName));

	// Override engine.getValues to return the right format for saving
	const originalGetValues = engine.getValues.bind(engine);
	engine.getValues = () => {
		const vals = originalGetValues();
		// Convert range arrays to min/max properties
		const result = { ...vals };
		if (vals.hueRange) {
			result.minHue = vals.hueRange[0];
			result.maxHue = vals.hueRange[1];
			delete result.hueRange;
		}
		if (vals.satRange) {
			result.minSaturation = vals.satRange[0];
			result.maxSaturation = vals.satRange[1];
			delete result.satRange;
		}
		if (vals.litRange) {
			result.minLightness = vals.litRange[0];
			result.maxLightness = vals.litRange[1];
			delete result.litRange;
		}
		// Handle contrast toggle - set threshold to 0 when disabled
		if (!vals.contrastEnabled) {
			result.contrastThreshold = 0;
		}
		delete result.contrastEnabled;
		return result;
	};

	// Initial setup
	updateRangeFromSpread('hue');
	updateRangeFromSpread('sat');
	updateRangeFromSpread('lit');
	updatePreview();
	ready = true;

	return { engine, save, reset };
}

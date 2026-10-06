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
 * The preset select's option for a theme: its preset's name, lowercased,
 * whether the theme is given by that name or by its site id (Top8 is
 * 'myspace'). An empty value, "Select a preset", when no preset matches.
 * @param {string} themeName - a preset name or a data-theme value
 * @returns {string}
 */
function presetOptionValue(themeName) {
	const preset = findThemeEntry(PRESET_THEMES, themeName);
	const name = Object.keys(PRESET_THEMES).find(key => PRESET_THEMES[key] === preset);
	return name ? name.toLowerCase() : '';
}

/**
 * The global settings form's markup.
 * @returns {{preview: string, content: string}} HTML: the strip of preview
 *   nicks, and the form (filled in by buildSiteSettingsForm)
 */
function siteSettingsMarkup() {
	const eff = getEffectiveSiteConfig();
	const theme = getThemeColors(null, 'hsl');
	return {
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
			${createInputRow({
				label: 'Preset Theme:',
				// Page-unique: the dialog and the settings page section can both be open
				id: uiId('settings-preset'),
				type: 'select',
				classes: 'nc-settings-preset',
				options: `<option value="">-- Select a preset --</option>${Object.keys(PRESET_THEMES).map(name => `<option value="${name.toLowerCase()}">${name}</option>`).join('')}`
			})}
			<hr />
			<div data-settings-engine></div>
		`,
	};
}

/**
 * Open the global settings dialog. Changes apply on Save.
 * Side effects: opens a dialog; Save writes siteConfig and recolors the page.
 */
function createSettingsPanel() {
	const { preview, content } = siteSettingsMarkup();
	let form = null;
	const dialog = createDialog({
		title: 'Nick Color Settings',
		width: '400px',
		onHelp: showHelpDialog,
		preview,
		content,
		buttons: [
			{ label: 'Save', class: 'save', onClick: (close) => {
				form.save();
				// The page section saves its whole form; it must not keep older values
				refreshSettingsSection(SETTINGS_SECTION_KEY);
				close();
			}},
			{ label: 'Reset', class: 'reset', onClick: () => form.reset() },
			{ label: 'Cancel', class: 'cancel', onClick: (close) => close() }
		]
	});
	form = buildSiteSettingsForm(dialog.el, {
		// Reopen, so the form shows what was imported
		onImported: () => {
			dialog.close();
			refreshSettingsSection(SETTINGS_SECTION_KEY);
			createSettingsPanel();
		},
	});
}

/**
 * Fill Nick Colors' section of the site's Settings > AtmoMod tab. The
 * site's own settings save as they change, so this form does too.
 * Side effects: fills body; every change writes siteConfig and recolors the page.
 * @param {HTMLElement} body - the section body from registerSettingsSection
 */
function renderSiteSettingsSection(body) {
	const { preview, content } = siteSettingsMarkup();
	const resetId = uiId('nick-colors-reset');
	body.innerHTML = `
		<div class="hint">Changes save as you make them. Per-user colors: right-click a username and ${COLOR_MENU_HOWTO}.</div>
		<div class="atmo-dialog-preview">${preview}</div>
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
		autoSave: true,
		onImported: () => renderSiteSettingsSection(body),
	});
	const resetButton = body.querySelector('#' + resetId);
	// Above the color settings: it decides whose names they apply to
	const friends = document.createElement('div');
	body.querySelector('[data-settings-engine]').before(friends);
	renderNickFriendsSettings(friends);
	resetButton.addEventListener('click', () => confirmAction({
		title: 'Reset to preset?',
		message: `This puts the nick color settings back to the selected preset, or with none selected to the site theme's. Chooms, per-user colors, notes and the ${SETTINGS_TITLE} section stay.`,
		confirmLabel: 'RESET',
		tone: 'caution',
		onConfirm: () => form.reset(),
	}));
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
 * Wire up the global settings form in root: previews, the preset select,
 * and the settings engine.
 * Side effects: fills root's form; with autoSave, every change writes
 * siteConfig and recolors the page.
 * @param {HTMLElement} root - holds siteSettingsMarkup()'s preview and content
 * @param {{autoSave?: boolean, onImported: Function}} options - onImported:
 *   called after a successful import, to show the imported settings
 * @returns {{engine: Object, save: Function, reset: Function}}
 */
function buildSiteSettingsForm(root, { autoSave = false, onImported }) {
	const eff = getEffectiveSiteConfig();
	const theme = getThemeColors(null, 'hsl');
	const {
		settings: defaultSettings,
		colorVariables: defaultColors
	} = getThemeDefaultSettings();
	// Off until the form is set up: its own initial updates are not changes
	let ready = false;

	const engineContainer = root.querySelector('[data-settings-engine]');
	const presetSelect = root.querySelector('.nc-settings-preset select');
	const previewRow = root.querySelector('[data-settings-preview]');
	const previewRowInverted = root.querySelector('[data-settings-preview-inverted]');

	/**
	 * Store the form's values as siteConfig and recolor the page.
	 */
	function save() {
		siteConfig = engine.getValues();
		saveSiteConfig();
		colorizeAll();
	}

	/**
	 * Reset the form to the selected preset theme (or the site theme if none).
	 */
	function reset() {
		const selectedTheme = presetSelect.value || siteThemeName || '';
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
		presetSelect.value = presetOptionValue(selectedTheme);
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
			if (autoSave && ready) save();
		},
		container: engineContainer
	});

	engine.render();

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
		const previewTheme = presetSelect.value || siteThemeName || '';

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
	presetSelect.addEventListener('change', () => {
		const switchTheme = presetSelect.value;
		const themeSettings = getThemeDefaultSettings(switchTheme);
		if (themeSettings?.settings) {
			const p = themeSettings.settings;
			engine.setValues({
				hueRange: [p.minHue, p.maxHue],
				satRange: [p.minSaturation, p.maxSaturation],
				litRange: [p.minLightness, p.maxLightness],
				...contrastFields(p.contrastThreshold),
			}, true);
			updatePreview();
		}
	});

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

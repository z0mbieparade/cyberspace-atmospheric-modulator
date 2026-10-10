// =====================================================
// SETTINGS PANEL
// =====================================================
// createDialog and createSettingsEngine come from src/shared.

// Where to report problems: the dialogs' footer, and the top of the settings tab
const REPORT_WARNING = userscriptWarning('Report them to <a href="/z0ylent">@z0ylent</a>.');

/**
 * Defaults merged into every createDialog call (see shared ui-dialog.js).
 * @returns {Object}
 */
function dialogDefaults() {
	return {
		warning: REPORT_WARNING,
		attribution: attributionItems(),
	};
}

/**
 * The attribution row's items: the dialogs' footer, and the top of the settings tab.
 * @returns {string[]} HTML
 */
function attributionItems() {
	return [
		...AUTHOR_LINKS,
		repoLinkHtml('https://github.com/z0mbieparade/cyberspace-atmospheric-modulator'),
		versionLinkHtml(),
	];
}

/**
 * The warning box (warningBoxHtml) as an element, for a custom field.
 * @param {string} text - shown as text
 * @returns {Element}
 */
function warningBox(text) {
	const template = document.createElement('template');
	template.innerHTML = warningBoxHtml(escapeHtml(text));
	return template.content.firstElementChild;
}

// This script's section of the site's Settings > AtmoMod tab
const SETTINGS_SECTION_KEY = 'atmospheric-modulator';

// The form, in order. Keys match featureConfig. Debug mode is in Backup &
// Troubleshooting's form (backupSchema, backup.js)
const SETTINGS_SCHEMA = [
	{ type: 'section', label: 'Undither images', fields: [
		{ key: 'unditherImages', type: 'toggle', label: 'Show original image on hover', default: DEFAULT_FEATURE_CONFIG.unditherImages },
		{ key: 'holdDuration', type: 'slider', label: 'Press-and-hold time on touch screens (ms)',
			min: 100, max: 2000, step: 50, default: DEFAULT_FEATURE_CONFIG.holdDuration,
			showWhen: { field: 'unditherImages', is: true }, sub: true },
		{ key: 'unditherWarning', type: 'custom', showWhen: { field: 'unditherImages', is: true }, render: () => {
			if (!unditherCannotWork()) return null;
			return warningBox('Your userscript manager runs scripts apart from the page, so hovering cannot show original images. It works in Tampermonkey and Greasemonkey.');
		} },
	]},
	{ type: 'section', label: 'Nick colors', fields: [
		{ key: 'nickColors', type: 'toggle', label: 'Usernames get their own color', default: DEFAULT_FEATURE_CONFIG.nickColors },
		{ type: 'hint', text: 'Usernames get hashed (same everywhere) colors applied to their nickname.' },
		// The separate script draws its styles into #nc-styles. With both
		// running, each refresh recolors every name with its own settings (see
		// DEFAULT_FEATURE_CONFIG)
		{ type: 'custom', render: () => {
			if (!standaloneNickColorsRunning()) return null;
			return warningBox('The separate Nick Colors userscript is running too. Turn one of them off.');
		} },
		// Only my chooms, from nick colors' scope. After the switch's own hint
		// and warning, so each description stays under its own switch
		{ key: 'nickColorsDetail', type: 'custom', showWhen: { field: 'nickColors', is: true }, render: () => featureSwitchDetail('nickColors') },
	]},
	{ type: 'section', label: 'Nick notes', fields: [
		{ key: 'nickNotes', type: 'toggle', label: 'Keep personal (private) notes on users, shown on hover', default: DEFAULT_FEATURE_CONFIG.nickNotes },
		{ type: 'hint', text: 'Right-click or long-press a name and choose Notes. The CHOOMS section below shows all of your user notes.' },
	]},
	{ type: 'section', label: 'World clock', fields: [
		{ key: 'worldClock', type: 'toggle', label: 'Show city times under cIRC\'s header', default: DEFAULT_FEATURE_CONFIG.worldClock },
		{ type: 'hint', text: 'Show a list of cities and times under the cIRC header in 12- or 24-hour time. See World Clock settings below.' },
	]},
];

/**
 * A field of SETTINGS_SCHEMA, for its limits.
 * @param {string} key
 * @returns {Object|undefined}
 */
function settingsField(key) {
	return SETTINGS_SCHEMA.flatMap(section => section.fields).find(field => field.key === key);
}

/**
 * Store the main section's values as featureConfig.
 * Side effects: updates featureConfig in place (other code holds it),
 * writes it to storage, tells booted features their switch
 * changed (featuresSwitched), boots any feature just turned on, and
 * shows or hides the settings tab's sections that follow a switch.
 * @param {Object} values - from the settings engine's getValues()
 */
function applySettings(values) {
	const previous = { ...featureConfig };
	Object.assign(featureConfig, values);
	saveFeatureConfig();
	// A booted feature hears its switch change; one turned on starts now
	featuresSwitched(previous);
	bootFeatures();
	// Its part of the Users section follows its switch too
	refreshUserList();
	// A feature's section on the settings tab follows its switch now
	syncSettingsPage();
}

/**
 * Render the settings form with the current values.
 * Side effects: fills container.
 * @param {HTMLElement} container
 * @param {Array} schema - SETTINGS_SCHEMA, or Backup & Troubleshooting's (backupSchema)
 * @param {Function} [onChange] - called with (key, value, engine) on every change
 * @returns {Object} the settings engine
 */
function renderSettingsForm(container, schema, onChange) {
	const engine = createSettingsEngine({
		schema,
		values: { ...featureConfig, debugMode: DEBUG },
		container,
		onChange,
	});
	engine.render();
	return engine;
}

/**
 * Open the settings dialog: the settings tab's sections, drawn by the same
 * code, saving each change as it is made, as the tab does. The dialog's
 * footer carries the warning and attribution the tab shows at its top.
 * Side effects: opens a dialog; its sections follow every change, as the
 * tab's do, while it is open; closing it redraws the tab's sections.
 * @param {string} [focusKey] - a section to unfold and move focus to, as
 *   given to registerSettingsSection
 */
function openSettingsPanel(focusKey) {
	const dialog = createDialog({
		title: SETTINGS_TITLE,
		width: '600px',
		// The tab's copies, out of reach behind the dialog meanwhile, show
		// what changed in it
		onClose: refreshSettingsTabSections,
		content: `<div class="${uiClass('settings-dialog-sections')}"></div>`,
		buttons: [
			{ label: 'Close', class: 'cancel', onClick: (close) => close() },
		],
	});
	const host = dialog.querySelector('.' + uiClass('settings-dialog-sections'));
	renderSettingsSections(host);
	if (focusKey) focusSettingsSection(focusKey, host);
}

/**
 * Fill this script's section of the site's Settings > AtmoMod tab. The
 * site's own settings save as they change, so this form does too.
 * Side effects: fills body; every change writes to storage.
 * @param {HTMLElement} body - the section body from registerSettingsSection
 */
function renderSettingsSection(body) {
	// No rule after the last section: the section's box ends there.
	// Resetting everything is in Backup & Troubleshooting (backup.js)
	const engine = renderSettingsForm(body,
		SETTINGS_SCHEMA.map((section, i) => (i === SETTINGS_SCHEMA.length - 1 ? { ...section, noHr: true } : section)),
		() => applySettings(engine.getValues()));
}

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

// The form, in order. Keys match featureConfig. The settings dialog adds
// backupSchema() (backup.js), which holds debugMode
const SETTINGS_SCHEMA = [
	{ type: 'section', label: 'Undither images', fields: [
		{ key: 'unditherImages', type: 'toggle', label: 'Show original image on hover', default: DEFAULT_FEATURE_CONFIG.unditherImages },
		{ key: 'holdDuration', type: 'slider', label: 'Press-and-hold time on touch screens (ms)',
			min: 100, max: 2000, step: 50, default: DEFAULT_FEATURE_CONFIG.holdDuration,
			showWhen: { field: 'unditherImages', is: true } },
		{ key: 'unditherWarning', type: 'custom', showWhen: { field: 'unditherImages', is: true }, render: () => {
			if (!unditherCannotWork()) return null;
			return warningBox('Your userscript manager runs scripts apart from the page, so hovering cannot show original images. It works in Tampermonkey and Greasemonkey.');
		} },
	]},
	{ type: 'section', label: 'Nick colors', fields: [
		{ key: 'nickColors', type: 'toggle', label: 'Give every username its own color', default: DEFAULT_FEATURE_CONFIG.nickColors },
		{ type: 'hint', text: 'Every user gets a hashed (same everywhere) color applied to their nickname. Turning it off hides its settings and its menu item, and takes the colors off every name, at once.' },
		// The separate script draws its styles into #nc-styles. With both
		// running, each refresh recolors every name with its own settings (see
		// DEFAULT_FEATURE_CONFIG)
		{ type: 'custom', render: () => {
			if (!standaloneNickColorsRunning()) return null;
			return warningBox('The separate Nick Colors userscript is running too. Turn one of them off.');
		} },
	]},
	{ type: 'section', label: 'Nick notes', fields: [
		{ key: 'nickNotes', type: 'toggle', label: 'Keep personal notes on users, shown on hover', default: DEFAULT_FEATURE_CONFIG.nickNotes },
		{ type: 'hint', text: 'Right-click or long-press a name and choose Notes. Turning it off hides Notes from the menu at once; notes on hover stay until the page reloads.' },
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
 * Store the form's values: featureConfig, and debugMode when the form has it.
 * Side effects: updates featureConfig in place (other code holds it) and
 * DEBUG, writes them to storage, tells booted features their switch
 * changed (featuresSwitched), boots any feature just turned on, and
 * shows or hides the settings tab's sections that follow a switch.
 * @param {Object} values - from the settings engine's getValues()
 */
function applySettings(values) {
	const { debugMode, ...features } = values;
	const previous = { ...featureConfig };
	Object.assign(featureConfig, features);
	saveFeatureConfig();
	// The settings tab's main section has no debugMode: it is in Backup & Troubleshooting
	if (debugMode !== undefined) {
		DEBUG = debugMode;
		saveDebugMode();
	}
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
 * @param {Array} schema - SETTINGS_SCHEMA, or it plus page-only fields
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
 * Open the settings dialog. Changes apply on Save.
 * Side effects: opens a dialog; Save writes featureConfig and debugMode to storage.
 */
function openSettingsPanel() {
	let engine = null;
	// Reopen, so the form shows the settings after an import or an erase
	const reopen = () => {
		dialog.close();
		openSettingsPanel();
	};
	const dialog = createDialog({
		title: SETTINGS_TITLE,
		content: `<div class="${uiClass('settings-engine')}"></div>`,
		buttons: [
			{ label: 'Save', class: 'save', onClick: (close) => {
				applySettings(engine.getValues());
				// The page section saves its whole form; it must not keep older values
				refreshSettingsSection(SETTINGS_SECTION_KEY);
				close();
			} },
			{ label: 'Reset', class: 'reset', onClick: () => engine.reset() },
			{ label: 'Cancel', class: 'cancel', onClick: (close) => close() },
		],
	});
	engine = renderSettingsForm(dialog.querySelector('.' + uiClass('settings-engine')), [
		...SETTINGS_SCHEMA,
		...backupSchema({ onImported: reopen, onErased: reopen }),
	]);
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

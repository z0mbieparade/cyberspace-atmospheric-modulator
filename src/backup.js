// =====================================================
// BACKUP & TROUBLESHOOTING
// =====================================================
// For the whole script: its settings file, debug mode, the debug log and
// issue reports. Each feature adds its part through the hooks on
// registerFeature (features.js), so no feature's code is called by name here.
// The text for the user still names them, where that tells the user where to go.

// Marks this script's settings file. A file from anything else, the separate
// Nick Colors included, is turned away before anything is written
const BACKUP_APP = 'cyberspace-atmospheric-modulator';
const BACKUP_VERSION = 1;

// This script's last section of the site's Settings > AtmoMod tab
const BACKUP_SECTION_KEY = 'atmospheric-modulator-backup';

/**
 * Every setting in the script, as the settings file holds them. Debug mode is
 * left out: it is for one session's troubleshooting, not a preference.
 * @returns {{app: string, version: number, exportedAt: string, featureConfig: Object, features: Object}}
 *   features: each feature's exportBackup(), by its key
 */
function exportBackup() {
	const features = {};
	for (const feature of FEATURES) {
		if (!feature.exportBackup) continue;
		try {
			features[feature.key] = feature.exportBackup();
		} catch (e) {
			// The rest of the settings are still worth saving
			console.error(LOG_PREFIX + ` Could not export ${feature.key}:`, e);
		}
	}
	return {
		app: BACKUP_APP,
		version: BACKUP_VERSION,
		exportedAt: new Date().toISOString(),
		featureConfig: { ...featureConfig },
		features,
	};
}

/**
 * Store a settings file's contents. A part that fails does not stop the
 * rest, so a failed import may still have changed settings.
 * Side effects: each feature stores its own part; updates featureConfig and
 * saves it, boots any feature the file turns on, and re-renders this
 * script's section of the settings tab.
 * @param {*} data - parsed from a settings file, as exportBackup() wrote it
 * @returns {{success: boolean, changed: boolean, message: string}} changed:
 *   whether anything was written; message: for the user
 */
function importBackup(data) {
	if (!data || typeof data !== 'object' || data.app !== BACKUP_APP) {
		return { success: false, changed: false, message: 'This is not an Atmospheric Modulator settings file. For settings from the separate Nick Colors userscript, turn nick colors on, then use Import from Nick Colors in its section.' };
	}
	if (data.version > BACKUP_VERSION) {
		return { success: false, changed: false, message: 'This settings file is from a newer Atmospheric Modulator. Update the script, then load it again.' };
	}

	// Features first, so one the file turns on boots with its imported settings
	const failures = [];
	// What a feature wants the user told about an import that worked, such as
	// styles it left out as unsafe
	const notices = [];
	for (const feature of FEATURES) {
		const part = data.features?.[feature.key];
		if (!feature.importBackup || part === undefined) continue;
		try {
			const result = feature.importBackup(part, feature.booted);
			if (!result.success) failures.push(`${feature.key}: ${result.message}`);
			else if (result.notice) notices.push(result.notice);
		} catch (e) {
			failures.push(`${feature.key}: ${e.message}`);
		}
	}

	// Only the switches this version has, of the type and range its form
	// takes: a file from another version must not store what the form cannot show
	const config = data.featureConfig && typeof data.featureConfig === 'object' ? data.featureConfig : {};
	for (const [key, value] of Object.entries(DEFAULT_FEATURE_CONFIG)) {
		if (typeof config[key] !== typeof value) continue;
		const field = settingsField(key);
		featureConfig[key] = typeof value === 'number' && field?.min !== undefined
			? Math.min(field.max, Math.max(field.min, config[key]))
			: config[key];
	}
	saveFeatureConfig();
	// Every feature re-reads storage: one may hold what another's part stored,
	// as nick notes does for notes in an older file's nick colors part. Then a
	// feature turned on starts now; one turned off stops on reload
	featuresStorageReady();
	refreshSettingsSection(SETTINGS_SECTION_KEY);

	if (failures.length) {
		return { success: false, changed: true, message: ['Some settings were not imported.', ...failures, ...notices].join(' ') };
	}
	return { success: true, changed: true, message: ['Settings imported.', ...notices].join(' ') };
}

/**
 * Read a settings file's text.
 * @param {string} text
 * @returns {*} the parsed data, for importBackup
 * @throws {Error} when the text is not JSON
 */
function parseBackupText(text) {
	try {
		return JSON.parse(text);
	} catch (err) {
		throw new Error(`This is not a settings file: ${err.message}`);
	}
}

/**
 * The debug log: the script's state, then each feature's part.
 * @returns {string} plain text, for a file or the clipboard
 */
function exportDebugLog() {
	const rule = '='.repeat(60);
	const subRule = '-'.repeat(60);
	const lines = [
		rule, `${SCRIPT_NAME.toUpperCase()} DEBUG LOG`, rule, '',
		`Exported: ${new Date().toISOString()}`,
		`Version: ${VERSION}`,
		`Debug Mode: ${DEBUG}`,
		`URL: ${window.location.href}`,
		`User Agent: ${navigator.userAgent}`,
		'',
		subRule, 'FEATURE CONFIG', subRule,
		JSON.stringify(featureConfig, null, 2),
		'',
	];
	for (const feature of FEATURES) {
		if (!feature.debugLog) continue;
		lines.push(rule, `${feature.key} (${feature.booted ? 'running' : 'not running'})`, rule, '');
		try {
			lines.push(feature.debugLog());
		} catch (e) {
			// The rest of the log is still worth sending
			lines.push(`Could not read: ${e.message}`, '');
		}
	}
	lines.push(rule, 'END OF DEBUG LOG', rule);
	return lines.join('\n');
}

/**
 * The script's state in one short line, for an issue report message.
 * @returns {string}
 */
function reportSummary() {
	const parts = [`v${VERSION}`, `Features: ${JSON.stringify(featureConfig)}`];
	for (const feature of FEATURES) {
		if (!feature.reportSummary) continue;
		try {
			parts.push(`${feature.key}: ${feature.reportSummary()}`);
		} catch (e) {
			parts.push(`${feature.key}: could not read (${e.message})`);
		}
	}
	return parts.join(' | ');
}

/**
 * Ask what went wrong, then send it with reportSummary() as a message to @z0ylent.
 * Side effects: opens a dialog; Send sends a C-Mail as the user, or, when
 * the API cannot, navigates to the C-Mail compose box with it filled in.
 */
function showReportIssueDialog() {
	// Shown before sending: it goes out as the user, with no compose box to check it in
	const context = `Debug: ${reportSummary()} | Page: ${window.location.href}`;
	const issueId = uiId('report-issue');
	const stepsId = uiId('report-steps');
	const errorsId = uiId('report-errors');
	const dialog = createDialog({
		title: 'Report Issue',
		width: '400px',
		onHelp: null,
		warning: '',
		attribution: [],
		content: `
			<div class="hint">Describe the problem and how to make it happen. The script's version and settings are sent with it.</div>
			${createInputRow({ type: 'textarea', id: issueId, label: 'What went wrong? (required)' })}
			${createInputRow({ type: 'textarea', id: stepsId, label: 'Steps to make it happen (required)', placeholder: '1. Go to...\n2. Click on...\n3. See error...' })}
			${createInputRow({ type: 'text', id: errorsId, label: 'Error messages from the browser console (optional)' })}
			<details>
				<summary class="hint">Also sent</summary>
				<pre class="hint" style="white-space: pre-wrap; word-break: break-all;">${escapeHtml(context)}</pre>
			</details>
			<div class="hint" role="status" aria-live="polite"></div>
		`,
		buttons: [
			{ label: 'SEND REPORT', class: 'save', onClick: (close) => submit(close) },
			{ label: 'CANCEL', class: 'cancel', onClick: (close) => close() },
		],
	});

	const issueInput = dialog.querySelector('#' + issueId);
	const stepsInput = dialog.querySelector('#' + stepsId);
	const errorsInput = dialog.querySelector('#' + errorsId);
	const status = dialog.querySelector('[role="status"]');
	let sending = false;

	/**
	 * Check the required fields, then send the report.
	 * Side effects: on a missing field, alerts and focuses it; else sends the
	 * message (sendMessageToUser), shows that it is sending, then closes the
	 * dialog and says how it went.
	 * @param {Function} close - closes the dialog
	 * @returns {Promise<void>}
	 */
	async function submit(close) {
		// A second click while the first is in flight would send it twice
		if (sending) return;
		const issue = issueInput.value.trim();
		const steps = stepsInput.value.trim();
		const errors = errorsInput.value.trim();
		if (!issue) {
			alert('Describe what went wrong.');
			issueInput.focus();
			return;
		}
		if (!steps) {
			alert('List the steps that make it happen.');
			stepsInput.focus();
			return;
		}

		let message = `[${SCRIPT_NAME} Issue Report] | Issue: ${issue} | Steps: ${steps}`;
		if (errors) message += ` | Errors: ${errors}`;
		message += ` | ${context}`;
		// Open until it settles: the report is still here if the send fails
		sending = true;
		status.textContent = 'Sending…';
		const result = await sendMessageToUser('z0ylent', message);
		close();
		reportMessageResult(result, 'z0ylent', 'Report sent to @z0ylent. Thank you!');
	}

	issueInput.focus();
}

/**
 * Import settings, and tell the user how it went.
 * Side effects: as importBackup; alerts; calls onImported when anything was
 * written, even by a partial import: a form showing the older values would
 * write them back on its next save.
 * @param {*} data - parsed settings file
 * @param {Function} onImported - shows the imported settings
 */
function finishImport(data, onImported) {
	const result = importBackup(data);
	alert(result.message);
	if (result.changed) onImported();
}

/**
 * A pickTextFile or showPasteDialog callback that imports the settings file.
 * @param {Function} onImported - as finishImport's
 * @returns {function(*, Error|null): void}
 */
function importFrom(onImported) {
	return (data, err) => {
		if (err) {
			alert(err.message);
			return;
		}
		finishImport(data, onImported);
	};
}

/**
 * Ask before erasing everything, then erase it.
 * Side effects: opens a dialog; confirming does what eraseAllSettings does,
 * alerts how it went, then calls onErased.
 * @param {Function} onErased - shows the settings as they are after the erase
 */
function confirmEraseAllSettings(onErased) {
	confirmAction({
		title: 'Erase all settings?',
		message: 'This erases every setting, every per-name style and every note, and cannot be undone. To keep a copy, choose Save Settings File first.',
		confirmLabel: 'ERASE EVERYTHING',
		tone: 'danger',
		onConfirm: () => {
			const result = eraseAllSettings();
			alert(result.message);
			onErased();
		},
	});
}

/**
 * Put the whole script back as it was installed: every feature's settings
 * and data, the feature switches, and debug mode off.
 * Side effects: each feature resets its own storage; saves the default
 * featureConfig and debug mode; re-reads storage and boots any feature now
 * on; re-renders this script's sections of the settings tab.
 * @returns {{success: boolean, message: string}} message: for the user
 */
function eraseAllSettings() {
	const failures = [];
	for (const feature of FEATURES) {
		if (!feature.resetSettings) continue;
		try {
			feature.resetSettings(feature.booted);
		} catch (e) {
			// The rest still goes back to its defaults
			console.error(LOG_PREFIX + ` Could not reset ${feature.key}:`, e);
			failures.push(`${feature.key}: ${e.message}`);
		}
	}
	for (const key of Object.keys(featureConfig)) delete featureConfig[key];
	Object.assign(featureConfig, DEFAULT_FEATURE_CONFIG);
	saveFeatureConfig();
	DEBUG = false;
	saveDebugMode();
	featuresStorageReady();
	refreshSettingsSection(SETTINGS_SECTION_KEY);
	refreshSettingsSection(BACKUP_SECTION_KEY);
	if (failures.length) {
		return { success: false, message: `Some settings could not be erased; they may come back on reload. ${failures.join(' ')}` };
	}
	return { success: true, message: 'All settings erased.' };
}

/**
 * The backup and troubleshooting fields, for the settings dialog and the
 * settings tab's section.
 * @param {{onImported: Function, onErased: Function}} after - each shows the
 *   settings after an import or an erase
 * @returns {Array} settings engine schema
 */
function backupSchema({ onImported, onErased }) {
	const today = () => new Date().toISOString().slice(0, 10);
	return [
		{ type: 'section', label: 'Backup', fields: [
			{ type: 'hint', text: 'Every setting in this script, per-user nick colors included. Debug mode is not saved.' },
			{ type: 'button', id: 'backup-save-file', label: 'Save all settings to a file', buttonText: 'Save Settings File',
				onClick: () => downloadText(JSON.stringify(exportBackup(), null, 2), `atmospheric-modulator-settings-${today()}.json`, 'application/json') },
			{ type: 'button', id: 'backup-copy', label: 'Copy all settings to the clipboard', buttonText: 'Copy to Clipboard',
				onClick: () => copyText(JSON.stringify(exportBackup()), 'Settings copied to the clipboard.') },
			{ type: 'button', id: 'backup-load-file', label: 'Load settings from a file', buttonText: 'Load Settings File',
				onClick: () => pickTextFile(importFrom(onImported), { parse: parseBackupText }) },
			{ type: 'button', id: 'backup-paste', label: 'Load settings from the clipboard', buttonText: 'Paste from Clipboard',
				onClick: () => showPasteDialog(importFrom(onImported), { parse: parseBackupText }) },
		]},
		{ type: 'section', label: 'Troubleshooting', fields: [
			{ key: 'debugMode', type: 'toggle', label: 'Debug mode: log details to the console, and show nick colors\' calculations', default: false },
			{ type: 'button', id: 'debug-save-file', label: 'Save the debug log to a file', buttonText: 'Save Debug File',
				onClick: () => downloadText(exportDebugLog(), `atmospheric-modulator-debug-${today()}.txt`) },
			{ type: 'button', id: 'debug-copy', label: 'Copy the debug log to the clipboard', buttonText: 'Copy Debug Log',
				onClick: () => copyText(exportDebugLog(), 'Debug log copied to the clipboard.') },
			{ type: 'button', id: 'report-issue', label: 'Send a problem report to @z0ylent', buttonText: 'Report Issue',
				onClick: () => showReportIssueDialog() },
		]},
		{ type: 'section', label: 'Reset', noHr: true, fields: [
			{ type: 'button', id: 'erase-all', danger: true, label: 'Erase every setting, per-name style and note',
				buttonText: 'Erase All Settings', onClick: () => confirmEraseAllSettings(onErased) },
		]},
	];
}

/**
 * Fill the settings tab's Backup & Troubleshooting section. Debug mode saves
 * as it changes, like the site's own settings.
 * Side effects: fills body; a debug mode change writes it to storage.
 * @param {HTMLElement} body - the section body from registerSettingsSection
 */
function renderBackupSection(body) {
	renderSettingsForm(body, backupSchema({
		// The sections that show imported values re-render themselves; this
		// one shows none, so focus stays on the button that was used
		onImported: () => {},
		// The erase re-renders this section too (eraseAllSettings), taking the
		// focused button with it: focus goes to the section's heading instead
		onErased: () => focusSettingsSection(BACKUP_SECTION_KEY),
	}), (key, value) => {
		if (key !== 'debugMode') return;
		DEBUG = value;
		saveDebugMode();
	});
}

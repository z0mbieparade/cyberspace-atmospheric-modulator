

/**
	* Creates a debug pre element (hidden when DEBUG is false, but still in DOM for export)
	* @param {Object|string} data - Object with label/value pairs, or plain string for unlabeled content
	* @param {string} [classes] - Additional CSS classes
	* @returns {string} HTML string
	*/
function createDebugPre(data, classes = '') {
	const hiddenStyle = DEBUG ? '' : ' style="display: none;"';
	const classStr = `nc-dialog-debug${classes ? ' ' + classes : ''}`;
	if (typeof data === 'string') {
		return `<div class="${classStr}"${hiddenStyle}>${data}</div>`;
	}
	logDebug(NICK_LOG_PREFIX, data);
	const lines = Object.entries(data)
		.map(([label, value]) => {
			if(typeof value === 'object' && (value.txt !== undefined || value.elem !== undefined))
				return `<span><strong>${label}:</strong><span>${value.txt ?? ' N/A'}${value.elem ? ' ' + value.elem : ''}</span></span>`;
			else if(typeof value === 'string')
				return `<span><strong>${label}:</strong><span>${value ?? 'N/A'}</span></span>`;
		})
		.filter(line => line && line.trim() !== '')
		.join('\n').trim();
	return `<div class="${classStr}"${hiddenStyle}>\n${lines}\n</div>`;
}

/**
	* Gets or creates a debug pre element under a parent (for dynamic updates)
	* @param {HTMLElement} parent - Parent element to append to
	* @param {string} [classes] - Additional CSS classes
	* @returns {HTMLElement} The debug element (hidden if DEBUG is false)
	*/
function getOrCreateDebugPre(parent, classes = '') {
	let debug = parent.querySelector('.nc-dynamic-debug');
	if (!debug) {
		debug = document.createElement('div');
		debug.className = `nc-dynamic-debug nc-dialog-debug${classes ? ' ' + classes : ''}`;
		parent.appendChild(debug);
	}
	debug.style.display = DEBUG ? '' : 'none';
	return debug;
}

/**
 * Nick colors' part of the script's debug log: the theme, the settings in
 * effect, the custom colors, the friends list and its switch, the overrides,
 * and any debug readouts on the page.
 * @returns {string} plain text, for the debug log file
 */
function nickDebugLog() {
	const lines = [];
	const block = (title, body) => {
		lines.push('-'.repeat(60), title, '-'.repeat(60), body, '');
	};

	block('THEME INFO', [
		`Site Theme Name: ${siteThemeName || 'none'}`,
		`Site Theme Object: ${siteTheme ? JSON.stringify(siteTheme) : 'none'}`,
		`Site Custom Theme: ${siteCustomTheme ? JSON.stringify(siteCustomTheme) : 'none'}`,
	].join('\n'));
	block('THEME COLORS (resolved)', JSON.stringify(getThemeColors(null, 'hsl'), null, 2));
	block('EFFECTIVE CONFIG (after site theme integration)', JSON.stringify(getEffectiveSiteConfig(), null, 2));
	block('SAVED SITE CONFIG', JSON.stringify(siteConfig, null, 2));
	block(`CUSTOM NICK COLORS (${Object.keys(customNickColors).length} total)`, JSON.stringify(customNickColors, null, 2));
	block(`FRIENDS (${nickFriends.enabled ? 'only friends colored' : 'everyone colored'})`, nickFriends.users.join(', ') || 'none');
	block(`MANUAL OVERRIDES (${Object.keys(MANUAL_OVERRIDES).length} total)`, JSON.stringify(MANUAL_OVERRIDES, null, 2));

	// Shown only in debug mode, but always on the page
	const debugPres = document.querySelectorAll('.nc-dialog-debug, .nc-dynamic-debug');
	if (debugPres.length > 0) {
		block(`DEBUG ELEMENTS (${debugPres.length} found)`,
			Array.from(debugPres, (pre, i) => `[${i + 1}] ${pre.textContent.trim()}`).join('\n'));
	}

	return lines.join('\n');
}

/**
 * Nick colors' part of an issue report: short, as it goes in a message.
 * @returns {string} e.g. '3 custom | friends only (2) | H:0-360 S:70-100 L:55-75 | Settings: {...}'
 */
function nickReportSummary() {
	const eff = getEffectiveSiteConfig();
	const friends = nickFriends.enabled ? ` | friends only (${nickFriends.users.length})` : '';
	return `${Object.keys(customNickColors).length} custom${friends} | H:${eff.minHue}-${eff.maxHue} S:${eff.minSaturation}-${eff.maxSaturation} L:${eff.minLightness}-${eff.maxLightness}`
		+ ` | Settings: ${JSON.stringify(minifyKeys({ siteConfig }))}`;
}

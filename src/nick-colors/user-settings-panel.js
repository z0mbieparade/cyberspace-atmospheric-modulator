// =====================================================
// USER SETTINGS PANEL
// =====================================================

function createUserSettingsPanel(username, currentStyles)
{
	// Check if color range is restricted
	const eff = getEffectiveSiteConfig();
	
	// Filter out color, icon, and style variation properties from CSS string
	const styleVariationKeys = ['color', 'icon', 'fontWeight', 'fontStyle', 'fontVariant', 'fontFamily', 'invert', 'userNotes'];
	const filteredStyles = Object.fromEntries(
		Object.entries(makeStylesObject(currentStyles)).filter(([key]) => !styleVariationKeys.includes(key))
	);
	const currentCssString = stylesToCssString(filteredStyles, ';\n');

	// Get current custom icon state
	const savedData = customNickColors[username] || {};
	const savedPrependIcon = savedData.prependIcon ?? '';
	const savedAppendIcon = savedData.appendIcon ?? '';
	// Determine icon states: null = auto (use global), false = disabled, true = custom
	const hasPrependIconProperty = 'prependIcon' in savedData;
	const hasAppendIconProperty = 'appendIcon' in savedData;
	const initialPrependIconState = !hasPrependIconProperty ? null : (savedPrependIcon ? true : false);
	const initialAppendIconState = !hasAppendIconProperty ? null : (savedAppendIcon ? true : false);

	// Calculate hash-based defaults for display
	const hashIcon = getHashBasedIcon(username, { effectiveConfig: eff }) || '';
	const hashStyles = getHashBasedStyleVariations(username);
	const hashWeight = hashStyles.fontWeight;
	const hashItalic = hashStyles.fontStyle;
	const hashCase = hashStyles.fontVariant;

	// Get current per-user style overrides (null means use global/hash)
	// Merge MANUAL_OVERRIDES as base, then customNickColors on top
	const remoteStyles = MANUAL_OVERRIDES[username] || {};
	const localStyles = customNickColors[username] || {};
	const savedStyles = { ...(typeof remoteStyles === 'object' ? remoteStyles : {}), ...localStyles };
	const currentWeight = savedStyles.fontWeight;
	const currentItalic = savedStyles.fontStyle;
	const currentCase = savedStyles.fontVariant;
	const currentInvert = savedStyles.invert; // true, false, or undefined (auto)
	const currentFontFamily = savedStyles.fontFamily || '';

	// Determine fontFamily tri-state: null = auto, false = disabled, true = custom
	// Check if LOCAL settings have fontFamily (not merged result)
	const hasLocalFontFamily = 'fontFamily' in localStyles;
	const localFontFamilyValue = localStyles.fontFamily;
	const remoteFontFamily = (typeof remoteStyles === 'object' ? remoteStyles.fontFamily : null) || '';
	const initialFontFamilyState = !hasLocalFontFamily ? null : (localFontFamilyValue ? true : false);

	// Check if user has remote overrides
	const hasRemoteOverride = MANUAL_OVERRIDES[username];
	let remoteOverrideText = '';
	if (hasRemoteOverride) {
		const override = MANUAL_OVERRIDES[username];
		if (typeof override === 'string') {
			remoteOverrideText = `color: ${override}`;
		} else {
			remoteOverrideText = stylesToCssString(override);
		}
	}

	const isHueRestricted = eff.minHue !== 0 || eff.maxHue !== 360;
	const isSatRestricted = eff.minSaturation !== 0 || eff.maxSaturation !== 100;
	const isLitRestricted = eff.minLightness !== 0 || eff.maxLightness !== 100;
	const isRestricted = isHueRestricted || isSatRestricted || isLitRestricted;

	// Determine source of color data for debug display
	const baseColor = getNickBase(username, 'hsl', {
		effectiveConfig: eff
	});
	const mappedColor = applyRangeMappingToColor(baseColor, 'hsl', {
		effectiveConfig: eff
	});
	let colorSource = 'hash-generated';
	let colorSourceData = '';
	if (customNickColors[username]) {
		colorSource = 'customNickColors (local save)';
		colorSourceData = escapeHtml(JSON.stringify(customNickColors[username]));
	} else if (MANUAL_OVERRIDES[username]) {
		colorSource = 'MANUAL_OVERRIDES (remote)';
		colorSourceData = escapeHtml(JSON.stringify(MANUAL_OVERRIDES[username]));
	}

	// Get hash values for debug
	const hash = hashString(username);
	const hash2 = hashString(username + '_sat');
	const hash3 = hashString(username + '_lit');
	const hash4 = hashString(username + '_style');

	// Build icon picker HTML helper
	const buildIconPicker = (targetId) => {
		if (!siteConfig.iconSet) return '';
		// Buttons, so the set is reachable by keyboard; the group names which
		// field they fill
		const groupName = targetId === 'settings-prependIcon' ? 'Icons before nickname' : 'Icons after nickname';
		return `<div class="picker-icon-options" data-target="${targetId}" role="group" aria-label="${groupName}" style="display: flex; flex-wrap: wrap; gap: 0.25em; margin-bottom: 0.5rem;">${siteConfig.iconSet.split(/\s+/).filter(Boolean).map(icon => `<button type="button" class="nc-icon-option" style="flex: 0 0 auto; cursor: pointer; padding: 0.2em 0.4em; background: none; color: inherit; font: inherit; border: 1px solid var(--atmo-border); border-radius: var(--radius-md); transition: background 0.15s, border-color 0.15s;" title="Click to select">${escapeHtml(icon)}</button>`).join('')}</div>`;
	};

	const dialog = createDialog({
		title: `Nick: ${escapeHtml(username)}`,
		width: '350px',
		onHelp: showHelpDialog,
		onSettings: () => openSettingsSection(SETTINGS_SECTION_KEY),
		preview: `<div class="preview">&lt;<span id="picker-preview">${escapeHtml(username)}</span>&gt; Example chat message in cIRC<br />Inline mention <span id="picker-preview-mention">@${escapeHtml(username)}</span> example</div>
			<div class="preview preview-inverted" id="picker-preview-inverted">&lt;<span id="picker-preview-inverted-nick">${escapeHtml(username)}</span>&gt; Inverted container preview</div>`,
		content: `
			${createDebugPre({
				'Color Source': colorSource,
				'Saved Data': colorSourceData,
				'Hash Values': `h:${hash} s:${hash2} l:${hash3} style:${hash4}`,
				'Base Color (raw)': {
					txt: `H:${baseColor.h.toFixed(1)} S:${baseColor.s.toFixed(1)} L:${baseColor.l.toFixed(1)}`,
					elem: `<span class="nc-debug-color" style="background-color: hsl(${baseColor.h}, ${baseColor.s}%, ${baseColor.l}%)">BASE</span>`
				},
				'Mapped Color': {
					txt: `H:${mappedColor.h.toFixed(1)} S:${mappedColor.s.toFixed(1)} L:${mappedColor.l.toFixed(1)}`,
					elem: `<span class="nc-debug-color" style="background-color: hsl(${mappedColor.h}, ${mappedColor.s}%, ${mappedColor.l}%)">MAPPED</span>`
				},
				'Effective Config': {
					txt: `H:${eff.minHue}-${eff.maxHue} S:${eff.minSaturation}-${eff.maxSaturation} L:${eff.minLightness}-${eff.maxLightness}`,
					elem: `<span class="nc-debug-color" style="background-color: hsl(${eff.minHue}, ${eff.minSaturation}%, ${eff.minLightness}%)">MIN</span>-<span class="nc-debug-color" style="background-color: hsl(${eff.maxHue}, ${eff.maxSaturation}%, ${eff.maxLightness}%)">MAX</span>`
				},
				'Style Variations': `weight:${hashWeight} italic:${hashItalic} case:${hashCase}`
			})}
			${hasRemoteOverride ? `<div class="hint">Site-wide override: <code style="background: var(--atmo-code-bg); padding: 0.1em 0.3em;">${escapeHtml(remoteOverrideText)}</code><br>Your changes will override this locally.</div>` : ''}
			${eff.useSingleColor ? `
			<div class="atmo-dialog-info" style="padding: 0.5rem;">
				Per-user color customization is disabled. Monochrome mode is enabled.<br>
				<button class="link-brackets" id="picker-open-settings" style="margin-top: 0.5rem;"><span class="inner">Change in Settings</span></button>
			</div>
			` : `
			<h4>Nick Color</h4>
			<div id="picker-sliders"></div>
			${createInputRow({
				label: 'Custom color value:',
				id: 'picker-custom',
				placeholder: '#ff6b6b or hsl(280, 90%, 65%)',
				classes: 'no-padding-bottom'
			})}
			${isRestricted ? `<div class="hint">Color range is restricted. Preview shows mapped result. Click SETTINGS to adjust.</div>` : ''}
			`}
			<div id="picker-engine-container"></div>
		`,
		buttons: [
			{ label: 'Save', class: 'save', onClick: (close) => {
				// Typed here, so free CSS, but nothing that escapes the name (sanitize.js)
				customNickColors[username] = sanitizeNickStyle(buildCurrentStyles(), 'typed') ?? {};
				saveCustomNickColors();
				colorizeAll();
				close();
			}},
			{ label: 'Reset', class: 'reset', onClick: (close) => {
				delete customNickColors[username];
				saveCustomNickColors();
				colorizeAll();
				close();
			}},
			{ label: 'Cancel', class: 'cancel', onClick: (close) => close() }
		]
	});

	const preview = dialog.querySelector('#picker-preview');
	const previewMention = dialog.querySelector('#picker-preview-mention');
	const previewInverted = dialog.querySelector('#picker-preview-inverted-nick');
	const customInput = dialog.querySelector('#picker-custom');
	const slidersContainer = dialog.querySelector('#picker-sliders');
	const engineContainer = dialog.querySelector('#picker-engine-container');

	let requestingOverride = false;

	// Build the schema for engine-managed fields
	const userSettingsSchema = [
		{ type: 'hr' },
		{ type: 'section', label: 'Custom Icons', hint: 'Prepend/Append a custom character or emoji to the nickname.', fields: [
			{ key: 'prependIconEnabled', type: 'tristate', label: 'Prepend icon', default: initialPrependIconState, defaultLabel: hashIcon },
			{ key: 'prependIconPicker', type: 'custom', showWhen: { field: 'prependIconEnabled', is: true }, render: () => {
				const div = document.createElement('div');
				div.innerHTML = buildIconPicker('settings-prependIcon');
				return div;
			}},
			{ key: 'prependIcon', type: 'text', label: '', ariaLabel: 'Custom icon before nickname', default: savedPrependIcon, placeholder: 'custom icon before nickname', showWhen: { field: 'prependIconEnabled', is: true } },
			{ key: 'appendIconEnabled', type: 'tristate', label: 'Append icon', default: initialAppendIconState, defaultLabel: hashIcon },
			{ key: 'appendIconPicker', type: 'custom', showWhen: { field: 'appendIconEnabled', is: true }, render: () => {
				const div = document.createElement('div');
				div.innerHTML = buildIconPicker('settings-appendIcon');
				return div;
			}},
			{ key: 'appendIcon', type: 'text', label: '', ariaLabel: 'Custom icon after nickname', default: savedAppendIcon, placeholder: 'custom icon after nickname', showWhen: { field: 'appendIconEnabled', is: true } },
		]},
		{ type: 'section', label: 'Style Variations', hint: 'Override the global style settings for this user to add some visual flair.', fields: [
			{ key: 'fontWeight', type: 'tristate', label: 'Bold', default: currentWeight === 'bold' ? true : currentWeight === 'normal' ? false : null, defaultLabel: hashWeight },
			{ key: 'fontStyle', type: 'tristate', label: 'Italic', default: currentItalic === 'italic' ? true : currentItalic === 'normal' ? false : null, defaultLabel: hashItalic },
			{ key: 'fontVariant', type: 'tristate', label: 'Small Caps', default: currentCase === 'small-caps' ? true : currentCase === 'normal' ? false : null, defaultLabel: hashCase },
			{ key: 'invert', type: 'tristate', label: 'Invert', default: currentInvert === true ? true : currentInvert === false ? false : null, defaultLabel: 'auto' },
			{ key: 'customFontFamily', type: 'tristate', label: 'Custom Font', default: initialFontFamilyState, defaultLabel: remoteFontFamily || 'site default' },
			{ key: 'fontFamily', type: 'text', label: '', ariaLabel: 'Custom font family', default: currentFontFamily, placeholder: 'Comic Sans MS, cursive', showWhen: { field: 'customFontFamily', is: true } },
		]},
		{ type: 'section', label: 'Additional CSS', fields: [
			{ key: 'customCss', type: 'textarea', label: '', default: currentCssString, placeholder: 'background-color: #1a1a2e;\ntext-decoration: underline;', hint: 'CSS properties, one per line' },
		]},
		{ type: 'section', label: 'Backup', fields: [
			{ key: 'exportFile', type: 'button', label: 'Export user settings to file', buttonText: 'Save Settings File', onClick: () => {
				const exportData = { [username]: buildCurrentStyles() };
				const timestamp = new Date().toISOString().slice(0, 10);
				saveToFile(exportData, `nick-colors-${username}-${timestamp}.json`);
			}},
			{ key: 'exportCopy', type: 'button', label: 'Export user settings to clipboard', buttonText: 'Copy to Clipboard', onClick: async () => {
				const exportData = { [username]: buildCurrentStyles() };
				await copyText(JSON.stringify(minifyKeys(exportData)), 'Copied to clipboard!');
			}},
			{ key: 'importFile', type: 'button', label: 'Import user settings from file', buttonText: 'Load Settings File',
				onClick: () => pickTextFile(importUserSettings('file'), { parse: parseSettingsText }) },
			{ key: 'importPaste', type: 'button', label: 'Import user settings from clipboard', buttonText: 'Paste from Clipboard',
				onClick: () => showPasteDialog(importUserSettings('clipboard'), { parse: parseSettingsText }) },
		]},
		{ type: 'section', label: 'Request Override', noHr: true, hint: 'Ask for this style to be the default everyone sees for this name. Anyone who set their own style for it keeps theirs. If C-Mail opens instead with no message filled in, choose Copy to Clipboard in Backup above and send the text to <a href="/z0ylent">@z0ylent</a>.', fields: [
			{ key: 'requestOverride', type: 'button', label: 'Send this style as a request', buttonText: 'Request Override', onClick: async () => {
				// A second click while the first is in flight would send it twice
				if (requestingOverride) return;
				requestingOverride = true;
				// Shows it is in flight: a slow send otherwise looks like nothing happened
				const button = dialog.querySelector('[data-field-key="requestOverride"] button');
				button.textContent = 'Sending…';
				const exportData = { [username]: buildCurrentStyles() };
				const message = `Hi! I'd like to request a site-wide nick color override: ${JSON.stringify(minifyKeys(exportData))}`;
				try {
					reportMessageResult(await sendMessageToUser('z0ylent', message), 'z0ylent', 'Request sent to @z0ylent.');
				} finally {
					requestingOverride = false;
					button.textContent = 'Request Override';
				}
			}},
		]},
	];

	// Create the settings engine
	const engine = createSettingsEngine({
		schema: userSettingsSchema,
		values: {},
		onChange: () => updatePreview(),
		container: engineContainer
	});
	engine.render();

	

	// Create sliders with restricted range info and live value display in labels
	// Only create sliders when NOT in monochrome mode
	let hueSlider = null, satSlider = null, litSlider = null;
	if (slidersContainer && !eff.useSingleColor) {
		const hueLabel = isHueRestricted
			? `Hue <span class="nc-slider-values"></span> <span>→ mapped to ${eff.minHue}-${eff.maxHue}</span>`
			: `Hue <span class="nc-slider-values"></span>`;
		const satLabel = isSatRestricted
			? `Sat <span class="nc-slider-values"></span> <span>→ mapped to ${eff.minSaturation}-${eff.maxSaturation}</span>`
			: `Sat <span class="nc-slider-values"></span>`;
		const litLabel = isLitRestricted
			? `Lit <span class="nc-slider-values"></span> <span>→ mapped to ${eff.minLightness}-${eff.maxLightness}</span>`
			: `Lit <span class="nc-slider-values"></span>`;

		hueSlider = createSlider({ label: hueLabel, min: 0, max: 360, value: 180, onChange: () => { customInput.value = ''; updatePreview(); } });
		satSlider = createSlider({ label: satLabel, min: 0, max: 100, value: 85, onChange: () => { customInput.value = ''; updatePreview(); } });
		litSlider = createSlider({ label: litLabel, min: 0, max: 100, value: 65, onChange: () => { customInput.value = ''; updatePreview(); } });

		slidersContainer.append(hueSlider.el, satSlider.el, litSlider.el);
	}

	// The "Change in Settings" button, shown in monochrome mode
	const openSettingsBtn = dialog.querySelector('#picker-open-settings');
	if (openSettingsBtn) {
		openSettingsBtn.addEventListener('click', () => {
			dialog.close();
			openSettingsSection(SETTINGS_SECTION_KEY);
		});
	}

	function getTextColor() {
		// In monochrome mode, return saved color or null (let getNickBase handle it)
		if (eff.useSingleColor || !hueSlider) {
			return customInput?.value?.trim() || null;
		}
		// Save raw slider values - mapping happens on display
		return customInput.value.trim() || `hsl(${hueSlider.getValue()}, ${satSlider.getValue()}%, ${litSlider.getValue()}%)`;
	}

	function updateGradients() {
		// Skip gradient updates if sliders don't exist (monochrome mode)
		if (!hueSlider || !satSlider || !litSlider) return;

		// Raw slider values (base values)
		const h = hueSlider.getValue(), s = satSlider.getValue(), l = litSlider.getValue();

		// Apply site-wide range mapping (proportional)
		const mappedH = mapHueToRange(h, eff.minHue, eff.maxHue);
		const mappedS = mapToRange(s, eff.minSaturation, eff.maxSaturation);
		const mappedL = mapToRange(l, eff.minLightness, eff.maxLightness);

		// HUE SLIDER
		// Full track: shows raw hue values with raw sat/lit (what you'd get without mapping)
		const fullHueStops = Array.from({ length: 13 }, (_, i) => {
			const hue = i * 30;
			return [hue, s, l, 1, (hue / 360) * 100];
		});

		if (isHueRestricted) {
			// Mapped track: shows what color you GET at each position (mapped hue, mapped sat/lit)
			const mappedHueStops = [];
			for (let i = 0; i <= 36; i++) {
				const inputHue = i * 10;
				const outputHue = mapHueToRange(inputHue, eff.minHue, eff.maxHue);
				const pos = (inputHue / 360) * 100;
				mappedHueStops.push([outputHue, mappedS, mappedL, 1, pos]);
			}
			hueSlider.setSplitGradient(mappedHueStops, fullHueStops);
		} else {
			hueSlider.setSplitGradient(null);
			hueSlider.setGradient(fullHueStops);
		}

		// SATURATION SLIDER
		// Full track: shows raw sat values with raw hue/lit
		const fullSatStops = [[h, 0, l, 1, 0], [h, 100, l, 1, 100]];

		if (isSatRestricted) {
			// Mapped track: shows actual output (mapped hue, mapped sat, mapped lit)
			// Map 0-100 to minSat-maxSat
			const mappedSatStops = [[mappedH, eff.minSaturation, mappedL, 1, 0], [mappedH, eff.maxSaturation, mappedL, 1, 100]];
			satSlider.setSplitGradient(mappedSatStops, fullSatStops);
		} else {
			satSlider.setSplitGradient(null);
			satSlider.setGradient(fullSatStops);
		}

		// LIGHTNESS SLIDER
		// Full track: shows raw lit values with raw hue/sat
		const fullLitStops = [[h, s, 0, 1, 0], [h, s, 50, 1, 50], [h, s, 100, 1, 100]];

		if (isLitRestricted) {
			// Mapped track: shows actual output (mapped hue/sat, mapped lit)
			// Map 0-100 to minLit-maxLit
			const mappedLitStops = [[mappedH, mappedS, eff.minLightness, 1, 0], [mappedH, mappedS, eff.maxLightness, 1, 100]];
			litSlider.setSplitGradient(mappedLitStops, fullLitStops);
		} else {
			litSlider.setSplitGradient(null);
			litSlider.setGradient(fullLitStops);
		}

		// All thumbs show the final resulting color
		const thumbColor = `hsl(${mappedH}, ${mappedS}%, ${mappedL}%)`;
		hueSlider.setThumbColor(thumbColor);
		satSlider.setThumbColor(thumbColor);
		litSlider.setThumbColor(thumbColor);

		// Update live value displays: raw → mapped
		const hueValuesEl = hueSlider.el.querySelector('.nc-slider-values');
		const satValuesEl = satSlider.el.querySelector('.nc-slider-values');
		const litValuesEl = litSlider.el.querySelector('.nc-slider-values');
		if (hueValuesEl) hueValuesEl.textContent = `[${Math.round(h)} → ${Math.round(mappedH)}]`;
		if (satValuesEl) satValuesEl.textContent = `[${Math.round(s)} → ${Math.round(mappedS)}]`;
		if (litValuesEl) litValuesEl.textContent = `[${Math.round(l)} → ${Math.round(mappedL)}]`;

		// Debug info under each slider (hidden if DEBUG is false)
		const hueDebug = getOrCreateDebugPre(hueSlider.el);
		const satDebug = getOrCreateDebugPre(satSlider.el);
		const litDebug = getOrCreateDebugPre(litSlider.el);

		const hueRange = eff.maxHue - eff.minHue;
		const hueT = h / 360;
		hueDebug.textContent = `t=${hueT.toFixed(3)} | ${eff.minHue} + ${hueT.toFixed(3)} * (${eff.maxHue} - ${eff.minHue}) = ${eff.minHue} + ${hueT.toFixed(3)} * ${hueRange} = ${(eff.minHue + hueT * hueRange).toFixed(1)}`;

		const satRange = eff.maxSaturation - eff.minSaturation;
		const satT = s / 100;
		satDebug.textContent = `t=${satT.toFixed(3)} | ${eff.minSaturation} + ${satT.toFixed(3)} * (${eff.maxSaturation} - ${eff.minSaturation}) = ${(eff.minSaturation + satT * satRange).toFixed(1)}`;

		const litRange = eff.maxLightness - eff.minLightness;
		const litT = l / 100;
		litDebug.textContent = `t=${litT.toFixed(3)} | ${eff.minLightness} + ${litT.toFixed(3)} * (${eff.maxLightness} - ${eff.minLightness}) = ${(eff.minLightness + litT * litRange).toFixed(1)}`;
	}

	function updatePreview() {
		updateGradients();

		// Build temporary styles object from current dialog state (using engine values)
		const prependIconState = engine.getFieldValue('prependIconEnabled');
		const appendIconState = engine.getFieldValue('appendIconEnabled');
		// What Save would store, as Save checks it (sanitize.js), so the
		// preview shows what is saved
		const tempStyles = sanitizeNickStyle(buildCurrentStyles(), 'typed') ?? {};

		// Temporarily apply dialog state to customNickColors for applyStyles
		const savedCustom = customNickColors[username];
		customNickColors[username] = tempStyles;

		// Match site-settings-panel behavior: set siteConfig to effective values
		// and disable siteConfig to prevent double-application of site theme adjustments
		// The eff variable (computed at dialog open) already has site theme adjustments baked in
		const savedSiteConfig = { ...siteConfig };
		Object.assign(siteConfig, eff);
		siteConfig.useSiteThemeHue = false;
		siteConfig.useSiteThemeSat = false;
		siteConfig.useSiteThemeLit = false;

		// Determine icons for preview
		let prependValue = '';
		let appendValue = '';
		if (prependIconState === true) {
			prependValue = (engine.getFieldValue('prependIcon') || '').trim();
		} else if (prependIconState === null && siteConfig.prependIcon) {
			prependValue = hashIcon;
		}
		if (appendIconState === true) {
			appendValue = (engine.getFieldValue('appendIcon') || '').trim();
		} else if (appendIconState === null && siteConfig.appendIcon) {
			appendValue = hashIcon;
		}

		// Helper to apply styles to a preview element
		const applyPreviewStyles = (el, isMention, isInverted = false) => {
			el.style.cssText = '';
			applyStyles(el, username, {
				matchType: isMention ? 'mention' : 'nick',
				isInverted,
				debugData: DEBUG,
				mergeStyles: {
					prependIcon: prependValue,
					appendIcon: appendValue
				}
			});
		};

		// Update both previews (false = not mention, true = mention)
		applyPreviewStyles(preview, false, false);
		if (previewMention) applyPreviewStyles(previewMention, true, false);
		if (previewInverted) applyPreviewStyles(previewInverted, false, true);

		// Restore original configs AFTER applying preview styles
		Object.assign(siteConfig, savedSiteConfig);

		// Restore original customNickColors
		if (savedCustom !== undefined) {
			customNickColors[username] = savedCustom;
		} else {
			delete customNickColors[username];
		}
	}

	// Parse initial color - load raw saved values directly to sliders
	if (currentStyles.color && hueSlider && satSlider && litSlider) {
		const hsl = parseColor(currentStyles.color, 'hsl');
		if (hsl) {
			hueSlider.setValue(hsl.h); satSlider.setValue(hsl.s); litSlider.setValue(hsl.l);
		} else if (customInput) {
			customInput.value = currentStyles.color;
		}
	}

	// Color input handler (custom color text field)
	if (customInput) customInput.addEventListener('input', updatePreview);

	// Icon option click handlers - each icon picker targets its specific input via data-target
	engineContainer.addEventListener('click', (e) => {
		const option = e.target.closest('.nc-icon-option');
		if (option) {
			const icon = option.textContent;
			const iconOptions = option.closest('.picker-icon-options');
			const targetId = iconOptions?.dataset.target;
			if (targetId) {
				// Map the target ID to engine field key
				const fieldKey = targetId === 'settings-prependIcon' ? 'prependIcon' : 'appendIcon';
				engine.setFieldValue(fieldKey, icon);
				updatePreview();
			}
			// Brief visual feedback
			// Restore the resting inline value, not '': the button's
			// `background: none` is inline too, and clearing it shows the
			// browser's default grey. Saved once, so a second click during the
			// flash cannot save the flash color as the one to restore
			if (option.dataset.restingBackground === undefined) option.dataset.restingBackground = option.style.background;
			clearTimeout(option.flashTimer);
			option.style.background = 'var(--atmo-fg-dim)';
			option.flashTimer = setTimeout(() => { option.style.background = option.dataset.restingBackground; }, 150);
		}
	});

	// Helper to build current styles object (uses engine values)
	function buildCurrentStyles() {
		const textColor = getTextColor();
		const prependIconState = engine.getFieldValue('prependIconEnabled');
		const appendIconState = engine.getFieldValue('appendIconEnabled');
		const weightState = engine.getFieldValue('fontWeight');
		const italicState = engine.getFieldValue('fontStyle');
		const caseState = engine.getFieldValue('fontVariant');
		const invertState = engine.getFieldValue('invert');

		const styles = { ...cssStringToStyles(engine.getFieldValue('customCss') || '') };
		if (textColor) styles.color = textColor;
		if (prependIconState === true) {
			styles.prependIcon = (engine.getFieldValue('prependIcon') || '').trim();
		} else if (prependIconState === false) {
			styles.prependIcon = '';
		}
		if (appendIconState === true) {
			styles.appendIcon = (engine.getFieldValue('appendIcon') || '').trim();
		} else if (appendIconState === false) {
			styles.appendIcon = '';
		}
		if (weightState !== null) {
			styles.fontWeight = weightState ? 'bold' : 'normal';
		}
		if (italicState !== null) {
			styles.fontStyle = italicState ? 'italic' : 'normal';
		}
		if (caseState !== null) {
			styles.fontVariant = caseState ? 'small-caps' : 'normal';
		}
		if (invertState !== null) {
			styles.invert = invertState;
		}
		// Handle fontFamily tri-state
		const customFontFamilyState = engine.getFieldValue('customFontFamily');
		if (customFontFamilyState === true) {
			styles.fontFamily = engine.getFieldValue('fontFamily')?.trim() || '';
		} else if (customFontFamilyState === false) {
			styles.fontFamily = ''; // Explicitly disabled
		}
		return styles;
	}

	/**
	 * A pickTextFile or showPasteDialog callback that puts the user's
	 * settings into this dialog, or says why it could not.
	 * @param {string} source - where the settings came from, for the message
	 * @returns {function(Object|null, Error|null): void}
	 */
	function importUserSettings(source) {
		return (data, err) => {
			if (err) {
				alert(err.message);
				return;
			}
			const raw = data && typeof data === 'object' ? data[username] || Object.values(data)[0] : null;
			// From a file or the clipboard: only safe styles (sanitize.js)
			const userSettings = sanitizeNickStyle(raw, 'imported');
			if (userSettings) {
				applyImportedUserSettings(userSettings);
				alert(`Settings imported!${droppedStylesNote(countDroppedStyles({ [username]: raw }, { [username]: userSettings }))}`);
			} else {
				alert(`No valid user settings found in ${source}`);
			}
		};
	}

	// Helper to apply imported user settings to the dialog (uses engine)
	function applyImportedUserSettings(settings) {
		// Apply color
		if (settings.color && hueSlider && satSlider && litSlider) {
			const hsl = parseColor(settings.color, 'hsl');
			if (hsl) {
				hueSlider.setValue(hsl.h);
				satSlider.setValue(hsl.s);
				litSlider.setValue(hsl.l);
			} else if (customInput) {
				customInput.value = settings.color;
			}
		}
		// Apply CSS (backgroundColor and other styles)
		const cssProps = [];
		if (settings.backgroundColor) cssProps.push(`background-color: ${settings.backgroundColor}`);
		if (cssProps.length > 0) {
			engine.setFieldValue('customCss', cssProps.join(';\n'));
		}
		// Apply prepend icon
		if (settings.prependIcon !== undefined) {
			if (settings.prependIcon === '') {
				engine.setFieldValue('prependIconEnabled', false);
			} else {
				engine.setFieldValue('prependIconEnabled', true);
				engine.setFieldValue('prependIcon', settings.prependIcon);
			}
		}
		// Apply append icon
		if (settings.appendIcon !== undefined) {
			if (settings.appendIcon === '') {
				engine.setFieldValue('appendIconEnabled', false);
			} else {
				engine.setFieldValue('appendIconEnabled', true);
				engine.setFieldValue('appendIcon', settings.appendIcon);
			}
		}
		// Apply style overrides
		if (settings.fontWeight !== undefined) {
			const state = settings.fontWeight === 'bold' ? true : settings.fontWeight === 'normal' ? false : null;
			engine.setFieldValue('fontWeight', state);
		}
		if (settings.fontStyle !== undefined) {
			const state = settings.fontStyle === 'italic' ? true : settings.fontStyle === 'normal' ? false : null;
			engine.setFieldValue('fontStyle', state);
		}
		if (settings.fontVariant !== undefined) {
			const state = settings.fontVariant === 'small-caps' ? true : settings.fontVariant === 'normal' ? false : null;
			engine.setFieldValue('fontVariant', state);
		}
		if (settings.fontFamily !== undefined) {
			if (settings.fontFamily === '') {
				engine.setFieldValue('customFontFamily', false);
			} else {
				engine.setFieldValue('customFontFamily', true);
				engine.setFieldValue('fontFamily', settings.fontFamily);
			}
		}
		if (settings.invert !== undefined) {
			engine.setFieldValue('invert', settings.invert);
		}
		updatePreview();
	}

	updatePreview();
}

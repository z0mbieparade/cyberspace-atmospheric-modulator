// =====================================================
// COLOR GENERATION
// =====================================================
//
// Flow:
// 1. getNickBase(username) → raw HSL (0-360, 0-100, 0-100)
//    - From custom save, override, or hash generation
// 2. applyRangeMappingToColor(hsl, config) → mapped HSL (within site ranges)
//    - Proportionally maps base color to configured ranges
// 3. Display always shows mapped result
// 4. Picker shows raw values, preview shows mapped result
// =====================================================

/**
 * Strip config only values from style object and convert colors to HSL if necessary
 * @param {Object} styles - Style object with potential color properties
 * @returns {Object} - Cleaned style object with colors in HSL format
 */
function makeStylesObject(styles)
{
	delete styles.appendIcon;
	delete styles.prependIcon;
	delete styles.invert;
	delete styles.userNotes;

	for(const key in styles)
	{
		if(key.startsWith('color') && typeof styles[key] !== 'string')
		{
			const color = parseColor(styles[key], 'hsl');
			if(color)
				styles[key] = color;
			else 
				delete styles[key];
		}
		else if (key.startsWith('base'))
		{
			delete styles[key];
		}
	}

	return styles;
}

/**
 * Get the base color/styles for a username
 * First checks for user-saved custom color,
 * then checks for remote/manual overrides,
 * and finally generates from hash if none are set.
 * Returns { h, s, l } in full range (h: 0-360, s: 0-100, l: 0-100)
 */
function getNickBase(username, colorFormat = 'hsl', options = {}) 
{
	options = {
		includeStyles: false,
		effectiveConfig: getEffectiveSiteConfig(),
		debugData: false,
		...options
	};

	let styles = {
		color: null
	};

	let debugData = [];

	// Check remote/manual overrides first (as base)
	if (MANUAL_OVERRIDES[username]) {
		const override = MANUAL_OVERRIDES[username];
		const colorStr = typeof override === 'string' ? override : override.color;
		if (colorStr) {
			const parsedColor = parseColor(colorStr, colorFormat);
			if (parsedColor) styles.color = parsedColor;
			debugData.push(['Source', 'Override']);
		}

		if(options.includeStyles && typeof override === 'object')
			styles = { ...override, ...styles };
	}

	// Then apply user-saved custom settings on top (takes precedence)
	if (customNickColors[username]) {
		const custom = customNickColors[username];
		const colorStr = typeof custom === 'string' ? custom : custom.color;
		if (colorStr) {
			const parsedColor = parseColor(colorStr, colorFormat);
			if (parsedColor) styles.color = parsedColor;
			debugData.push(['Source', 'Custom']);
		}

		if(options.includeStyles && typeof custom === 'object')
			styles = { ...styles, ...custom };
	}

	if (options.effectiveConfig.useSingleColor) 
	{
		// Monochrome mode - use configured color
		let hsl;
		if (options.effectiveConfig.singleColorCustom) {
			// Use custom color value if set
			const parsed = parseColor(options.effectiveConfig.singleColorCustom, 'hsl');
			hsl = parsed || { h: options.effectiveConfig.singleColorHue, s: options.effectiveConfig.singleColorSat, l: options.effectiveConfig.singleColorLit };
		} else {
			// Use H/S/L sliders
			hsl = {
				h: options.effectiveConfig.singleColorHue,
				s: options.effectiveConfig.singleColorSat,
				l: options.effectiveConfig.singleColorLit
			};
		}
		styles = {
			...styles,
			color: parseColor(hsl, colorFormat),
		};

		delete styles.backgroundColor;
	}

	if(styles.color === null)
	{
		// Normal mode - generate from hash
		const hash = hashString(username);
		const hash2 = hashString(username + '_sat');
		const hash3 = hashString(username + '_lit');

		const hsl = {
			h: hash % 360,
			s: hash2 % 101,  // 0-100 inclusive
			l: hash3 % 101   // 0-100 inclusive
		}

		styles = {
			...styles,
			color: parseColor(hsl, colorFormat)
		};

		debugData.push(['Source', 'Hashed']);
	}

	if(options.includeStyles)
	{
		// Apply style variations based on hash (unless already set by override)
		const hashStyles = getHashBasedStyleVariations(username);
		if (options.effectiveConfig.varyWeight && !styles.fontWeight)
			styles.fontWeight = hashStyles.fontWeight;
		if (options.effectiveConfig.varyItalic && !styles.fontStyle)
			styles.fontStyle = hashStyles.fontStyle;
		if (options.effectiveConfig.varyCase && !styles.fontVariant)
			styles.fontVariant = hashStyles.fontVariant;

		// Each side only while its own switch is on, and only where neither the
		// user nor a site-wide override set one: a custom icon, or '' for none,
		// stays as set
		if(options.effectiveConfig.prependIcon || options.effectiveConfig.appendIcon)
		{
			const icon = getHashBasedIcon(username, { effectiveConfig: options.effectiveConfig });
			if(options.effectiveConfig.prependIcon && styles.prependIcon === undefined)
				styles.prependIcon = icon;
			if(options.effectiveConfig.appendIcon && styles.appendIcon === undefined)
				styles.appendIcon = icon;
		}
	}

	if(options.debugData)
	{
		styles.debugData = debugData;
	}

	return options.includeStyles ? styles : styles.color;
}


/**
 * Get hash-based icon for a username (ignores overrides, for display defaults)
 * Returns the same icon for both prepend and append by default
 */
function getHashBasedIcon(username, options = {}) 
{
	options = {
		effectiveConfig: getEffectiveSiteConfig(),
		...options
	};

	if ((!options.effectiveConfig.prependIcon && !options.effectiveConfig.appendIcon) || !options.effectiveConfig.iconSet) return null;
	const icons = options.effectiveConfig.iconSet.split(/\s+/).filter(Boolean);
	if (icons.length === 0) return null;
	const hash = hashString(username + '_icon');
	return icons[hash % icons.length];
}

/**
 * Get hash-based style variations for a username
 */
function getHashBasedStyleVariations(username) {
	return {
		fontWeight: (hashString(username + '_fontWeight') % 2 === 0) ? 'normal' : 'bold',
		fontStyle: (hashString(username + '_fontStyle') % 4 === 0) ? 'italic' : 'normal',
		fontVariant: (hashString(username + '_fontVariant') % 4 === 1) ? 'small-caps' : 'normal'
	};
}


/**
 * Get raw styles for editing in color picker
 * Returns the base color values that user can edit
 */
function getRawStylesForPicker(username)
{
	const base = getNickBase(username);

	// Build styles object with base color
	let styles = { color: `hsl(${base.h}, ${base.s}%, ${base.l}%)` };

	// Merge MANUAL_OVERRIDES first (as base), then customNickColors on top
	if (MANUAL_OVERRIDES[username] && typeof MANUAL_OVERRIDES[username] === 'object') {
		const override = { ...MANUAL_OVERRIDES[username] };
		delete override.color;
		styles = { ...styles, ...override };
	}
	if (customNickColors[username] && typeof customNickColors[username] === 'object') {
		const custom = { ...customNickColors[username] };
		delete custom.color;
		delete custom.invert;
		styles = { ...styles, ...custom };
	}

	return styles;
}

/**
 * Apply color color to a base color
 * Returns the mapped color in the requested format
 */
function getMappedNickColor(username, colorFormat = 'hsl', options = {})
{
	options = {
		includeStyles: false,
		effectiveConfig: getEffectiveSiteConfig(),
		debugData: false,
		...options
	};

	const base = getNickBase(username, colorFormat, options);
	let mapped = null;
	let debugData = [];

	// In monochrome mode, skip range mapping - user chose the exact color
	const skipMapping = options.effectiveConfig.useSingleColor;

	if(options.includeStyles === true)
	{
		if(options.debugData)
		{
			debugData = base.debugData || [];
			delete base.debugData;
		}

		mapped = { ...base };
		for(const key in base)
		{
			if(key.startsWith('color'))
			{
				mapped[toCamelCase('base-' + key)] = base[key];
				mapped[key] = skipMapping ? base[key] : applyRangeMappingToColor(base[key], colorFormat, {
					effectiveConfig: options.effectiveConfig,
				});
			}
		}


		if(options.debugData)
		{
			mapped.debugData = debugData;
		}
	}
	else
	{
		mapped = skipMapping ? base : applyRangeMappingToColor(base, colorFormat, {
			effectiveConfig: options.effectiveConfig,
		})
	}

	return mapped;
}

function generateStyles(username, options = {}) 
{
	options = {
		themeName: siteThemeName,
		effectiveConfig: getEffectiveSiteConfig(),
		isInverted: false,
		debugData: false,
		...options
	};

	let debugData = [];

	const threshold = options.effectiveConfig.contrastThreshold ?? 4.5;
	const nickStyles = getMappedNickColor(username, 'hsl', {
		includeStyles: true,
		effectiveConfig: options.effectiveConfig,
		debugData: options.debugData,
	});
	const themeColors = getThemeColors(options.themeName);

	if(options.debugData)
	{
		debugData = nickStyles.debugData || [];
		delete nickStyles.debugData;
	}

	let nickColorRGB = parseColor(nickStyles.color, 'rgb');
	let elementBackgroundColor = options.isInverted ? themeColors.invertedBg : themeColors.bg;
	const elementBgRGB = parseColor(elementBackgroundColor, 'rgb');

	debugData.push(['Element BG', elementBackgroundColor ? parseColor(elementBgRGB, 'hsl-string') : 'N/A']);

	let nickBgColorRGB = parseColor(nickStyles.backgroundColor ?? elementBackgroundColor, 'rgb');

	debugData.push(['Nick FG (raw)', nickColorRGB ? parseColor(nickColorRGB, 'hsl-string') : 'N/A']);
	debugData.push(['Nick BG (raw)', nickBgColorRGB ? parseColor(nickBgColorRGB, 'hsl-string') : 'N/A']);

	// Handle inversion based on per-user setting or auto contrast
	let contrastRatio = getContrastRatio(nickColorRGB, nickBgColorRGB);
	debugData.push(['Contrast (raw)', +contrastRatio.toFixed(2)]);

	let shouldInvert = false;

	// User explicitly set inversion
	if (nickStyles.invert === true || nickStyles.invert === false)
	{
		shouldInvert = nickStyles.invert;
		debugData.push(['User Invert', nickStyles.invert]);
	}
	else if(threshold > 0) {
		shouldInvert = contrastRatio < threshold;
		debugData.push(['Thresh Invert', shouldInvert]);
	}

	const nickFg = parseColor(nickStyles.color, 'hsl-string');
	const nickBg = nickStyles.backgroundColor ? parseColor(nickStyles.backgroundColor, 'hsl-string') : null;

	// Extract icon values before makeStylesObject deletes them
	const prependIcon = nickStyles.prependIcon;
	const appendIcon = nickStyles.appendIcon;

	const styles = makeStylesObject(nickStyles);
	styles.color = nickFg;

	// if we should invert, swap fg and bg
	if(shouldInvert)
	{
		let invertBg = nickFg;
		let invertFg = nickBg ? nickBg : pickBestContrastingColor(nickFg, 'hsl-string', {
			themeName: options.themeName,
			isInverted: true,
			effectiveConfig: options.effectiveConfig,
			debugData: options.debugData
		});

		if(!options.effectiveConfig.useSingleColor)
		{
			const adjustedColors = adjustContrastToThreshold(invertBg, invertFg, threshold, 'hsl-string');
			styles.color = adjustedColors.colorAdjust;
			styles.backgroundColor = adjustedColors.colorCompare;
		}
		else 
		{
			styles.color = invertFg;
			styles.backgroundColor = invertBg;
		}

		debugData.push(['Nick FG (adj)', styles.color || 'N/A']);
		debugData.push(['Nick BG (adj)', styles.backgroundColor || 'N/A']);

		contrastRatio = getContrastRatio(styles.color, styles.backgroundColor);
		styles.padding = '0 0.25em';
	}
	else
	{
		if(!options.effectiveConfig.useSingleColor)
		{
			const adjustedColors = adjustContrastToThreshold(nickBgColorRGB, nickFg, threshold, 'hsl-string');
			styles.color = adjustedColors.colorAdjust;
			debugData.push(['Nick FG (adj)', styles.color || 'N/A']);
		}

		contrastRatio = getContrastRatio(styles.color, nickBgColorRGB);
	}

	debugData.push(['Contrast (adj)', +contrastRatio.toFixed(2)]);

	return {
		styles,
		nickConfig: { ...nickStyles, prependIcon, appendIcon },
		contrastRatio,
		debugData
	};
}

function applyStyles(element, username, options = {}) 
{
	options = {
		matchType: 'nick',
		mergeStyles: {},
		overridesStyles: null,
		themeName: siteThemeName,
		effectiveConfig: getEffectiveSiteConfig(),
		debugData: false,
		...options
	};

	let debugData = [];

	if(element.querySelector('.nc-nick-debug'))
		element.querySelector('.nc-nick-debug').remove();

	// Check if element is in an inverted container
	const isInverted = options.isInverted ?? (
		INVERTED_CONTAINERS.length > 0 &&
		INVERTED_CONTAINERS.some(sel => element.closest(sel))
	);

	let { styles, nickConfig, contrastRatio, debugData: debugDataGenStyles } = generateStyles(username, {
		themeName: options.themeName,
		effectiveConfig: options.effectiveConfig,
		debugData: options.debugData,
		isInverted
	});

	debugData = [...debugData, ...(debugDataGenStyles || [])];

	styles = { ...styles, ...options.mergeStyles };

	if(options.overrideStyles && typeof options.overrideStyles === 'object')
	{
		styles = { ...options.overrideStyles };
	}

	// Clear previous inline styles before applying new ones
	// This ensures old background-color/padding from inversion is removed when no longer needed
	element.style.cssText = '';

	// Apply all styles to the element
	for(const key in styles)
	{
		const styleKey = toKebabCase(key);
		element.style.setProperty(styleKey, styles[key], 'important');
	}

	element.dataset[`${options.matchType}Colored`] = 'true';
	element.dataset.username = username;
	if (typeof contrastRatio === 'number') element.dataset.contrastRatio = contrastRatio.toFixed(2);

	const prependIcon = nickConfig.prependIcon;
	const appendIcon = nickConfig.appendIcon;

	// Prepend/append icon if enabled
	if (prependIcon || appendIcon) 
	{
		if (!element.dataset.iconApplied) {
			// Store original text before first icon application
			element.dataset.originalText = element.textContent;
			element.dataset.iconApplied = 'true';
		}

		const originalText = element.dataset.originalText || element.textContent;
		let newText = originalText;
		if (prependIcon) newText = prependIcon + ' ' + newText;
		if (appendIcon) newText = newText + ' ' + appendIcon;
		element.textContent = newText;
	} 
	else if (element.dataset.iconApplied)
	{
		// Icons were removed - restore original text
		if (element.dataset.originalText) {
			element.textContent = element.dataset.originalText;
		}
		delete element.dataset.iconApplied;
		delete element.dataset.originalText;
	}

	if(options.debugData)
	{
		// Store debug data for tooltip
		element.dataset.ncDebug = JSON.stringify(debugData);
		element.classList.add('nc-has-debug');

		// Add tooltip on hover
		element.addEventListener('mouseenter', showDebugTooltip);
		element.addEventListener('mouseleave', hideDebugTooltip);
	}

	return element;
}

// Debug tooltip functions
let debugTooltip = null;

function showDebugTooltip(e) {
	const element = e.currentTarget;
	const debugData = JSON.parse(element.dataset.ncDebug || '[]');

	if (!debugTooltip) {
		debugTooltip = document.createElement('div');
		debugTooltip.className = 'nc-debug-tooltip';
		document.body.appendChild(debugTooltip);
	}

	// debugData is an array of [label, value] pairs
	debugTooltip.innerHTML = debugData
		.map(([label, value]) => {
			const displayValue = typeof value === 'string' && value.startsWith('hsl')
				? `<span class="nc-debug-swatch" style="background:${value}"></span>${value}`
				: value;
			return `<div class="nc-debug-row"><span class="nc-debug-label">${label}:</span> <span class="nc-debug-value">${displayValue}</span></div>`;
		})
		.join('');

	// Position tooltip
	const rect = element.getBoundingClientRect();
	debugTooltip.style.left = rect.left + 'px';
	debugTooltip.style.top = (rect.bottom + 4) + 'px';
	debugTooltip.classList.add('visible');
}

function hideDebugTooltip() {
	if (debugTooltip) {
		debugTooltip.classList.remove('visible');
	}
}

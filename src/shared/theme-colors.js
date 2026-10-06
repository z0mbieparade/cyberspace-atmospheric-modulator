// =====================================================
// THEME COLORS
// =====================================================
// The site theme's colors, resolved so they are always usable: a theme
// variable that is transparent, or in a format the color math cannot read,
// falls back to the user's custom_theme, then to THEME_COLORS, then to
// defaults. Status colors (error, warn, success, info) are derived from the
// theme and kept at 4.5:1 contrast. initThemeVariables() publishes them as
// --atmo-* custom properties for the shared UI.
//
// Requires ui-dialog.js (UI_PREFIX) before this file, and LOG_PREFIX.

// Colors for each site theme, by the name the site shows (matched
// case-insensitively against data-theme); `id` holds the data-theme value
// where it differs (findThemeEntry). In the site's own order, after Full
// Spectrum, the fallback for a theme not listed.
// logic: which colors an inverted container uses, where it is not fg on bg
const THEME_COLORS = {
	'Full Spectrum': {
		colors: { fg: '#e0e0e0', bg: '#0a0a0a', fgDim: '#888888', border: '#333333', codeBg: '#222222' },
	},
	'z0ylent': {
		colors: { fg: '#91ff00', bg: '#060f04', fgDim: '#12892d', border: '#12892d', codeBg: '#0c1c08' },
	},
	'Dark': {
		colors: { fg: '#efe5c0', bg: '#000000', fgDim: '#a89984', border: '#3a3a3a', codeBg: 'hsla(0,0%,100%,.07)' },
	},
	'Light': {
		colors: { fg: '#000000', bg: '#efe5c0', fgDim: '#3a3a3a', border: '#a89984', codeBg: 'rgba(0,0,0,.08)' },
	},
	'LCD': {
		colors: { fg: '#000000', bg: '#eaeae4', fgDim: '#3a3a3a', border: '#9aa49d', codeBg: '#b4c2aa' },
	},
	'C64': {
		colors: { fg: 'hsla(0,0%,100%,.75)', bg: '#2a2ab8', fgDim: 'hsla(0,0%,100%,.4)', border: 'hsla(0,0%,100%,.3)', codeBg: 'hsla(0,0%,100%,.08)' },
	},
	'VT320': {
		colors: { fg: '#ff9a10', bg: '#170800', fgDim: '#ff9100', border: 'rgba(255,155,0,.27)', codeBg: 'rgba(255,155,0,.05)' },
	},
	'Matrix': {
		colors: { fg: 'rgba(160,224,68,.9)', bg: '#000000', fgDim: 'rgba(160,224,68,.5)', border: 'rgba(160,224,68,.4)', codeBg: 'rgba(0,255,65,.08)' },
	},
	'Poetry': {
		colors: { fg: '#222222', bg: '#fefaf8', fgDim: '#666666', border: '#cccccc', codeBg: '#f0e0dd' },
		logic: { invertedContainerBg: 'codeBg', invertedContainerFg: 'fg' },
	},
	'Brutalist': {
		colors: { fg: '#c0d0e8', bg: '#080810', fgDim: '#99a9bf', border: 'rgba(160,180,220,.18)', codeBg: 'rgba(160,180,220,.06)' },
	},
	'GRiD': {
		colors: { fg: '#fea813', bg: '#180f06', fgDim: '#d08c17', border: 'rgba(245,169,28,.22)', codeBg: 'rgba(245,169,28,.08)' },
	},
	'Crypt': {
		// The site's code background is transparent: a faint red stands in
		colors: { fg: '#ee1100', bg: '#100202', fgDim: 'rgba(255,0,0,.8)', border: 'rgba(255,0,0,.3)', codeBg: 'rgba(255,0,0,.05)' },
	},
	'Bubblegum': {
		colors: { fg: '#6b1a4a', bg: '#ffe4f1', fgDim: '#b86b93', border: '#f5b5d1', codeBg: '#ffd0e5' },
	},
	'Top8': {
		id: 'myspace',
		colors: { fg: '#000000', bg: '#ffffff', fgDim: '#666666', border: '#6699cc', codeBg: '#e6f2ff' },
	},
	'System': {
		colors: { fg: '#efe5c0', bg: '#000000', fgDim: '#a89984', border: '#3a3a3a', codeBg: 'hsla(0,0%,100%,.07)' },
	},
};

// The user's custom colors from the site's settings, or null
let siteCustomTheme = null;

/**
 * Read the user's custom colors from the site's localStorage.
 * Side effects: sets siteCustomTheme; logs and leaves it alone on bad JSON.
 */
function loadSiteCustomTheme() {
	try {
		// First try custom_theme (full color customization)
		const customThemeStr = localStorage.getItem('custom_theme');
		if (customThemeStr) {
			siteCustomTheme = JSON.parse(customThemeStr);
		}
	} catch (e) {
		console.log(LOG_PREFIX + ' Could not parse site custom_theme:', e);
	}
}
loadSiteCustomTheme();

/**
 * Look a theme up by name or by its site id: exact first, then
 * case-insensitive. An entry's `id` is the site's data-theme value, where it
 * differs from the name the site shows (Top8 is stored as 'myspace').
 * @param {Object} table - THEME_COLORS, or a script's own table keyed the same way
 * @param {string} themeName - a name, or a data-theme value
 * @returns {Object|null}
 */
function findThemeEntry(table, themeName) {
	if (!themeName) return null;
	if (table[themeName]) return table[themeName];
	const lowerName = themeName.toLowerCase();
	for (const [name, entry] of Object.entries(table)) {
		if (name.toLowerCase() === lowerName || entry.id?.toLowerCase() === lowerName) return entry;
	}
	return null;
}

/**
 * @param {string} hex - '#rrggbb' or 'rrggbb'; 3- and 8-digit forms are not read
 * @returns {{r: number, g: number, b: number}|null} 0-255 channels, or null when unreadable
 */
function hexToRgb(hex) {
	const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
	if (!result) return null;
	return {
		r: parseInt(result[1], 16),
		g: parseInt(result[2], 16),
		b: parseInt(result[3], 16)
	};
}

/**
 * @param {string} hex - '#rrggbb' or 'rrggbb'
 * @returns {{h: number, s: number, l: number}|null} h in degrees, s and l in %, or null when unreadable
 */
function hexToHsl(hex) {
	const rgb = hexToRgb(hex);
	if (!rgb) return null;

	let r = rgb.r / 255;
	let g = rgb.g / 255;
	let b = rgb.b / 255;

	const max = Math.max(r, g, b), min = Math.min(r, g, b);
	let h, s, l = (max + min) / 2;

	if (max === min) {
		h = s = 0;
	} else {
		const d = max - min;
		s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
		switch (max) {
			case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
			case g: h = ((b - r) / d + 2) / 6; break;
			case b: h = ((r - g) / d + 4) / 6; break;
		}
	}

	return {
		h: Math.round(h * 360),
		s: Math.round(s * 100),
		l: Math.round(l * 100)
	};
}

/**
 * @param {number} r - 0-255
 * @param {number} g - 0-255
 * @param {number} b - 0-255
 * @returns {{h: number, s: number, l: number}} h in degrees, s and l in %
 */
function rgbToHsl(r, g, b) {
	r /= 255; g /= 255; b /= 255;
	const max = Math.max(r, g, b), min = Math.min(r, g, b);
	let h, s, l = (max + min) / 2;
	if (max === min) {
		h = s = 0;
	} else {
		const d = max - min;
		s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
		switch (max) {
			case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
			case g: h = ((b - r) / d + 2) / 6; break;
			case b: h = ((r - g) / d + 4) / 6; break;
		}
	}
	return { h: h * 360, s: s * 100, l: l * 100 };
}

/**
 * @param {number} h - degrees
 * @param {number} s - %
 * @param {number} l - %
 * @returns {{r: number, g: number, b: number}} 0-255 channels
 */
function hslToRgb(h, s, l) {
	h = h / 360;
	s = s / 100;
	l = l / 100;

	let r, g, b;
	if (s === 0) {
		r = g = b = l;
	} else {
		const hue2rgb = (p, q, t) => {
			if (t < 0) t += 1;
			if (t > 1) t -= 1;
			if (t < 1/6) return p + (q - p) * 6 * t;
			if (t < 1/2) return q;
			if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
			return p;
		};
		const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
		const p = 2 * l - q;
		r = hue2rgb(p, q, h + 1/3);
		g = hue2rgb(p, q, h);
		b = hue2rgb(p, q, h - 1/3);
	}
	return {
		r: Math.round(r * 255),
		g: Math.round(g * 255),
		b: Math.round(b * 255)
	};
}

/**
 * @param {{r: number, g: number, b: number}} rgb - 0-255 channels; fractions are rounded
 * @returns {string} '#rrggbb'
 */
function rgbToHex({ r, g, b }) {
	const channel = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
	return `#${channel(r)}${channel(g)}${channel(b)}`;
}

/**
 * Convert a color between formats.
 *
 * Reads hsl()/hsla() and rgb()/rgba() strings (alpha ignored), '#rrggbb'
 * hex, and {h, s, l} or {r, g, b} objects. '#rgb' hex only passes through to
 * 'hex' output; to hsl or rgb it gives null. (getThemeColors rejects 3-digit
 * site colors earlier, in its own check, so they fall through to THEME_COLORS.)
 * @param {string|Object} color
 * @param {string} [colorFormat='hsl'] - 'hsl' or 'rgb', with '-string' for
 *   a CSS string or '-object' (the default) for an object; or 'hex', a
 *   '#rrggbb' string (hex input is returned as given)
 * @returns {string|Object|null} the color in that format, or null when unreadable
 */
function parseColor(color, colorFormat = 'hsl') 
{
	if (!color) return null;

	let hslMatch, rgbMatch, hexMatch;
	if(typeof color === 'string') {
		// Support both hsl/hsla and rgb/rgba formats (ignore alpha channel)
		hslMatch = color.match(/hsla?\(([\d.]+),\s*([\d.]+)%?,\s*([\d.]+)%?(?:,\s*[\d.]+)?\)/);
		rgbMatch = color.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*[\d.]+)?\)/);
		hexMatch = color.match(/^#([a-f\d]{6}|[a-f\d]{3})$/i);
	} else if(typeof color === 'object') {
		if (color.h !== undefined && color.s !== undefined && color.l !== undefined)
			hslMatch = [null, color.h, color.s, color.l];
		else if (color.r !== undefined && color.g !== undefined && color.b !== undefined)
			rgbMatch = [null, color.r, color.g, color.b];
	}

	const formatType = colorFormat.match('-string') ? 'string' : 'object';
	colorFormat = colorFormat.replace(/-string|-object$/, '');

	if(colorFormat === 'hsl') {
		if (hslMatch)
			return formatType === 'string' ?
			`hsl(${(+hslMatch[1]).toFixed(1)}, ${(+hslMatch[2]).toFixed(1)}%, ${(+hslMatch[3]).toFixed(1)}%)` :
			{ h: +hslMatch[1], s: +hslMatch[2], l: +hslMatch[3] };
		else if (rgbMatch){
			const hsl = rgbToHsl(+rgbMatch[1], +rgbMatch[2], +rgbMatch[3]);
			return formatType === 'string' ?
				`hsl(${hsl.h.toFixed(1)}, ${hsl.s.toFixed(1)}%, ${hsl.l.toFixed(1)}%)` :
				{ h: hsl.h, s: hsl.s, l: hsl.l };
		}
		else if (hexMatch)
			return hexToHsl(color);
	} else if(colorFormat === 'rgb') {
		if (rgbMatch)
			return formatType === 'string' ?
				`rgb(${(+rgbMatch[1]).toFixed(1)}, ${(+rgbMatch[2]).toFixed(1)}, ${(+rgbMatch[3]).toFixed(1)})` :
				{ r: +rgbMatch[1], g: +rgbMatch[2], b: +rgbMatch[3] };
		else if (hslMatch) {
			const rgb = hslToRgb(+hslMatch[1], +hslMatch[2], +hslMatch[3]);
			return formatType === 'string' ?
				`rgb(${rgb.r.toFixed(1)}, ${rgb.g.toFixed(1)}, ${rgb.b.toFixed(1)})` :
				{ r: rgb.r, g: rgb.g, b: rgb.b };
		}
		else if (hexMatch)
			return hexToRgb(color);
	} else if(colorFormat === 'hex') {
		if (hexMatch)
			return color;
		else if (hslMatch)
			return rgbToHex(hslToRgb(+hslMatch[1], +hslMatch[2], +hslMatch[3]));
		else if (rgbMatch)
			return rgbToHex({ r: +rgbMatch[1], g: +rgbMatch[2], b: +rgbMatch[3] });
	}

	return null;
}

/**
 * Relative luminance per WCAG 2.1
 * (https://www.w3.org/WAI/GL/wiki/Relative_luminance).
 * @param {string|Object} color - anything parseColor reads
 * @returns {number} 0 for black to 1 for white
 */
function getRelativeLuminance(color) {

	const rgb = parseColor(color, 'rgb');

	if (!rgb) return 0;
	const { r, g, b } = rgb;

	// Convert 0-255 to 0-1
	const rsRGB = r / 255;
	const gsRGB = g / 255;
	const bsRGB = b / 255;

	// Apply gamma correction
	const rLinear = rsRGB <= 0.03928 ? rsRGB / 12.92 : Math.pow((rsRGB + 0.055) / 1.055, 2.4);
	const gLinear = gsRGB <= 0.03928 ? gsRGB / 12.92 : Math.pow((gsRGB + 0.055) / 1.055, 2.4);
	const bLinear = bsRGB <= 0.03928 ? bsRGB / 12.92 : Math.pow((bsRGB + 0.055) / 1.055, 2.4);

	// Weighted sum (human eye is most sensitive to green)
	return 0.2126 * rLinear + 0.7152 * gLinear + 0.0722 * bLinear;
}

/**
 * WCAG contrast ratio (https://www.w3.org/WAI/GL/wiki/Contrast_ratio).
 * @param {string|Object} color1 - anything parseColor reads
 * @param {string|Object} color2
 * @returns {number} 1 (none) to 21 (black on white)
 */
function getContrastRatio(color1, color2) {
	const L1 = getRelativeLuminance(color1);
	const L2 = getRelativeLuminance(color2);

	const lighter = Math.max(L1, L2);
	const darker = Math.min(L1, L2);

	return (lighter + 0.05) / (darker + 0.05);
}

/**
 * A text color readable on bg, as close to color as can be: color stepped in
 * lightness until it reaches threshold. When its side of bg cannot get there
 * (a mid-gray background), black or white, whichever reads better: one of
 * them always reaches 4.5:1. The background never moves.
 * @param {string} bg
 * @param {string} color
 * @param {number} [threshold=4.5]
 * @returns {string} a color string
 */
function readableTextOn(bg, color, threshold = 4.5) {
	const stepped = adjustContrastToThreshold(bg, color, threshold, 'hsl-string').colorAdjust;
	if (getContrastRatio(bg, stepped) >= threshold) return stepped;
	return getContrastRatio(bg, '#000000') >= getContrastRatio(bg, '#ffffff') ? '#000000' : '#ffffff';
}

/**
 * Step lightness by 5% until two colors reach a contrast ratio, at most 20
 * steps. colorAdjust moves, unless it is already black or white; then
 * colorCompare moves instead.
 * @param {string|Object} colorCompare - usually the background
 * @param {string|Object} colorAdjust - usually the text
 * @param {number} [threshold=4.5] - the WCAG ratio to reach
 * @param {string} [colorFormat='hsl'] - the result colors' format (see parseColor)
 * @returns {{colorCompare, colorAdjust, contrast: number, adjusted: boolean, loopCount: number}}
 *   the colors as given when either is unreadable
 */
function adjustContrastToThreshold(colorCompare, colorAdjust, threshold = 4.5, colorFormat = 'hsl')
{
	let contrast = getContrastRatio(colorCompare, colorAdjust);
	const colors = { adjusted: false };

	const hslCompare = parseColor(colorCompare, 'hsl');
	const hslAdjust = parseColor(colorAdjust, 'hsl');

	// If either color can't be parsed, return early with original colors
	if (!hslCompare || !hslAdjust) {
		colors.colorAdjust = colorAdjust;
		colors.colorCompare = colorCompare;
		colors.contrast = contrast;
		colors.loopCount = 0;
		return colors;
	}

	let loopCount = 0;

	while(contrast < threshold && loopCount < 20)
	{
		const luminanceCompare = getRelativeLuminance(hslCompare);
		const luminanceAdjust = getRelativeLuminance(hslAdjust);

		// if the adjust color is already black or white, adjust the compare color
		if(hslAdjust.l === 0 || hslAdjust.l === 100)
		{
			// if compare color is lighter than adjust color, we need to lighten the compare color
			if(luminanceCompare > luminanceAdjust)
				hslCompare.l += 5;
			else
				hslCompare.l -= 5;
		}
		else 
		{
			// if adjust color is lighter than compare color, we need to lighten the adjust color
			if(luminanceAdjust > luminanceCompare)
				hslAdjust.l += 5;
			else
				hslAdjust.l -= 5;
		}

		contrast = getContrastRatio(hslCompare, hslAdjust);
		loopCount++;

		colors.adjusted = true;
	}

	colors.colorAdjust = parseColor(hslAdjust, colorFormat);
	colors.colorCompare = parseColor(hslCompare, colorFormat);
	colors.contrast = contrast;
	colors.loopCount = loopCount;

	return colors;
}

/**
 * @param {string} str - camelCase
 * @returns {string} kebab-case
 */
function toKebabCase(str) {
	return str.replace(/([A-Z])/g, '-$1').toLowerCase();
}

/**
 * The theme's colors, each from the first usable source: the site's CSS
 * variable, the user's custom_theme, THEME_COLORS, then Full Spectrum.
 * Status colors and their backgrounds are derived from fg and bg and kept at
 * 4.5:1 contrast.
 * @param {string|null} [themeName] - a THEME_COLORS name; defaults to the page's data-theme
 * @param {string|null} [colorFormat] - convert every color (see parseColor);
 *   null leaves each as found
 * @returns {{bg, fg, fgDim, border, codeBg, invertedBg, invertedFg,
 *   error, warn, success, info, errorBg, warnBg, successBg, infoBg}}
 */
function getThemeColors(themeName = null, colorFormat = null)
{
	const root = document.documentElement;
	const style = getComputedStyle(root);

	// Get preset theme from data-theme attribute
	themeName = themeName ?? root.dataset.theme ?? document.body?.dataset?.theme;
	const presetTheme = themeName ? findThemeEntry(THEME_COLORS, themeName) : null;

	// Map custom_theme keys to our keys (custom_theme uses different property names)
	const customTheme = siteCustomTheme ? {
		bg: siteCustomTheme.bg,
		fg: siteCustomTheme.fg,
		fgDim: siteCustomTheme.fgDim || siteCustomTheme.dim,
		border: siteCustomTheme.border,
		codeBg: siteCustomTheme.codeBg || siteCustomTheme.code_bg,
	} : null;

	// Default fallbacks (used if no theme or theme missing property)
	const defaults = THEME_COLORS['Full Spectrum'].colors;

	// Helper to check if a color value is valid (not transparent, not empty)
	function isValidColor(value) {
		if (!value || value === 'transparent' || value === 'none') {
			return false;
		}
		// Accept hex, rgb(), hsl(), rgba(), hsla()
		if (hexToRgb(value)) return true;
		if (value.startsWith('rgb') || value.startsWith('hsl')) return true;
		return false;
	}

	// Get safe color with fallback chain: CSS var > custom_theme > preset > default
	function getSafeColor(varName, themeKey) {
		// 1. Try CSS variable
		const cssValue = style.getPropertyValue(varName).trim();
		if (isValidColor(cssValue)) {
			return cssValue;
		}

		// 2. Try custom_theme (user's custom colors from localStorage)
		if (customTheme && isValidColor(customTheme[themeKey])) {
			return customTheme[themeKey];
		}

		// 3. Try preset theme
		if (presetTheme && presetTheme.colors && isValidColor(presetTheme.colors[themeKey])) {
			return presetTheme.colors[themeKey];
		}

		// 4. Fall back to defaults
		return defaults[themeKey];
	}

	let invertedBg = getSafeColor('--color-fg', 'fg');
	let invertedFg = getSafeColor('--color-bg', 'bg');

	if(presetTheme?.logic)
	{
		const invertedContainerBg = presetTheme.logic.invertedContainerBg ?? 'fg';
		const invertedContainerFg = presetTheme.logic.invertedContainerFg ?? 'bg';

		const invertedContainerBgCss = '--color-' + toKebabCase(invertedContainerBg);
		const invertedContainerFgCss = '--color-' + toKebabCase(invertedContainerFg);

		invertedBg = getSafeColor(invertedContainerBgCss, invertedContainerBg);
		invertedFg = getSafeColor(invertedContainerFgCss, invertedContainerFg);
	}

	const colors = {
		bg: getSafeColor('--color-bg', 'bg'),
		fg: getSafeColor('--color-fg', 'fg'),
		fgDim: getSafeColor('--color-fg-dim', 'fgDim'),
		border: getSafeColor('--color-border', 'border'),
		codeBg: getSafeColor('--color-code-bg', 'codeBg'),

		invertedBg, invertedFg,

		error: '#ff6b6b',
		warn: '#ffd93d',
		success: '#6bcb77',
		info: '#4d96ff',
		errorBg: '#1a0d0d',
		warnBg: '#1a250d',
		successBg: '#152a15',
		infoBg: '#15152a'
	}
	
	// Generate semantic colors based on fg color's saturation/lightness
	// Shift hue to standard values: error=0, warn=45, success=120, info=210
	const fgHsl = hexToHsl(colors.fg) || parseColor(colors.fg, 'hsl');
	const bgHsl = hexToHsl(colors.bg) || parseColor(colors.bg, 'hsl');

	// Helper to adjust lightness until we get good contrast against bg
	function getContrastSafeColor(hue, sat, lit, bgRgb, minContrast = 4.5) {
		// Try the initial lightness
		let testLit = lit;
		let rgb = hslToRgb(hue, sat, testLit);
		let contrast = getContrastRatio(rgb, bgRgb);

		// If contrast is good, return as-is
		if (contrast >= minContrast) {
			return `hsl(${hue}, ${sat}%, ${testLit}%)`;
		}

		// Determine if we need to go lighter or darker based on bg luminance
		const bgLum = getRelativeLuminance(bgRgb);
		const direction = bgLum > 0.5 ? -5 : 5; // Dark bg = go lighter, light bg = go darker

		// Adjust lightness until contrast is good (max 15 iterations)
		for (let i = 0; i < 15; i++) {
			testLit = Math.max(5, Math.min(95, testLit + direction));
			rgb = hslToRgb(hue, sat, testLit);
			contrast = getContrastRatio(rgb, bgRgb);
			if (contrast >= minContrast) {
				break;
			}
		}

		return `hsl(${hue}, ${sat}%, ${testLit}%)`;
	}

	if (fgHsl && bgHsl) {
		// Use fg's saturation and lightness as starting point
		let sat = Math.max(fgHsl.s, 50);
		let lit = fgHsl.l;

		// If fg is too dark or too light, start from a middle ground
		if (lit < 20 || lit > 80) {
			lit = 50;
			sat = Math.max(sat, 70);
		}

		// Get bg as RGB for contrast checking
		const bgRgb = hslToRgb(bgHsl.h, bgHsl.s, bgHsl.l);

		colors.error = getContrastSafeColor(0, sat, lit, bgRgb);
		colors.warn = getContrastSafeColor(45, sat, lit, bgRgb);
		colors.success = getContrastSafeColor(120, sat, lit, bgRgb);
		colors.info = getContrastSafeColor(210, sat, lit, bgRgb);
	}

	if (bgHsl) {
		// Use bg's saturation and lightness for background variants
		let sat = Math.max(bgHsl.s, 20);
		let lit = bgHsl.l;

		// If bg is pure black, add a subtle tint
		if (lit < 5) {
			lit = 10;
			sat = Math.max(sat, 30);
		}
		// If bg is pure white, darken slightly for visibility
		else if (lit > 95) {
			lit = 90;
			sat = Math.max(sat, 30);
		}

		colors.errorBg = `hsl(0, ${sat}%, ${lit}%)`;
		colors.warnBg = `hsl(45, ${sat}%, ${lit}%)`;
		colors.successBg = `hsl(120, ${sat}%, ${lit}%)`;
		colors.infoBg = `hsl(210, ${sat}%, ${lit}%)`;

		// Ensure alert fg/bg pairs have good contrast
		if (colors.error && colors.errorBg) {
			const adjusted = adjustContrastToThreshold(colors.errorBg, colors.error, 4.5, 'hsl-string');
			colors.error = adjusted.colorAdjust;
			colors.errorBg = adjusted.colorCompare;
		}
		if (colors.warn && colors.warnBg) {
			const adjusted = adjustContrastToThreshold(colors.warnBg, colors.warn, 4.5, 'hsl-string');
			colors.warn = adjusted.colorAdjust;
			colors.warnBg = adjusted.colorCompare;
		}
		if (colors.success && colors.successBg) {
			const adjusted = adjustContrastToThreshold(colors.successBg, colors.success, 4.5, 'hsl-string');
			colors.success = adjusted.colorAdjust;
			colors.successBg = adjusted.colorCompare;
		}
		if (colors.info && colors.infoBg) {
			const adjusted = adjustContrastToThreshold(colors.infoBg, colors.info, 4.5, 'hsl-string');
			colors.info = adjusted.colorAdjust;
			colors.infoBg = adjusted.colorCompare;
		}
	}

	// The theme's dim text, made readable where it is not: themes set fg-dim
	// for hints, often below 4.5:1 on their background
	if (colors.fgDim && colors.bg) colors.fgMuted = readableTextOn(colors.bg, colors.fgDim);

	if(colorFormat)
	{
		for(const key in colors)
		{
			const color = colors[key];
			const parsed = parseColor(color, colorFormat);
			if(parsed) colors[key] = parsed;
		}
	}
	
	return colors;
}

/**
 * Publish the theme's colors as --atmo-* custom properties on :root, for the
 * shared UI styles. Every script built on these files computes the same
 * values, so any of them may run it.
 * Side effects: sets custom properties on document.documentElement.
 * @param {string|null} [themeName] - as getThemeColors
 */
function initThemeVariables(themeName = null) {
	
	const colors = getThemeColors(themeName);
	const root = document.documentElement;

	root.style.setProperty('--' + UI_PREFIX + '-bg', colors.bg);
	root.style.setProperty('--' + UI_PREFIX + '-fg', colors.fg);
	root.style.setProperty('--' + UI_PREFIX + '-fg-dim', colors.fgDim);
	root.style.setProperty('--' + UI_PREFIX + '-fg-muted', colors.fgMuted);
	root.style.setProperty('--' + UI_PREFIX + '-border', colors.border);
	root.style.setProperty('--' + UI_PREFIX + '-code-bg', colors.codeBg);
	root.style.setProperty('--' + UI_PREFIX + '-inverted-bg', colors.invertedBg);
	root.style.setProperty('--' + UI_PREFIX + '-inverted-fg', colors.invertedFg);
	root.style.setProperty('--' + UI_PREFIX + '-error', colors.error);
	root.style.setProperty('--' + UI_PREFIX + '-warn', colors.warn);
	root.style.setProperty('--' + UI_PREFIX + '-success', colors.success);
	root.style.setProperty('--' + UI_PREFIX + '-info', colors.info);
	root.style.setProperty('--' + UI_PREFIX + '-error-bg', colors.errorBg);
	root.style.setProperty('--' + UI_PREFIX + '-warn-bg', colors.warnBg);
	root.style.setProperty('--' + UI_PREFIX + '-success-bg', colors.successBg);
	root.style.setProperty('--' + UI_PREFIX + '-info-bg', colors.infoBg);
}

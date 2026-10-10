function getThemeDefaultSettings(themeName) 
{
	themeName = themeName ?? siteThemeName ?? 'Full Spectrum';
	const presetTheme = findThemeEntry(PRESET_THEMES, themeName);
	const themeColors = getThemeColors(themeName);
	const themeColorVariables = getThemeColors(themeName, 'hsl');

	return {
		theme: themeName,
		colors: themeColors,
		colorVariables: themeColorVariables,
		settings: {
			...DEFAULT_SITE_CONFIG,
			...presetTheme?.settings || {},
		}
	};
}

/**
 * A preset's color ranges and contrast, as siteConfig holds them: what
 * choosing that preset changes.
 * @param {string|null} themeName - a preset name or a data-theme value
 * @returns {{minHue: number, maxHue: number, minSaturation: number, maxSaturation: number, minLightness: number, maxLightness: number, contrastThreshold: number}|null}
 *   null when no preset matches
 */
function presetRanges(themeName) {
	if (!findThemeEntry(PRESET_THEMES, themeName)) return null;
	const { minHue, maxHue, minSaturation, maxSaturation, minLightness, maxLightness, contrastThreshold } = getThemeDefaultSettings(themeName).settings;
	return { minHue, maxHue, minSaturation, maxSaturation, minLightness, maxLightness, contrastThreshold };
}

/**
 * With Follow site theme on, take the site theme's preset ranges, when the
 * theme is not the one last followed: a range edited by hand under the same
 * theme stays. A theme with no preset (a custom one) leaves the ranges as
 * they are.
 * Side effects: may update siteConfig and save it.
 * @returns {boolean} whether the settings changed
 */
function followSiteThemePreset() {
	const theme = siteThemeName || '';
	if (!siteConfig.followSiteTheme || siteConfig.followedTheme === theme) return false;
	Object.assign(siteConfig, presetRanges(theme) || {}, { followedTheme: theme });
	saveSiteConfig();
	return true;
}

// Convert kebab-case to camelCase
function toCamelCase(str) {
	return str.replace(/-([a-z])/g, (_, p1) => p1.toUpperCase());
}

// Parse CSS text into style object
function cssStringToStyles(cssText) {
	const styles = {};
	cssText.split(/[;\n]/).forEach(line => {
		const trimmed = line.trim();
		if (!trimmed) return;
		const idx = trimmed.indexOf(':');
		if (idx === -1) return;
		const prop = trimmed.slice(0, idx).trim();
		const value = trimmed.slice(idx + 1).trim();
		if (prop && value) {
			const camelProp = prop.replace(/-([a-z])/g, (_, l) => l.toUpperCase());
			styles[camelProp] = value;
		}
	});
	return styles;
}

// Convert style object to CSS string
function stylesToCssString(styles, separator = '; ') {
	return Object.entries(styles)
		.map(([k, v]) => `${toKebabCase(k)}: ${v}`)
		.join(separator);
}

// Map a hue value (0-360) to the effective range
// Scales input proportionally: 0 -> minHue, 360 -> maxHue
function mapHueToRange(hue, minHue, maxHue) {
	// If full range, no mapping needed
	if (minHue === 0 && maxHue === 360) return hue;

	// Normalize input to 0-1
	const t = hue / 360;

	if (minHue <= maxHue) {
		// Normal range: linearly map 0-360 to minHue-maxHue
		return minHue + t * (maxHue - minHue);
	} else {
		// Wrap-around range (e.g., 300-60 means 300->360->0->60)
		// Total range spans: (360 - minHue) + maxHue
		const range = (360 - minHue) + maxHue;
		const mapped = minHue + t * range;
		// Wrap around if we go past 360
		return mapped >= 360 ? mapped - 360 : mapped;
	}
}

// Map a value from 0-100 range proportionally to min-max range
function mapToRange(value, min, max) {
	if (min === 0 && max === 100) return value;
	const t = value / 100; // Normalize to 0-1
	return min + t * (max - min);
}

function pickBestContrastingColor(color, colorFormat = 'hsl', options = {})
{
	options = {
		themeName: siteThemeName,
		isInverted: false,
		...options
	};

	const themeVariables = getThemeColors(options.themeName, 'hsl');
	let bgColor = options.isInverted ? themeVariables.invertedBg : themeVariables.bg;
	let fgColor = options.isInverted ? themeVariables.invertedFg : themeVariables.fg;

	let bgContrast = getContrastRatio(bgColor, color);
	let fgContrast = getContrastRatio(fgColor, color);

	const useBgColor = bgContrast > fgContrast;
	const contrastColor = useBgColor ? parseColor(bgColor, colorFormat) : parseColor(fgColor, colorFormat);

	return contrastColor;
}

// Apply range mapping to a color based on config
function applyRangeMappingToColor(color, colorFormat = 'hsl', options = {})
{
	options = {
		mapHue: true,
		mapSat: true,
		mapLit: true,
		effectiveConfig: getEffectiveSiteConfig(),
		...options
	}

	if(!color) return null;

	const hsl = parseColor(color, 'hsl');
	if(!hsl) return null;

	const h = options.mapHue ? mapHueToRange(hsl.h, options.effectiveConfig.minHue ?? 0, options.effectiveConfig.maxHue ?? 360) : hsl.h;
	const s = options.mapSat ? mapToRange(hsl.s, options.effectiveConfig.minSaturation ?? 0, options.effectiveConfig.maxSaturation ?? 100) : hsl.s;
	const l = options.mapLit ? mapToRange(hsl.l, options.effectiveConfig.minLightness ?? 0, options.effectiveConfig.maxLightness ?? 100) : hsl.l;

	return parseColor({ h, s, l }, colorFormat);
}

// Function to get effective site config (applies site theme overrides)
function getEffectiveSiteConfig() {
	const config = { ...siteConfig };
	const themeColors = getThemeColors(null, 'hsl');
	const siteThemeFgHSL = parseColor(themeColors?.fg, 'hsl') || { h: 0, s: 0, l: 0 };

	if (siteConfig.useSiteThemeHue) {
		config.minHue = (siteThemeFgHSL.h - siteConfig.hueSpread + 360) % 360;
		config.maxHue = (siteThemeFgHSL.h + siteConfig.hueSpread) % 360;
	}
	if (siteConfig.useSiteThemeSat) {
		const spread = siteConfig.satSpread || 0;
		config.minSaturation = Math.max(0, siteThemeFgHSL.s - spread);
		config.maxSaturation = Math.min(100, siteThemeFgHSL.s + spread);
	}
	if (siteConfig.useSiteThemeLit) {
		const spread = siteConfig.litSpread || 0;
		config.minLightness = Math.max(0, siteThemeFgHSL.l - spread);
		config.maxLightness = Math.min(100, siteThemeFgHSL.l + spread);
	}

	return config;
}

// Hash a string to a number (for consistent color generation)
function hashString(str) {
	let hash = 0;
	const normalized = str.toLowerCase().trim();
	for (let i = 0; i < normalized.length; i++) {
		hash = normalized.charCodeAt(i) + ((hash << 5) - hash);
		hash = hash & hash; // Convert to 32-bit integer
	}
	return Math.abs(hash);
}

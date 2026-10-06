import { describe, it, expect } from 'vitest';
import './setup.js';

describe('hexToHsl', () => {
	it('converts black correctly', () => {
		const result = hexToHsl('#000000');
		expect(result).toEqual({ h: 0, s: 0, l: 0 });
	});

	it('converts white correctly', () => {
		const result = hexToHsl('#ffffff');
		expect(result).toEqual({ h: 0, s: 0, l: 100 });
	});

	it('converts pure red correctly', () => {
		const result = hexToHsl('#ff0000');
		expect(result).toEqual({ h: 0, s: 100, l: 50 });
	});

	it('converts pure green correctly', () => {
		const result = hexToHsl('#00ff00');
		expect(result).toEqual({ h: 120, s: 100, l: 50 });
	});

	it('converts pure blue correctly', () => {
		const result = hexToHsl('#0000ff');
		expect(result).toEqual({ h: 240, s: 100, l: 50 });
	});

	it('handles hex without # prefix', () => {
		const result = hexToHsl('ff0000');
		expect(result).toEqual({ h: 0, s: 100, l: 50 });
	});

	it('returns null for invalid hex', () => {
		expect(hexToHsl('#gg0000')).toBeNull();
		expect(hexToHsl('invalid')).toBeNull();
		expect(hexToHsl('#fff')).toBeNull(); // 3-char hex not supported
	});
});

describe('toKebabCase', () => {
	it('converts camelCase to kebab-case', () => {
		expect(toKebabCase('backgroundColor')).toBe('background-color');
		expect(toKebabCase('fontWeight')).toBe('font-weight');
		expect(toKebabCase('minSaturation')).toBe('min-saturation');
	});

	it('handles already lowercase strings', () => {
		expect(toKebabCase('color')).toBe('color');
	});

	it('handles multiple capitals', () => {
		expect(toKebabCase('borderTopLeftRadius')).toBe('border-top-left-radius');
	});
});

describe('toCamelCase', () => {
	it('converts kebab-case to camelCase', () => {
		expect(toCamelCase('background-color')).toBe('backgroundColor');
		expect(toCamelCase('font-weight')).toBe('fontWeight');
		expect(toCamelCase('min-saturation')).toBe('minSaturation');
	});

	it('handles already camelCase strings', () => {
		expect(toCamelCase('color')).toBe('color');
	});

	it('handles multiple hyphens', () => {
		expect(toCamelCase('border-top-left-radius')).toBe('borderTopLeftRadius');
	});

	it('handles leading hyphen', () => {
		expect(toCamelCase('-webkit-transform')).toBe('WebkitTransform');
	});
});

describe('stylesToCssString', () => {
	it('converts style object to CSS string', () => {
		const styles = { backgroundColor: 'red', fontSize: '12px' };
		const result = stylesToCssString(styles);
		expect(result).toBe('background-color: red; font-size: 12px');
	});

	it('handles custom separator', () => {
		const styles = { color: 'blue', padding: '10px' };
		const result = stylesToCssString(styles, '\n');
		expect(result).toBe('color: blue\npadding: 10px');
	});

	it('handles empty object', () => {
		expect(stylesToCssString({})).toBe('');
	});
});

describe('parseColor', () => {
	it('parses hsl string', () => {
		const result = parseColor('hsl(180, 50%, 60%)');
		expect(result).toEqual({ h: 180, s: 50, l: 60 });
	});

	it('parses hsl without % signs', () => {
		const result = parseColor('hsl(90, 75, 25)');
		expect(result).toEqual({ h: 90, s: 75, l: 25 });
	});

	it('parses hex color', () => {
		const result = parseColor('#ff0000');
		expect(result).toEqual({ h: 0, s: 100, l: 50 });
	});

	it('returns null for empty input', () => {
		expect(parseColor('')).toBeNull();
		expect(parseColor(null)).toBeNull();
		expect(parseColor(undefined)).toBeNull();
	});

	it('parses rgb color', () => {
		const result = parseColor('rgb(255, 0, 0)');
		expect(result).toEqual({ h: 0, s: 100, l: 50 });
	});

	it('returns null for unsupported formats', () => {
		expect(parseColor('red')).toBeNull();
	});
});

// Note: mapHueToRange and mapToRange tests are in range-mapping.test.js

describe('hashString', () => {
	it('returns consistent hash for same input', () => {
		const hash1 = hashString('testuser');
		const hash2 = hashString('testuser');
		expect(hash1).toBe(hash2);
	});

	it('normalizes case', () => {
		expect(hashString('TestUser')).toBe(hashString('testuser'));
		expect(hashString('TESTUSER')).toBe(hashString('testuser'));
	});

	it('trims whitespace', () => {
		expect(hashString('  testuser  ')).toBe(hashString('testuser'));
	});

	it('returns different hashes for different inputs', () => {
		const hash1 = hashString('user1');
		const hash2 = hashString('user2');
		expect(hash1).not.toBe(hash2);
	});

	it('returns positive integer', () => {
		const hash = hashString('anyuser');
		expect(hash).toBeGreaterThanOrEqual(0);
		expect(Number.isInteger(hash)).toBe(true);
	});
});

describe('parseColor edge cases', () => {
	it('handles uppercase hex colors', () => {
		const result = parseColor('#FFFFFF');
		expect(result).toEqual({ h: 0, s: 0, l: 100 });
	});

	it('handles mixed case hex colors', () => {
		const result = parseColor('#FfAa00');
		expect(result).not.toBeNull();
	});

	it('handles hsla with alpha channel', () => {
		const result = parseColor('hsla(180, 50%, 60%, 0.5)');
		expect(result).toEqual({ h: 180, s: 50, l: 60 });
	});

	it('handles rgba with alpha channel', () => {
		const result = parseColor('rgba(255, 0, 0, 0.5)');
		expect(result).toEqual({ h: 0, s: 100, l: 50 });
	});

	it('handles hsl with decimal values', () => {
		const result = parseColor('hsl(180.5, 50.5%, 60.5%)');
		expect(result).toEqual({ h: 180.5, s: 50.5, l: 60.5 });
	});

	it('returns null for empty string', () => {
		expect(parseColor('')).toBeNull();
	});

	it('returns null for null input', () => {
		expect(parseColor(null)).toBeNull();
	});

	it('returns null for undefined input', () => {
		expect(parseColor(undefined)).toBeNull();
	});

	it('returns null for 3-digit hex (not supported)', () => {
		expect(parseColor('#fff')).toBeNull();
	});

	it('converts HSL object to string format when requested', () => {
		const result = parseColor({ h: 180, s: 50, l: 60 }, 'hsl-string');
		expect(result).toMatch(/^hsl\(180/);
	});

	it('converts between formats correctly', () => {
		// HSL to RGB
		const rgb = parseColor('hsl(0, 100%, 50%)', 'rgb');
		expect(rgb.r).toBe(255);
		expect(rgb.g).toBe(0);
		expect(rgb.b).toBe(0);
	});
});

describe('getThemeColors', () => {
	it('returns an object with expected theme properties', () => {
		const colors = getThemeColors();
		expect(colors).toHaveProperty('bg');
		expect(colors).toHaveProperty('fg');
		expect(colors).toHaveProperty('fgDim');
		expect(colors).toHaveProperty('border');
		expect(colors).toHaveProperty('codeBg');
		expect(colors).toHaveProperty('invertedBg');
		expect(colors).toHaveProperty('invertedFg');
	});

	it('returns valid color values', () => {
		const colors = getThemeColors();
		// All colors should be strings (hex or hsl/rgb)
		expect(typeof colors.bg).toBe('string');
		expect(typeof colors.fg).toBe('string');
		expect(colors.bg.length).toBeGreaterThan(0);
		expect(colors.fg.length).toBeGreaterThan(0);
	});

	it('returns consistent results when called multiple times', () => {
		const colors1 = getThemeColors();
		const colors2 = getThemeColors();
		expect(colors1.bg).toBe(colors2.bg);
		expect(colors1.fg).toBe(colors2.fg);
	});

	it('accepts themeName parameter', () => {
		const colors = getThemeColors('poetry');
		expect(colors).toHaveProperty('bg');
		expect(colors).toHaveProperty('fg');
	});
});

describe('getThemeDefaultSettings for a theme stored under another id', () => {
	it('uses Top8\'s preset for data-theme="myspace"', () => {
		expect(getThemeDefaultSettings('myspace').settings.maxLightness).toBe(25);
	});

	it('selects Top8 in the preset select for data-theme="myspace"', () => {
		expect(presetOptionValue('myspace')).toBe('top8');
		expect(presetOptionValue('brutalist')).toBe('brutalist');
		expect(presetOptionValue('nonesuch')).toBe('');
	});
});

describe('getThemeColors fgMuted', () => {
	it('is the theme\'s dim text made readable on its background', () => {
		const root = document.documentElement;
		root.style.setProperty('--color-bg', '#777777');
		root.style.setProperty('--color-fg-dim', '#999999');
		try {
			const colors = getThemeColors();
			expect(getContrastRatio(colors.bg, colors.fgMuted)).toBeGreaterThanOrEqual(4.5);
		} finally {
			root.style.removeProperty('--color-bg');
			root.style.removeProperty('--color-fg-dim');
		}
	});
});

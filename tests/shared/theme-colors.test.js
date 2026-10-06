/**
 * Tests for theme-colors.js: color conversion, and finding a theme by its
 * name or site id. Resolving a theme's colors is exercised by Nick Colors'
 * tests, which run the same file.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const SOURCE = readFileSync(join(__dirname, '..', '..', 'src', 'shared', 'theme-colors.js'), 'utf8');
const { parseColor, rgbToHex, findThemeEntry, THEME_COLORS, readableTextOn, getContrastRatio } = new Function(`const UI_PREFIX = 'atmo'; const LOG_PREFIX = '[Test]';
	const localStorage = { getItem: () => null };
	${SOURCE}
	return { parseColor, rgbToHex, findThemeEntry, THEME_COLORS, readableTextOn, getContrastRatio };`)();

describe('findThemeEntry', () => {
	it('finds a theme by its name in any case, or by the site id it is stored as', () => {
		expect(findThemeEntry(THEME_COLORS, 'brutalist')).toBe(THEME_COLORS.Brutalist);
		// The site shows Top8, and stores data-theme="myspace"
		expect(findThemeEntry(THEME_COLORS, 'myspace')).toBe(THEME_COLORS.Top8);
		expect(findThemeEntry(THEME_COLORS, 'top8')).toBe(THEME_COLORS.Top8);
		expect(findThemeEntry(THEME_COLORS, 'nonesuch')).toBeNull();
	});
});

describe('rgbToHex', () => {
	it('pads, rounds and clamps channels', () => {
		expect(rgbToHex({ r: 255, g: 0, b: 15 })).toBe('#ff000f');
		expect(rgbToHex({ r: 127.6, g: -3, b: 300 })).toBe('#8000ff');
	});
});

describe('parseColor to hex', () => {
	it('converts hsl and rgb strings and objects', () => {
		expect(parseColor('hsl(0, 100%, 50%)', 'hex')).toBe('#ff0000');
		expect(parseColor('rgba(0, 128, 255, 0.5)', 'hex')).toBe('#0080ff');
		expect(parseColor({ h: 120, s: 100, l: 25 }, 'hex')).toBe('#008000');
		expect(parseColor({ r: 1, g: 2, b: 3 }, 'hex')).toBe('#010203');
	});

	it('passes 3-digit hex through to hex only: to hsl or rgb it is unreadable', () => {
		expect(parseColor('#fff', 'hex')).toBe('#fff');
		expect(parseColor('#fff', 'rgb')).toBeNull();
		expect(parseColor('#fff', 'hsl')).toBeNull();
	});

	it('returns hex input as given, and null for unreadable input', () => {
		expect(parseColor('#ABCDEF', 'hex')).toBe('#ABCDEF');
		expect(parseColor('not a color', 'hex')).toBeNull();
	});
});

describe('readableTextOn', () => {
	it.each(Object.keys(THEME_COLORS))('makes %s\'s dim text readable on its background', (name) => {
		const { bg, fgDim } = THEME_COLORS[name].colors;
		expect(getContrastRatio(bg, readableTextOn(bg, fgDim))).toBeGreaterThanOrEqual(4.5);
	});

	it('falls back to black or white when the color\'s side of a mid-gray background cannot get there', () => {
		// Stepping the lighter gray up stops at white, about 4.48:1 on #777777
		expect(getContrastRatio('#777777', readableTextOn('#777777', '#999999'))).toBeGreaterThanOrEqual(4.5);
	});

});

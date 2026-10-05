import { describe, it, expect, beforeEach } from 'vitest';
import './setup.js';

/**
 * Tests for WCAG contrast detection and color inversion
 */

describe('Contrast and Inversion', () => {
	beforeEach(() => {
		Object.keys(customNickColors).forEach(k => delete customNickColors[k]);
		Object.keys(MANUAL_OVERRIDES).forEach(k => delete MANUAL_OVERRIDES[k]);
		Object.assign(siteConfig, JSON.parse(JSON.stringify(DEFAULT_SITE_CONFIG)));
	});

	describe('WCAG helper functions', () => {
		describe('hexToRgb', () => {
			it('parses 6-digit hex colors', () => {
				expect(hexToRgb('#ff0000')).toEqual({ r: 255, g: 0, b: 0 });
				expect(hexToRgb('#00ff00')).toEqual({ r: 0, g: 255, b: 0 });
				expect(hexToRgb('#0000ff')).toEqual({ r: 0, g: 0, b: 255 });
				expect(hexToRgb('#ffffff')).toEqual({ r: 255, g: 255, b: 255 });
				expect(hexToRgb('#000000')).toEqual({ r: 0, g: 0, b: 0 });
			});

			it('handles hex without # prefix', () => {
				expect(hexToRgb('ff0000')).toEqual({ r: 255, g: 0, b: 0 });
			});

			it('returns null for invalid input', () => {
				expect(hexToRgb('#fff')).toBeNull(); // 3-digit not supported
				expect(hexToRgb('invalid')).toBeNull();
				expect(hexToRgb('')).toBeNull();
			});
		});

		describe('hslToRgb', () => {
			it('converts pure red', () => {
				const rgb = hslToRgb(0, 100, 50);
				expect(rgb.r).toBe(255);
				expect(rgb.g).toBe(0);
				expect(rgb.b).toBe(0);
			});

			it('converts pure green', () => {
				const rgb = hslToRgb(120, 100, 50);
				expect(rgb.r).toBe(0);
				expect(rgb.g).toBe(255);
				expect(rgb.b).toBe(0);
			});

			it('converts pure blue', () => {
				const rgb = hslToRgb(240, 100, 50);
				expect(rgb.r).toBe(0);
				expect(rgb.g).toBe(0);
				expect(rgb.b).toBe(255);
			});

			it('converts white', () => {
				const rgb = hslToRgb(0, 0, 100);
				expect(rgb).toEqual({ r: 255, g: 255, b: 255 });
			});

			it('converts black', () => {
				const rgb = hslToRgb(0, 0, 0);
				expect(rgb).toEqual({ r: 0, g: 0, b: 0 });
			});

			it('converts gray (no saturation)', () => {
				const rgb = hslToRgb(0, 0, 50);
				expect(rgb.r).toBe(rgb.g);
				expect(rgb.g).toBe(rgb.b);
				expect(rgb.r).toBeCloseTo(128, 0);
			});
		});

		describe('getRelativeLuminance', () => {
			it('returns 0 for black', () => {
				expect(getRelativeLuminance({ r: 0, g: 0, b: 0 })).toBe(0);
			});

			it('returns 1 for white', () => {
				expect(getRelativeLuminance({ r: 255, g: 255, b: 255 })).toBe(1);
			});

			it('returns correct luminance for red', () => {
				// Red coefficient is 0.2126
				const lum = getRelativeLuminance({ r: 255, g: 0, b: 0 });
				expect(lum).toBeCloseTo(0.2126, 2);
			});

			it('returns higher luminance for green than red', () => {
				// Human eye is most sensitive to green
				const redLum = getRelativeLuminance({ r: 255, g: 0, b: 0 });
				const greenLum = getRelativeLuminance({ r: 0, g: 255, b: 0 });
				expect(greenLum).toBeGreaterThan(redLum);
			});
		});

		describe('getContrastRatio', () => {
			it('returns 21 for black on white', () => {
				const black = { r: 0, g: 0, b: 0 };
				const white = { r: 255, g: 255, b: 255 };
				expect(getContrastRatio(black, white)).toBeCloseTo(21, 0);
			});

			it('returns 1 for same colors', () => {
				const color = { r: 128, g: 128, b: 128 };
				expect(getContrastRatio(color, color)).toBe(1);
			});

			it('is symmetric', () => {
				const color1 = { r: 100, g: 50, b: 200 };
				const color2 = { r: 200, g: 150, b: 100 };
				expect(getContrastRatio(color1, color2)).toBe(getContrastRatio(color2, color1));
			});

			it('returns ratio >= 1', () => {
				const color1 = { r: 50, g: 50, b: 50 };
				const color2 = { r: 60, g: 60, b: 60 };
				expect(getContrastRatio(color1, color2)).toBeGreaterThanOrEqual(1);
			});
		});
	});

	describe('Contrast threshold detection', () => {
		it('does not invert when contrast threshold is 0', () => {
			siteConfig.contrastThreshold = 0;
			// Force a low lightness color
			siteConfig.minLightness = 10;
			siteConfig.maxLightness = 20;

			const { styles } = generateStyles('darkuser');

			// Should not have background color (no inversion)
			expect(styles.backgroundColor).toBeUndefined();
		});

		it('inverts when WCAG contrast ratio is below threshold', () => {
			siteConfig.contrastThreshold = 4.5; // WCAG AA
			// Force very low lightness (poor contrast on dark background)
			siteConfig.minLightness = 5;
			siteConfig.maxLightness = 15;

			const { styles } = generateStyles('verydarkuser');
			const hsl = parseColor(styles.backgroundColor || styles.color);

			// Low lightness on dark bg = poor contrast ratio, should invert
			if (hsl && hsl.l <= 15) {
				expect(styles.backgroundColor).toBeDefined();
			}
		});

		it('does not invert when WCAG contrast ratio is good', () => {
			siteConfig.contrastThreshold = 4.5; // WCAG AA
			// Force high lightness (good contrast on dark background)
			siteConfig.minLightness = 70;
			siteConfig.maxLightness = 90;

			const { styles } = generateStyles('brightuser');

			// High lightness on dark bg = good contrast ratio, no inversion
			expect(styles.backgroundColor).toBeUndefined();
		});

		it('uses WCAG AA threshold (4.5) by default', () => {
			expect(DEFAULT_SITE_CONFIG.contrastThreshold).toBe(4.5);
		});
	});

	describe('Per-user invert setting', () => {
		it('forces inversion when user setting is true', () => {
			siteConfig.contrastThreshold = 0; // Disable auto-invert
			customNickColors['forceinvert'] = { invert: true };

			const { styles } = generateStyles('forceinvert');

			expect(styles.backgroundColor).toBeDefined();
			// Text color is now an HSL string (best contrasting color)
			expect(styles.color).toMatch(/^hsl\(/);
			expect(styles.padding).toBe('0 0.25em');
		});

		it('prevents inversion when user setting is false', () => {
			siteConfig.contrastThreshold = 21; // Would normally always invert
			siteConfig.minLightness = 5;
			siteConfig.maxLightness = 15;
			customNickColors['noinvert'] = { invert: false };

			const { styles } = generateStyles('noinvert');

			// Should not invert despite low contrast
			expect(styles.backgroundColor).toBeUndefined();
		});

		it('uses auto behavior when user setting is undefined', () => {
			// This test verifies that auto-contrast detection works
			// With high contrast, should NOT invert
			siteConfig.contrastThreshold = 4.5;
			siteConfig.minLightness = 70;
			siteConfig.maxLightness = 90; // Far from bg (~10)

			const { styles } = generateStyles('autocontrastuser');

			// High contrast should NOT invert (no backgroundColor)
			expect(styles.backgroundColor).toBeUndefined();
			// Color should be an HSL value, not the inversion variable
			expect(styles.color).toMatch(/^hsl\(/);
		});
	});

	describe('Inversion style properties', () => {
		it('sets backgroundColor to the original color when inverting', () => {
			customNickColors['inverttest'] = {
				color: 'hsl(200, 80%, 50%)',
				invert: true
			};

			const { styles } = generateStyles('inverttest');

			// Background should be the mapped version of the color
			expect(styles.backgroundColor).toBeDefined();
			const bgHsl = parseColor(styles.backgroundColor);
			expect(bgHsl).not.toBeNull();
		});

		it('sets text color to an HSL string when inverting', () => {
			customNickColors['fgtest'] = { invert: true };

			const { styles } = generateStyles('fgtest');

			// Text color is now an HSL string (best contrasting color)
			expect(styles.color).toMatch(/^hsl\(/);
		});

		it('adds padding when inverting', () => {
			customNickColors['paddingtest'] = { invert: true };

			const { styles } = generateStyles('paddingtest');

			expect(styles.padding).toBe('0 0.25em');
		});

		it('does not add padding when not inverting', () => {
			siteConfig.contrastThreshold = 0;
			customNickColors['nopaddingtest'] = { invert: false };

			const { styles } = generateStyles('nopaddingtest');

			expect(styles.padding).toBeUndefined();
		});
	});

	describe('Inversion with custom backgroundColor', () => {
		it('uses custom backgroundColor when set', () => {
			customNickColors['custombg'] = {
				color: 'hsl(200, 80%, 50%)',
				backgroundColor: 'hsl(0, 0%, 20%)',
				invert: true
			};

			const { styles } = generateStyles('custombg');

			// Should have a background color (may be adjusted for contrast)
			expect(styles.backgroundColor).toBeTruthy();
			// Color should be an HSL string, not a CSS variable
			expect(styles.color).toMatch(/^hsl\(/);
		});
	});

	describe('DOM application with inversion', () => {
		beforeEach(() => {
			document.body.innerHTML = '<div id="test"></div>';
		});

		it('applies inverted styles to element', () => {
			customNickColors['domtest'] = { invert: true };

			const el = document.createElement('span');
			el.textContent = 'domtest';
			applyStyles(el, 'domtest');

			expect(el.style.backgroundColor).toBeTruthy();
			// Text color is an HSL or RGB string
			expect(el.style.color).toBeTruthy();
			expect(el.style.padding).toBe('0px 0.25em'); // Browser normalizes to px
		});

		it('applies non-inverted styles to element', () => {
			siteConfig.contrastThreshold = 0;

			const el = document.createElement('span');
			el.textContent = 'normaluser';
			applyStyles(el, 'normaluser');

			expect(el.style.color).toBeTruthy();
			// With threshold 0, no contrast adjustment happens
		});

		it('records the final contrast ratio on the element', () => {
			const el = document.createElement('span');
			el.textContent = 'ratiotest';
			applyStyles(el, 'ratiotest');

			const ratio = parseFloat(el.dataset.contrastRatio);
			expect(Number.isNaN(ratio)).toBe(false);
			expect(ratio).toBeGreaterThanOrEqual(1);
			expect(ratio).toBeLessThanOrEqual(21);
		});

		it('records a contrast ratio meeting the threshold after adjustment', () => {
			siteConfig.contrastThreshold = 4.5;
			// A near-black nick that forces both inversion and lightness adjustment
			customNickColors['adjustedratio'] = { color: 'hsl(0, 0%, 5%)' };

			const el = document.createElement('span');
			el.textContent = 'adjustedratio';
			applyStyles(el, 'adjustedratio');

			expect(parseFloat(el.dataset.contrastRatio)).toBeGreaterThanOrEqual(4.5);
		});
	});

	describe('Inverted containers behavior', () => {
		beforeEach(() => {
			document.body.innerHTML = `
				<div class="profile-box-inverted">
					<span class="nick">testuser</span>
				</div>
			`;
		});

		it('applies contrast-aware styling in inverted containers', () => {
			// Force a color that has poor contrast on light backgrounds
			siteConfig.contrastThreshold = 4.5;
			siteConfig.minLightness = 70;
			siteConfig.maxLightness = 90;

			const el = document.querySelector('.nick');
			applyStyles(el, 'testuser');

			// In inverted container (light bg), light colors need inversion
			// The exact styling depends on the contrast calculation
			expect(el.style.color).toBeTruthy();
		});

		it('handles already-inverted styles in inverted containers', () => {
			// User has invert enabled, but we're in an inverted container
			// The system checks contrast against the container's actual bg (theme.fg)
			customNickColors['doubletest'] = { invert: true };

			const el = document.querySelector('.nick');
			applyStyles(el, 'doubletest');

			// applyStyles recalculates contrast for the inverted container context
			// The result depends on whether the inverted bg color contrasts well
			// with the container's light background
			expect(el.style.color).toBeTruthy();
		});
	});
});

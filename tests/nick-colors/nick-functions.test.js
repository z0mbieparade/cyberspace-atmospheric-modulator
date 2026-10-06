import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { dom } from './setup.js';

const SITE_ORIGIN = 'https://cyberspace.online';
const goToPath = (path) => dom.reconfigure({ url: SITE_ORIGIN + path });

describe('isValidUsername', () => {
	it('rejects names that would reach an object\'s prototype', () => {
		expect(isValidUsername('__proto__')).toBe(false);
		expect(isValidUsername('@constructor')).toBe(false);
		expect(isValidUsername('toString')).toBe(false);
		expect(isValidUsername('Constructor')).toBe(true);
	});

	it('accepts valid usernames', () => {
		expect(isValidUsername('testuser')).toBe(true);
		expect(isValidUsername('User123')).toBe(true);
		expect(isValidUsername('user_name')).toBe(true);
		expect(isValidUsername('user-name')).toBe(true);
		expect(isValidUsername('a')).toBe(true);
	});

	it('rejects reserved words', () => {
		expect(isValidUsername('Loading')).toBe(false);
		expect(isValidUsername('loading')).toBe(false);
		expect(isValidUsername('LOADING')).toBe(false);
	});

	it('rejects usernames with spaces', () => {
		expect(isValidUsername('user name')).toBe(false);
		expect(isValidUsername('test user')).toBe(false);
	});

	it('rejects empty strings', () => {
		expect(isValidUsername('')).toBe(false);
		expect(isValidUsername(null)).toBe(false);
		expect(isValidUsername(undefined)).toBe(false);
	});
});

describe('getNickBase', () => {
	beforeEach(() => {
		// Clear custom colors
		Object.keys(customNickColors).forEach(k => delete customNickColors[k]);
		Object.keys(MANUAL_OVERRIDES).forEach(k => delete MANUAL_OVERRIDES[k]);
	});

	it('returns consistent color for same username', () => {
		const color1 = getNickBase('testuser');
		const color2 = getNickBase('testuser');
		expect(color1).toEqual(color2);
	});

	it('returns HSL object with valid ranges', () => {
		const color = getNickBase('anyuser');
		expect(color.h).toBeGreaterThanOrEqual(0);
		expect(color.h).toBeLessThan(360);
		expect(color.s).toBeGreaterThanOrEqual(0);
		expect(color.s).toBeLessThanOrEqual(100);
		expect(color.l).toBeGreaterThanOrEqual(0);
		expect(color.l).toBeLessThanOrEqual(100);
	});

	it('uses custom color when set', () => {
		customNickColors['testuser'] = { color: 'hsl(180, 50%, 50%)' };
		const color = getNickBase('testuser');
		expect(color).toEqual({ h: 180, s: 50, l: 50 });
	});

	it('uses manual override when no custom color', () => {
		MANUAL_OVERRIDES['testuser'] = { color: 'hsl(90, 75%, 60%)' };
		const color = getNickBase('testuser');
		expect(color).toEqual({ h: 90, s: 75, l: 60 });
	});

	it('prioritizes custom color over manual override', () => {
		customNickColors['testuser'] = { color: 'hsl(180, 50%, 50%)' };
		MANUAL_OVERRIDES['testuser'] = { color: 'hsl(90, 75%, 60%)' };
		const color = getNickBase('testuser');
		expect(color).toEqual({ h: 180, s: 50, l: 50 });
	});
});

describe('applyRangeMapping', () => {
	it('maps color to configured ranges', () => {
		const base = { h: 180, s: 50, l: 50 };
		const config = {
			minHue: 0, maxHue: 360,
			minSaturation: 60, maxSaturation: 100,
			minLightness: 40, maxLightness: 80
		};
		const result = applyRangeMappingToColor(base, 'hsl', {
			effectiveConfig: config
		});

		// h unchanged (full range)
		expect(result.h).toBe(180);
		// s: 50% of 0-100 maps to 50% of 60-100 = 80
		expect(result.s).toBe(80);
		// l: 50% of 0-100 maps to 50% of 40-80 = 60
		expect(result.l).toBe(60);
	});
});

describe('generateStyles', () => {
	beforeEach(() => {
		Object.keys(customNickColors).forEach(k => delete customNickColors[k]);
		Object.keys(MANUAL_OVERRIDES).forEach(k => delete MANUAL_OVERRIDES[k]);
		Object.assign(siteConfig, DEFAULT_SITE_CONFIG);
	});

	it('returns object with color property', () => {
		const { styles } = generateStyles('testuser');
		expect(styles.color).toBeDefined();
		expect(styles.color).toMatch(/^hsl\(/);
	});

	it('applies custom background color', () => {
		customNickColors['testuser'] = {
			color: 'hsl(180, 50%, 50%)',
			backgroundColor: 'hsl(0, 0%, 20%)'
		};
		const { styles } = generateStyles('testuser');
		expect(styles.backgroundColor).toBe('hsl(0, 0%, 20%)');
	});

	it('applies font variations when enabled', () => {
		siteConfig.varyWeight = true;
		siteConfig.varyItalic = true;
		siteConfig.varyCase = true;

		const { styles } = generateStyles('testuser');
		expect(['normal', 'bold']).toContain(styles.fontWeight);
		expect(['normal', 'italic']).toContain(styles.fontStyle);
		expect(['normal', 'small-caps']).toContain(styles.fontVariant);
	});
});

describe('getHashBasedIcon', () => {
	it('returns null when icons disabled', () => {
		const config = { prependIcon: false, appendIcon: false, iconSet: '★ ♦ ♠' };
		const icon = getHashBasedIcon('testuser', { effectiveConfig: config });
		expect(icon).toBeNull();
	});

	it('returns null when iconSet empty', () => {
		const config = { prependIcon: true, appendIcon: false, iconSet: '' };
		const icon = getHashBasedIcon('testuser', { effectiveConfig: config });
		expect(icon).toBeNull();
	});

	it('returns consistent icon for same username', () => {
		const config = { prependIcon: true, appendIcon: false, iconSet: '★ ♦ ♠ ♣' };
		const icon1 = getHashBasedIcon('testuser', { effectiveConfig: config });
		const icon2 = getHashBasedIcon('testuser', { effectiveConfig: config });
		expect(icon1).toBe(icon2);
	});

	it('returns icon from iconSet', () => {
		const config = { prependIcon: true, appendIcon: false, iconSet: '★ ♦ ♠' };
		const icon = getHashBasedIcon('testuser', { effectiveConfig: config });
		expect(['★', '♦', '♠']).toContain(icon);
	});
});

// As init.js does: names the separate Nick Colors userscript colored are its own
skipUsernamesMatching(standaloneNickColorsSelector());

// As on the page: the shared finder marks the names, nick colors styles them
const findAndColor = () => {
	findUsernames();
	colorizeAll();
};

describe('DOM manipulation', () => {
	beforeEach(() => {
		document.body.innerHTML = '<div id="chat"></div>';
		Object.keys(customNickColors).forEach(k => delete customNickColors[k]);
		Object.assign(siteConfig, DEFAULT_SITE_CONFIG);
	});

	describe('applyStyles', () => {
		it('applies color to element', () => {
			const el = document.createElement('span');
			el.textContent = 'testuser';
			applyStyles(el, 'testuser');

			expect(el.style.color).toBeTruthy();
			expect(el.dataset.nickColored).toBe('true');
			expect(el.dataset.username).toBe('testuser');
		});

		it('applies prepend icon when enabled', () => {
			siteConfig.prependIcon = true;
			siteConfig.iconSet = '★';

			const el = document.createElement('span');
			el.textContent = 'testuser';
			applyStyles(el, 'testuser');

			expect(el.textContent).toContain('★');
			expect(el.dataset.iconApplied).toBe('true');
		});
	});

	describe('finding and coloring names', () => {
		it('colorizes nick elements in containers', () => {
			// colorizeAll uses CONTAINER_HINTS which includes .chat-main-content
			document.body.innerHTML = `
				<div class="chat-main-content">
					<a href="/user1">user1</a>
					<a href="/user2">user2</a>
				</div>
			`;

			findAndColor();

			const nicks = document.querySelectorAll('a[href^="/"]');
			nicks.forEach(nick => {
				expect(nick.style.color).toBeTruthy();
				expect(nick.dataset.nickColored).toBe('true');
			});
		});

		it('skips already colored elements', () => {
			document.body.innerHTML = `
				<div class="chat-main-content">
					<a href="/user1" data-nick-colored="true">user1</a>
				</div>
			`;

			const nick = document.querySelector('a');
			nick.style.color = 'red';

			findAndColor();

			// Should keep the original color
			expect(nick.style.color).toBe('red');
		});

		it('skips links outside container hints', () => {
			document.body.innerHTML = `
				<div class="other-container">
					<a href="/user1">user1</a>
				</div>
			`;

			findAndColor();

			const nick = document.querySelector('a');
			expect(nick.dataset.nickColored).toBeUndefined();
		});
	});

	describe('excluded pages', () => {
		afterEach(() => goToPath('/'));

		it('/terminal is in the exclude list', () => {
			expect(PATH_EXCLUDE).toContain('/terminal');
		});

		it('/pages is in the exclude list', () => {
			expect(PATH_EXCLUDE).toContain('/pages');
		});

		it('does not colorize nicks on /pages or its sub-paths', () => {
			for (const path of ['/pages', '/pages/some-page']) {
				goToPath(path);
				document.body.innerHTML = `
					<div class="chat-main-content">
						<a href="/user1">user1</a>
					</div>
				`;

				findAndColor();

				const nick = document.querySelector('a');
				expect(nick.dataset.nickColored).toBeUndefined();
				expect(nick.style.color).toBe('');
			}
		});

		it('does not colorize nicks on an excluded page', () => {
			goToPath('/terminal');
			document.body.innerHTML = `
				<div class="chat-main-content">
					<a href="/user1">user1</a>
				</div>
			`;

			findAndColor();

			const nick = document.querySelector('a');
			expect(nick.dataset.nickColored).toBeUndefined();
			expect(nick.style.color).toBe('');
		});

		it('does not colorize @mentions on an excluded page', () => {
			goToPath('/terminal');
			document.body.innerHTML = '<div class="chat-main-content">hey @user1</div>';

			findAndColor();

			expect(document.querySelector('[data-mention-colored]')).toBeNull();
		});

		it('colorizes again after navigating off an excluded page', () => {
			goToPath('/terminal');
			document.body.innerHTML = `
				<div class="chat-main-content">
					<a href="/user1">user1</a>
				</div>
			`;
			findAndColor();
			expect(document.querySelector('a').dataset.nickColored).toBeUndefined();

			goToPath('/chat/general');
			findAndColor();
			expect(document.querySelector('a').dataset.nickColored).toBe('true');
		});
	});

	describe('excluded hosts', () => {
		const goToUrl = (url) => dom.reconfigure({ url });
		afterEach(() => goToPath('/'));

		it('page.cyberspace.online is in the exclude list', () => {
			expect(HOST_EXCLUDE).toContain('page.cyberspace.online');
		});

		it('matches the host and its subdomains, but not lookalikes', () => {
			goToUrl('https://page.cyberspace.online/');
			expect(isHostMatch(HOST_EXCLUDE)).toBe(true);

			goToUrl('https://user.page.cyberspace.online/some/path');
			expect(isHostMatch(HOST_EXCLUDE)).toBe(true);

			goToUrl('https://mypage.cyberspace.online/');
			expect(isHostMatch(HOST_EXCLUDE)).toBe(false);

			goToUrl('https://cyberspace.online/chat/general');
			expect(isHostMatch(HOST_EXCLUDE)).toBe(false);
		});

		it('returns false for an empty or missing list', () => {
			goToUrl('https://page.cyberspace.online/');
			expect(isHostMatch([])).toBe(false);
			expect(isHostMatch(null)).toBe(false);
		});

		it('does not colorize nicks on an excluded host', () => {
			goToUrl('https://page.cyberspace.online/anything');
			document.body.innerHTML = `
				<div class="chat-main-content">
					<a href="/user1">user1</a>
				</div>
			`;

			findAndColor();

			const nick = document.querySelector('a');
			expect(nick.dataset.nickColored).toBeUndefined();
			expect(nick.style.color).toBe('');
		});
	});

	describe('mentions', () => {
		beforeEach(() => {
			// Reset style config to avoid icon pollution from other tests
			Object.assign(siteConfig, DEFAULT_SITE_CONFIG);
		});

		it('wraps @mentions in styled spans', () => {
			document.body.innerHTML = `
				<div id="chat">
					<p>Hello @testuser how are you?</p>
				</div>
			`;

			findAndColor();

			const mention = document.querySelector('[data-mention-colored]');
			expect(mention).toBeTruthy();
			expect(mention.textContent).toContain('@testuser');
			expect(mention.style.color).toBeTruthy();
		});

		it('restyles a mention in place on a refresh, rather than finding it again', () => {
			document.body.innerHTML = '<div id="chat"><p>Hello @testuser</p></div>';
			findAndColor();
			const mention = document.querySelector('[data-atmo-mention]');
			const before = mention.style.color;

			customNickColors.testuser = { color: '#ff0000' };
			colorizeAll();

			expect(document.querySelector('[data-atmo-mention]')).toBe(mention);
			expect(mention.style.color).not.toBe(before);
		});

		it('finds and colors a name again on Refresh Nick Colors, after the site reused its link', () => {
			// As boot does: color each name the finder marks
			watchUsernames(found => found.forEach(styleUsername));
			document.body.innerHTML = '<div class="chat-main-content"><a href="/alice">alice</a></div>';
			findAndColor();
			const link = document.querySelector('a');
			link.setAttribute('href', '/bob');
			link.textContent = 'bob';

			refreshNickColors();

			expect(usernameOf(link)).toBe('bob');
			expect(link.dataset.username).toBe('bob');
		});

		it('skips email addresses', () => {
			document.body.innerHTML = `
				<div id="chat">
					<p>Email me at test@example.com</p>
				</div>
			`;

			findAndColor();

			const mention = document.querySelector('[data-mention-colored]');
			expect(mention).toBeNull();
		});

		it('skips invalid usernames like Loading', () => {
			document.body.innerHTML = `
				<div id="chat">
					<p>Please wait @Loading...</p>
				</div>
			`;

			findAndColor();

			const mention = document.querySelector('[data-mention-colored]');
			expect(mention).toBeNull();
		});
	});
});

describe('hashed icons', () => {
	const config = (prependIcon, appendIcon) => ({ ...getEffectiveSiteConfig(), prependIcon, appendIcon, iconSet: '★' });
	afterEach(() => { delete customNickColors.iconuser; });

	it('adds an icon only on the side whose switch is on', () => {
		const styles = getNickBase('iconuser', 'hsl', { includeStyles: true, effectiveConfig: config(true, false) });
		expect(styles.prependIcon).toBe('★');
		expect(styles.appendIcon).toBeUndefined();
	});

	it('keeps a custom icon, and a name\'s icon turned off, as saved', () => {
		customNickColors.iconuser = { prependIcon: '♥', appendIcon: '' };
		const styles = getNickBase('iconuser', 'hsl', { includeStyles: true, effectiveConfig: config(true, true) });
		expect(styles.prependIcon).toBe('♥');
		expect(styles.appendIcon).toBe('');
	});
});

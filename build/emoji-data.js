#!/usr/bin/env node
// Writes src/emoji-picker/emoji-data.js, the emoji picker's emoji and
// symbols, from Unicode's data files, the symbols Cyberspace draws, and
// some whole Unicode blocks (EXTRA_SYMBOL_BLOCKS), with CLDR's English
// keywords for the search.
// Run by hand when a pinned version or the site's rule changes:
//
//   curl -sSfL -o /tmp/emoji-test.txt https://www.unicode.org/Public/emoji/16.0/emoji-test.txt
//   curl -sSfL -o /tmp/UnicodeData.txt https://www.unicode.org/Public/16.0.0/ucd/UnicodeData.txt
//   curl -sSfL -o /tmp/Blocks.txt https://www.unicode.org/Public/16.0.0/ucd/Blocks.txt
//   curl -sSfL -o /tmp/cldr-annotations-en.xml https://raw.githubusercontent.com/unicode-org/cldr/release-46-1/common/annotations/en.xml
//   npm run emoji-data -- /tmp
//
// Each file is checked against its pinned SHA-256 before it is read, so a
// changed or corrupted download writes nothing. To move to a new Unicode
// version, change UNICODE_VERSION, CLDR_VERSION and the hashes below, and
// the URLs above: CLDR 46 is the release for Unicode 16.
// Only what Cyberspace shows as sent is kept (src/emoji-picker/site-rule.js).

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const UNICODE_VERSION = '16.0';
const CLDR_VERSION = '46.1';
const UNICODE_FILES = {
	'emoji-test.txt': '24f0c534e86cf142e2496953e8f0e46a3e702392911eddcd29c6cced85139697',
	'UnicodeData.txt': 'ff58e5823bd095166564a006e47d111130813dcf8bf234ef79fa51a870edb48f',
	'Blocks.txt': 'f3907b395d410f1b97342292ca6bc83dd12eb4b205f2a0c48efdef99e517d7b0',
	'cldr-annotations-en.xml': 'b33e2e88ed2fb8c438c1efa9747b9d845e8d7d74ef0c32342a805c0f46fdd7ec',
};
// The symbols Cyberspace swaps emoji for, read from its v-emoji-replace
// directive: each draws in its pixel fonts. Checked in, as the site has no
// file of them to download
const SITE_SYMBOLS_FILE = path.join(__dirname, 'data', 'cyberspace-symbols.txt');
const SITE_RULE_FILE = path.join(__dirname, '..', 'src', 'emoji-picker', 'site-rule.js');
// The ASCII art tab's blocks, whole: drawing with lines, shades and dots.
// Each is left out of the Symbols tab
const ASCII_ART_BLOCKS = ['Box Drawing', 'Block Elements', 'Braille Patterns'];
// Whole Unicode blocks the Symbols tab has too: outside the ranges the site
// swaps, so they show as sent, in a system font. Chosen by the user
const EXTRA_SYMBOL_BLOCKS = ['Runic', 'Linear B Syllabary', 'Linear B Ideograms', 'Ancient Symbols', 'Ugaritic', 'Old Persian',
	'Phoenician', 'Egyptian Hieroglyphs', 'Musical Symbols', 'Mahjong Tiles', 'Domino Tiles', 'Playing Cards'];
const OUTPUT = path.join(__dirname, '..', 'src', 'emoji-picker', 'emoji-data.js');

// Skin tones are left out: the picker offers each emoji once. Component
// holds the tones and hair parts alone, which are not emoji to send
const SKIN_TONES = /[\u{1F3FB}-\u{1F3FF}]/u;
const SKIPPED_GROUPS = new Set(['Component']);

/**
 * The picker's emoji groups from emoji-test.txt: fully-qualified emoji, in
 * the file's order, which is CLDR's keyboard order.
 * @param {string} text - the file
 * @returns {{name: string, picks: Array<[string, string]>}[]} each emoji as [character, name]
 */
function parseEmojiTest(text) {
	const groups = [];
	let group = null;
	for (const line of text.split('\n')) {
		const heading = line.match(/^# group: (.+)$/);
		if (heading) {
			group = SKIPPED_GROUPS.has(heading[1]) ? null : { name: heading[1], picks: [] };
			if (group) groups.push(group);
			continue;
		}
		const entry = line.match(/^[0-9A-F ]+; fully-qualified\s+# (\S+) E[\d.]+ (.+)$/);
		if (!group || !entry || SKIN_TONES.test(entry[1])) continue;
		group.picks.push([entry[1], entry[2]]);
	}
	return groups;
}

/**
 * Character names from UnicodeData.txt, lowercased, as emoji-test.txt has
 * them: of the characters that stand on their own, so can be picks.
 * @param {string} text - the file
 * @returns {Map<number, string>} by code point
 */
function parseUnicodeNames(text) {
	const names = new Map();
	for (const line of text.split('\n')) {
		const [code, name, category] = line.split(';');
		// Ranges name themselves in angle brackets. Marks (M*) attach to the
		// character before them, so one picked alone would change it, and
		// controls, formats and spaces (C*, Z*) draw nothing: none is a pick
		if (code && name && !name.startsWith('<') && !/^[MCZ]/.test(category ?? '')) names.set(parseInt(code, 16), name.toLowerCase());
	}
	return names;
}

/**
 * Unicode's blocks from Blocks.txt, for grouping symbols.
 * @param {string} text - the file
 * @returns {{start: number, end: number, name: string}[]}
 */
function parseBlocks(text) {
	return text.split('\n')
		.map(line => line.match(/^([0-9A-F]+)\.\.([0-9A-F]+); (.+)$/))
		.filter(Boolean)
		.map(([, start, end, name]) => ({ start: parseInt(start, 16), end: parseInt(end, 16), name }));
}

/**
 * Every named character of some Unicode blocks.
 * @param {string[]} blockNames - as Blocks.txt names them
 * @param {Map<number, string>} names - from parseUnicodeNames
 * @param {{start: number, end: number, name: string}[]} blocks - from parseBlocks
 * @returns {string[]}
 * @throws {Error} for a block name Blocks.txt does not have, so a typo is not a silent gap
 */
function blockCharacters(blockNames, names, blocks) {
	return blockNames.flatMap(blockName => {
		const block = blocks.find(b => b.name === blockName);
		if (!block) throw new Error(`Blocks.txt has no block named ${blockName}. Check EXTRA_SYMBOL_BLOCKS in build/emoji-data.js.`);
		const chars = [];
		for (let code = block.start; code <= block.end; code++) if (names.has(code)) chars.push(String.fromCodePoint(code));
		return chars;
	});
}

const XML_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/**
 * CLDR's keywords from its annotations file: the words people search an
 * emoji by, as zap for ⚡, which its name does not have. Its tts lines, the
 * names read aloud, are left out: the picker has Unicode's names.
 * @param {string} text - the file
 * @returns {Map<string, string[]>} by character, as CLDR writes it: an emoji without U+FE0F
 */
function parseAnnotations(text) {
	const unescape = (value) => value.replace(/&(amp|lt|gt|quot|apos);/g, (_, entity) => XML_ENTITIES[entity]);
	const keywords = new Map();
	for (const [, cp, words] of text.matchAll(/<annotation cp="([^"]+)">([^<]+)<\/annotation>/g)) {
		keywords.set(unescape(cp), unescape(words).split('|').map(word => word.trim().toLowerCase()).filter(Boolean));
	}
	return keywords;
}

/**
 * The keywords of each pick that has any its name does not already
 * have: the search matches the name too, so a repeat would only add bytes.
 * @param {{name: string, picks: Array<[string, string]>}[]} groups - every tab's
 * @param {Map<string, string[]>} annotations - from parseAnnotations
 * @returns {Array<[string, string]>} each as [character, its keywords joined by spaces]
 */
function cldrKeywords(groups, annotations) {
	return groups.flatMap(group => group.picks).flatMap(([char, name]) => {
		const words = (annotations.get(char) ?? annotations.get(char.replace(/\uFE0F/g, '')) ?? []).filter(word => !name.toLowerCase().includes(word));
		return words.length ? [[char, words.join(' ')]] : [];
	});
}

// Unicode names each hieroglyph by its sign-list code only, as K001, so a
// search for fish would find nothing. Gardiner's sign list sorts them by
// what they show, a letter (or Aa) for each: a group per category, its
// name searchable
const GARDINER_CATEGORIES = {
	A: 'Men', B: 'Women', C: 'Deities', D: 'Parts of the body', E: 'Mammals', F: 'Parts of mammals', G: 'Birds',
	H: 'Parts of birds', I: 'Reptiles and amphibians', K: 'Fish', L: 'Insects and small animals', M: 'Trees and plants',
	N: 'Sky, earth and water', NL: 'Lower Egypt nomes', NU: 'Upper Egypt nomes', O: 'Buildings', P: 'Ships', Q: 'Furniture',
	R: 'Temple things', S: 'Crowns and clothing', T: 'Weapons and tools', U: 'Farming and crafts', V: 'Rope and baskets',
	W: 'Vessels', X: 'Loaves', Y: 'Writing and music', Z: 'Strokes and shapes', Aa: 'Unclassified',
};

/**
 * Where a symbol goes, and what it is called there: its Unicode block and
 * name, or for a hieroglyph, its Gardiner category and a shorter name.
 * @param {string} block - its Unicode block
 * @param {string} name - its Unicode name, lowercased
 * @returns {{group: string, name: string}}
 */
function symbolPlace(block, name) {
	const sign = block === 'Egyptian Hieroglyphs' && name.match(/^egyptian hieroglyph ([a-z]+)(\d.*)$/);
	if (!sign) return { group: block, name };
	const letters = sign[1].length > 1 && sign[1] !== 'aa' ? sign[1].toUpperCase() : sign[1][0].toUpperCase() + sign[1].slice(1);
	const category = GARDINER_CATEGORIES[letters] ?? 'Other signs';
	return { group: `Hieroglyphs: ${category}`, name: `${category.toLowerCase()} hieroglyph ${letters}${sign[2].toUpperCase()}` };
}

/**
 * The Symbols tab: the site's symbols and the whole blocks, named and
 * grouped by Unicode block in code point order, hieroglyphs by what they
 * show (symbolPlace), leaving out any the site would swap, the emoji list
 * has, or Unicode gives no pickable name.
 * @param {string[]} symbols - single characters
 * @param {Map<number, string>} names - from parseUnicodeNames
 * @param {{start: number, end: number, name: string}[]} blocks - from parseBlocks
 * @param {function(string): boolean} keeps - siteShowsAsSent
 * @param {Set<string>} emoji - every emoji kept, without U+FE0F, so none
 *   shows twice: ♥ is left out for ♥️
 * @returns {{name: string, picks: Array<[string, string]>}[]}
 */
function symbolGroups(symbols, names, blocks, keeps, emoji) {
	const groups = new Map();
	const unique = [...new Set(symbols)].filter(char => keeps(char) && !emoji.has(char) && names.has(char.codePointAt(0)));
	unique.sort((a, b) => a.codePointAt(0) - b.codePointAt(0));
	for (const char of unique) {
		const code = char.codePointAt(0);
		const block = blocks.find(b => code >= b.start && code <= b.end)?.name ?? 'Other';
		const place = symbolPlace(block, names.get(code));
		if (!groups.has(place.group)) groups.set(place.group, []);
		groups.get(place.group).push([char, place.name]);
	}
	return Array.from(groups, ([name, picks]) => ({ name, picks }));
}

/**
 * One list as source: each group's picks as one string, "char name" pairs
 * joined by "|", so the bundle stays small and needs no parsing beyond a split.
 * @param {string} constant - the list's name in the bundle
 * @param {{name: string, picks: Array<[string, string]>}[]} groups
 * @returns {string} JavaScript source
 */
function groupsSource(constant, groups) {
	return [
		`const ${constant} = [`,
		...groups.map(group => `\t{ name: ${JSON.stringify(group.name)}, picks: ${JSON.stringify(group.picks.map(([char, name]) => `${char} ${name}`).join('|'))} },`),
		'];',
	].join('\n');
}

/**
 * The generated file.
 * @param {{name: string, picks: Array<[string, string]>}[]} emoji
 * @param {{name: string, picks: Array<[string, string]>}[]} symbols
 * @param {{name: string, picks: Array<[string, string]>}[]} asciiArt - the ASCII art tab's
 * @param {Array<[string, string]>} keywords - from cldrKeywords
 * @returns {string} JavaScript source
 */
function emojiDataSource(emoji, symbols, asciiArt, keywords) {
	return [
		'// =====================================================',
		'// EMOJI PICKER: THE EMOJI, SYMBOLS AND ASCII ART',
		'// =====================================================',
		`// Generated by build/emoji-data.js from Unicode ${UNICODE_VERSION}, the symbols Cyberspace`,
		'// draws, and whole Unicode blocks (EXTRA_SYMBOL_BLOCKS, ASCII_ART_BLOCKS). Do not edit: run it',
		'// again. Each group\'s picks are "character name" pairs joined by |. Only',
		'// what Cyberspace shows as sent (site-rule.js).',
		`// CLDR_KEYWORDS, from CLDR ${CLDR_VERSION}, are "character keywords" pairs joined by |: what`,
		'// the search matches besides a pick\'s name, for the picks that have any.',
		'',
		groupsSource('EMOJI_GROUPS', emoji),
		'',
		groupsSource('SYMBOL_GROUPS', symbols),
		'',
		groupsSource('ASCII_ART_GROUPS', asciiArt),
		'',
		`const CLDR_KEYWORDS = ${JSON.stringify(keywords.map(([char, words]) => `${char} ${words}`).join('|'))};`,
		'',
	].join('\n');
}

/**
 * siteShowsAsSent, from the picker's own file, so the generator and the
 * bundle apply one rule.
 * @returns {function(string): boolean}
 */
function loadSiteRule() {
	return new Function(`${fs.readFileSync(SITE_RULE_FILE, 'utf8')}; return siteShowsAsSent;`)();
}

/**
 * A pinned Unicode file, checked.
 * @param {string} dir - where the downloads are
 * @param {string} name - a key of UNICODE_FILES
 * @returns {string} its text
 * @throws {Error} when its SHA-256 is not the pinned one, saying what to do
 */
function readPinned(dir, name) {
	const bytes = fs.readFileSync(path.join(dir, name));
	const hash = crypto.createHash('sha256').update(bytes).digest('hex');
	if (hash !== UNICODE_FILES[name]) {
		throw new Error(`${name} is not the pinned file: its SHA-256 is ${hash}. Download it again with the commands in build/emoji-data.js.`);
	}
	return bytes.toString('utf8');
}

if (require.main === module) {
	const dir = process.argv[2];
	if (!dir) {
		console.error('Usage: npm run emoji-data -- <folder with emoji-test.txt, UnicodeData.txt, Blocks.txt and cldr-annotations-en.xml>. The header of build/emoji-data.js has the download commands.');
		process.exit(1);
	}
	try {
		const keeps = loadSiteRule();
		const emoji = parseEmojiTest(readPinned(dir, 'emoji-test.txt'))
			.map(group => ({ name: group.name, picks: group.picks.filter(([char]) => keeps(char)) }))
			.filter(group => group.picks.length);
		// Without U+FE0F, the emoji form's selector: the emoji ♥️ stands for the
		// symbol ♥, so the symbol is left out
		const kept = new Set(emoji.flatMap(group => group.picks.map(([char]) => char.replace(/\uFE0F/g, ''))));
		const names = parseUnicodeNames(readPinned(dir, 'UnicodeData.txt'));
		const blocks = parseBlocks(readPinned(dir, 'Blocks.txt'));
		const siteSymbols = Array.from(fs.readFileSync(SITE_SYMBOLS_FILE, 'utf8').trim());
		const allSymbols = symbolGroups([...siteSymbols, ...blockCharacters([...EXTRA_SYMBOL_BLOCKS, ...ASCII_ART_BLOCKS], names, blocks)], names, blocks, keeps, kept);
		const symbols = allSymbols.filter(group => !ASCII_ART_BLOCKS.includes(group.name));
		const asciiArt = allSymbols.filter(group => ASCII_ART_BLOCKS.includes(group.name));
		fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
		const keywords = cldrKeywords([...emoji, ...symbols, ...asciiArt], parseAnnotations(readPinned(dir, 'cldr-annotations-en.xml')));
		fs.writeFileSync(OUTPUT, emojiDataSource(emoji, symbols, asciiArt, keywords));
		const count = (groups) => groups.reduce((sum, group) => sum + group.picks.length, 0);
		console.log(`Wrote ${count(emoji)} emoji, ${count(symbols)} symbols and ${count(asciiArt)} ASCII art characters, ${keywords.length} with keywords, to ${path.relative(process.cwd(), OUTPUT)}`);
	} catch (e) {
		console.error(e.message);
		process.exit(1);
	}
}

module.exports = { parseEmojiTest, parseUnicodeNames, parseBlocks, blockCharacters, symbolPlace, symbolGroups, parseAnnotations, cldrKeywords, emojiDataSource };

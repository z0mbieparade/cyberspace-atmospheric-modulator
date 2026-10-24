/**
 * The emoji list generator (build/emoji-data.js): what it keeps from
 * Unicode's emoji-test.txt, and the source it writes.
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { parseEmojiTest, parseUnicodeNames, parseBlocks, blockCharacters, symbolPlace, symbolGroups, parseAnnotations, cldrKeywords, emojiDataSource } = require('../build/emoji-data.js');

// A cut of emoji-test.txt, in its own layout
const SAMPLE = [
	'# group: Smileys & Emotion',
	'# subgroup: face-smiling',
	'1F600                                                  ; fully-qualified     # 😀 E1.0 grinning face',
	'263A                                                   ; unqualified         # ☺ E0.6 smiling face',
	'# group: People & Body',
	'1F44B                                                  ; fully-qualified     # 👋 E0.6 waving hand',
	'1F44B 1F3FD                                            ; fully-qualified     # 👋🏽 E1.0 waving hand: medium skin tone',
	'# group: Component',
	'1F3FB                                                  ; component           # 🏻 E1.0 light skin tone',
	'1F9B0                                                  ; fully-qualified     # 🦰 E11.0 red hair',
	'# group: Flags',
	'1F1EF 1F1F5                                            ; fully-qualified     # 🇯🇵 E0.6 flag: Japan',
].join('\n');

describe('the emoji list generator', () => {
	it('keeps fully-qualified emoji by group, without skin tones or the Component group', () => {
		expect(parseEmojiTest(SAMPLE)).toEqual([
			{ name: 'Smileys & Emotion', picks: [['😀', 'grinning face']] },
			{ name: 'People & Body', picks: [['👋', 'waving hand']] },
			{ name: 'Flags', picks: [['🇯🇵', 'flag: Japan']] },
		]);
	});

	it('names and groups symbols by Unicode block, in code point order, once each', () => {
		const names = parseUnicodeNames('2190;LEFTWARDS ARROW;Sm;0;ON;;;;;N;;;;;\n2588;FULL BLOCK;So;0;ON;;;;;N;;;;;\n2591;LIGHT SHADE;So;0;ON;;;;;N;;;;;\n2605;BLACK STAR;So;0;ON;;;;;N;;;;;\n3400;<CJK Ideograph Extension A, First>;Lo;0;L;;;;;N;;;;;');
		const blocks = parseBlocks('# Blocks\n2190..21FF; Arrows\n2580..259F; Block Elements\n2600..26FF; Miscellaneous Symbols');
		// ★ stands for one the site swaps; ← for one the emoji list has
		const keeps = (char) => char !== '★';
		expect(symbolGroups(['░', '█', '░', '★', '←'], names, blocks, keeps, new Set(['←']))).toEqual([
			{ name: 'Block Elements', picks: [['█', 'full block'], ['░', 'light shade']] },
		]);
	});

	it('groups hieroglyphs by what they show, as Unicode names them only by code', () => {
		expect(symbolPlace('Egyptian Hieroglyphs', 'egyptian hieroglyph k001')).toEqual({ group: 'Hieroglyphs: Fish', name: 'fish hieroglyph K001' });
		expect(symbolPlace('Egyptian Hieroglyphs', 'egyptian hieroglyph aa001')).toEqual({ group: 'Hieroglyphs: Unclassified', name: 'unclassified hieroglyph Aa001' });
		expect(symbolPlace('Egyptian Hieroglyphs', 'egyptian hieroglyph nl001')).toEqual({ group: 'Hieroglyphs: Lower Egypt nomes', name: 'lower egypt nomes hieroglyph NL001' });
		expect(symbolPlace('Block Elements', 'full block')).toEqual({ group: 'Block Elements', name: 'full block' });
	});

	it('takes every named character of a whole block that stands on its own, and refuses a block it does not know', () => {
		// A combining mark would change the character before it, and a format control draws nothing
		const names = parseUnicodeNames('2588;FULL BLOCK;So;;;;;;;N;;;;;\n2591;LIGHT SHADE;So;;;;;;;N;;;;;\n2594;COMBINING TEST MARK;Mn;;;;;;;N;;;;;\n2595;TEST FORMAT;Cf;;;;;;;N;;;;;');
		const blocks = parseBlocks('2580..259F; Block Elements');
		expect(blockCharacters(['Block Elements'], names, blocks)).toEqual(['█', '░']);
		expect(() => blockCharacters(['Block Elementz'], names, blocks)).toThrow('Block Elementz');
	});

	it('keeps CLDR\'s keywords a pick\'s name lacks, found with or without U+FE0F', () => {
		const annotations = parseAnnotations([
			'<annotation cp="⚡">danger | electric | high voltage | voltage | Zap</annotation>',
			'<annotation cp="⚡" type="tts">high voltage</annotation>',
			'<annotation cp="♥">card | game | heart suit</annotation>',
			'<annotation cp="🆒">COOL button | cool</annotation>',
			'<annotation cp="&amp;">ampersand | and</annotation>',
		].join('\n'));
		expect(annotations.get('⚡')).toEqual(['danger', 'electric', 'high voltage', 'voltage', 'zap']);
		expect(annotations.get('&')).toEqual(['ampersand', 'and']);
		const groups = [{ name: 'Symbols', picks: [['⚡', 'high voltage'], ['♥️', 'heart suit'], ['🆒', 'COOL button'], ['ᚠ', 'runic letter fehu']] }];
		expect(cldrKeywords(groups, annotations)).toEqual([['⚡', 'danger electric zap'], ['♥️', 'card game']]);
	});

	it('writes lists the picker reads back as they were', () => {
		const source = emojiDataSource(parseEmojiTest(SAMPLE), [{ name: 'Runic', picks: [['ᚠ', 'runic letter fehu feoh fe f']] }], [{ name: 'Block Elements', picks: [['█', 'full block']] }], [['😀', 'face grin'], ['👋', 'hello']]);
		// The file's four statements, run alone
		const { emoji, symbols, asciiArt, keywords } = new Function(`${source}; return { emoji: EMOJI_GROUPS, symbols: SYMBOL_GROUPS, asciiArt: ASCII_ART_GROUPS, keywords: CLDR_KEYWORDS };`)();
		expect(emoji).toEqual([
			{ name: 'Smileys & Emotion', picks: '😀 grinning face' },
			{ name: 'People & Body', picks: '👋 waving hand' },
			{ name: 'Flags', picks: '🇯🇵 flag: Japan' },
		]);
		expect(symbols).toEqual([{ name: 'Runic', picks: 'ᚠ runic letter fehu feoh fe f' }]);
		expect(asciiArt).toEqual([{ name: 'Block Elements', picks: '█ full block' }]);
		expect(keywords).toBe('😀 face grin|👋 hello');
	});
});

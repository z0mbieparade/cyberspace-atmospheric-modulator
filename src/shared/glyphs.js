// =====================================================
// GLYPHS
// =====================================================
// Text as a reader sees it: single characters, so an emoji built from
// several code points, or a letter under its marks, stays whole.

/**
 * What a reader sees as single characters in text, one at a time, so an
 * emoji built from several code points stays whole.
 * @param {string} text
 * @returns {Iterable<string>} read as far as the caller goes, no further
 */
function* eachGlyph(text) {
	if (typeof Intl.Segmenter !== 'function') {
		yield* text;
		return;
	}
	for (const part of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)) yield part.segment;
}

/**
 * Text split into what a reader sees as single characters (eachGlyph).
 * @param {string} text
 * @returns {string[]}
 */
function splitGlyphs(text) {
	return Array.from(eachGlyph(text));
}

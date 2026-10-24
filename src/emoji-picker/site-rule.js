// =====================================================
// EMOJI PICKER: WHAT CYBERSPACE SHOWS AS SENT
// =====================================================
// Cyberspace keeps its chat pixel-style: as it shows a message (its
// v-emoji-replace directive), each character in these ranges becomes a
// random symbol, unless it is one of a few it keeps. A few sequences are
// replaced whole. The message is saved as sent; only what shows changes,
// on every redraw. The picker offers only what shows as sent.
// Read from the site's code on 2026-10-22. If the site changes it, change
// these, then run the generator again (build/emoji-data.js reads this file).

const SITE_REPLACED_RANGES = /[\u{1F300}-\u{1F9FF}\u{1FA00}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E0}-\u{1F1FF}]/u;
const SITE_KEPT = new Set(['☆', '✧', '✿', '❁', '♥', '♡', '♪', '☞', '◕', '◉', '☉', '⊙', '◐', '◑', '◣', '◢',
	'┻', '━', '┬', '─', '┼', '╯', '╭', '╮', '︵', '⚡', '■', '︻', '╦', '╤', '▽', '▼']);
const SITE_REPLACED_SEQUENCES = /❄️|⬛|↔️|↕️|↪️|↩️|⬅️|➡️|⬆️|⬇️|0️⃣|1️⃣|2️⃣|3️⃣|4️⃣|5️⃣|6️⃣|7️⃣|8️⃣|9️⃣|🔟/u;
// Its chat also reads _ as italics and * as bold, and a backslash does not
// escape them: ¯\_(ツ)_/¯ shows as ¯\(ツ)/¯, and (*^‿^*) loses its *. One
// alone shows, but pairs with any other in the message. Seen in chat on
// 2026-10-23.
const SITE_MARKUP = /[_*]/;

/**
 * Whether Cyberspace shows text as it was sent: no character of it is one
 * the site swaps for a random symbol or reads as markup.
 * @param {string} text
 * @returns {boolean}
 */
function siteShowsAsSent(text) {
	return !SITE_REPLACED_SEQUENCES.test(text) && !SITE_MARKUP.test(text)
		&& Array.from(text).every(char => !SITE_REPLACED_RANGES.test(char) || SITE_KEPT.has(char));
}

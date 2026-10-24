/**
 * Emoji picker tests (src/emoji-picker/): the button after the chat's
 * message input, in the ASCII art window, and in the site's editor on /write
 * and in a post's reply box, the dialog's tabs, and what a pick puts in the box.
 */

import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { dom } from './setup.js';

const doc = dom.window.document;
const feature = () => FEATURES.find(f => f.key === 'emojiPicker');
// The MutationObserver reports after the current task
const settle = () => new Promise(resolve => dom.window.setTimeout(resolve, 0));

/**
 * The site's message form, as cIRC draws it: the input, the image button,
 * then the send button.
 * @returns {HTMLInputElement} the input
 */
function addChatForm() {
	const holder = doc.createElement('div');
	holder.className = 'atmo-test-chat p-2 relative';
	holder.innerHTML = `
		<form class="flex gap-2">
			<div class="flex-1 relative"><input type="text" placeholder="Type a message..." maxlength="2048" class="w-full"></div>
			<button type="button" aria-label="Attach image" class="px-4 py-2 border">img</button>
			<button type="submit" class="px-4 py-2 border text-fg disabled:opacity-50 disabled:hover:text-fg" disabled>send</button>
		</form>`;
	doc.querySelector('#__nuxt').appendChild(holder);
	return holder.querySelector('input');
}
const dialog = () => doc.querySelector('.atmo-dialog');
const picks = (panel) => Array.from(panel.querySelectorAll('[data-pick]')).filter(button => !button.closest('[hidden]'));
const panelFor = (name) => Array.from(dialog().querySelectorAll('[role="tabpanel"]'))
	.find(panel => doc.getElementById(panel.getAttribute('aria-labelledby')).textContent === name);
/**
 * Show one of the dialog's tabs: it opens on the one used last.
 * @param {string} name - a tab's label, as Emoji or ASCII art
 */
const showTab = (name) => Array.from(dialog().querySelectorAll('[role="tab"]')).find(tab => tab.textContent === name).click();
const key = (el, k) => el.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: k, bubbles: true }));

beforeAll(() => {
	// Set, not assumed from the default: these tests need it on either way
	applySettings({ ...featureConfig, emojiPicker: true });
	startFeatures();
});

afterEach(() => {
	vi.restoreAllMocks();
	doc.querySelectorAll('.atmo-test-chat, .atmo-dialog-overlay').forEach(el => el.remove());
	feature().resetSettings(true);
	applySettings({ ...featureConfig, emojiPicker: true, emojiPickerNsfw: false });
});

describe('the emoji button', () => {
	// First in the file: the picker keeps each box's last tab for the page,
	// and every later test shares the page
	it('opens the chat on Emoticons, the first tab, and Emoji last', async () => {
		addChatForm();
		await vi.waitFor(() => expect(doc.querySelector('.atmo-emoji-button')).not.toBeNull());
		doc.querySelector('.atmo-emoji-button').click();
		const tabs = Array.from(dialog().querySelectorAll('[role="tab"]'));
		expect(tabs.map(tab => tab.textContent)).toEqual(['Emoticons', 'Kaomoji', 'Symbols', 'ASCII art', 'Emoji']);
		expect(tabs[0].getAttribute('aria-selected')).toBe('true');
		// The tabs stand in for the title, which still names the dialog
		const header = dialog().querySelector('.atmo-dialog-header');
		expect(header.querySelector('[role="tablist"]')).not.toBeNull();
		const title = doc.getElementById(dialog().getAttribute('aria-labelledby'));
		expect([title.textContent, title.classList.contains('atmo-sr-only')]).toEqual(['Emoji', true]);
	});

	it('sits after the message input, before the image and send buttons, in the send button\'s look', async () => {
		const input = addChatForm();
		await vi.waitFor(() => expect(doc.querySelector('.atmo-emoji-button')).not.toBeNull());
		const parts = Array.from(input.form.children, child => child.getAttribute('aria-label') ?? child.textContent.trim());
		expect(parts).toEqual(['', 'Insert emoji, a symbol, ASCII art, kaomoji or an emoticon', 'Attach image', 'send']);
		const button = doc.querySelector('.atmo-emoji-button');
		expect(button.type).toBe('button');
		// The site's classes, without the disabled look the empty send button has
		expect(button.className).toBe('px-4 py-2 border text-fg atmo-emoji-button');
	});

	it('goes away when switched off, and comes back on', async () => {
		addChatForm();
		await vi.waitFor(() => expect(doc.querySelectorAll('.atmo-emoji-button')).toHaveLength(1));
		applySettings({ ...featureConfig, emojiPicker: false });
		feature().onSwitch(false);
		expect(doc.querySelectorAll('.atmo-emoji-button')).toHaveLength(0);
		applySettings({ ...featureConfig, emojiPicker: true });
		feature().onSwitch(true);
		expect(doc.querySelectorAll('.atmo-emoji-button')).toHaveLength(1);
	});

	it('skips an input that belongs to another form, and still serves the real one', async () => {
		const stray = addChatForm();
		stray.form.id = 'atmo-test-elsewhere';
		const other = doc.createElement('form');
		other.id = 'atmo-test-other';
		other.className = 'atmo-test-chat';
		other.innerHTML = '<button type="submit">go</button>';
		doc.body.appendChild(other);
		stray.setAttribute('form', 'atmo-test-other');
		const real = addChatForm();
		await vi.waitFor(() => expect(real.form.querySelector('.atmo-emoji-button')).not.toBeNull());
		expect(doc.querySelectorAll('.atmo-emoji-button')).toHaveLength(1);
	});

	it('leaves a form with no message input alone', async () => {
		const input = addChatForm();
		input.placeholder = 'Search users';
		await settle();
		expect(doc.querySelector('.atmo-emoji-button')).toBeNull();
	});
});

describe('the ASCII art window', () => {
	/**
	 * The window /art opens, as the site draws it.
	 * @returns {HTMLTextAreaElement} its art box
	 */
	function addArtWindow() {
		const frame = doc.createElement('div');
		frame.className = 'atmo-test-chat dos-frame text-fg';
		frame.innerHTML = `
			<h2>ASCII Art</h2>
			<div class="mb-2"><textarea placeholder="Paste your ASCII art here..." rows="10"></textarea></div>
			<div class="flex justify-end"><div class="inline-flex divide-x border border-border rounded-md">
				<button type="button" class="px-3 py-1 bg-code-bg text-fg-dim text-sm"> Cancel </button>
				<button type="button" disabled class="px-3 py-1 bg-code-bg text-fg disabled:opacity-50 text-sm"> Send </button>
			</div></div>`;
		doc.querySelector('#__nuxt').appendChild(frame);
		return frame.querySelector('textarea');
	}

	it('puts the button before Cancel and Send, with a border of its own, and fills the art box', async () => {
		const art = addArtWindow();
		const frame = art.closest('.dos-frame');
		await vi.waitFor(() => expect(frame.querySelector('.atmo-emoji-button')).not.toBeNull());
		const button = frame.querySelector('.atmo-emoji-button');
		expect(button.nextElementSibling.querySelector('button').textContent.trim()).toBe('Cancel');
		expect(button.className).toBe('px-3 py-1 bg-code-bg text-sm text-fg border border-border rounded-md atmo-emoji-button-apart atmo-emoji-button');
		art.value = 'ab\ncd';
		art.setSelectionRange(3, 3);
		button.click();
		// The art window starts on its own tab
		expect(dialog().querySelector('[role="tab"][aria-selected="true"]').textContent).toBe('ASCII art');
		picks(panelFor('ASCII art')).find(pick => pick.dataset.pick === '░').click();
		expect([art.value, doc.activeElement]).toEqual(['ab\n░cd', art]);
	});

	it('puts a pick in the box whose button was used, with the chat open too', async () => {
		const input = addChatForm();
		const art = addArtWindow();
		await vi.waitFor(() => expect(doc.querySelectorAll('.atmo-emoji-button')).toHaveLength(2));
		art.closest('.dos-frame').querySelector('.atmo-emoji-button').click();
		picks(panelFor('ASCII art')).find(pick => pick.dataset.pick === '█').click();
		input.form.querySelector('.atmo-emoji-button').click();
		showTab('Emoji');
		picks(panelFor('Emoji')).find(pick => pick.dataset.pick === '⭐').click();
		expect([art.value, input.value]).toEqual(['█', '⭐']);
		// Each remembers its own tab: the art window's is still ASCII art
		art.closest('.dos-frame').querySelector('.atmo-emoji-button').click();
		expect(dialog().querySelector('[role="tab"][aria-selected="true"]').textContent).toBe('ASCII art');
	});

	it('gives a redrawn art box a button of its own, and drops the old one', async () => {
		const art = addArtWindow();
		const frame = art.closest('.dos-frame');
		await vi.waitFor(() => expect(frame.querySelector('.atmo-emoji-button')).not.toBeNull());
		const old = frame.querySelector('.atmo-emoji-button');
		const redrawn = doc.createElement('textarea');
		redrawn.placeholder = 'Paste your ASCII art here...';
		art.replaceWith(redrawn);
		await vi.waitFor(() => expect(old.isConnected).toBe(false));
		expect(frame.querySelectorAll('.atmo-emoji-button')).toHaveLength(1);
		frame.querySelector('.atmo-emoji-button').click();
		picks(panelFor('ASCII art')).find(pick => pick.dataset.pick === '▒').click();
		expect(redrawn.value).toBe('▒');
	});

	it('takes its button away when the window closes', async () => {
		const art = addArtWindow();
		await vi.waitFor(() => expect(doc.querySelector('.atmo-emoji-button')).not.toBeNull());
		art.closest('.dos-frame').remove();
		addChatForm();
		await vi.waitFor(() => expect(doc.querySelectorAll('.atmo-emoji-button')).toHaveLength(1));
		expect(doc.querySelector('.atmo-emoji-button').closest('form')).not.toBeNull();
	});
});

describe('the site\'s editor, on /write and in replies', () => {
	/**
	 * The site's editor, as /write and a post's reply box draw it, with a
	 * stand-in for ProseMirror's paste handling: it takes the text at its
	 * selection.
	 * @param {boolean} [takesPaste=true] - false for an editor that ignores a paste
	 * @param {string} [wrapperClass='tiptap-wrapper'] - the box around it:
	 *   /write's, or a post reply's 'terminal-box p-4'
	 * @returns {HTMLElement} the editor's editable area
	 */
	function addEditor(takesPaste = true, wrapperClass = 'tiptap-wrapper') {
		const wrapper = doc.createElement('div');
		wrapper.className = 'atmo-test-chat ' + wrapperClass;
		wrapper.innerHTML = `
			<div data-v-a1040f20="" class="editor">
				<div data-v-a1040f20="" class="menu-bar"><div data-v-a1040f20="" class="button-group">
					<button data-v-a1040f20="" class="" type="button" title="Bold">B</button>
					<button data-v-a1040f20="" class="" type="button" title="Emoticon">:)</button>
				</div></div>
				<div data-v-a1040f20="" class="editor-wrapper"><div contenteditable="true" class="tiptap ProseMirror"><p>hello world</p></div></div>
			</div>`;
		doc.querySelector('#__nuxt').appendChild(wrapper);
		const editor = wrapper.querySelector('.ProseMirror');
		if (takesPaste) {
			editor.addEventListener('paste', (e) => {
				e.preventDefault();
				const range = dom.window.getSelection().getRangeAt(0);
				range.deleteContents();
				range.insertNode(doc.createTextNode(e.clipboardData.getData('text/plain')));
			});
		}
		return editor;
	}
	const siteEmoticon = (editor) => editor.closest('.editor').querySelector('button[title="Emoticon"]');
	// Hidden by its own style: the site's toolbar styles outweigh the hidden attribute
	const siteHidden = (editor) => siteEmoticon(editor).style.getPropertyValue('display') === 'none'
		&& siteEmoticon(editor).style.getPropertyPriority('display') === 'important';

	it('stands in for the Emoticon button, in its look, and pastes a pick at the cursor', async () => {
		const editor = addEditor();
		await vi.waitFor(() => expect(editor.closest('.editor').querySelector('.atmo-emoji-button')).not.toBeNull());
		const button = editor.closest('.editor').querySelector('.atmo-emoji-button');
		expect([siteHidden(editor), siteEmoticon(editor).nextElementSibling, button.hasAttribute('data-v-a1040f20')]).toEqual([true, button, true]);
		// The cursor after "hello", as the pointer goes down on the button
		const text = editor.querySelector('p').firstChild;
		const range = doc.createRange();
		range.setStart(text, 5);
		range.collapse(true);
		dom.window.getSelection().removeAllRanges();
		dom.window.getSelection().addRange(range);
		button.dispatchEvent(new dom.window.Event('pointerdown', { bubbles: true }));
		dom.window.getSelection().removeAllRanges();
		button.click();
		// The first editor test to open the picker: it opens on Kaomoji
		expect(dialog().querySelector('[role="tab"][aria-selected="true"]').textContent).toBe('Kaomoji');
		showTab('Emoji');
		picks(panelFor('Emoji')).find(pick => pick.dataset.pick === '⭐').click();
		expect(editor.textContent).toBe('hello⭐ world');
		expect(dialog()).toBeNull();
	});

	it('stands in for the Emoticon button in a post\'s reply box too', async () => {
		const editor = addEditor(true, 'terminal-box p-4');
		await vi.waitFor(() => expect(editor.closest('.editor').querySelector('.atmo-emoji-button')).not.toBeNull());
		expect([siteHidden(editor), siteEmoticon(editor).nextElementSibling.classList.contains('atmo-emoji-button')]).toEqual([true, true]);
	});

	it('says so when the editor does not take a pick, and stays open', async () => {
		const editor = addEditor(false);
		await vi.waitFor(() => expect(editor.closest('.editor').querySelector('.atmo-emoji-button')).not.toBeNull());
		editor.closest('.editor').querySelector('.atmo-emoji-button').click();
		showTab('Emoji');
		picks(panelFor('Emoji')).find(pick => pick.dataset.pick === '⭐').click();
		expect(dialog().querySelector('[role="status"]').textContent).toContain('The editor did not take it');
		expect(editor.textContent).toBe('hello world');
	});

	it('gives the Emoticon button back when switched off', async () => {
		const editor = addEditor();
		await vi.waitFor(() => expect(siteHidden(editor)).toBe(true));
		applySettings({ ...featureConfig, emojiPicker: false });
		feature().onSwitch(false);
		expect([siteHidden(editor), editor.closest('.editor').querySelector('.atmo-emoji-button')]).toEqual([false, null]);
		applySettings({ ...featureConfig, emojiPicker: true });
		feature().onSwitch(true);
		expect(siteHidden(editor)).toBe(true);
	});

	it('hides the Emoticon button again when the site shows it again', async () => {
		const editor = addEditor();
		await vi.waitFor(() => expect(siteHidden(editor)).toBe(true));
		siteEmoticon(editor).style.removeProperty('display');
		await vi.waitFor(() => expect(siteHidden(editor)).toBe(true));
		expect(editor.closest('.editor').querySelectorAll('.atmo-emoji-button')).toHaveLength(1);
	});

	it('gives back an Emoticon button the site drew anew, when switched off', async () => {
		const editor = addEditor();
		await vi.waitFor(() => expect(siteHidden(editor)).toBe(true));
		// The site's framework replaces its button, and leaves ours in place
		const redrawn = siteEmoticon(editor).cloneNode(true);
		redrawn.style.removeProperty('display');
		siteEmoticon(editor).replaceWith(redrawn);
		await vi.waitFor(() => expect(siteHidden(editor)).toBe(true));
		applySettings({ ...featureConfig, emojiPicker: false });
		feature().onSwitch(false);
		expect(siteEmoticon(editor).style.getPropertyValue('display')).toBe('');
	});

	it('gives back an Emoticon button the site took out and put back, when switched off', async () => {
		const editor = addEditor();
		await vi.waitFor(() => expect(siteHidden(editor)).toBe(true));
		const wrapper = editor.closest('.editor');
		const parent = wrapper.parentElement;
		wrapper.remove();
		await settle();
		parent.appendChild(wrapper);
		await vi.waitFor(() => expect(siteHidden(editor)).toBe(true));
		applySettings({ ...featureConfig, emojiPicker: false });
		feature().onSwitch(false);
		expect(siteEmoticon(editor).style.getPropertyValue('display')).toBe('');
	});

	it('gives the Emoticon button back its own inline display', async () => {
		const editor = addEditor();
		siteEmoticon(editor).style.setProperty('display', 'flex');
		await vi.waitFor(() => expect(siteHidden(editor)).toBe(true));
		applySettings({ ...featureConfig, emojiPicker: false });
		feature().onSwitch(false);
		expect(siteEmoticon(editor).style.getPropertyValue('display')).toBe('flex');
	});
});

describe('the picker', () => {
	/**
	 * Open the picker for a fresh chat form.
	 * @returns {Promise<HTMLInputElement>} its input
	 */
	async function openPicker() {
		const input = addChatForm();
		await vi.waitFor(() => expect(doc.querySelector('.atmo-emoji-button')).not.toBeNull());
		doc.querySelector('.atmo-emoji-button').click();
		showTab('Emoji');
		return input;
	}

	it('puts a pick in at the cursor, as typing would, and closes back to the input', async () => {
		const input = await openPicker();
		input.value = 'hi there';
		input.setSelectionRange(2, 2);
		// Reopened, so it reads the cursor where it is now
		dialog().querySelector('.atmo-dialog-footer button.cancel').click();
		doc.querySelector('.atmo-emoji-button').click();
		showTab('Emoji');
		const typed = vi.fn();
		input.addEventListener('input', typed);
		picks(panelFor('Emoji')).find(button => button.dataset.pick === '⭐').click();
		expect([input.value, input.selectionStart, typed.mock.calls.length]).toEqual(['hi⭐ there', 3, 1]);
		expect(dialog()).toBeNull();
		expect(doc.activeElement).toBe(input);
	});

	it('replaces what was selected', async () => {
		const input = addChatForm();
		input.value = 'I am sad today';
		input.setSelectionRange(5, 8);
		await vi.waitFor(() => expect(doc.querySelector('.atmo-emoji-button')).not.toBeNull());
		doc.querySelector('.atmo-emoji-button').click();
		showTab('Kaomoji');
		picks(panelFor('Kaomoji')).find(button => button.getAttribute('aria-label') === 'crying').click();
		expect(input.value).toBe('I am (╥﹏╥) today');
	});

	it('keeps a message within its maxlength, and says why', async () => {
		const input = await openPicker();
		input.value = 'x'.repeat(2048);
		dialog().querySelector('.atmo-dialog-footer button.cancel').click();
		doc.querySelector('.atmo-emoji-button').click();
		showTab('Emoji');
		picks(panelFor('Emoji'))[0].click();
		expect(input.value).toHaveLength(2048);
		expect(dialog().querySelector('[role="status"]').textContent).toContain('2048 characters');
	});

	it('shows the last picks first, per tab, newest first', async () => {
		const input = await openPicker();
		for (const emoji of ['🆒', '⭐', '🆒']) {
			picks(panelFor('Emoji')).find(button => button.dataset.pick === emoji).click();
			doc.querySelector('.atmo-emoji-button').click();
			showTab('Emoji');
		}
		const recent = panelFor('Emoji').querySelector('.atmo-emoji-group');
		expect(recent.querySelector('h4').textContent).toBe('Recent');
		expect(Array.from(recent.querySelectorAll('[data-pick]'), button => button.getAttribute('aria-label'))).toEqual(['COOL button', 'star']);
		expect(input.value).toBe('🆒⭐🆒');
	});

	it('offers the NSFW groups, and recent NSFW picks, only with the setting on', async () => {
		_GM_setValue('emojiRecents', JSON.stringify({ emoticons: ['8==D', ':)'] }));
		feature().onStorageReady(true);
		const shown = async () => {
			doc.querySelectorAll('.atmo-test-chat, .atmo-dialog-overlay').forEach(el => el.remove());
			await openPicker();
			showTab('Emoticons');
			const panel = panelFor('Emoticons');
			return {
				groups: Array.from(panel.querySelectorAll('h4'), h4 => h4.textContent).filter(name => ['Recent', 'NSFW'].includes(name)),
				recent: picks(panel.querySelector('h4').parentElement).map(button => button.dataset.pick),
			};
		};
		// Saved while off, as a pick from when it was on
		expect(await shown()).toEqual({ groups: ['Recent'], recent: [':)'] });
		applySettings({ ...featureConfig, emojiPickerNsfw: true });
		expect(await shown()).toEqual({ groups: ['Recent', 'NSFW'], recent: ['8==D', ':)'] });
	});

	it('keeps only known picks from storage', () => {
		// 😀 is not one: Cyberspace swaps it for a random symbol
		_GM_setValue('emojiRecents', JSON.stringify({ emoji: ['⭐', '😀', '<img src=x>', 7, '⭐'], symbols: ['☆', '★'], kaomoji: ['¯\\＿(ツ)＿/¯', '¯\\_(ツ)_/¯', 'not one'] }));
		feature().onStorageReady(true);
		expect(feature().reportSummary()).toBe('3 recent picks');
	});

	it('finds emoji by every word of their name, and says how many', async () => {
		await openPicker();
		// Opened on the Emoji tab, the search box has focus
		dialog().querySelector('.atmo-dialog-footer button.cancel').click();
		doc.querySelector('.atmo-emoji-button').click();
		const panel = panelFor('Emoji');
		const search = panel.querySelector('input[type="search"]');
		expect(doc.activeElement).toBe(search);
		search.value = 'clock';
		search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
		const names = picks(panel).map(button => button.getAttribute('aria-label'));
		// Watch and stopwatch by their CLDR keyword clock
		expect(names).toEqual(['watch', 'alarm clock', 'stopwatch', 'timer clock']);
		expect(dialog().querySelector('[role="status"]').textContent).toBe(`${names.length} emoji match.`);
		search.value = 'zzqx';
		search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
		const status = () => dialog().querySelector('[role="status"]').textContent;
		expect(status()).toBe('No emoji match. Try another word.');
		// Each tab's own: back on this one, it says so again
		showTab('Kaomoji');
		expect(status()).toBe('');
		showTab('Emoji');
		expect(status()).toBe('No emoji match. Try another word.');
		search.value = 'alarm';
		search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
		expect(status()).toBe('1 emoji matches.');
	});

	it('finds picks by keywords their names lack, and still names them by their names', async () => {
		await openPicker();
		/**
		 * Search one tab.
		 * @param {string} tab - its label
		 * @param {string} words - what is typed
		 * @returns {HTMLButtonElement[]} the picks shown
		 */
		const searchTab = (tab, words) => {
			showTab(tab);
			const search = panelFor(tab).querySelector('input[type="search"]');
			search.value = words;
			search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
			return picks(panelFor(tab));
		};
		// From CLDR, generated
		expect(searchTab('Emoji', 'zap').map(button => [button.dataset.pick, button.getAttribute('aria-label')])).toEqual([['⚡', 'high voltage']]);
		expect(searchTab('Symbols', 'silcrow').map(button => button.dataset.pick)).toEqual(['§']);
		// Written by hand
		expect(searchTab('Emoticons', 'lol').map(button => button.dataset.pick)).toEqual(expect.arrayContaining(['XD', ':D']));
		expect(searchTab('Kaomoji', 'idk').map(button => button.getAttribute('aria-label'))).toEqual(['shrug', 'whatever']);
	});

	it('fills a tab the first time it shows', async () => {
		await openPicker();
		expect(panelFor('Symbols').querySelectorAll('[data-pick]')).toHaveLength(0);
		showTab('Symbols');
		expect(panelFor('Symbols').querySelectorAll('[data-pick]').length).toBeGreaterThan(2000);
		// Shown again, it is not filled twice
		showTab('Emoji');
		const count = panelFor('Symbols').querySelectorAll('[data-pick]').length;
		showTab('Symbols');
		expect(panelFor('Symbols').querySelectorAll('[data-pick]')).toHaveLength(count);
	});

	it('moves between tabs with the arrow keys, and between picks', async () => {
		await openPicker();
		const [emoticonsTab, kaomojiTab, , , emojiTab] = dialog().querySelectorAll('[role="tab"]');
		emoticonsTab.focus();
		key(emoticonsTab, 'ArrowRight');
		expect([doc.activeElement, kaomojiTab.getAttribute('aria-selected'), panelFor('Emoticons').hidden]).toEqual([kaomojiTab, 'true', true]);
		// Left from the first wraps to the last
		key(kaomojiTab, 'ArrowLeft');
		key(emoticonsTab, 'ArrowLeft');
		expect([doc.activeElement, emojiTab.getAttribute('aria-selected')]).toEqual([emojiTab, 'true']);
		const [first, second] = picks(panelFor('Emoji'));
		expect([first.tabIndex, second.tabIndex]).toEqual([0, -1]);
		first.focus();
		key(first, 'ArrowRight');
		expect([doc.activeElement, first.tabIndex, second.tabIndex]).toEqual([second, -1, 0]);
	});

	it('moves up and down to the nearest pick of the next row, as laid out', async () => {
		await openPicker();
		const shown = picks(panelFor('Emoji'));
		// Five across, then a group's short last row of two, then five more:
		// jsdom lays nothing out, so each pick is placed by its index
		const places = [[0, 0], [0, 30], [0, 60], [0, 90], [0, 120], [40, 0], [40, 30], [80, 0], [80, 30], [80, 60], [80, 90], [80, 120]];
		vi.spyOn(dom.window.HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
			const [top, left] = places[shown.indexOf(this)] ?? [200, 0];
			return { top, left, right: left + 24, bottom: top + 24, width: 24, height: 24 };
		});
		const press = (from, k) => {
			shown[from].focus();
			key(shown[from], k);
			return shown.indexOf(doc.activeElement);
		};
		// From the fourth, down stops at the short row, nearest across, not the full row past it
		expect(press(3, 'ArrowDown')).toBe(6);
		expect(press(6, 'ArrowUp')).toBe(1);
		expect(press(5, 'ArrowDown')).toBe(7);
		// Nothing above the first row: focus stays
		expect(press(2, 'ArrowUp')).toBe(2);
	});

	it('leaves out what the browser cannot draw', async () => {
		// A canvas as Firefox draws: a missing character is a box, its code
		// point inside, so ᴥ comes out the size of U+FFFF's box, and 🆕 of
		// U+1FFFF's, but not their pixels. ⬜ is gray, and drawn. #️⃣ comes out
		// as its parts
		const size = 48;
		let last = '';
		const rect = (left, top, right, bottom, rgb) => {
			const data = new Uint8ClampedArray(size * size * 4);
			for (let y = top; y <= bottom; y++) {
				for (let x = left; x <= right; x++) data.set([...rgb, 255], (y * size + x) * 4);
			}
			return data;
		};
		// One context, as a canvas gives back the same each call
		const ctx = {
			clearRect() {},
			fillText(text) { last = text; },
			measureText: (text) => ({ width: text === '#\uFE0F\u20E3' ? 72 : 24 }),
			getImageData: () => {
				// A space draws nothing, as on a real canvas, and so does the braille blank
				if (!last.trim() || last === '\u2800') return { data: new Uint8ClampedArray(size * size * 4) };
				// Four hex digits in the box, or five, a wider box
				if (['\uFFFF', 'ᴥ'].includes(last)) return { data: rect(2, 2, 20, 22, [last.length * 9, last.length * 9, last.length * 9]) };
				if (['\u{1FFFF}', '🆕'].includes(last)) return { data: rect(2, 2, 26, 22, [last.length * 9, last.length * 9, last.length * 9]) };
				// Gray by design, and drawn
				if (last === '⬜') return { data: rect(3, 3, 20, 20, [128, 128, 128]) };
				if (/\p{Extended_Pictographic}/u.test(last)) return { data: rect(1, 1, 22, 22, [250, 200, 0]) };
				return { data: rect(0, 0, 10, 20, [0, 0, 0]) };
			},
		};
		vi.spyOn(dom.window.HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ctx);
		await openPicker();
		const emoji = picks(panelFor('Emoji')).map(button => button.dataset.pick);
		expect(emoji).toEqual(expect.arrayContaining(['⭐', '⬜']));
		expect(emoji).not.toContain('🆕');
		expect(emoji).not.toContain('#\uFE0F\u20E3');
		showTab('Kaomoji');
		const kaomoji = picks(panelFor('Kaomoji')).map(button => button.getAttribute('aria-label'));
		// The braille blank draws no ink, by design, and is kept
		showTab('ASCII art');
		expect(picks(panelFor('ASCII art')).map(button => button.dataset.pick)).toContain('\u2800');
		showTab('Kaomoji');
		// ( ͡° ͜ʖ ͡° ) puts its marks on spaces: they are drawn, and so is it.
		// ʕ´•ᴥ•`ʔ draws as boxes, and is left out
		expect(kaomoji).toEqual(expect.arrayContaining(['shrug', 'lenny face']));
		expect(kaomoji).not.toContain('sad bear');
	});

	it('shows every pick where the canvas does not give back what it drew', async () => {
		// As a browser that hides the canvas from fingerprinting: the same
		// opaque white for any text, which would read as a missing box for each
		const blank = new Uint8ClampedArray(48 * 48 * 4).fill(255);
		const ctx = { clearRect() {}, fillText() {}, measureText: () => ({ width: 24 }), getImageData: () => ({ data: blank }) };
		vi.spyOn(dom.window.HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ctx);
		await openPicker();
		expect(picks(panelFor('Emoji')).map(button => button.dataset.pick)).toEqual(expect.arrayContaining(['⭐', '🆕']));
		showTab('Kaomoji');
		expect(picks(panelFor('Kaomoji')).map(button => button.getAttribute('aria-label'))).toEqual(expect.arrayContaining(['bear', 'sad bear']));
	});

	it('offers only what Cyberspace shows as sent', async () => {
		await openPicker();
		const emoji = picks(panelFor('Emoji')).map(button => button.dataset.pick);
		// Faces and animals are swapped for random symbols; ⭐ and 🆒 are not
		expect(emoji).toEqual(expect.arrayContaining(['⭐', '🆒']));
		expect(emoji).not.toContain('😀');
		showTab('Symbols');
		const symbols = picks(panelFor('Symbols')).map(button => button.dataset.pick);
		// ★ is swapped too; ☆ the site keeps. Box drawing and shades have a tab of their own
		expect(symbols).toContain('☆');
		expect(symbols).not.toEqual(expect.arrayContaining(['★', '░', '╬']));
		// Whole blocks outside what the site swaps, as hieroglyphs, found by what they show
		const search = panelFor('Symbols').querySelector('input[type="search"]');
		search.value = 'fish';
		search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
		expect(picks(panelFor('Symbols')).map(button => button.dataset.pick)).toContain('𓆝');
		showTab('ASCII art');
		expect(picks(panelFor('ASCII art')).map(button => button.dataset.pick)).toEqual(expect.arrayContaining(['─', '╬', '░', '█', '⣿']));
		showTab('Kaomoji');
		const kaomoji = picks(panelFor('Kaomoji')).map(button => button.getAttribute('aria-label'));
		expect(kaomoji).toContain('table flip');
	});
});

/**
 * Every entry of the generated lists, emoji, symbols and ASCII art, read from their source as text.
 * @param {string} source - src/emoji-picker/emoji-data.js
 * @returns {string[]} "character name" pairs
 */
function generatedEntries(source) {
	return Array.from(source.matchAll(/picks: "([^"]*)"/g), match => match[1].split('|')).flat();
}

/**
 * The groups of a list written by hand, read from its file.
 * @param {string} file - in src/emoji-picker
 * @param {string} groups - the name of its groups' constant
 * @returns {Array<{name: string, picks: Array<[string, string, string?]>}>} each pick as text, name, keywords
 */
const handGroups = (file, groups) => new Function(`${readFileSync(join(__dirname, '..', 'src', 'emoji-picker', file), 'utf8')}; return ${groups};`)();
const handPicks = (file, groups) => handGroups(file, groups).flatMap(group => group.picks);

describe('the search keywords written by hand', () => {
	it('hold only words a pick\'s name and group lack, as those are searched too', () => {
		for (const [file, groups] of [['kaomoji.js', 'KAOMOJI_GROUPS'], ['emoticons.js', 'EMOTICON_GROUPS']]) {
			const repeats = handGroups(file, groups)
				.flatMap(group => group.picks.flatMap(([text, name, words = '']) => words.split(' ')
					.filter(word => word && `${name} ${group.name}`.toLowerCase().includes(word)).map(word => `${text}: ${word}`)));
			expect(repeats).toEqual([]);
		}
	});
});

describe('the emoji list', () => {
	it('holds only a character and a name in each entry, nothing that could end its string', () => {
		const source = readFileSync(join(__dirname, '..', 'src', 'emoji-picker', 'emoji-data.js'), 'utf8');
		expect(source).not.toMatch(/[\\`$<\u2028\u2029]/);
		const entries = generatedEntries(source);
		expect(entries.length).toBe(81 + 2456 + 416);
		// A name may hold any letter, as Côte d’Ivoire, but no control character
		expect(entries.filter(entry => !/^\S+ [^\u0000-\u001f]+$/u.test(entry))).toEqual([]);
	});
});

describe('what Cyberspace shows as sent', () => {
	const siteShowsAsSent = new Function(`${readFileSync(join(__dirname, '..', 'src', 'emoji-picker', 'site-rule.js'), 'utf8')}; return siteShowsAsSent;`)();

	it('swaps what its v-emoji-replace swaps, reads _ and * as markup, and keeps the rest', () => {
		const cases = {
			'↔': true, '↔️': false, '⬛': false, '#️⃣': true, '1️⃣': false, '♥️': true, '☞': true, '★': false,
			'😀': false, '⭐': true, '𓆝': true, '(╯°□°)╯︵ ┻━┻': true, '(◍•ᴗ•◍)❤': false,
			'¯\\_(ツ)_/¯': false, '(^_^)': false, '¯\\＿(ツ)＿/¯': true,
			'(*^‿^*)': false, '*️⃣': false, '(∗^‿^∗)': true,
		};
		expect(Object.fromEntries(Object.keys(cases).map(text => [text, siteShowsAsSent(text)]))).toEqual(cases);
	});

	const kaomojiPicks = () => handPicks('kaomoji.js', 'KAOMOJI_GROUPS');

	it('keeps plain keyboard characters on the Emoticons tab, and the rest on the Kaomoji tab', () => {
		// Read as typed: ＿ and ∗ stand in for _ and *, for the chat's sake
		const typed = ([text]) => /^[\x20-\x7e]+$/.test(text.replace(/＿/g, '_').replace(/∗/g, '*'));
		expect(handPicks('emoticons.js', 'EMOTICON_GROUPS').filter(pick => !typed(pick))).toEqual([]);
		// One with ＿ is not plain: it was typed with _, which the chat would read as markup
		expect(kaomojiPicks().filter(pick => typed(pick) && !pick[0].includes('＿'))).toEqual([]);
	});

	it('holds every kaomoji and emoticon to it, as they are written by hand', () => {
		const picks = [...kaomojiPicks(), ...handPicks('emoticons.js', 'EMOTICON_GROUPS')];
		expect(picks.filter(([text]) => !siteShowsAsSent(text))).toEqual([]);
	});

	it('has every kaomoji of the editor\'s Emoticon list it stands in for, with ＿ for _ and ∗ for *', () => {
		// The list as the site's Emoticon button showed it on 2026-10-23
		const emoticons = readFileSync(join(__dirname, 'fixtures', 'editor-emoticons.txt'), 'utf8').split('\n').filter(Boolean)
			.map(text => text.replace(/_/g, '＿').replace(/\*/g, '∗'));
		const texts = new Set(kaomojiPicks().map(([text]) => text));
		expect(emoticons.filter(text => !texts.has(text))).toEqual([]);
	});
});

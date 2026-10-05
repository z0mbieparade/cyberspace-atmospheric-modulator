// =====================================================
// FILES AND PASTED TEXT
// =====================================================
// Moving text in and out of a userscript: a download, a picked file, or a
// paste dialog. What the text holds is up to the caller.

/**
 * Offer text to the user as a downloaded file.
 * Side effects: adds and removes a temporary link, and starts a download.
 * @param {string} text
 * @param {string} filename
 * @param {string} [type] - the file's MIME type
 */
function downloadText(text, filename, type = 'text/plain') {
	const url = URL.createObjectURL(new Blob([text], { type }));
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	URL.revokeObjectURL(url);
}

/**
 * Copy text to the clipboard, and tell the user how it went.
 * Side effects: writes the clipboard; alerts.
 * @param {string} text
 * @param {string} copiedMessage - shown once it is copied
 * @returns {Promise<void>} settles after the alert; never rejects
 */
async function copyText(text, copiedMessage) {
	try {
		await navigator.clipboard.writeText(text);
		alert(copiedMessage);
	} catch (err) {
		alert(`Could not copy: ${err.message}`);
	}
}

/**
 * Ask the user for a file, read it as text, and parse it.
 * Side effects: opens the browser's file picker.
 * @param {function(*, Error|null): void} callback - called with what parse
 *   returned, or with why the file could not be read or parsed. Not called
 *   when the user cancels
 * @param {{parse?: function(string): *, accept?: string}} [options] -
 *   parse: turns the text into data, throwing an Error for the user when it
 *   cannot; accept: the picker's file filter
 */
function pickTextFile(callback, { parse = text => text, accept = '.json' } = {}) {
	const input = document.createElement('input');
	input.type = 'file';
	input.accept = accept;
	input.addEventListener('change', () => {
		const file = input.files[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			let data;
			try {
				data = parse(reader.result);
			} catch (err) {
				callback(null, err);
				return;
			}
			callback(data, null);
		};
		reader.onerror = () => callback(null, new Error(`Could not read ${file.name}.`));
		reader.readAsText(file);
	});
	input.click();
}

/**
 * Ask the user to paste text into a dialog, and parse it.
 * Side effects: opens a dialog, closed once the text parses.
 * @param {function(*, Error|null): void} callback - called with what parse
 *   returned, or with why it could not parse. The dialog stays open on an
 *   error, for another try
 * @param {{parse?: function(string): *, title?: string, label?: string}} [options] -
 *   parse: as pickTextFile's; title, label: the dialog's title, and the
 *   label over the text box
 */
function showPasteDialog(callback, { parse = text => text, title = 'Paste Settings', label = 'Paste your settings below.' } = {}) {
	const textareaId = uiId('paste');
	const dialog = createDialog({
		title,
		width: '400px',
		onHelp: null,
		warning: '',
		attribution: [],
		content: `
			<label for="${textareaId}" class="hint">${label}</label>
			<textarea id="${textareaId}" style="min-height: 150px; width: 100%; font-size: var(--font-size-base);"></textarea>
		`,
		buttons: [
			{ label: 'IMPORT', class: 'import', onClick: (close) => {
				const text = textarea.value.trim();
				if (!text) {
					alert('Paste the settings first.');
					return;
				}
				let data;
				try {
					data = parse(text);
				} catch (err) {
					callback(null, err);
					return;
				}
				close();
				callback(data, null);
			} },
			{ label: 'CANCEL', class: 'cancel', onClick: (close) => close() },
		],
	});
	const textarea = dialog.querySelector('#' + textareaId);
	textarea.focus();
}

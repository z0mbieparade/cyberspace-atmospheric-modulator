/**
 * UI component tests: ui-dialog.js, ui-slider.js and ui-settings-engine.js,
 * evaluated in a jsdom window the way a bundle concatenates them. These pin
 * the accessibility behavior (names, roles, focus, keyboard) as well as the
 * values, because that behavior is easy to lose in a restyle.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { JSDOM } from 'jsdom';

const UI_SOURCE = ['ui-dialog.js', 'theme-colors.js', 'ui-slider.js', 'ui-settings-engine.js']
	.map(name => readFileSync(join(__dirname, '..', '..', 'src', 'shared', name), 'utf8'))
	.join('\n\n');

let window;
let document;
let ui;

/**
 * Load the UI files into a fresh window.
 * @param {string} [extra] - code evaluated before the files, e.g. a dialogDefaults()
 */
function loadUi(extra = '') {
	window = new JSDOM('<!DOCTYPE html><body><button id="opener">open</button></body>', { runScripts: 'outside-only' }).window;
	document = window.document;
	window.eval(`const LOG_PREFIX = '[Test]';\n${extra}\n${UI_SOURCE}
		window.__ui = { createDialog, createInputRow, createSlider, createSettingsEngine, syncTristate, escapeHtml, AUTHOR_LINKS };`);
	ui = window.__ui;
}

const key = (target, k, init = {}) => target.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }));

/**
 * The accessible name of a form control from its labels, skipping
 * aria-hidden ones: the subset of the name computation these components use.
 * @param {HTMLElement} el
 * @returns {string}
 */
function accessibleName(el) {
	const ids = el.getAttribute('aria-labelledby');
	if (ids) return ids.split(' ').map(id => document.getElementById(id).textContent.trim()).join(' ');
	if (el.getAttribute('aria-label')) return el.getAttribute('aria-label');
	const fromLabels = Array.from(document.querySelectorAll(`label[for="${el.id}"]`))
		.filter(l => l.getAttribute('aria-hidden') !== 'true')
		.map(l => l.textContent.trim()).join(' ');
	return fromLabels || (el.tagName === 'BUTTON' ? el.textContent.trim() : '');
}

describe('createDialog', () => {
	beforeEach(() => loadUi());

	it('is a modal dialog named by its title', () => {
		const d = ui.createDialog({ title: 'Atmospheric Modulator Settings', content: '<p>x</p>' });
		const dialog = d.el.querySelector('[role="dialog"]');
		expect(dialog.getAttribute('aria-modal')).toBe('true');
		expect(document.getElementById(dialog.getAttribute('aria-labelledby')).textContent).toBe('Atmospheric Modulator Settings');
		// The name contains the visible text "ESC" (WCAG 2.5.3)
		expect(accessibleName(d.el.querySelector('.atmo-header-close'))).toBe('ESC, close');
	});

	it('takes focus and returns it to the opener on close', () => {
		const opener = document.getElementById('opener');
		opener.focus();
		const d = ui.createDialog({ title: 'T', content: '' });
		expect(document.activeElement).toBe(d.el.querySelector('[role="dialog"]'));
		d.close();
		expect(document.activeElement).toBe(opener);
		expect(document.querySelector('.atmo-dialog-overlay')).toBeNull();
	});

	it('keeps Tab inside the dialog', () => {
		const d = ui.createDialog({ title: 'T', content: '<input id="a"><input id="b">', buttons: [{ label: 'Save' }] });
		const focusable = d.el.querySelectorAll('button, input');
		const first = focusable[0];
		const last = focusable[focusable.length - 1];

		last.focus();
		key(last, 'Tab');
		expect(document.activeElement).toBe(first);

		first.focus();
		key(first, 'Tab', { shiftKey: true });
		expect(document.activeElement).toBe(last);
	});

	it('skips fields hidden with display: none when wrapping Tab', () => {
		const d = ui.createDialog({ title: 'T', content: '<input id="shown"><div style="display: none"><input id="gone"></div>' });
		const shown = d.el.querySelector('#shown');
		shown.focus();
		key(shown, 'Tab');
		expect(document.activeElement).toBe(d.el.querySelector('.atmo-header-close'));
	});

	it('closes only itself on Escape: the site\'s document handlers never see it', () => {
		const siteHandler = vi.fn();
		document.addEventListener('keydown', siteHandler);
		const lower = ui.createDialog({ title: 'Lower', content: '' });
		const upper = ui.createDialog({ title: 'Upper', content: '' });
		key(upper.el.querySelector('[role="dialog"]'), 'Escape');
		expect(upper.el.isConnected).toBe(false);
		expect(lower.el.isConnected).toBe(true);
		expect(siteHandler).not.toHaveBeenCalled();
	});

	it('runs footer buttons in order with close, and calls onClose once', () => {
		const onClose = vi.fn();
		const saved = vi.fn();
		const d = ui.createDialog({
			title: 'T', content: '', onClose,
			buttons: [{ label: 'Save', class: 'save', onClick: (close) => { saved(); close(); } }, { label: 'Cancel', class: 'cancel' }],
		});
		d.el.querySelectorAll('.buttons > button')[0].click();
		expect(saved).toHaveBeenCalledTimes(1);
		expect(onClose).toHaveBeenCalledTimes(1);
		d.close();
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it('closes on a backdrop click only when the press started on the backdrop', () => {
		const d = ui.createDialog({ title: 'T', content: '<p id="inside">x</p>' });
		const inside = d.el.querySelector('#inside');
		inside.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
		d.el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
		expect(d.el.isConnected, 'drag that ended outside').toBe(true);

		d.el.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
		d.el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
		expect(d.el.isConnected).toBe(false);
	});

	it('merges dialogDefaults(), and onHelp: null drops the default help button', () => {
		loadUi(`function dialogDefaults() { return { warning: 'Not the site\\'s', attribution: [...AUTHOR_LINKS, 'v1'], onHelp: () => {} }; }`);
		const withDefaults = ui.createDialog({ title: 'T', content: '' });
		expect(withDefaults.el.querySelector('.atmo-dialog-warning').textContent).toBe("Not the site's");
		const items = withDefaults.el.querySelectorAll('.atmo-dialog-attribution > span');
		expect(Array.from(items, i => i.textContent)).toEqual(['created by @z0ylent', 'https://z0m.bi', 'v1']);
		expect(accessibleName(withDefaults.el.querySelector('.atmo-header-help'))).toBe('Help');

		const noHelp = ui.createDialog({ title: 'T', content: '', onHelp: null });
		expect(noHelp.el.querySelector('.atmo-header-help')).toBeNull();
	});
});

describe('createInputRow', () => {
	beforeEach(() => loadUi());

	const render = (opts) => {
		document.body.insertAdjacentHTML('beforeend', ui.createInputRow(opts));
		return document.getElementById(opts.id);
	};

	it('shows a tristate\'s default as text, so a value from data cannot add markup', () => {
		const input = render({ type: 'tristate', id: 'icon', label: 'Prepend icon', defaultLabel: '<img src=x onerror="1">' });
		const row = input.closest('.atmo-input-row');
		expect(row.querySelector('img')).toBeNull();
		expect(row.textContent).toContain('<img src=x');
	});

	it('names a toggle by its label alone, as a switch', () => {
		const input = render({ type: 'toggle', id: 'reveal', label: 'Reveal images', checked: true });
		expect(input.getAttribute('role')).toBe('switch');
		expect(input.checked).toBe(true);
		expect(accessibleName(input)).toBe('Reveal images');
	});

	it('escapes value and placeholder, so user text cannot break the markup', () => {
		const input = render({ id: 'note', label: 'Note', value: '"><img src=x>', placeholder: 'a "quote"' });
		expect(input.value).toBe('"><img src=x>');
		expect(input.placeholder).toBe('a "quote"');
		expect(document.querySelector('img')).toBeNull();
	});

	it('names a row button by its own text, described by the row label', () => {
		const button = render({ type: 'button', id: 'export', label: 'Export settings to file', buttonText: 'Save Settings File' });
		expect(accessibleName(button)).toBe('Save Settings File');
		expect(document.getElementById(button.getAttribute('aria-describedby')).textContent).toBe('Export settings to file');
	});

	it('reads a tristate auto as mixed (indeterminate)', () => {
		const input = render({ type: 'tristate', id: 'bold', label: 'Bold', state: null });
		ui.syncTristate(input, null);
		expect(input.indeterminate).toBe(true);
		ui.syncTristate(input, false);
		expect(input.indeterminate).toBe(false);
		expect(input.checked).toBe(false);
	});
});

describe('createSlider', () => {
	beforeEach(() => loadUi());

	it('is a native range input named by the label', () => {
		const s = ui.createSlider({ label: 'Hold duration', min: 100, max: 2000, step: 50, value: 500 });
		document.body.appendChild(s.el);
		const input = s.el.querySelector('input[type="range"]');
		expect(input.value).toBe('500');
		expect(input.step).toBe('50');
		expect(accessibleName(input)).toBe('Hold duration');
	});

	it('gives each range thumb its own name, and each value button the slider\'s name plus its number', () => {
		const s = ui.createSlider({ type: 'range', label: 'Hue', min: 0, max: 360, values: [10, 200] });
		document.body.appendChild(s.el);
		const [low, high] = s.el.querySelectorAll('input[type="range"]');
		expect(accessibleName(low)).toBe('Hue minimum');
		expect(accessibleName(high)).toBe('Hue maximum');
		const [lowValue] = s.el.querySelectorAll('.atmo-slider-labels button');
		expect(accessibleName(lowValue)).toBe('Edit Hue minimum 10');
	});

	it('puts each thumb right after its input, where the focus-ring rule looks for it', () => {
		const s = ui.createSlider({ type: 'range', label: 'Hue', values: [1, 2] });
		for (const input of s.el.querySelectorAll('input[type="range"]')) {
			expect(input.nextElementSibling.classList.contains('atmo-slider-thumb')).toBe(true);
		}
	});

	it('keeps the disabled look over a thumb color, and restores the color when re-enabled', () => {
		const s = ui.createSlider({ type: 'range', label: 'L', values: [1, 2] });
		const thumb = s.el.querySelector('.atmo-slider-thumb');
		s.setThumbColor(['red', 'blue']);
		s.setDisabled(true);
		expect(thumb.style.background).toBe('var(--atmo-fg-dim)');
		s.setThumbColor(['green', 'blue']);
		expect(thumb.style.background, 'still disabled').toBe('var(--atmo-fg-dim)');
		s.setDisabled(false);
		expect(thumb.style.background).toBe('green');
	});

	it('follows its input (keyboard and pointer both arrive as input events)', () => {
		const onChange = vi.fn();
		const s = ui.createSlider({ label: 'L', value: 5, onChange });
		const input = s.el.querySelector('input[type="range"]');
		input.value = '42';
		input.dispatchEvent(new window.Event('input', { bubbles: true }));
		expect(onChange).toHaveBeenCalledWith(42);
		expect(s.getValue()).toBe(42);
		expect(s.el.querySelector('.atmo-slider-labels button').textContent).toBe('42');

		s.setValue(7);
		expect(input.value).toBe('7');
	});

	it('disables every control, so the keyboard cannot move it either', () => {
		const s = ui.createSlider({ type: 'range', label: 'L', values: [1, 2] });
		s.setDisabled(true);
		expect(Array.from(s.el.querySelectorAll('input, button')).every(el => el.disabled)).toBe(true);
		s.setDisabled(false);
		expect(Array.from(s.el.querySelectorAll('input, button')).some(el => el.disabled)).toBe(false);
	});

	it('snaps a track click to the step grid that starts at min', () => {
		const onChange = vi.fn();
		const s = ui.createSlider({ type: 'range', min: 5, max: 105, step: 10, values: [5, 105], onChange });
		const slider = s.el.querySelector('.atmo-slider');
		slider.getBoundingClientRect = () => ({ left: 0, width: 100 });
		slider.dispatchEvent(new window.MouseEvent('click', { bubbles: true, clientX: 50 }));
		// 50% of 5..105 is 55, on the grid 5, 15, …; not 60
		expect(onChange).toHaveBeenCalledWith([55, 105]);
	});

	it('moves the nearer range thumb on a track click', () => {
		const onChange = vi.fn();
		const s = ui.createSlider({ type: 'range', min: 0, max: 100, values: [10, 90], onChange });
		const slider = s.el.querySelector('.atmo-slider');
		slider.getBoundingClientRect = () => ({ left: 0, width: 200 });
		slider.dispatchEvent(new window.MouseEvent('click', { bubbles: true, clientX: 160 }));
		expect(onChange).toHaveBeenCalledWith([10, 80]);

		s.setDisabled(true);
		slider.dispatchEvent(new window.MouseEvent('click', { bubbles: true, clientX: 0 }));
		expect(s.getValues(), 'a disabled slider ignores the track').toEqual([10, 80]);
	});

	it('edits the exact value in a number field: Enter commits, Escape cancels without closing the dialog', () => {
		const onChange = vi.fn();
		const s = ui.createSlider({ label: 'L', min: 0, max: 100, value: 5, onChange });
		const d = ui.createDialog({ title: 'T', content: '' });
		d.el.querySelector('.atmo-dialog-content').appendChild(s.el);
		const button = s.el.querySelector('.atmo-slider-labels button');

		button.click();
		let field = s.el.querySelector('input[type="number"]');
		expect(button.hidden).toBe(true);
		field.value = '250';
		key(field, 'Enter');
		expect(s.getValue(), 'clamped to max').toBe(100);
		expect(onChange).toHaveBeenLastCalledWith(100);

		button.click();
		s.el.querySelector('input[type="number"]').value = '33.7';
		key(s.el.querySelector('input[type="number"]'), 'Enter');
		expect(s.getValue(), 'snapped to the step').toBe(34);
		button.click();
		s.el.querySelector('input[type="number"]').value = '100';
		key(s.el.querySelector('input[type="number"]'), 'Enter');
		expect(document.activeElement).toBe(button);

		button.click();
		field = s.el.querySelector('input[type="number"]');
		field.value = '3';
		key(field, 'Escape');
		expect(s.getValue()).toBe(100);
		expect(d.el.isConnected, 'Escape stayed in the field').toBe(true);
		expect(s.el.querySelector('input[type="number"]')).toBeNull();
	});
});

describe('createSettingsEngine', () => {
	beforeEach(() => loadUi());

	const schema = [
		{ key: 'enabled', type: 'toggle', label: 'Enabled', default: true },
		{ key: 'delay', type: 'slider', label: 'Delay', min: 100, max: 2000, step: 50, default: 500, showWhen: { field: 'enabled', is: true } },
		{ key: 'bold', type: 'tristate', label: 'Bold', default: null },
	];

	const mount = (values = {}) => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		const onChange = vi.fn();
		const engine = ui.createSettingsEngine({ schema, values, container, onChange });
		engine.render();
		return { engine, container, onChange };
	};

	it('gives inputs page-unique ids, so two scripts\' dialogs never share one', () => {
		const first = mount().container.querySelector('[data-field-key="enabled"] input');
		const second = mount().container.querySelector('[data-field-key="enabled"] input');
		expect(first.id).toMatch(/^atmo-[a-z0-9]+-settings-enabled-\d+$/);
		expect(first.id).not.toBe(second.id);
	});

	it('reports toggle changes and hides dependent fields', () => {
		const { engine, container, onChange } = mount({ enabled: true });
		const toggle = container.querySelector('[data-field-key="enabled"] input');
		toggle.click();
		expect(onChange).toHaveBeenCalledWith('enabled', false, engine);
		expect(engine.getField('delay').wrapper.style.display).toBe('none');
	});

	it('cycles a tristate auto -> true -> false -> auto through real clicks', () => {
		const { engine, container } = mount();
		const box = container.querySelector('[data-field-key="bold"] input');
		expect(box.indeterminate).toBe(true);
		box.click();
		expect(engine.getFieldValue('bold')).toBe(true);
		expect(box.checked).toBe(true);
		box.click();
		expect(engine.getFieldValue('bold')).toBe(false);
		expect(box.checked).toBe(false);
		box.click();
		expect(engine.getFieldValue('bold')).toBe(null);
		expect(box.indeterminate).toBe(true);
	});

	it('names an unlabeled field by its ariaLabel, else by its section', () => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		ui.createSettingsEngine({ container, schema: [
			{ type: 'section', label: '<b>Notes</b>', fields: [{ key: 'notes', type: 'textarea', label: '', placeholder: 'type here' }] },
			{ type: 'section', label: 'Icons', fields: [{ key: 'before', type: 'text', label: '', ariaLabel: 'Icon before name' }] },
		] }).render();
		expect(accessibleName(container.querySelector('[data-field-key="notes"] textarea'))).toBe('Notes');
		expect(accessibleName(container.querySelector('[data-field-key="before"] input'))).toBe('Icon before name');
	});

	it('resets to schema defaults', () => {
		const { engine } = mount({ enabled: false, delay: 900 });
		engine.reset();
		expect(engine.getValues()).toEqual({ enabled: true, delay: 500, bold: null });
	});
});

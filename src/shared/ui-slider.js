// =====================================================
// UI: SLIDER
// =====================================================
//
// Requires ui-dialog.js (uiClass) before this file.

/**
 * Build a gradient from hsla stops.
 * @param {Array<Array<number>>} stops - [hue, sat%, lit%, alpha = 1, position% = none]
 * @returns {string} a linear-gradient() value
 */
function buildSliderGradient(stops) {
	return `linear-gradient(to right, ${stops.map(stop => {
		const [hue, s, l, a = 1, p = null] = stop;
		return `hsla(${hue}, ${s}%, ${l}%, ${a})${p !== null ? ` ${p}%` : ''}`;
	}).join(', ')})`;
}

/**
 * Create a single- or two-thumb slider.
 *
 * Each thumb is a native <input type="range">, so the keyboard (arrows, Page
 * Up/Down, Home/End) and assistive tech work without extra code. The visible
 * thumb is decorative. A range slider may have values[0] > values[1]: that
 * selects the wrapped-around interval, as a hue range does.
 * @param {Object} opts
 * @param {'single'|'range'} [opts.type='single']
 * @param {boolean} [opts.simple=false] - a thin track and round thumb
 * @param {number} [opts.min=0]
 * @param {number} [opts.max=100]
 * @param {number} [opts.step=1]
 * @param {number} [opts.value] - single; defaults to min
 * @param {number[]} [opts.values] - range; defaults to [min, max]
 * @param {string} [opts.label] - HTML; also the thumbs' accessible name
 * @param {Array<Array<number>>} [opts.gradient] - initial setGradient stops
 * @param {Function} [opts.onChange] - gets the value, or [low, high] for a range
 * @returns {Object} { el, getValue, getValues, setValue, setValues, setGradient, setSplitGradient, setThumbColor, setDisabled }
 */
function createSlider(opts) {
	const { type = 'single', simple = false, min = 0, max = 100, step = 1, onChange, label } = opts;
	const isRange = type === 'range';
	const labelId = uiId('slider');
	const thumbCount = isRange ? 2 : 1;
	// Range thumbs need names that tell them apart
	const thumbNames = isRange ? ['minimum', 'maximum'] : [''];
	const glyphs = isRange ? ['▶', '◀'] : [''];

	const container = document.createElement('div');
	// Accessible names are assembled from parts by id: the label (live, since
	// some scripts update text inside it), the thumb's name for a range, and
	// for the value buttons their own visible number, which a name must
	// contain (WCAG 2.5.3). Each input directly precedes its thumb: the focus
	// ring rule in _ui.scss is `input:focus-visible + thumb`
	const nameIds = (i) => [label ? labelId : '', isRange ? `${labelId}-name-${i}` : ''].filter(Boolean);
	container.innerHTML = `
		${label ? `<label id="${labelId}">${label}</label>` : ''}
		<div class="${uiClass('slider')}${simple ? ' ' + uiClass('slider-simple') : ''}${isRange ? ' ' + uiClass('slider-range') : ''}">
			<div class="${uiClass('slider-track-mapped')}" aria-hidden="true"></div>
			<div class="${uiClass('slider-track')}" aria-hidden="true"></div>
			${thumbNames.map((name, i) => `
				<input type="range" class="${uiClass('slider-input')}" data-i="${i}" min="${min}" max="${max}" step="${step}"
					${nameIds(i).length ? `aria-labelledby="${nameIds(i).join(' ')}"` : 'aria-label="value"'}>
				<div class="${uiClass('slider-thumb')}" data-i="${i}" aria-hidden="true">${glyphs[i]}</div>
			`).join('')}
		</div>
		<div class="${uiClass('slider-labels')}">
			${thumbNames.map((name, i) => `<button type="button" id="${labelId}-value-${i}" data-i="${i}" title="Click to edit"
				aria-labelledby="${labelId}-edit ${[...nameIds(i), `${labelId}-value-${i}`].join(' ')}"></button>`).join('')}
		</div>
		<span id="${labelId}-edit" hidden>Edit</span>
		${thumbNames.map((name, i) => name ? `<span id="${labelId}-name-${i}" hidden>${name}</span>` : '').join('')}
	`;

	const slider = container.querySelector('.' + uiClass('slider'));
	const track = container.querySelector('.' + uiClass('slider-track'));
	const trackMapped = container.querySelector('.' + uiClass('slider-track-mapped'));
	const inputs = container.querySelectorAll('.' + uiClass('slider-input'));
	const thumbs = container.querySelectorAll('.' + uiClass('slider-thumb'));
	const valueButtons = container.querySelectorAll('.' + uiClass('slider-labels') + ' > button');

	const clamp = (v) => Math.max(min, Math.min(max, v));
	// Onto the grid the range input allows (min, min + step, …), then within
	// bounds: a stored value the slider itself cannot show would disagree
	// with what assistive tech reads from it
	const snap = (v) => clamp(Math.round((v - min) / step) * step + min);
	let values = isRange ? [...(opts.values || [min, max])] : [opts.value ?? min];

	const toPercent = (v) => ((v - min) / (max - min)) * 100;

	// Where the browser draws a native thumb: its center travels from
	// thumb-w/2 to width - thumb-w/2, not from 0 to width. The decorative
	// thumb sits there too, so it covers the native one it stands for.
	function positionThumb(thumb, v) {
		const fraction = toPercent(v) / 100;
		thumb.style.left = `calc(${fraction * 100}% + var(--thumb-w) * ${0.5 - fraction})`;
	}

	function update() {
		for (let i = 0; i < thumbCount; i++) {
			inputs[i].value = String(values[i]);
			positionThumb(thumbs[i], values[i]);
			valueButtons[i].textContent = String(values[i]);
		}
	}

	const emit = () => onChange?.(isRange ? [...values] : values[0]);

	inputs.forEach((input, i) => {
		input.addEventListener('input', () => {
			values[i] = Number(input.value);
			update();
			emit();
		});
	});

	// Range inputs only take the pointer on their thumbs (see _ui.scss), so a
	// click on the bare track moves the nearer thumb here
	if (isRange) {
		slider.addEventListener('click', (e) => {
			if (inputs[0].disabled || e.target.closest('.' + uiClass('slider-input'))) return;
			const rect = slider.getBoundingClientRect();
			if (!rect.width) return;
			const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
			const v = snap(min + fraction * (max - min));
			const nearer = Math.abs(v - values[0]) <= Math.abs(v - values[1]) ? 0 : 1;
			values[nearer] = v;
			update();
			emit();
		});
	}

	// The value readout opens a number field for typing an exact value. The
	// field replaces the button rather than nesting in it: a button may not
	// hold interactive content
	valueButtons.forEach((button, i) => {
		button.addEventListener('click', () => {
			const previous = values[i];
			const field = document.createElement('input');
			field.type = 'number';
			field.min = String(min);
			field.max = String(max);
			field.step = String(step);
			field.value = String(previous);
			field.className = uiClass('slider-value-input');
			if (nameIds(i).length) field.setAttribute('aria-labelledby', nameIds(i).join(' '));
			else field.setAttribute('aria-label', 'value');
			button.hidden = true;
			button.after(field);
			field.focus();
			field.select();

			let cancelled = false;
			field.addEventListener('blur', () => {
				const typed = Number(field.value);
				field.remove();
				button.hidden = false;
				values[i] = cancelled || field.value === '' || Number.isNaN(typed) ? previous : snap(typed);
				update();
				if (values[i] !== previous) emit();
			});
			field.addEventListener('keydown', (e) => {
				if (e.key === 'Enter' || e.key === 'Escape') {
					e.preventDefault();
					// Escape cancels the edit, not the dialog around it
					e.stopPropagation();
					cancelled = e.key === 'Escape';
					// Focus must land somewhere before the field goes
					button.hidden = false;
					button.focus();
				}
			});
		});
	});

	/**
	 * Paint the track. On a range slider, stops outside the selected
	 * interval are dimmed to alpha 0.5, with hard edges at the thumbs.
	 * @param {Array<Array<number>>} hueStops - [hue, sat%, lit%, alpha, position%]
	 */
	function setGradient(hueStops) {
		if (isRange) {
			const p0 = toPercent(values[0]);
			const p1 = toPercent(values[1]);
			const isWrapAround = p0 > p1;

			const interpolate = (stop1, stop2, targetP) => {
				const [h1, s1, l1, a1, pos1] = stop1;
				const [h2, s2, l2, a2, pos2] = stop2;
				const t = pos2 === pos1 ? 0 : (targetP - pos1) / (pos2 - pos1);
				return [
					Math.round(h1 + t * (h2 - h1)),
					Math.round(s1 + t * (s2 - s1)),
					Math.round(l1 + t * (l2 - l1)),
					a1 + t * (a2 - a1),
					targetP,
				];
			};
			const findSegment = (pos) => {
				for (let i = 0; i < hueStops.length - 1; i++) {
					if (pos >= hueStops[i][4] && pos <= hueStops[i + 1][4]) return [hueStops[i], hueStops[i + 1]];
				}
				return [hueStops[0], hueStops[hueStops.length - 1]];
			};

			const allPositions = [...new Set([...hueStops.map(s => s[4]), p0, p1])].sort((a, b) => a - b);
			const adjustedStops = [];
			allPositions.forEach(pos => {
				const color = interpolate(...findSegment(pos), pos);
				const rgbPart = color.slice(0, 3);
				// Two stops at a thumb make a hard edge: dimmed outside, full inside
				if (pos === p0) {
					adjustedStops.push([...rgbPart, 0.5, pos], [...rgbPart, 1, pos]);
				} else if (pos === p1) {
					adjustedStops.push([...rgbPart, 1, pos], [...rgbPart, 0.5, pos]);
				} else {
					const inRange = isWrapAround ? (pos >= p0 || pos <= p1) : (pos >= p0 && pos <= p1);
					adjustedStops.push([...rgbPart, inRange ? color[3] : 0.5, pos]);
				}
			});
			hueStops = adjustedStops;
		}
		track.style.background = buildSliderGradient(hueStops);
	}

	/**
	 * Split the track: the top half shows the mapped range, the bottom the full one.
	 * @param {Array<Array<number>>|null} mappedStops - null turns the split off
	 * @param {Array<Array<number>>} [fullStops]
	 */
	function setSplitGradient(mappedStops, fullStops) {
		if (!mappedStops) {
			slider.classList.remove(uiClass('slider-split'));
			trackMapped.style.background = '';
			return;
		}
		slider.classList.add(uiClass('slider-split'));
		trackMapped.style.background = buildSliderGradient(mappedStops);
		track.style.background = buildSliderGradient(fullStops);
	}

	/**
	 * @param {string|string[]} colors - one color, or one per thumb
	 */
	function setThumbColor(colors) {
		const colorArray = Array.isArray(colors) ? colors : [colors];
		colorArray.forEach((color, i) => { if (color) thumbColors[i] = color; });
		applyThumbColors();
	}

	// Thumb colors are inline styles, which beat the stylesheet's disabled
	// look; so a disabled slider overrides them here, and keeps them to
	// restore when re-enabled
	const thumbColors = [];
	function applyThumbColors() {
		const disabled = inputs[0].disabled;
		thumbs.forEach((t, i) => {
			t.style.background = disabled ? `var(--${UI_PREFIX}-fg-dim)` : (thumbColors[i] || '');
		});
	}

	/**
	 * Disable or enable every control of the slider: thumbs and value buttons.
	 * Side effects: sets disabled on them and a -slider-disabled class.
	 * @param {boolean} disabled
	 */
	function setDisabled(disabled) {
		inputs.forEach(input => { input.disabled = disabled; });
		valueButtons.forEach(button => { button.disabled = disabled; });
		slider.classList.toggle(uiClass('slider-disabled'), disabled);
		applyThumbColors();
	}

	if (opts.gradient) setGradient(opts.gradient);
	update();

	return {
		el: container,
		getValue: () => values[0],
		getValues: () => [...values],
		setValue: (v) => { values[0] = v; update(); },
		setValues: (vs) => { values = [...vs]; update(); },
		setGradient,
		setSplitGradient,
		setThumbColor,
		setDisabled,
	};
}

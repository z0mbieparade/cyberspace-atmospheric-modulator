// =====================================================
// UI: SETTINGS ENGINE
// =====================================================
// A declarative schema renders a settings form, tracks its values, and shows
// or hides fields by their showWhen conditions.
//
// Requires ui-dialog.js and ui-slider.js before this file.

/**
 * Creates a settings engine from a schema definition
 *
 * Field types: toggle, tristate, slider, range, text, textarea, select,
 * button, custom (def.render), hint, hr; and section, which nests fields.
 * A field with `sub: true` is drawn set in (.sub-setting), as part of the
 * switch above it, usually beside a showWhen on that switch.
 * @param {Object} opts
 * @param {Array} opts.schema - field and section definitions
 * @param {Object} [opts.values] - initial values by key
 * @param {Object} [opts.defaults] - values for reset(), over each def.default
 * @param {Function} [opts.onChange] - called with (key, value, api) on every change
 * @param {HTMLElement} opts.container - where render() puts the form
 * @returns {Object} the engine API
 */
function createSettingsEngine(opts) {
	const { schema, values = {}, defaults = {}, onChange, container } = opts;

	// Internal state: field key -> { value, element, slider?, definition }
	const fields = {};

	// Track which fields control visibility of others
	const dependencyMap = {}; // fieldKey -> [dependentFieldKeys]

	/**
	 * Evaluate a showWhen condition
	 */
	function evaluateCondition(condition) {
		if (!condition) return true;

		// Simple condition: { field: 'key', is: value }
		if (condition.field !== undefined) {
			const fieldState = fields[condition.field];
			if (!fieldState) return true;
			return fieldState.value === condition.is;
		}

		// Any condition: { any: [conditions] }
		if (condition.any) {
			return condition.any.some(c => evaluateCondition(c));
		}

		// All condition: { all: [conditions] }
		if (condition.all) {
			return condition.all.every(c => evaluateCondition(c));
		}

		return true;
	}

	/**
	 * Update visibility of a field based on its showWhen condition
	 */
	function updateVisibility(key) {
		const fieldState = fields[key];
		if (!fieldState || !fieldState.definition.showWhen) return;

		const visible = evaluateCondition(fieldState.definition.showWhen);
		if (fieldState.wrapper) {
			fieldState.wrapper.style.display = visible ? '' : 'none';
		}
	}

	/**
	 * Update all dependent field visibilities when a field changes
	 */
	function updateDependencies(changedKey) {
		const dependents = dependencyMap[changedKey] || [];
		dependents.forEach(key => updateVisibility(key));
	}

	/**
	 * Register a dependency relationship
	 */
	function registerDependency(dependentKey, condition) {
		if (!condition) return;

		const addDep = (cond) => {
			if (cond.field) {
				if (!dependencyMap[cond.field]) dependencyMap[cond.field] = [];
				if (!dependencyMap[cond.field].includes(dependentKey)) {
					dependencyMap[cond.field].push(dependentKey);
				}
			}
			if (cond.any) cond.any.forEach(addDep);
			if (cond.all) cond.all.forEach(addDep);
		};
		addDep(condition);
	}

	/**
	 * Get the current value for a field
	 */
	function getFieldValue(key) {
		const fieldState = fields[key];
		if (!fieldState) return undefined;
		return fieldState.value;
	}

	/**
	 * Set the value for a field and update UI
	 */
	function setFieldValue(key, value, triggerChange = true) {
		const fieldState = fields[key];
		if (!fieldState) return;

		fieldState.value = value;
		updateFieldUI(key, value);

		if (triggerChange) {
			updateDependencies(key);
			fieldState.definition.onChange?.(value, api);
			onChange?.(key, value, api);
		}
	}

	/**
	 * Update the UI element to reflect a value
	 */
	function updateFieldUI(key, value) {
		const fieldState = fields[key];
		if (!fieldState) return;

		const { definition, element, slider } = fieldState;

		switch (definition.type) {
			case 'toggle':
				if (element) {
					element.checked = !!value;
					syncToggle(element);
				}
				break;

			case 'tristate':
				if (element) syncTristate(element, value);
				break;

			case 'slider':
				if (slider) slider.setValue(value);
				break;

			case 'range':
				if (slider) slider.setValues(value);
				break;

			case 'text':
			case 'textarea':
				if (element) element.value = value || '';
				break;

			case 'select':
				if (element) element.value = value || '';
				break;
		}
	}

	/**
	 * Render a single field definition
	 * @param {Object} def
	 * @param {HTMLElement} parentEl
	 * @param {string} [sectionName] - the enclosing section's title as text:
	 *   the name of a field with neither a label nor an ariaLabel
	 */
	function renderField(def, parentEl, sectionName = '') {
		const { key, type, label, hint, showWhen } = def;

		// Create wrapper for the field
		const wrapper = document.createElement('div');
		wrapper.className = def.sub ? uiClass('settings-field', 'sub-setting') : uiClass('settings-field');
		if (key) wrapper.dataset.fieldKey = key;

		// Get initial value
		const initialValue = key ? (values[key] !== undefined ? values[key] : def.default) : undefined;

		let element = null;
		let slider = null;
		const inputId = uiId(`settings-${key || def.id}`);
		const ariaLabel = def.ariaLabel || (def.label ? '' : sectionName);

		switch (type) {
			case 'toggle': {
				wrapper.innerHTML = createInputRow({
					type: 'toggle',
					label: def.label,
					ariaLabel,
					id: inputId,
					checked: !!initialValue,
					disabled: typeof def.disabled === 'function' ? def.disabled(values) : def.disabled
				});
				element = wrapper.querySelector(`#${inputId}`);
				if (element) {
					element.addEventListener('change', () => {
						setFieldValue(key, element.checked);
					});
				}
				break;
			}

			case 'tristate': {
				wrapper.innerHTML = createInputRow({
					type: 'tristate',
					label: def.label,
					id: inputId,
					state: initialValue ?? null,
					defaultLabel: def.defaultLabel || ''
				});
				element = wrapper.querySelector(`#${inputId}`);
				if (element) {
					syncTristate(element, initialValue ?? null);
					// The browser has already flipped checked by now; overwrite it
					// with the next state of the cycle. (Cancelling the click
					// instead would make the browser restore the old state
					// after the handler, undoing setFieldValue.)
					element.addEventListener('change', () => {
						const current = fields[key].value;
						// Cycle: null -> true -> false -> null
						const next = current === null ? true : current === true ? false : null;
						setFieldValue(key, next);
					});
				}
				break;
			}

			case 'slider': {
				const sliderOpts = {
					type: 'single',
					simple: def.simple !== false,
					min: def.min ?? 0,
					max: def.max ?? 100,
					step: def.step ?? 1,
					value: initialValue ?? def.default ?? def.min ?? 0,
					label: def.label,
					onChange: (v) => setFieldValue(key, v)
				};
				slider = createSlider(sliderOpts);
				wrapper.appendChild(slider.el);
				break;
			}

			case 'range': {
				const rangeOpts = {
					type: 'range',
					min: def.min ?? 0,
					max: def.max ?? 100,
					step: def.step ?? 1,
					values: initialValue ?? def.default ?? [def.min ?? 0, def.max ?? 100],
					label: def.label,
					onChange: (v) => setFieldValue(key, v)
				};
				slider = createSlider(rangeOpts);
				wrapper.appendChild(slider.el);
				break;
			}

			case 'text': {
				wrapper.innerHTML = createInputRow({
					type: 'text',
					label: def.label,
					ariaLabel,
					id: inputId,
					value: initialValue || '',
					placeholder: def.placeholder || ''
				});
				element = wrapper.querySelector(`#${inputId}`);
				if (element) {
					element.addEventListener('input', () => {
						setFieldValue(key, element.value);
					});
				}
				break;
			}

			case 'textarea': {
				wrapper.innerHTML = createInputRow({
					type: 'textarea',
					label: def.label,
					ariaLabel,
					id: inputId,
					value: initialValue || '',
					placeholder: def.placeholder || ''
				});
				element = wrapper.querySelector(`#${inputId}`);
				if (element) {
					element.addEventListener('input', () => {
						setFieldValue(key, element.value);
					});
				}
				break;
			}

			case 'select': {
				const optionsHtml = def.options.map(opt => {
					const { value, label } = typeof opt === 'string' ? { value: opt, label: opt } : opt;
					return `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`;
				}).join('');
				wrapper.innerHTML = createInputRow({
					type: 'select',
					label: def.label,
					ariaLabel,
					id: inputId,
					options: optionsHtml
				});
				element = wrapper.querySelector(`#${inputId}`);
				if (element) {
					element.value = initialValue || '';
					element.addEventListener('change', () => {
						setFieldValue(key, element.value);
					});
				}
				break;
			}

			case 'button': {
				wrapper.innerHTML = createInputRow({
					type: 'button',
					label: def.label,
					id: inputId,
					buttonText: def.buttonText || def.label,
					// A button that destroys something: in the error color
					classes: def.danger ? uiClass('danger') : '',
				});
				element = wrapper.querySelector(`#${inputId}`);
				if (element && def.onClick) {
					element.addEventListener('click', () => def.onClick(api));
				}
				break;
			}

			case 'custom': {
				if (def.render) {
					const customEl = def.render(initialValue, api);
					if (customEl) wrapper.appendChild(customEl);
				}
				break;
			}

			case 'hint': {
				wrapper.innerHTML = `<div class="hint">${def.text || def.label}</div>`;
				break;
			}

			case 'hr': {
				wrapper.innerHTML = '<hr />';
				break;
			}
		}

		// Add hint if provided (and not already a hint type)
		if (hint && type !== 'hint') {
			const hintEl = document.createElement('div');
			hintEl.className = 'hint';
			hintEl.innerHTML = hint;
			wrapper.appendChild(hintEl);
		}

		// Store field state
		if (key) {
			fields[key] = {
				value: initialValue,
				element,
				slider,
				wrapper,
				definition: def
			};

			// Register dependencies
			if (showWhen) {
				registerDependency(key, showWhen);
			}
		}

		parentEl.appendChild(wrapper);
		return wrapper;
	}

	/**
	 * Render a section with header and fields
	 */
	function renderSection(def, parentEl) {
		const sectionName = def.label ? def.label.replace(/<[^>]*>/g, '').trim() : '';
		// Create wrapper for section + hr so we can hide both together
		const wrapper = document.createElement('div');
		wrapper.className = uiClass('settings-section-wrapper');

		const section = document.createElement('div');
		section.className = uiClass('settings-section');

		if (def.label) {
			const header = document.createElement('h4');
			header.innerHTML = def.label;
			section.appendChild(header);
		}

		if (def.hint) {
			const hint = document.createElement('div');
			hint.className = 'hint';
			hint.innerHTML = def.hint;
			section.appendChild(hint);
		}

		if (def.fields) {
			def.fields.forEach(fieldDef => {
				if (fieldDef.type === 'section') {
					renderSection(fieldDef, section);
				} else {
					renderField(fieldDef, section, sectionName);
				}
			});
		}

		wrapper.appendChild(section);

		// Add hr after section (unless noHr is set)
		if (!def.noHr) {
			const hr = document.createElement('hr');
			wrapper.appendChild(hr);
		}

		parentEl.appendChild(wrapper);

		// Handle showWhen for sections
		if (def.showWhen) {
			const sectionKey = `_section_${def.label || Math.random()}`;
			fields[sectionKey] = {
				value: null,
				element: null,
				slider: null,
				wrapper: wrapper,
				definition: def
			};
			registerDependency(sectionKey, def.showWhen);
		}

		return wrapper;
	}

	/**
	 * Render the full schema
	 */
	function render() {
		if (!container) return;

		schema.forEach(def => {
			if (def.type === 'section') {
				renderSection(def, container);
			} else {
				renderField(def, container);
			}
		});

		// Apply initial visibility based on showWhen conditions
		Object.keys(fields).forEach(key => {
			updateVisibility(key);
		});
	}

	/**
	 * Get all current values as an object
	 */
	function getValues() {
		const result = {};
		Object.keys(fields).forEach(key => {
			const fieldState = fields[key];
			// Buttons and custom fields hold no value; a key only lets showWhen find them
			if (fieldState && !['button', 'custom'].includes(fieldState.definition.type)) {
				result[key] = fieldState.value;
			}
		});
		return result;
	}

	/**
	 * Set multiple values at once
	 */
	function setValues(newValues, triggerChange = false) {
		Object.keys(newValues).forEach(key => {
			if (fields[key]) {
				setFieldValue(key, newValues[key], triggerChange);
			}
		});
		// Update all visibilities after bulk update
		Object.keys(fields).forEach(key => updateVisibility(key));
	}

	/**
	 * Reset all fields to defaults
	 */
	function reset() {
		// Collect all defaults from schema
		const defaultValues = { ...defaults };

		const collectDefaults = (items) => {
			items.forEach(def => {
				if (def.type === 'section' && def.fields) {
					collectDefaults(def.fields);
				} else if (def.key && def.default !== undefined) {
					if (defaultValues[def.key] === undefined) {
						defaultValues[def.key] = def.default;
					}
				}
			});
		};
		collectDefaults(schema);

		setValues(defaultValues, true);
	}

	/**
	 * Get a field's API (element, slider methods, etc.)
	 */
	function getField(key) {
		const fieldState = fields[key];
		if (!fieldState) return null;

		return {
			element: fieldState.element,
			wrapper: fieldState.wrapper,
			getValue: () => fieldState.value,
			setValue: (v) => setFieldValue(key, v),
			// Slider-specific methods
			setGradient: fieldState.slider?.setGradient,
			setSplitGradient: fieldState.slider?.setSplitGradient,
			setThumbColor: fieldState.slider?.setThumbColor,
			setDisabled: fieldState.slider?.setDisabled,
			setValues: fieldState.slider?.setValues,
			getValues: fieldState.slider?.getValues
		};
	}

	/**
	 * Destroy the engine and clean up
	 */
	function destroy() {
		if (container) {
			container.innerHTML = '';
		}
		Object.keys(fields).forEach(key => delete fields[key]);
		Object.keys(dependencyMap).forEach(key => delete dependencyMap[key]);
	}

	// Public API
	const api = {
		render,
		getValues,
		setValues,
		reset,
		getField,
		destroy,
		// Direct access for advanced use cases
		fields,
		setFieldValue,
		getFieldValue,
		updateDependencies
	};

	return api;
}

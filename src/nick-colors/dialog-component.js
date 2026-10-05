// =====================================================
// HELP
// =====================================================
// createDialog and the other UI pieces come from src/shared; the footer comes
// from the script's dialogDefaults() (src/settings-panel.js).

/**
 * Shows a help dialog explaining how the plugin works
 */
function showHelpDialog() {
	createDialog({
		title: 'Nick Colors - Help',
		width: '420px',
		onHelp: null,
		warning: '',
		attribution: [],
		buttons: [{ label: 'CLOSE', class: 'nc-close-btn', onClick: (close) => close() }],
		content: `
			<div class="nc-help-content">
				<h4>What is this?</h4>
				<p>A userscript that gives each username a unique, consistent color based on a hash of their name. Colors persist across sessions and pages.</p>

				<h4>Quick Start</h4>
				<ul>
					<li><strong>Right-click any username</strong> and choose <strong>Color</strong> to customize its color, icon, or style</li>
					<li><strong>Use the SETTINGS button</strong> to configure global color ranges and options</li>
				</ul>

				<h4>Settings Overview</h4>
				<ul>
					<li><strong>Preset Themes</strong> - Match colors to site themes (VT320, Poetry, etc.)</li>
					<li><strong>Monochrome Mode</strong> - Use one color for all usernames</li>
					<li><strong>H/S/L Ranges</strong> - Limit hue, saturation, and lightness ranges</li>
					<li><strong>Contrast Threshold</strong> - Auto-invert colors for readability (WCAG ratios)</li>
					<li><strong>Style Variations</strong> - Add bold, italic, small-caps, or icons</li>
				</ul>

				<h4>Per-User Customization</h4>
				<ul>
					<li><strong>Color</strong> - Set via sliders or custom hex/hsl value</li>
					<li><strong>Icons</strong> - Prepend/append symbols (auto, custom, or disabled)</li>
					<li><strong>Styles</strong> - Override weight, italic, small-caps per user</li>
					<li><strong>Inversion</strong> - Force or prevent background inversion</li>
					<li><strong>Custom CSS</strong> - Add any additional styles</li>
				</ul>

				<h4>Tips</h4>
				<ul>
					<li>Colors are mapped proportionally to your configured ranges</li>
					<li>Site-wide overrides are loaded in remote from github, but can be overridden locally</li>
					<li>Export your settings to back them up or share with others</li>
				</ul>

				<h4>Bugs</h4>
				<ul>
					<li>Report issues either on <a href="https://github.com/z0mbieparade/cyberspace-atmospheric-modulator/issues" target="_blank" rel="noopener noreferrer">GitHub</a></li>
					<li>Or use <strong>Report Issue</strong> under Settings &gt; ${escapeHtml(SETTINGS_TAB_LABEL)} &gt; ${escapeHtml(BACKUP_SECTION_TITLE)}</li>
				</ul>
			</div>
		`,
	});
}

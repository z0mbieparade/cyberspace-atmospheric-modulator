// =====================================================
// MENU COMMANDS
// =====================================================

// Tampermonkey grants GM_registerMenuCommand as a direct global (not on
// window); Greasemonkey 4 only has GM.registerMenuCommand. Null when the
// manager provides neither, so callers check before registering.
const registerMenuCommand = (typeof GM_registerMenuCommand === 'function')
	? GM_registerMenuCommand
	: (typeof GM !== 'undefined' && typeof GM.registerMenuCommand === 'function')
		? GM.registerMenuCommand
		: null;

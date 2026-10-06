# Changelog

All notable changes to this project will be documented in this file.

## [0.2.2] - 2026-10-06

### Added
- **GIFs undither too** - hover or hold a GIF in chat and the original, animated, shows over its dithered canvas
- **Only color my friends** - a Nick Colors switch, off by default, that colors only the people you add. Their menu gets **Add Color**, or **Edit Color** and **Remove Color**; the settings show them as a wrapped list, each with an × to remove it. Everyone else keeps the site's colors. Turned on with an empty list, it adds you first

### Fixed
- **A feature switched off still ran after a reload in Greasemonkey** - with storage that loads asynchronously, features started before the saved switches arrived, so they ran with the defaults. Features now wait for storage
- **Turning nick colors off left names colored until a reload** - names lose their colors at once, and get them back when it is turned on

## [0.2.1] - 2026-10-06

### Added
- **Image undither says when it can't work** - in a userscript manager that runs scripts apart from the page, such as MonkeyScript, Settings > AtmoMod shows a warning under Undither images, once a hover finds nothing to show, instead of hover silently doing nothing
- The script asks to run in the page (`@inject-into auto`), for managers that honor it

### Fixed
- **Long styles typed in the Color dialog were cut on load** - icons over 50 characters and CSS values over 200 were dropped from storage. Those limits apply to imports only
- **Additional CSS could still move a name** - `-webkit-transform`, `offset-path` and the logical insets such as `inset-inline-start` got past the block list, as did a vendor-prefixed or hyphenated key in storage. Keys are checked as the property the browser applies, and Save says what it left out
- **Styles already saved lose any blocked property or unsafe value on load**, such as a `transform` or a `background-image: url(...)`. Storage cannot tell your own CSS from an old shared file's
- **Importing one name's style lost its letter spacing and text decoration** - both go into Additional CSS
- **An imported value with a line break could set any property** - it landed in Additional CSS, which Save splits by line. Values with a line break or another control character are refused
- Usernames that are built-in object properties, such as `__proto__` or `toString`, are ignored

## [0.2.0] - 2026-10-05

The first release of Cyberspace Atmospheric Modulator: usability features for Cyberspace as one userscript, with the Nick Colors userscript built in.

### Added
- **Image undither** - hover, focus or press and hold a dithered image to see the original. It is shown at the dithered image's size, so the page does not reflow. The menu command **Dump Image Undither Diagnostics** reports what the hooks saw
- **Nick colors, built in** - Nick Colors 1.3.4, on by default. **Import from Nick Colors** brings over the standalone script's settings, colors and notes
- **Nick notes** - notes are their own feature, with their own switch and storage. Existing notes move over from nick colors' storage automatically. The tooltip shows on hover and on keyboard focus, and Escape hides it
- **User menu** - right-click or long-press a username for **Color**, **Notes**, **Poke** and **Profile**. Color shows while nick colors is on, and Notes while nick notes is; Poke and Profile are left out on that user's own profile
- **Username finder** - one shared search marks every username and @mention on the page, for nick colors, nick notes and the user menu. It runs while either feature is on, so notes work without colors
- **Poke** - sends the same nudge as the site's **[P] Poke** button, through the Cyberspace API
- **Settings > AtmoMod tab** - every setting on the site's own settings page, at `#atmomod`, with the report-to-z0ylent notice and version at the top
- **Sidebar button** - under the globe, to the AtmoMod tab: a waveform icon when collapsed, **AtmoMod** and the version when open, with a dashed border so it isn't taken for part of the site
- **Backup & Troubleshooting** - one settings file for the whole script, debug mode, a debug log, **Report Issue**, and **Erase All Settings**, which asks first
- **C-Mail through the API** - Report Issue and Request Override send as the signed-in user, falling back to filling in the compose box. A send that may have gone through says so rather than sending twice
- Theme colors and nick color presets for the site's newer themes: LCD, Crypt, Bubblegum and Top8
- `overrides.json` in this repo, a copy of Nick Colors'
- Console lines start with `[AtmoMod]`, or `[AtmoMod|<feature>]` for a feature's

### Changed (from Nick Colors 1.3.4)
- Right-clicking a name opens the user menu rather than the nick settings dialog
- The per-user dialog no longer holds notes. Its **[SETTINGS]** button opens the settings tab
- Dialogs, inputs and sliders are shared, `atmo-`-prefixed, and keyboard-operable: focus trap, labels, native range inputs
- Report issues on this repo's GitHub, or with Report Issue

### Fixed
- Usernames are escaped in dialog titles and previews, so a crafted name cannot inject HTML
- **Settings files, pasted settings and `overrides.json` cannot run script or reach beyond a name** - imported settings are checked by type and range; imported styles and overrides keep only colors, fonts, spacing, decoration and icons, and an import says what it left out. Values shown in dialogs are escaped. Both holes are in Nick Colors 1.3.4 too
- API requests refuse redirects, so the session token cannot follow one elsewhere

Before 0.2.0 this project was the standalone Nick Colors userscript. Its history follows.

## [1.3.4] - 2026-09-02

### Added
- **Update banner** - a newer release now slides down a banner from the top of the page instead of only tinting the version number in a dialog footer nobody opens. `UPDATE` opens the new version to install, `LATER` hides it until the next page load, `x` hides it until something newer than that version ships
- Section 7 of `tests/visual-test.html` shows the banner on demand, so it can be checked against every preset theme's warn colors
- Tests for version comparison and the banner's show/dismiss rules

### Fixed
- **The update check never ran without `GM_xmlhttpRequest`** - it returned early, so anyone on a manager that doesn't grant it was never told about a new release. It now falls back to `fetch`
- **The update check fired on any differing version, not a newer one** - a local build ahead of `main` prompted you to "update" backwards. Versions are now compared numerically per segment, so `1.3.10` correctly beats `1.3.9`
- `@updateURL`/`@downloadURL` moved to `raw.githubusercontent.com`, so the URL the manager reports back through `GM_info` is one a plain `fetch` can actually read

### Changed
- The script's own download URL is built once in `getScriptURL()` rather than assembled from `GM_info` in two places

## [1.3.3] - 2026-09-02

### Added
- Tests for the GM storage shim covering sync `GM_*`, async `GM.*`, async `GM_*`, the no-manager localStorage fallback, and a `GM_getValue` that throws

### Fixed
- **Settings failed to load on managers with an async `GM_*` API** - detection assumed the `GM_*` names meant synchronous functions, so a manager implementing them async handed callers a Promise and every read blew up with `Unexpected token 'o', "[object Promise]" is not valid JSON`. Which API is in use is now decided by probing what `GM_getValue` actually returns, so async `GM_*` routes through the same value cache as `GM.*`
- **Remote overrides never loaded without `GM_xmlhttpRequest`** - `OVERRIDES_URL` pointed at `github.com/.../raw/...`, which 302-redirects with an empty `Access-Control-Allow-Origin` and kills the plain `fetch` fallback used when a manager doesn't grant `GM_xmlhttpRequest`. It now points at `raw.githubusercontent.com` directly
- Async storage writes are fire-and-forget but no longer uncaught, so a rejecting manager can't surface as an unhandled rejection

### Changed
- **Debug tracing is now behind debug mode** - theme variable dumps, remote override counts, theme change records, the nick picker's color calculation dump, and the C-Mail compose traces all logged to the console unconditionally. `[Nick Colors] Loaded.` and genuine errors still always log
- `_hasOldGM`/`_hasNewGM` renamed to `_hasSyncGM`/`_hasAsyncGM` - whether the names exist was never the real question, how they behave is
- The persisted storage key list is now `GM_STORAGE_KEYS` instead of being repeated in three places

## [1.3.2]

### Added
- **Host exclusion list** - `HOST_EXCLUDE` skips whole subdomains, matching the host and any of its subdomains; `page.cyberspace.online` and `terminal.cyberspace.online` are excluded
- `/pages` added to `PATH_EXCLUDE`
- Excluded hosts and paths now live in `src/exclusions.json`, the single source for both the userscript `@exclude` header lines (generated at build time) and the `HOST_EXCLUDE`/`PATH_EXCLUDE` constants in the bundle

## [1.3.1] - 2026-08-08

### Added
- **Page exclusion list** - `PATH_EXCLUDE` skips coloring entirely on pages that render their own content; `/terminal` (the canvas terminal emulator) is the first entry
- Path matching now compares whole segments, so `/terminal` matches `/terminal` and `/terminal/x` but not `/terminals`

### Changed
- Permissive-path hint for chat now also covers the bare `/chat` index page, not just `/chat/<room>`
- LOGIC.md updated to match the code - theme detection reads `<html data-theme>` and resolves colors per-key through CSS variable → `custom_theme` → preset → default; corrected the preset theme table (4 hue ranges were wrong); documented the contrast lightness adjustment and how inverted containers actually work

### Fixed
- `data-contrast-ratio` on colored nicks was always the string `"undefined"` - it now holds the final ratio after inversion and contrast adjustment

## [1.3.0] - 2026-02-10

### Added
- **Beta site support** - Script now works on beta.cyberspace.online in addition to the main site
- Added selector for beta site's username spans (`span.cursor-pointer.hover:underline`)
- Site-specific container hints (beta uses `#main-content-area` and `.space-y-1`)
- Path-based hints - more permissive coloring on `/chat/` pages

### Fixed
- Username detection now works for elements without href attributes (beta site compatibility)
- User list usernames on beta site now get colored
- GM storage now supports both old (`GM_*`) and new (`GM.*`) APIs - settings/notes sync across both domains

## [1.2.4] - 2026-01-14

### Added
- **Update indicator** - Version in dialog footer highlights when update available; click to install
- **Greasemonkey 4+ support** - Added `GM.xmlHttpRequest` compatibility for newer Greasemonkey versions

### Fixed
- Added `github.com` to `@connect` list for overrides.json fetch (was causing "not part of @connect list" error)

## [1.2.2] - 2026-01-13

### Added
- **Font family tristate toggle** - Custom font now has auto/off/on states like other style variations (auto inherits from remote overrides)

### Fixed
- Bug with not removing userNotes from styles
- MANUAL_OVERRIDES now properly merge with local customNickColors (remote as base, local on top)

## [1.2.1] - 2026-01-13

### Fixed
- Bug where editor crashes if @username is typed

## [1.2.0] - 2026-01-13

### Added
- **User notes** - Add personal notes about users that display on hover (300ms delay)
- **Contrast toggle** - Enable/disable contrast auto-inversion from site settings
- **Font family** - Per-user custom font family support
- **Mobile long-press** - 500ms long-press on usernames opens settings (with visual feedback)

### Fixed
- Dialog close behavior - Dialogs no longer close when dragging sliders outside the dialog

## [1.1.0] - 2025-12-15

### Added
- **Settings engine** - Unified schema-based settings system for all dialogs
- **WCAG contrast** - Contrast calculations now use proper WCAG 2.1 luminance ratios
- **Help dialog** - Added help information accessible from settings
- **Test suite** - Comprehensive tests for color functions, contrast, and import/export
- **Inverted container support** - Proper color handling in inverted background containers

### Changed
- Refactored source into separate files with build script
- Styles moved to SCSS
- Improved site theme detection and integration
- Better preset theme defaults

### Fixed
- Contrast calculation accuracy
- Import/export v1 to v1.1 migration

## [1.0.0] - 2025-12-12

### Added
- **Hash-based coloring** - Consistent colors for usernames based on hash
- **@mention detection** - Colors @username mentions in chat
- **Hue/Saturation/Lightness ranges** - Configurable color ranges
- **Contrast threshold** - Auto-invert colors for readability
- **Preset themes** - Quick presets matching Cyberspace site themes
- **Site theme integration** - Match custom site theme colors
- **Style variations** - Vary font-weight, italic, small-caps by hash
- **Username icons** - Prepend/append hash-based icons
- **Per-user overrides** - Custom colors, icons, and styles per user
- **Import/Export** - Backup and restore settings
- **Remote overrides** - Site-wide nick color overrides from JSON

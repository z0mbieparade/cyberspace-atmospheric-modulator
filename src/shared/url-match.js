// =====================================================
// URL MATCHING
// =====================================================

/**
 * Whether the current page path matches one of the given path patterns.
 * Matches whole segments, so '/terminal' matches '/terminal' and '/terminal/x',
 * but not '/terminals'. Trailing slashes are ignored on both sides.
 * @param {string[]} paths
 * @returns {boolean}
 */
function isPathMatch(paths) {
	if (!paths || paths.length === 0) return false;
	const currentPath = window.location.pathname.replace(/\/+$/, '');
	return paths.some(path => {
		const pattern = path.replace(/\/+$/, '');
		if (!pattern) return false;
		return currentPath === pattern || currentPath.startsWith(pattern + '/');
	});
}

/**
 * Whether the current hostname matches one of the given hosts.
 * Matches the host itself and any of its subdomains, so 'page.cyberspace.online'
 * matches 'page.cyberspace.online' and 'x.page.cyberspace.online',
 * but not 'mypage.cyberspace.online'.
 * @param {string[]} hosts
 * @returns {boolean}
 */
function isHostMatch(hosts) {
	if (!hosts || hosts.length === 0) return false;
	const currentHost = window.location.hostname.toLowerCase();
	return hosts.some(host => {
		const pattern = host.toLowerCase();
		if (!pattern) return false;
		return currentHost === pattern || currentHost.endsWith('.' + pattern);
	});
}

/**
 * Whether this page is the user's profile, /<username>, rather than one of
 * their posts.
 * @param {string} username
 * @returns {boolean}
 */
function isOnProfileOf(username) {
	// Ignoring case: a mention may be typed in another case than the profile's URL
	return window.location.pathname.replace(/\/+$/, '').toLowerCase() === '/' + username.toLowerCase();
}

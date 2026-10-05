// =====================================================
// LONG PRESS (touch)
// =====================================================

// Movement past this many px means the user is scrolling, not holding
const LONG_PRESS_MOVE_THRESHOLD = 10;

/**
 * Run handlers for press-and-hold on touch screens.
 *
 * One hold at a time: a new single touch releases the previous one.
 * Multi-touch (pinch) never starts a hold; it cancels a pending hold and
 * leaves a completed one alone.
 *
 * Side effects: adds touchstart, touchmove, touchend and touchcancel
 * listeners to document, all passive.
 * @param {object} handlers
 * @param {(e: TouchEvent) => (Element|null)} handlers.findTarget - the element
 *   the touch started on, or null to ignore this touch
 * @param {() => number} handlers.getDuration - ms of press before onHold
 * @param {(el: Element) => void} handlers.onHold
 * @param {(el: Element) => void} [handlers.onPress] - called when a hold starts
 * @param {(el: Element, held: boolean) => void} [handlers.onRelease] - called when
 *   the last finger lifts, the finger moves too far, or the touch is
 *   cancelled. held is true when onHold already ran.
 */
function attachLongPress({ findTarget, getDuration, onHold, onPress, onRelease }) {
	let timer = null;
	let target = null;
	let startPos = null;
	let held = false;

	const release = () => {
		if (timer) {
			clearTimeout(timer);
			timer = null;
		}
		const el = target;
		const wasHeld = held;
		target = null;
		startPos = null;
		held = false;
		if (el && onRelease) onRelease(el, wasHeld);
	};

	document.addEventListener('touchstart', (e) => {
		// A second finger (pinch) cancels a pending hold but leaves a completed
		// one in place until every finger lifts
		if (e.touches.length !== 1) {
			if (timer) release();
			return;
		}
		release();
		const el = findTarget(e);
		if (!el) return;
		target = el;
		startPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
		if (onPress) onPress(el);
		timer = setTimeout(() => {
			timer = null;
			held = true;
			onHold(el);
		}, getDuration());
	}, { passive: true });

	document.addEventListener('touchmove', (e) => {
		// Only a pending hold can be cancelled by movement; once held, the
		// finger may drift until it lifts
		if (!timer || !startPos) return;
		const dx = Math.abs(e.touches[0].clientX - startPos.x);
		const dy = Math.abs(e.touches[0].clientY - startPos.y);
		if (dx > LONG_PRESS_MOVE_THRESHOLD || dy > LONG_PRESS_MOVE_THRESHOLD) release();
	}, { passive: true });

	// touchend fires for every finger that lifts; the hold ends with the last
	document.addEventListener('touchend', (e) => {
		if (e.touches.length === 0) release();
	}, { passive: true });
	document.addEventListener('touchcancel', release, { passive: true });
}

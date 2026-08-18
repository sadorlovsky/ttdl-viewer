import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef } from "react";

/** How long a finger has to stay put before it counts as a press rather than the start of a swipe. */
const HOLD_MS = 400;

/**
 * How far it may drift first.
 *
 * Every swipe through the feed begins as a press on the media, so without this a slow-starting
 * flick is indistinguishable from a hold: the timer fires mid-swipe and opens the menu over the
 * post being scrolled to. `pointercancel` arrives too, but only once the browser has decided the
 * gesture is a scroll, which can be well past 400ms.
 */
const HOLD_SLOP = 10;

/**
 * How far sideways before a gesture is a swipe between images.
 *
 * Deliberately close to the hold's slop rather than far beyond it. A finger reports its way across
 * the glass in a few pixels at a time, so a threshold set generously wide is not a stricter test —
 * it is a later one, and the browser will have committed the gesture to scrolling long before it
 * is met.
 */
const SWIPE_PX = 18;

/**
 * How much more sideways than up-and-down a swipe has to be.
 *
 * The feed scrolls vertically and a carousel steps horizontally, and the same finger starts both.
 * Distance alone would hand a lazy diagonal to whichever axis crossed its threshold first, which is
 * a coin toss; requiring the horizontal to lead means an ambiguous gesture stays with the feed,
 * where being wrong costs a scroll rather than a lost place in the post.
 */
const SWIPE_BIAS = 1.2;

/** Anything with its own gesture is left alone: the play badge, a carousel segment, the scrubber. */
const INTERACTIVE = "button, a, input, [data-interactive]";

interface Gesture {
	/** Where the current stretch is measured from; a swipe re-bases it so a long drag can step on. */
	x: number;
	y: number;
	/** Still eligible to become a press: nothing has moved far enough to say otherwise. */
	hold: boolean;
	/** Something has already been made of this gesture, so the lift is not also a tap. */
	spent: boolean;
}

export interface LongPress {
	/** Spread onto the element the gesture belongs to. */
	handlers: {
		onPointerDown: (event: ReactPointerEvent) => void;
		onPointerMove: (event: ReactPointerEvent) => void;
		onPointerUp: (event: ReactPointerEvent) => void;
		onPointerCancel: () => void;
		onContextMenu: (event: { preventDefault: () => void }) => void;
	};
	/** Abandon a press in flight — for a slide being scrolled away from mid-hold. */
	cancel: () => void;
}

interface Options {
	/**
	 * A press that outlasted the timer.
	 *
	 * Takes where the finger went down, as a fraction across the surface, because what a hold means
	 * depends on where it is: near the leading edge it runs the post fast, anywhere else it opens
	 * the sheet. The consumer decides; the gesture only reports.
	 */
	onLongPress: (at: { x: number }) => void;
	/** The hold ended — the finger came up, or the gesture was taken away. */
	onRelease?: () => void;
	onTap: () => void;
	/** A decisive sideways drag, once per stretch of one. Omit where sideways means nothing. */
	onSwipe?: (direction: 1 | -1) => void;
}

/**
 * Tap, press-and-hold and sideways swipe on one surface.
 *
 * All three are decided from pointer events alone; `click` is deliberately not used. In a
 * scroll-snapping feed it is not a reliable signal: the browser withholds it after a
 * `pointercancel`, and after a press it fires against the nearest common ancestor of where the
 * finger went down and where it came up — which, once a sheet has appeared under the finger, is
 * not the element that was pressed. Both cases read to the viewer as a tap that did nothing, and
 * on a snapping scroller they are common rather than exotic. A pointerup that started on this
 * surface and never wandered is a tap, and nothing else has to agree.
 *
 * The gesture outlives the press it might have been. Abandoning the whole thing the moment a
 * finger moved past the hold's slop is what made the sideways swipe almost impossible to perform:
 * a finger crosses ten pixels several reports before it crosses enough to mean anything, so by the
 * time there was a swipe to recognise there was nothing left to recognise it with.
 */
export function useLongPress({ onLongPress, onRelease, onTap, onSwipe }: Options): LongPress {
	const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
	/** The gesture in flight, or null between them. */
	const gesture = useRef<Gesture | null>(null);
	/** Set once the hold has fired, so the release can be reported exactly once. */
	const holding = useRef(false);

	// Read through refs so the handlers can stay stable across renders: they are spread onto a
	// slide, and a new identity every render would churn its listeners during playback.
	const latest = useRef({ onLongPress, onRelease, onTap, onSwipe });
	latest.current = { onLongPress, onRelease, onTap, onSwipe };

	const release = useCallback(() => {
		if (!holding.current) {
			return;
		}
		holding.current = false;
		latest.current.onRelease?.();
	}, []);

	const cancel = useCallback(() => {
		clearTimeout(timer.current);
		gesture.current = null;
		release();
	}, [release]);

	// A hold still pending when the slide unmounts would fire against a detached element, and one
	// that had already fired would never be told the finger was gone.
	useEffect(
		() => () => {
			clearTimeout(timer.current);
			release();
		},
		[release],
	);

	const onPointerDown = useCallback((event: ReactPointerEvent) => {
		// A secondary button is a right-click; the browser turns that into `contextmenu`, which
		// is handled below. Starting the hold timer as well would open the sheet twice.
		if (event.button !== 0) {
			return;
		}
		if ((event.target as HTMLElement | null)?.closest(INTERACTIVE)) {
			return;
		}
		// Where on the surface, not where on the screen: the surface is what the caller reasons
		// about, and it is not always the whole window.
		const box = event.currentTarget.getBoundingClientRect();
		const within = box.width > 0 ? (event.clientX - box.left) / box.width : 0;
		gesture.current = { x: event.clientX, y: event.clientY, hold: true, spent: false };
		timer.current = setTimeout(() => {
			const live = gesture.current;
			if (!live?.hold) {
				return;
			}
			live.spent = true;
			holding.current = true;
			latest.current.onLongPress({ x: within });
		}, HOLD_MS);
	}, []);

	const onPointerMove = useCallback((event: ReactPointerEvent) => {
		const live = gesture.current;
		if (!live || holding.current) {
			return;
		}
		const dx = event.clientX - live.x;
		const dy = event.clientY - live.y;
		if (
			latest.current.onSwipe &&
			Math.abs(dx) > SWIPE_PX &&
			Math.abs(dx) > Math.abs(dy) * SWIPE_BIAS
		) {
			clearTimeout(timer.current);
			live.hold = false;
			live.spent = true;
			// Measure the next stretch from here, so one long drag can step on through the images
			// rather than spending itself on the first of them.
			live.x = event.clientX;
			live.y = event.clientY;
			latest.current.onSwipe(dx < 0 ? 1 : -1);
			return;
		}
		if (live.hold && (Math.abs(dx) > HOLD_SLOP || Math.abs(dy) > HOLD_SLOP)) {
			// Moved: no longer a press, and no longer a tap. The gesture itself carries on, because
			// a swipe has not had the room to declare itself yet.
			clearTimeout(timer.current);
			live.hold = false;
		}
	}, []);

	const onPointerUp = useCallback(
		(event: ReactPointerEvent) => {
			const live = gesture.current;
			cancel();
			// A gesture that became something else, or wandered, is not a tap.
			if (!live || live.spent || !live.hold) {
				return;
			}
			// The lift can land somewhere with its own gesture even when the press did not start
			// there; a tap that ends on the scrubber belongs to the scrubber.
			if ((event.target as HTMLElement | null)?.closest(INTERACTIVE)) {
				return;
			}
			latest.current.onTap();
		},
		[cancel],
	);

	const onContextMenu = useCallback((event: { preventDefault: () => void }) => {
		// On a desktop pointer the browser's own menu is what a long press produces, and it is
		// the wrong menu. On touch it is the callout, which is worse: it offers to save a file
		// the viewer already has. Either way this gesture belongs to the sheet — and never to
		// the speed-up, which has no way of ever being released from here.
		event.preventDefault();
		latest.current.onLongPress({ x: 1 });
	}, []);

	return {
		handlers: {
			onPointerDown,
			onPointerMove,
			onPointerUp,
			onPointerCancel: cancel,
			onContextMenu,
		},
		cancel,
	};
}

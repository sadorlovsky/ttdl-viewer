import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * How long the pointer has to rest on a tile before its post starts playing.
 *
 * The grid is six columns wide on a desktop screen, so crossing it takes a pointer past a dozen
 * tiles in well under a second. Without a delay every one of them opens a connection and asks a
 * disk — which on the archive this was built for is a NAS across a wireless link — for the head of
 * a file nobody wanted to see. Long enough to mean it, short enough that the wait is not the thing
 * you notice.
 */
const INTENT_MS = 300;

const FINE_POINTER = "(hover: hover) and (pointer: fine)";
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function queries(): MediaQueryList[] {
	return [window.matchMedia(FINE_POINTER), window.matchMedia(REDUCED_MOTION)];
}

function subscribe(onChange: () => void): () => void {
	const list = queries();
	for (const query of list) {
		query.addEventListener("change", onChange);
	}
	return () => {
		for (const query of list) {
			query.removeEventListener("change", onChange);
		}
	};
}

function allowed(): boolean {
	const [fine, still] = queries();
	return Boolean(fine?.matches) && !still?.matches;
}

/**
 * Whether this visitor gets moving previews at all.
 *
 * Two tests, and neither is a width. A hover that never arrives is the failure mode DESIGN.md
 * names for touch screens, so the pointer decides — a tablet with a trackpad qualifies and a wide
 * phone does not. And an autoplaying loop under the pointer is exactly the incidental motion
 * `prefers-reduced-motion` is for: the answer there is no preview, not a faster one, because there
 * is nothing to shorten.
 *
 * Live rather than read once, because both can change under a running page — a laptop that gains a
 * mouse, a system setting flipped in another window.
 */
export function usePreviewsAllowed(): boolean {
	return useSyncExternalStore(subscribe, allowed, () => false);
}

export interface PreviewIntent {
	/** True once the pointer has rested long enough for the preview to be worth loading. */
	armed: boolean;
	handlers: {
		onPointerEnter: (event: React.PointerEvent) => void;
		onPointerLeave: () => void;
		onPointerCancel: () => void;
	};
}

/**
 * Arm a tile's preview after the pointer has stayed on it.
 *
 * `pointerType` is checked rather than assumed: a tap on a touch screen also delivers a
 * pointerenter, and it is never followed by a leave — so a tapped tile would keep a video element
 * alive behind the feed the viewer just opened, on precisely the devices that can least afford one.
 */
export function usePreviewIntent(enabled: boolean): PreviewIntent {
	const [armed, setArmed] = useState(false);
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

	const cancel = useCallback(() => {
		if (timer.current !== null) {
			clearTimeout(timer.current);
			timer.current = null;
		}
		setArmed(false);
	}, []);

	// Both on unmount and the moment previews stop being allowed: the virtualizer recycles rows out
	// from under a resting pointer, and a pending timer would arm a tile that is no longer there.
	useEffect(() => cancel, [cancel]);
	useEffect(() => {
		if (!enabled) {
			cancel();
		}
	}, [enabled, cancel]);

	const onPointerEnter = useCallback(
		(event: React.PointerEvent) => {
			if (!enabled || event.pointerType !== "mouse") {
				return;
			}
			if (timer.current !== null) {
				clearTimeout(timer.current);
			}
			timer.current = setTimeout(() => setArmed(true), INTENT_MS);
		},
		[enabled],
	);

	return { armed, handlers: { onPointerEnter, onPointerLeave: cancel, onPointerCancel: cancel } };
}

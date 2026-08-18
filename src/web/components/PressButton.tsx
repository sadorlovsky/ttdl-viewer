import { useMemo, useRef } from "react";

/** How far a finger may wander and still have meant to press this, rather than to swipe the feed. */
const PRESS_SLOP = 10;

interface PressButtonProps extends Omit<React.ComponentProps<"button">, "onClick" | "type"> {
	/** The press. Runs on `pointerup`, so it is still inside the user gesture that asked for it. */
	onPress: () => void;
}

/**
 * A button that decides its own presses, for the surfaces the feed scrolls under.
 *
 * `click` is not used, for the reason the slide's own gesture code gives: in a snap-scrolling feed
 * the browser withholds it after a `pointercancel`, and after a press it fires against the nearest
 * common ancestor of where the finger went down and where it came up. The overlay buttons add a
 * third way to lose one — the first press after a swipe corrects the active index on the way down,
 * and that re-render can move the button while the finger is still on it, so the lift hit-tests
 * somewhere the button no longer is. Every one of these reads as a broken button rather than as a
 * missed gesture, and on a phone they are common rather than exotic: Back and the speaker needed
 * several attempts, more or fewer depending on how recently the feed had been flung.
 *
 * So: a pointerup that started on this button and never wandered is a press, and nothing else has
 * to agree. Acting on the lift keeps the work inside the user gesture, which the controls that
 * unmute or open windows need — a browser deciding whether to allow either looks for the finger.
 *
 * The press in flight is held in a ref rather than a closure, for the reason the rail's own
 * version of this learned: the feed re-renders constantly, and a closure rebuilt between the
 * finger going down and coming up hands `pointerup` a fresh, empty one and drops the press.
 */
export function PressButton({ onPress, ...rest }: PressButtonProps) {
	const at = useRef<{ x: number; y: number } | null>(null);
	// Read through a ref so the handlers stay stable and the button keeps one set of listeners
	// instead of swapping them mid-press.
	const latest = useRef(onPress);
	latest.current = onPress;

	const handlers = useMemo(
		() => ({
			onPointerDown: (event: React.PointerEvent) => {
				// The slide beneath is listening too; this press belongs to the control.
				event.stopPropagation();
				at.current = { x: event.clientX, y: event.clientY };
			},
			onPointerUp: (event: React.PointerEvent) => {
				const start = at.current;
				at.current = null;
				if (!start) {
					return;
				}
				event.stopPropagation();
				if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > PRESS_SLOP) {
					return;
				}
				latest.current();
			},
			onPointerCancel: () => {
				at.current = null;
			},
			// Enter and Space arrive as a click with no pointer behind it; that is the only click used.
			onClick: (event: React.MouseEvent) => {
				if (event.detail === 0) {
					latest.current();
				}
			},
		}),
		[],
	);

	return <button type="button" {...rest} {...handlers} />;
}

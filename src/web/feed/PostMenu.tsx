import {
	type PointerEvent as ReactPointerEvent,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import type { Post } from "../../shared/types.ts";
import {
	AutoScrollIcon,
	CodeIcon,
	CopyIcon,
	ExternalIcon,
	EyeOffIcon,
	FullscreenExitIcon,
	FullscreenIcon,
	InfoIcon,
	KeysIcon,
	PanIcon,
	PipIcon,
	SpeedIcon,
} from "../components/Icons.tsx";
import { RATES, usePlayer } from "../store/player.ts";
import styles from "./PostMenu.module.css";

/**
 * How long the sheet is given to animate itself out.
 *
 * A timeout rather than `transitionend`, because an environment that runs no transitions at all
 * fires no such event, and the sheet would then never unmount — a blank screen with no way back.
 * Kept in step with the duration in the stylesheet.
 */
const EXIT_MS = 220;

/**
 * How long the backdrop ignores clicks after opening.
 *
 * The press that opens the sheet is still down when it appears, and the lift that follows can
 * land on the backdrop. Whether that becomes a click depends on the browser, so rather than rely
 * on any of them, the first moments are simply not listening.
 */
const ARM_MS = 250;

/** How far down a finger has to travel before it is dragging the sheet rather than pressing it. */
const DRAG_START = 8;
/** Past here on release the sheet goes, however slowly it got there. */
const DISMISS_PX = 90;
/**
 * …and short of that, a flick still dismisses: pixels per millisecond over the last movement.
 *
 * Measured over the last segment rather than the whole gesture, or a finger that rested a moment
 * before letting go would average its way below any threshold and the sheet would spring back
 * against an unmistakable downward flick.
 */
const DISMISS_VELOCITY = 0.5;
/**
 * How far a flick must still travel to count as one.
 *
 * Velocity alone is not enough to separate a flick from a twitch: a dozen pixels inside one frame
 * clears any sane threshold, and the sheet would close on nothing the viewer thinks of as a
 * gesture. Below this it is a press that wobbled, and the sheet stays.
 */
const DISMISS_FLICK_PX = 28;

interface PostMenuProps {
	post: Post;
	onClose: () => void;
	/** Hides every overlay until the next tap on the media. */
	onClearDisplay: () => void;
	onFullscreen: () => void;
	fullscreen: boolean;
	/** Null when this post is not a video, or the browser has no Picture-in-Picture. */
	onPip: (() => void) | null;
	onRawInfo: () => void;
	/**
	 * Opens the post where it came from — the only outbound navigation in the product.
	 *
	 * A row rather than a gesture on the rail's link button: an archive that promises nothing leaves
	 * the machine should make its one exception explicit, labelled, and reachable from a keyboard,
	 * not hidden behind a press-and-hold nobody is told about.
	 */
	onOpenSource: (() => void) | null;
	/** Opens the keys-and-gestures panel. The `?` key is the other way in, and touch has no keys. */
	onShortcuts: () => void;
	debug: boolean;
	onDebugChange: (on: boolean) => void;
}

/**
 * The long-press sheet.
 *
 * Modelled on the one the app this imitates puts under a held finger, and filtered by the same
 * rule the action rail follows: an offline archive has no business offering to report a post, cast
 * it, or download something already sitting on the disk it is being read from. What is left is
 * everything that is genuinely about *watching* — rate, auto-advance, a clear frame — plus the two
 * things that were previously reachable only by keyboard or by URL.
 */
export function PostMenu({
	post,
	onClose,
	onClearDisplay,
	onFullscreen,
	fullscreen,
	onPip,
	onRawInfo,
	onOpenSource,
	onShortcuts,
	debug,
	onDebugChange,
}: PostMenuProps) {
	const rate = usePlayer((state) => state.rate);
	const setRate = usePlayer((state) => state.setRate);
	const autoAdvance = usePlayer((state) => state.autoAdvance);
	const pan = usePlayer((state) => state.pan);
	const setPan = usePlayer((state) => state.setPan);
	const setAutoAdvance = usePlayer((state) => state.setAutoAdvance);

	const sheetRef = useRef<HTMLDivElement>(null);
	const backdropRef = useRef<HTMLDivElement>(null);
	const [open, setOpen] = useState(false);
	const [armed, setArmed] = useState(false);
	const [copied, setCopied] = useState(false);
	const closing = useRef(false);

	/**
	 * Come in from below.
	 *
	 * A transition off an attribute rather than a keyframe animation, and flipped on a later frame
	 * than the mount. An animation is handed to the compositor before the sheet's own height is
	 * settled, and `translateY(100%)` is a percentage *of that height* — so it ran against a box
	 * that was briefly the height of the screen, which is precisely what made the sheet appear at
	 * full height and then drop. Waiting a frame means the box being animated is the final one.
	 */
	useEffect(() => {
		// A timer stands behind the frame because a hidden or frozen tab paints no frames at all,
		// and a sheet whose opening callback never runs is an invisible pane over a live feed. In
		// a tab anyone is actually looking at, the frame always wins the race.
		const frame = requestAnimationFrame(() => setOpen(true));
		const fallback = setTimeout(() => setOpen(true), 50);
		return () => {
			cancelAnimationFrame(frame);
			clearTimeout(fallback);
		};
	}, []);

	const requestClose = useCallback(() => {
		if (closing.current) {
			return;
		}
		closing.current = true;
		setOpen(false);
		setTimeout(onClose, EXIT_MS);
	}, [onClose]);

	useEffect(() => {
		const timer = setTimeout(() => setArmed(true), ARM_MS);
		return () => clearTimeout(timer);
	}, []);

	// Escape is handled here rather than in the feed's key handler: this is the innermost thing on
	// screen, and it should not have to be spelled out in the ordering of somebody else's switch.
	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				event.stopPropagation();
				requestClose();
			}
		};
		window.addEventListener("keydown", onKey, true);
		return () => window.removeEventListener("keydown", onKey, true);
	}, [requestClose]);

	// Take focus so the sheet is reachable by keyboard, and hand it back on the way out — the feed
	// is what was focused, and losing it would leave the arrow keys pointing at nothing.
	useEffect(() => {
		const previous = document.activeElement as HTMLElement | null;
		sheetRef.current?.focus({ preventScroll: true });
		return () => previous?.focus?.();
	}, []);

	/*
	 * Whether a touch on the sheet's body belongs to the drag or to the scroller.
	 *
	 * `touch-action: pan-y` is honest only while there is something to pan: iOS claims any
	 * vertical movement it is offered and answers our pointer stream with `pointercancel`, so on a
	 * sheet whose rows all fit — which is this menu almost always — the drag lost the race nearly
	 * every time and the sheet read as tap-outside-only. When nothing can scroll, hand the browser
	 * nothing. When the rows genuinely overflow, the scroller keeps the body and the grab handle
	 * remains the way to pull the sheet down.
	 *
	 * Measured once per open: the rows are decided by then, and the one label that changes while
	 * the sheet is up ("Link copied") does not change its height.
	 */
	useEffect(() => {
		const sheet = sheetRef.current;
		if (sheet && sheet.scrollHeight <= sheet.clientHeight) {
			sheet.style.touchAction = "none";
		}
	}, []);

	/* ------------------------------------------------------------------------------ drag to close */

	const drag = useRef<{
		id: number;
		/** Where the finger went down. */
		from: number;
		dy: number;
		/** The previous sample, which is what the release velocity is measured against. */
		lastY: number;
		lastAt: number;
		speed: number;
		live: boolean;
		/** Went down on the grab handle, whose drags are never the scroller's to claim. */
		grip: boolean;
	} | null>(null);

	const onDragStart = (event: ReactPointerEvent) => {
		if (event.button !== 0) {
			return;
		}
		drag.current = {
			id: event.pointerId,
			from: event.clientY,
			dy: 0,
			lastY: event.clientY,
			lastAt: performance.now(),
			speed: 0,
			live: false,
			grip: (event.target as HTMLElement | null)?.closest("[data-grip]") !== null,
		};
	};

	const onDragMove = (event: ReactPointerEvent) => {
		const state = drag.current;
		const sheet = sheetRef.current;
		if (!state || !sheet || event.pointerId !== state.id) {
			return;
		}
		const dy = event.clientY - state.from;
		if (!state.live) {
			// Upwards is never a dismissal, and a sheet scrolled down from its top is being read
			// rather than dragged — that gesture belongs to its own scroller.
			if (dy < DRAG_START) {
				return;
			}
			// A handle drag is exempt: `touch-action: none` on the grab zone means the scroller
			// never had a claim on this gesture, so it dismisses from any scroll position — which
			// is what the handle is for.
			if (sheet.scrollTop > 0 && !state.grip) {
				drag.current = null;
				return;
			}
			state.live = true;
			// Capture only once it is genuinely a drag. Taking the pointer earlier would cancel the
			// click on whichever row the finger happens to be resting on, which is most of them.
			// It throws if the pointer is already gone, and a drag that cannot be captured is still
			// a drag worth following — it just ends when the pointer leaves the sheet.
			try {
				sheet.setPointerCapture(event.pointerId);
			} catch {
				// no capture; the move and up handlers still fire while the pointer is over the sheet
			}
			sheet.style.transition = "none";
		}
		const now = performance.now();
		const elapsed = now - state.lastAt;
		// Samples can arrive within the same millisecond; one of those says nothing about speed, so
		// the previous reading stands rather than being replaced by a division by almost nothing.
		if (elapsed >= 1) {
			state.speed = (event.clientY - state.lastY) / elapsed;
			state.lastY = event.clientY;
			state.lastAt = now;
		}
		state.dy = Math.max(0, dy);
		sheet.style.transform = `translateY(${state.dy}px)`;
		if (backdropRef.current) {
			backdropRef.current.style.opacity = String(
				Math.max(0, 1 - state.dy / (sheet.offsetHeight || 1)),
			);
		}
	};

	const onDragEnd = () => {
		const state = drag.current;
		const sheet = sheetRef.current;
		drag.current = null;
		if (!state?.live || !sheet) {
			return;
		}
		// Hand the transition back before anything moves, so both outcomes are animated.
		sheet.style.transition = "";
		const flicked = state.speed > DISMISS_VELOCITY && state.dy > DISMISS_FLICK_PX;
		if (state.dy > DISMISS_PX || flicked) {
			// Driven to the end inline rather than by dropping the open attribute, so it carries on
			// from where the finger left it instead of snapping back to nought first.
			sheet.style.transform = "translateY(100%)";
			if (backdropRef.current) {
				backdropRef.current.style.opacity = "0";
			}
			requestClose();
			return;
		}
		sheet.style.transform = "";
		if (backdropRef.current) {
			backdropRef.current.style.opacity = "";
		}
	};

	/* ---------------------------------------------------------------------------------- the rows */

	/** Fire a one-shot action and get out of the way; a sheet left open over its own result reads
	 *  as though nothing happened. */
	const run = (action: () => void) => () => {
		action();
		requestClose();
	};

	const copyLink = async () => {
		if (!post.webpageUrl) {
			return;
		}
		try {
			await navigator.clipboard.writeText(post.webpageUrl);
			setCopied(true);
			setTimeout(() => setCopied(false), 1400);
		} catch {
			// Clipboard access can be refused; leaving the label unchanged is the honest answer.
		}
	};

	return (
		<div className={styles.layer}>
			{/* A click target for the mouse only: keyboard users have Escape and the Cancel row, so
			    this is hidden from assistive tech rather than made operable twice over. */}
			<div
				ref={backdropRef}
				className={styles.backdrop}
				data-open={open || undefined}
				onClick={armed ? requestClose : undefined}
				aria-hidden="true"
			/>

			<div
				className={styles.sheet}
				data-open={open || undefined}
				role="dialog"
				aria-modal="true"
				aria-label="Post options"
				tabIndex={-1}
				ref={sheetRef}
				onPointerDown={onDragStart}
				onPointerMove={onDragMove}
				onPointerUp={onDragEnd}
				onPointerCancel={onDragEnd}
			>
				<div className={styles.grab} data-grip aria-hidden>
					<div className={styles.grip} />
				</div>

				<div className={styles.group}>
					{post.webpageUrl && (
						<button className={styles.row} onClick={copyLink}>
							<CopyIcon size={20} className={styles.icon} />
							<span className={styles.label}>
								{copied ? "Link copied" : "Copy the original link"}
							</span>
						</button>
					)}
					{onOpenSource && (
						<button className={styles.row} onClick={run(onOpenSource)}>
							<ExternalIcon size={20} className={styles.icon} />
							<span className={styles.label}>Open at the source</span>
							<span className={styles.note}>leaves the archive</span>
						</button>
					)}

					<button className={styles.row} onClick={run(onShortcuts)}>
						<KeysIcon size={20} className={styles.icon} />
						<span className={styles.label}>Keys and gestures</span>
					</button>

					<button className={styles.row} onClick={run(onRawInfo)}>
						<InfoIcon size={20} className={styles.icon} />
						<span className={styles.label}>Raw metadata</span>
						{!post.hasInfo && <span className={styles.note}>none on disk</span>}
					</button>
				</div>

				<div className={styles.group}>
					{/* A row of choices rather than a control that opens something: four rates are few
					    enough to show, and the current one has to be legible at a glance. */}
					<div className={styles.row} data-static>
						<SpeedIcon size={20} className={styles.icon} />
						<span className={styles.label}>Speed</span>
						<div className={styles.speeds}>
							{RATES.map((value) => (
								<button
									key={value}
									className={styles.speed}
									data-on={value === rate || undefined}
									// Labelled per button rather than by grouping them under the row: a
									// bare "1.5×" read out on its own says nothing about what it sets.
									aria-label={`Play at ${value}× speed`}
									aria-pressed={value === rate}
									onClick={() => setRate(value)}
								>
									{value.toFixed(1)}×
								</button>
							))}
						</div>
					</div>

					<button className={styles.row} onClick={run(onClearDisplay)}>
						<EyeOffIcon size={20} className={styles.icon} />
						<span className={styles.label}>Clear display</span>
						<span className={styles.note}>tap to restore</span>
					</button>

					<button
						className={styles.row}
						role="switch"
						aria-checked={autoAdvance}
						onClick={() => setAutoAdvance(!autoAdvance)}
					>
						<AutoScrollIcon size={20} className={styles.icon} />
						<span className={styles.label}>Auto scroll</span>
						<span className={styles.switch} data-on={autoAdvance || undefined} aria-hidden />
					</button>

					{/* Only where it has something to move: a video is not panned across. */}
					{post.kind === "carousel" && (
						<button
							className={styles.row}
							role="switch"
							aria-checked={pan}
							onClick={() => setPan(!pan)}
						>
							<PanIcon size={20} className={styles.icon} />
							<span className={styles.label}>Photo zoom</span>
							<span className={styles.switch} data-on={pan || undefined} aria-hidden />
						</button>
					)}

					{onPip && (
						<button className={styles.row} onClick={run(onPip)}>
							<PipIcon size={20} className={styles.icon} />
							<span className={styles.label}>Picture-in-Picture</span>
						</button>
					)}

					<button className={styles.row} onClick={run(onFullscreen)}>
						{fullscreen ? (
							<FullscreenExitIcon size={20} className={styles.icon} />
						) : (
							<FullscreenIcon size={20} className={styles.icon} />
						)}
						<span className={styles.label}>{fullscreen ? "Exit fullscreen" : "Fullscreen"}</span>
					</button>

					<button
						className={styles.row}
						role="switch"
						aria-checked={debug}
						onClick={() => onDebugChange(!debug)}
					>
						<CodeIcon size={20} className={styles.icon} />
						<span className={styles.label}>Debug readout</span>
						<span className={styles.switch} data-on={debug || undefined} aria-hidden />
					</button>
				</div>

				<button className={styles.cancel} onClick={requestClose}>
					Cancel
				</button>
			</div>
		</div>
	);
}

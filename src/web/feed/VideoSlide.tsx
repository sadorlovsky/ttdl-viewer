import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Post } from "../../shared/types.ts";
import { PlayIcon } from "../components/Icons.tsx";
import { usePlayer } from "../store/player.ts";
import { Scrubber } from "./Scrubber.tsx";
import styles from "./Slide.module.css";

interface VideoSlideProps {
	post: Post;
	active: boolean;
	/** 0 for the active slide, 1 for its immediate neighbours, 2 for the outer ring. */
	distance: number;
	onPausedChange: (paused: boolean) => void;
	registerMedia: (element: HTMLVideoElement | null) => void;
	/**
	 * Whether this slide may buffer the whole file yet. Neighbours wait until the active slide can
	 * play, so it wins the race for the first frame instead of competing with four others.
	 */
	mayBuffer: boolean;
	onReady: () => void;
}

/** HTMLMediaElement.HAVE_FUTURE_DATA — the readyState at which `canplay` would have fired. */
const HAVE_FUTURE_DATA = 3;

/** How long a finger has to stay put before it counts as inspecting a frame. */
const HOLD_MS = 400;

/**
 * How far it may drift first.
 *
 * Every swipe through the feed begins as a press on the video, so without this a slow-starting
 * flick is indistinguishable from a hold: the timer fires mid-swipe and pauses the post being
 * scrolled to. `pointercancel` arrives too, but only once the browser has decided the gesture is a
 * scroll, which can be well past 400ms.
 */
const HOLD_SLOP = 10;

/** How many times an unasked-for pause is taken back before the element is left alone. */
const MAX_RESUMES = 3;

/** Anything appreciably off 9:16 gets the blurred backdrop, which makes it look intentional. */
function needsBackdrop(post: Post): boolean {
	const ratio = post.media.aspectRatio;
	return ratio === null || Math.abs(ratio - 9 / 16) > 0.06;
}

export function VideoSlide({
	post,
	active,
	distance,
	onPausedChange,
	registerMedia,
	mayBuffer,
	onReady,
}: VideoSlideProps) {
	const videoRef = useRef<HTMLVideoElement>(null);
	const muted = usePlayer((state) => state.muted);
	const volume = usePlayer((state) => state.volume);
	const mute = usePlayer((state) => state.mute);
	const [paused, setPaused] = useState(true);
	const [ready, setReady] = useState(false);
	const [held, setHeld] = useState(false);
	/**
	 * Why the last play() was turned down, or null if it was not.
	 *
	 * The name is kept rather than a flag because the two refusals mean opposite things:
	 * `NotAllowedError` is policy and only a gesture clears it, while `AbortError` is just this
	 * slide being scrolled away from mid-call and is not worth a control at all.
	 */
	const [refused, setRefused] = useState<string | null>(null);
	const holdTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
	/** Where the finger went down, so a swipe can be told from a hold before the timer fires. */
	const pressAt = useRef<{ x: number; y: number } | null>(null);
	/** A completed long press must not also register as the click that ends it. */
	const swallowClick = useRef(false);

	/**
	 * Mirror of `held` that the pointer handlers read.
	 *
	 * The hold begins inside a timeout, so between it setting the state and React re-rendering there
	 * is a window in which the handlers still close over `held === false`. A finger lifted in that
	 * window took the "nothing to release" path: the flag stayed set and the element stayed paused,
	 * with the play badge suppressed — a frozen frame and no way back that did not involve leaving
	 * the post. A ref is read at the moment of the event rather than at the moment of the render.
	 */
	const heldRef = useRef(false);
	const activeRef = useRef(active);
	activeRef.current = active;

	/** Set only when the viewer asked for the pause, so an unasked-for one can be told apart. */
	const userPausedRef = useRef(false);
	/**
	 * Consecutive automatic resumes since playback last actually ran.
	 *
	 * A browser that is refusing to play at all — autoplay policy, a lost decoder — would otherwise
	 * turn the guard below into a pause/play loop. Three attempts is enough to ride out a transient
	 * refusal and few enough to give up quietly on a real one.
	 */
	const resumes = useRef(0);

	const setHolding = useCallback((value: boolean) => {
		heldRef.current = value;
		setHeld(value);
	}, []);

	useEffect(() => {
		registerMedia(videoRef.current);
		return () => registerMedia(null);
	}, [registerMedia]);

	/**
	 * Hand the decoder back the moment this slide goes away.
	 *
	 * Detaching an element from the DOM does not release what it holds — the media resource lives
	 * until the element is collected, and a feed mints a fresh one on every swipe. iOS Safari caps
	 * how many may hold audio at once, so after a handful of swipes the next element is granted
	 * video and refused sound: it plays, silently, and the ones before it are still sitting on the
	 * audio nobody is listening to. Emptying the element is the documented way to give that back,
	 * and it has to happen here because nothing else will do it in time.
	 */
	useLayoutEffect(() => {
		const video = videoRef.current;
		return () => {
			if (!video) {
				return;
			}
			video.pause();
			video.removeAttribute("src");
			// Required: without a load() the element keeps the old resource despite the empty src.
			video.load();
		};
		// Layout, not passive: a passive cleanup is deferred, and swiping mounts elements faster
		// than React gets round to running them — so the resources pile up exactly when the feed
		// is under the most pressure, which is the moment they had to be back.
	}, []);

	useEffect(() => {
		const video = videoRef.current;
		if (!video) {
			return;
		}
		video.muted = muted;
		video.volume = volume;
	}, [muted, volume]);

	// Play the active slide; rewind anything that has left the immediate neighbourhood, so coming
	// back to a post starts it over rather than resuming halfway through.
	useEffect(() => {
		const video = videoRef.current;
		if (!video) {
			return;
		}
		if (active) {
			// Arriving at a slide is a fresh start: whatever the viewer decided about the last one
			// does not carry over, and the resume budget is for this stretch of playback only.
			userPausedRef.current = false;
			resumes.current = 0;
			// An element that already buffered while it was a neighbour is past canplay and will
			// not fire it again, so report readiness from its state as well as from the event —
			// otherwise the staged preload would stall the first time the feed advances.
			if (video.readyState >= HAVE_FUTURE_DATA) {
				onReady();
			}
			void video
				.play()
				.then(() => setRefused(null))
				.catch((error: DOMException) => {
					/*
					 * Refused. With sound on this is routine — a browser will not start an unmuted
					 * element without a recent gesture, and swiping is not one.
					 *
					 * What made it look like a bug rather than a policy is that the play badge is
					 * gated on `canplay`, and a refusal usually comes before there is any data to
					 * report: no badge, no scrubber, just the poster sitting there. Recording the
					 * refusal is what puts a control back on screen for the tap that is allowed to
					 * start it.
					 *
					 * An AbortError is not that: it only means the feed moved on while the call was
					 * in flight, and offering a badge for it would put one on every slide swiped past.
					 */
					if (error?.name === "AbortError") {
						setRefused(null);
						return;
					}
					/*
					 * A refusal to start an *unmuted* element is the ordinary one, and it is not a
					 * failure state — it is the autoplay policy, which no amount of retrying answers.
					 * Only a gesture lifts it, and swiping is not a gesture, so a feed that waits for
					 * one simply stops. Muted playback is always permitted, so the feed carries on
					 * without sound and the speaker icon says so; a tap on it is a gesture and brings
					 * the sound straight back.
					 */
					if (error?.name === "NotAllowedError" && !video.muted) {
						mute();
						video.muted = true;
						void video
							.play()
							.then(() => setRefused(null))
							.catch(() => setRefused(error.name));
						return;
					}
					setRefused(error?.name ?? "unknown");
				});
		} else {
			video.pause();
			// A press interrupted by scrolling away must not leave this slide's overlays hidden
			// when the feed comes back to it.
			clearTimeout(holdTimer.current);
			pressAt.current = null;
			setHolding(false);
			swallowClick.current = false;
			if (distance > 1) {
				video.currentTime = 0;
			}
		}
	}, [active, distance, onReady, setHolding, mute]);

	useEffect(() => {
		onPausedChange(paused);
	}, [paused, onPausedChange]);

	/** End a press, whether it became a hold or not. Safe to call for a press that never held. */
	const release = useCallback(() => {
		clearTimeout(holdTimer.current);
		pressAt.current = null;
		if (!heldRef.current) {
			return;
		}
		setHolding(false);
		// The finger may have lifted after the feed already moved on; resuming a slide that is no
		// longer the active one would play it off screen, audible and invisible.
		if (activeRef.current) {
			void videoRef.current?.play().catch(() => undefined);
		}
	}, [setHolding]);

	// A hold that is still pending when this slide unmounts would fire against a detached element,
	// leaving the flag set on the way back in.
	useEffect(() => () => clearTimeout(holdTimer.current), []);

	const toggle = () => {
		const video = videoRef.current;
		if (!video) {
			return;
		}
		if (video.paused) {
			userPausedRef.current = false;
			resumes.current = 0;
			void video.play().catch(() => undefined);
		} else {
			// Flagged before pausing, so the guard on `pause` can tell this from the browser's own.
			userPausedRef.current = true;
			video.pause();
		}
	};

	return (
		// The flags are on the element so `?debug=1` can report them without this component having
		// to know the panel exists, and so a stuck slide can be read straight out of the inspector.
		<div
			className={styles.slide}
			data-active={active || undefined}
			data-ready={ready || undefined}
			data-refused={refused || undefined}
			data-held={held || undefined}
			data-paused={paused || undefined}
		>
			{needsBackdrop(post) && post.cover && (
				<img src={post.cover.url} alt="" className={styles.backdrop} aria-hidden />
			)}

			<video
				ref={videoRef}
				className={styles.media}
				src={post.media.url}
				poster={post.cover?.url}
				loop
				playsInline
				muted={muted}
				// Buffering is staged: the active slide always may, neighbours only once it can
				// play, and the outer ring never gets past its dimensions.
				preload={mayBuffer ? "auto" : "metadata"}
				onPlay={() => setPaused(false)}
				onPlaying={() => {
					resumes.current = 0;
					setRefused(null);
				}}
				onPause={(event) => {
					setPaused(true);
					/*
					 * Take back a pause nobody asked for.
					 *
					 * The active slide is only ever meant to be paused by the viewer, by a hold, or by
					 * the feed moving on — and each of those is flagged before it pauses. Anything else
					 * is the browser stopping the element on its own, which it is free to do and which
					 * leaves the post frozen on a frame with no control on screen to say so: the play
					 * badge is only offered once `canplay` has been seen, and an element stopped before
					 * that never showed one. The carousels already defend against exactly this; the
					 * video slides never did.
					 */
					const video = event.currentTarget;
					if (
						activeRef.current &&
						!heldRef.current &&
						!userPausedRef.current &&
						!video.ended &&
						resumes.current < MAX_RESUMES
					) {
						resumes.current++;
						void video.play().catch(() => undefined);
					}
				}}
				onCanPlay={(event) => {
					setReady(true);
					onReady();
					// The play() that made this slide active was issued while it still had no data,
					// and a browser is free to refuse one that early. Nothing retries it, so the
					// moment there is something to play is the moment to ask again.
					const video = event.currentTarget;
					if (activeRef.current && !heldRef.current && video.paused) {
						void video.play().catch(() => undefined);
					}
				}}
				onClick={() => {
					// The pointerup that ends a long press is followed by a click; without this the
					// gesture would toggle playback on release and undo itself.
					if (swallowClick.current) {
						swallowClick.current = false;
						return;
					}
					toggle();
				}}
				onPointerDown={(event) => {
					// Long-press to inspect a frame: freeze it and clear the overlays, resume on
					// release. Holding without actually pausing would show a moving frame.
					pressAt.current = { x: event.clientX, y: event.clientY };
					holdTimer.current = setTimeout(() => {
						setHolding(true);
						swallowClick.current = true;
						videoRef.current?.pause();
					}, HOLD_MS);
				}}
				onPointerMove={(event) => {
					const start = pressAt.current;
					if (!start || heldRef.current) {
						return;
					}
					// Moved: this is a swipe, so the hold never begins.
					if (
						Math.abs(event.clientX - start.x) > HOLD_SLOP ||
						Math.abs(event.clientY - start.y) > HOLD_SLOP
					) {
						clearTimeout(holdTimer.current);
						pressAt.current = null;
					}
				}}
				onPointerUp={release}
				onPointerCancel={() => {
					// A cancelled pointer is followed by no click, so the guard set when the hold
					// fired has to be cleared here or it would swallow the next genuine tap.
					swallowClick.current = false;
					release();
				}}
			/>

			{held && <div className={styles.holding} />}

			{paused && (ready || refused) && !held && (
				<button className={styles.playBadge} onClick={toggle} aria-label="Play">
					<PlayIcon size={34} />
				</button>
			)}

			{active && !held && <Scrubber mediaRef={videoRef} active={active} />}
		</div>
	);
}

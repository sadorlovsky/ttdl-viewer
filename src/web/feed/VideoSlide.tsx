import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Post } from "../../shared/types.ts";
import { PlayIcon } from "../components/Icons.tsx";
import { usePlayer } from "../store/player.ts";
import { BOOST_ZONE, boostedRate } from "./boost.ts";
import { Scrubber } from "./Scrubber.tsx";
import styles from "./Slide.module.css";
import { useLongPress } from "./useLongPress.ts";

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
	/**
	 * Held for something the viewer opened over it — the long-press sheet.
	 *
	 * The slide pauses and clears its own overlays for as long as this is set, and resumes when it
	 * clears. It is a prop rather than internal state because the thing being held for is owned by
	 * the feed: a hold released by lifting a finger would end the moment the sheet appeared.
	 */
	suspended: boolean;
	onLongPress: () => void;
	/** Clear display is on: no scrubber, and a tap brings the interface back instead of pausing. */
	chromeHidden: boolean;
	onRestoreChrome: () => void;
	/** Auto scroll is on and this post finished. */
	onEnded: () => void;
}

/** HTMLMediaElement.HAVE_FUTURE_DATA — the readyState at which `canplay` would have fired. */
const HAVE_FUTURE_DATA = 3;

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
	suspended,
	onLongPress,
	chromeHidden,
	onRestoreChrome,
	onEnded,
}: VideoSlideProps) {
	const videoRef = useRef<HTMLVideoElement>(null);
	const muted = usePlayer((state) => state.muted);
	const volume = usePlayer((state) => state.volume);
	const rate = usePlayer((state) => state.rate);
	const autoAdvance = usePlayer((state) => state.autoAdvance);
	const mute = usePlayer((state) => state.mute);
	const [paused, setPaused] = useState(true);
	const [ready, setReady] = useState(false);
	/**
	 * Why the last play() was turned down, or null if it was not.
	 *
	 * The name is kept rather than a flag because the two refusals mean opposite things:
	 * `NotAllowedError` is policy and only a gesture clears it, while `AbortError` is just this
	 * slide being scrolled away from mid-call and is not worth a control at all.
	 */
	const [refused, setRefused] = useState<string | null>(null);

	/**
	 * Mirror of `suspended` that the media event handlers read.
	 *
	 * Assigned during render, so by the time the effect below pauses the element the handlers it
	 * triggers already see the new value. Reading the prop out of a closure instead would let the
	 * auto-resume guard fire against a pause the sheet had just asked for.
	 */
	const suspendedRef = useRef(suspended);
	suspendedRef.current = suspended;
	const activeRef = useRef(active);
	activeRef.current = active;
	const onEndedRef = useRef(onEnded);
	onEndedRef.current = onEnded;

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

	/** Held fast by a press near the leading edge; also what puts the readout on screen. */
	const [boosted, setBoosted] = useState(false);

	// Declared before the effects that call `press.cancel`, and reading the toggle through a ref so
	// the handlers it produces keep one identity for the slide's lifetime.
	const tap = useRef<() => void>(() => undefined);
	const press = useLongPress({
		onLongPress: ({ x }) => {
			const video = videoRef.current;
			// Only `playbackRate`, deliberately not the default: this lasts as long as the finger
			// does, and a reload landing mid-press should come back at the rate that was chosen
			// rather than at the one being borrowed.
			if (x < BOOST_ZONE && video) {
				video.playbackRate = boostedRate(rate);
				setBoosted(true);
				return;
			}
			onLongPress();
		},
		onRelease: () => {
			setBoosted(false);
			const video = videoRef.current;
			if (video) {
				video.playbackRate = rate;
			}
		},
		onTap: () => tap.current(),
	});

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
		/*
		 * Both, and `defaultPlaybackRate` is the one that matters.
		 *
		 * `playbackRate` does not survive: the media element load algorithm resets it to
		 * `defaultPlaybackRate`, and this feed runs that algorithm constantly — implicitly every
		 * time a slide mounts and its `src` is set, explicitly through the `load()` that hands the
		 * decoder back on the way out. Whether the reset landed before or after this line was a
		 * race, and the feed lost it about half the time: the rate held on the post it was chosen
		 * on, went back to normal on the next, held again on the one after. The menu meanwhile
		 * reported what had been asked for, because the store was still perfectly correct — it was
		 * the element that kept being told otherwise. Set the default and every reset resets *to*
		 * the chosen rate.
		 */
		video.defaultPlaybackRate = rate;
		video.playbackRate = rate;
	}, [muted, volume, rate]);

	/**
	 * Start this element, and give the sound up if that is the only way it will run.
	 *
	 * Every place that starts playback goes through here, which it did not use to. The arrival path
	 * had this fallback and the others — the resume after an unasked-for pause, the retry once
	 * there is data, the release from a hold — each had a bare `.catch(() => undefined)`. That gap
	 * is what made the speaker button feel broken: unmuting a post the browser had only ever
	 * allowed to play *because* it was muted makes some browsers stop it on the spot, the resume
	 * that followed was refused for the same reason and swallowed, and the post was left frozen
	 * with the icon claiming sound. Further presses then flipped an icon over a video that was
	 * never going to move again. Handled here, the worst case is the post carrying on without
	 * sound and the icon saying so — which is a state the viewer can act on.
	 */
	const start = useCallback(() => {
		const video = videoRef.current;
		if (!video) {
			return;
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
	}, [mute]);

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
			// The sheet is what decides when this resumes; starting it here would play the post
			// underneath a menu that was opened to stop it.
			if (suspendedRef.current) {
				return;
			}
			start();
		} else {
			video.pause();
			// A press interrupted by scrolling away must not leave a hold pending on this slide.
			press.cancel();
			if (distance > 1) {
				video.currentTime = 0;
			}
		}
	}, [active, distance, onReady, start, press.cancel]);

	/**
	 * Hold for the sheet, and resume when it goes.
	 *
	 * Kept out of the effect above so that opening a menu does not re-run the whole arrival path —
	 * the readiness report, the refusal handling and the rewind all belong to *becoming* active,
	 * and replaying them on every hold would report a slide ready twice and lose a real refusal.
	 */
	/**
	 * `ours` is why this is not simply "pause on open, play on close": a post the viewer had
	 * already paused must still be paused when the sheet goes away. Only a pause the sheet caused
	 * is a pause the sheet may take back.
	 */
	const ours = useRef(false);
	useEffect(() => {
		const video = videoRef.current;
		if (suspended) {
			if (video && !video.paused) {
				ours.current = true;
				video.pause();
			}
			return;
		}
		if (!ours.current) {
			return;
		}
		ours.current = false;
		// The feed may have moved on underneath the sheet; resuming a slide that is no longer the
		// active one would play it off screen, audible and invisible.
		if (activeRef.current) {
			start();
		}
	}, [suspended, start]);

	useEffect(() => {
		onPausedChange(paused);
	}, [paused, onPausedChange]);

	const toggle = () => {
		const video = videoRef.current;
		if (!video) {
			return;
		}
		if (video.paused) {
			userPausedRef.current = false;
			resumes.current = 0;
			start();
		} else {
			// Flagged before pausing, so the guard on `pause` can tell this from the browser's own.
			userPausedRef.current = true;
			video.pause();
		}
	};

	tap.current = () => {
		// With the interface cleared, the tap that brings it back is the whole gesture — pausing as
		// well would make the post pay for looking at the controls.
		if (chromeHidden) {
			onRestoreChrome();
			return;
		}
		toggle();
	};

	return (
		// The flags are on the element so the debug readout can report them without this component
		// having to know the panel exists, and so a stuck slide can be read straight out of the
		// inspector. `held` is the name the readout has always used for "frozen and stripped".
		/*
		 * The gesture belongs to the whole slide, not to the video element.
		 *
		 * A 9:16 file in a window that is not 9:16 is letterboxed by `object-fit`, so the element
		 * is narrower — sometimes far narrower — than what the viewer sees as "the post". With the
		 * handlers on the element, every tap on the black beside it was swallowed, and it read as
		 * a play/pause that needs several attempts. The slide is what fills the viewport, so the
		 * slide is what listens.
		 */
		<div
			className={styles.slide}
			data-active={active || undefined}
			data-ready={ready || undefined}
			data-refused={refused || undefined}
			data-held={suspended || undefined}
			data-paused={paused || undefined}
			{...press.handlers}
		>
			{needsBackdrop(post) && post.cover && (
				<img src={post.cover.url} alt="" className={styles.backdrop} aria-hidden />
			)}

			<video
				ref={videoRef}
				className={styles.media}
				src={post.media.url}
				poster={post.cover?.url}
				// Auto scroll needs an `ended` event, and a looping element never fires one.
				loop={!autoAdvance}
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
				onEnded={() => {
					if (activeRef.current) {
						onEndedRef.current();
					}
				}}
				onPause={(event) => {
					setPaused(true);
					/*
					 * The speaker button stops this element on purpose, so that the play() it issues
					 * next is a real one and can carry the sound with it. That pause arrives here a
					 * task later, by which time the post is already running again — resuming it a
					 * second time would spend one of the very few attempts kept for a genuine stall.
					 * Consumed rather than read, because it describes one pause and not a state.
					 */
					if (event.currentTarget.dataset.soundSwap) {
						delete event.currentTarget.dataset.soundSwap;
						return;
					}
					/*
					 * Take back a pause nobody asked for.
					 *
					 * The active slide is only ever meant to be paused by the viewer, by the sheet, or
					 * by the feed moving on — and each of those is flagged before it pauses. Anything
					 * else is the browser stopping the element on its own, which it is free to do and
					 * which leaves the post frozen on a frame with no control on screen to say so: the
					 * play badge is only offered once `canplay` has been seen, and an element stopped
					 * before that never showed one. The carousels already defend against exactly this;
					 * the video slides never did.
					 */
					const video = event.currentTarget;
					if (
						activeRef.current &&
						!suspendedRef.current &&
						!userPausedRef.current &&
						!video.ended &&
						resumes.current < MAX_RESUMES
					) {
						resumes.current++;
						start();
					}
				}}
				onCanPlay={(event) => {
					setReady(true);
					onReady();
					// The play() that made this slide active was issued while it still had no data,
					// and a browser is free to refuse one that early. Nothing retries it, so the
					// moment there is something to play is the moment to ask again.
					const video = event.currentTarget;
					if (activeRef.current && !suspendedRef.current && video.paused) {
						start();
					}
				}}
			/>

			{/*
			 * Focusable but not clickable.
			 *
			 * It fills the slide, so as an ordinary button it was the thing every pointer gesture
			 * landed on whenever the post was paused — which is exactly when a long press is most
			 * likely, and it swallowed all of them. Letting pointers through to the slide beneath
			 * costs nothing that matters: the slide's own tap is what starts the post either way.
			 * The element stays a button so it keeps its place in the tab order and its label.
			 */}
			{paused && (ready || refused) && !suspended && (
				<button className={styles.playBadge} onClick={toggle} aria-label="Play">
					<PlayIcon size={34} />
				</button>
			)}

			{/* Without this the post simply runs fast for no visible reason, and the gesture reads as
			    a glitch rather than as something the viewer is doing. */}
			{boosted && (
				<div className={styles.boost} aria-hidden>
					{boostedRate(rate)}× speed
				</div>
			)}

			{active && !suspended && !chromeHidden && <Scrubber mediaRef={videoRef} active={active} />}
		</div>
	);
}

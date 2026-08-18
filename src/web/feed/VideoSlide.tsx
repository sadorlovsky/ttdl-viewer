import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Post } from "../../shared/types.ts";
import { PlayIcon } from "../components/Icons.tsx";
import { usePlayer } from "../store/player.ts";
import { BOOST_ZONE, boostedRate } from "./boost.ts";
import type { SlideControls } from "./controls.ts";
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
	 * Hands the feed a way to pause and seek this post.
	 *
	 * Without it the keyboard reaches for the element directly, and `onPause` below reads a pause it
	 * was not told about as the browser stopping the video on its own — so Space paused the post for
	 * a frame and the slide immediately started it again.
	 */
	registerControls: (id: string, controls: SlideControls | null) => void;
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

/** MediaError codes. Only the two that describe the file itself are named; see `describeFailure`. */
const MEDIA_ERR_DECODE = 3;
const MEDIA_ERR_SRC_NOT_SUPPORTED = 4;

interface Failure {
	/** Short flag, for the slide's data attributes and `?debug=1`. */
	flag: string;
	message: string;
	/** A command that would actually fix it, or null when re-fetching would fix nothing. */
	command: string | null;
}

/**
 * What to say about a video that will not play, and what would fix it.
 *
 * Only a permanent fault earns an explanation. `MEDIA_ERR_ABORTED` and `MEDIA_ERR_NETWORK` are
 * properties of the moment rather than of the file — a load cut short, a server that went away
 * mid-stream — and both come back on a second attempt, so those keep the play badge and a tap
 * runs the load again. A file that is missing, truncated, or in a codec this browser will not
 * decode fails identically every time, and offering a play button for one is the lie this state
 * exists to stop telling.
 *
 * The recovery has to match the fault too: re-fetching the post answers a missing or truncated
 * file and answers nothing at all about a dropped connection.
 */
function describeFailure(
	code: number | null,
	refusal: string | null,
	handle: string,
): Failure | null {
	const refetch = handle ? `./ttdl.py get @${handle}` : "./ttdl.py get";

	if (code === MEDIA_ERR_DECODE) {
		return {
			flag: "decode",
			message:
				"This video is on disk but could not be decoded. The download may have been cut short.",
			command: refetch,
		};
	}
	if (code === MEDIA_ERR_SRC_NOT_SUPPORTED || refusal === "NotSupportedError") {
		return {
			flag: "unsupported",
			message:
				"This video could not be played. The file may be missing, or it may be in a format this browser cannot decode.",
			command: refetch,
		};
	}
	return null;
}

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
	registerControls,
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
	/** The element's own `error.code`, which the `error` event does not carry. */
	const [mediaError, setMediaError] = useState<number | null>(null);

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
	/**
	 * Out of data and waiting for more — not paused, and not broken.
	 *
	 * The archive is served off a disk that may be a NAS across a wireless link, which is the scene
	 * PRODUCT.md documents. Nothing said so: a large post showed a poster and silence, and a slow
	 * post was indistinguishable from a dead one for the whole wait — the exact ambiguity the
	 * failure copy exists to remove, reintroduced by having nothing to say.
	 */
	const [buffering, setBuffering] = useState(false);
	/** ...and has waited long enough that a moving bar alone stops answering the question. */
	const [slow, setSlow] = useState(false);

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
		/*
		 * An element that stopped on an error does not start again on play() alone; the resource
		 * selection algorithm has to be run a second time. Only a fault worth retrying leaves a badge
		 * on screen to be tapped, so this is the retry for exactly those.
		 */
		if (video.error) {
			setMediaError(null);
			video.load();
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

	/** Five seconds, the same jump the arrow keys made when they reached past this slide. */
	const step = (delta: number) => {
		const video = videoRef.current;
		if (!video || !Number.isFinite(video.duration)) {
			return;
		}
		video.currentTime = Math.min(video.duration, Math.max(0, video.currentTime + delta * 5));
	};

	// Registered through a ref for the same reason the carousel does it: the slide hands the feed
	// one stable pair of functions rather than re-registering itself on every render.
	const latest = useRef<SlideControls>({ toggle, step });
	latest.current = { toggle, step };
	useEffect(() => {
		const id = post.id;
		registerControls(id, {
			toggle: () => latest.current.toggle(),
			step: (delta) => latest.current.step(delta),
		});
		return () => registerControls(id, null);
	}, [registerControls, post.id]);

	useEffect(() => {
		if (!buffering) {
			setSlow(false);
			return;
		}
		const timer = setTimeout(() => setSlow(true), 4000);
		return () => clearTimeout(timer);
	}, [buffering]);

	const failure = describeFailure(mediaError, refused, post.author.handle);

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
			data-failed={failure?.flag}
			data-held={suspended || undefined}
			data-paused={paused || undefined}
			{...press.handlers}
		>
			{needsBackdrop(post) && post.cover && (
				<img src={post.cover.url} alt="" className={styles.backdrop} aria-hidden />
			)}

			{/* Present, not failed, and with no frame to show — see `.emptyStage`. */}
			{!post.cover && !ready && !failure && (
				<div className={styles.emptyStage} aria-hidden>
					<span className={styles.emptyGlyph}>
						{(post.author.handle || post.author.name || "?").trim().charAt(0).toUpperCase()}
					</span>
				</div>
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
				// The code lives on the element; the error event itself carries nothing.
				onError={() => setMediaError(videoRef.current?.error?.code ?? MEDIA_ERR_SRC_NOT_SUPPORTED)}
				onWaiting={() => setBuffering(true)}
				onStalled={() => setBuffering(true)}
				onPlay={() => setPaused(false)}
				onPlaying={() => {
					setBuffering(false);
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
					// A pause is an answer; it is not the element still reading.
					setBuffering(false);
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
			{paused && !failure && (ready || refused) && !suspended && !failure && (
				<button className={styles.playBadge} onClick={toggle} aria-label="Play">
					<PlayIcon size={34} />
				</button>
			)}

			{failure && (
				// Polite, not assertive: arriving on a dead post is worth saying, and not worth cutting
				// the post's own announcement short to say.
				<div className={`${styles.broken} ${styles.brokenOver}`} role="status">
					<p>{failure.message}</p>
					{failure.command && <code>{failure.command}</code>}
				</div>
			)}

			{/* Without this the post simply runs fast for no visible reason, and the gesture reads as
			    a glitch rather than as something the viewer is doing. */}
			{boosted && (
				<div className={styles.boost} aria-hidden>
					{boostedRate(rate)}× speed
				</div>
			)}

			{/*
			 * The post's own box, the way the carousel draws its segments against it.
			 *
			 * Left on the slide, these spanned the window: under a 453px video on a desktop screen
			 * the scrub bar ran the full 1397px, so dragging in the black margin scrubbed a video
			 * that was not there — and the design system names the rule that forbids it.
			 */}
			<div className={styles.frame}>
				{slow && !failure && active && (
					// Said once the bar has been moving long enough to stop answering on its own. The
					// archive's own vocabulary: this is a file being read, not a stream being fetched.
					<p className={styles.stillReading} role="status">
						still reading from disk
					</p>
				)}

				{active && !suspended && !chromeHidden && !failure && (
					<Scrubber mediaRef={videoRef} active={active} buffering={buffering} />
				)}
			</div>
		</div>
	);
}

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Post } from "../../shared/types.ts";
import { PressButton } from "../components/PressButton.tsx";
import { usePlayer } from "../store/player.ts";
import { BOOST_ZONE, boostedRate } from "./boost.ts";
import { bankLap, type Lap, shiftFor } from "./clock.ts";
import type { SlideControls } from "./controls.ts";
import { boost, boostFor, playbackVolume } from "./loudness.ts";
import styles from "./Slide.module.css";
import { useLongPress } from "./useLongPress.ts";

interface CarouselSlideProps {
	post: Post;
	active: boolean;
	distance: number;
	onPausedChange: (paused: boolean) => void;
	registerMedia: (element: HTMLAudioElement | null) => void;
	/**
	 * Hands the feed's keyboard handling to this slide.
	 *
	 * A carousel cannot be driven through its audio element from outside: pausing the element
	 * directly looks identical to the browser stopping it on its own, and once the wall-clock
	 * fallback is running the element is not the clock at all. Both keys have to go through the
	 * component that owns that state.
	 */
	registerControls: (id: string, controls: SlideControls | null) => void;
	/** Same staged-buffering rule the video slides follow, so both media paths agree. */
	mayBuffer: boolean;
	/** Held for the long-press sheet; see the video slide, which reads it the same way. */
	suspended: boolean;
	onLongPress: () => void;
	/** Clear display is on: no segments, no counter, and a tap brings the interface back. */
	chromeHidden: boolean;
	onRestoreChrome: () => void;
	/** Auto scroll is on and the slideshow has been all the way round once. */
	onEnded: () => void;
}

const PER_IMAGE_MIN = 1.5;
const PER_IMAGE_MAX = 4;
const PER_IMAGE_FALLBACK = 2.5;
/** How many decoded images to keep mounted beyond the live window. */
const LRU_SIZE = 8;

/**
 * How long each image is held.
 *
 * When the track divides into a watchable per-image time, use it: the slideshow then ends exactly
 * with the audio, which is what the post was built to do. When it does not — three images over a
 * forty-five second track — images and audio loop independently at a fixed pace, which is what
 * these posts actually look like in the app they came from.
 */
function cadence(duration: number | null, images: number): number {
	if (!duration || images === 0) {
		return PER_IMAGE_FALLBACK;
	}
	const fit = duration / images;
	return fit >= PER_IMAGE_MIN && fit <= PER_IMAGE_MAX ? fit : PER_IMAGE_FALLBACK;
}

export function CarouselSlide({
	post,
	active,
	distance,
	onPausedChange,
	registerMedia,
	registerControls,
	mayBuffer,
	suspended,
	onLongPress,
	chromeHidden,
	onRestoreChrome,
	onEnded,
}: CarouselSlideProps) {
	const audioRef = useRef<HTMLAudioElement>(null);
	const muted = usePlayer((state) => state.muted);
	const volume = usePlayer((state) => state.volume);
	const rate = usePlayer((state) => state.rate);
	const pan = usePlayer((state) => state.pan);
	const autoAdvance = usePlayer((state) => state.autoAdvance);

	const urls = post.photos?.urls ?? [];
	const total = urls.length;
	const expected = post.photos?.expected ?? null;
	const perImage = useMemo(() => cadence(post.duration, total), [post.duration, total]);

	const [index, setIndex] = useState(0);
	const [progress, setProgress] = useState(0);
	const [paused, setPaused] = useState(true);
	/** Set when the audio element will not run, and a wall clock has to stand in as the clock. */
	const fallbackRef = useRef<{ startedAt: number; offset: number } | null>(null);
	/** Distinguishes "the viewer pressed pause" from "the browser stopped it on its own". */
	const userPausedRef = useRef(false);

	// Read inside the rAF loop rather than closed over, so a rate change does not tear the clock
	// down and rebuild it mid-slideshow. Written in a layout effect below rather than during
	// render, because the wall clock has to be re-anchored while this still holds the old rate.
	const rateRef = useRef(rate);
	const suspendedRef = useRef(suspended);
	suspendedRef.current = suspended;
	const activeRef = useRef(active);
	activeRef.current = active;
	const autoAdvanceRef = useRef(autoAdvance);
	autoAdvanceRef.current = autoAdvance;
	const onEndedRef = useRef(onEnded);
	onEndedRef.current = onEnded;
	/** Last position within the image cycle, so a wrap round to the start can be spotted. */
	const previous = useRef(0);
	/** How far the images are held ahead of the clock, so stepping one does not move the track. */
	const shiftRef = useRef(0);

	/** Held fast by a press near the leading edge; also what puts the readout on screen. */
	const [boosted, setBoosted] = useState(false);

	// The toggle and the step are defined further down and close over the clock, so the handlers go
	// through refs: the slide keeps one set of listeners rather than re-registering them as the
	// images turn.
	const tap = useRef<() => void>(() => undefined);
	const swipe = useRef<(delta: number) => void>(() => undefined);
	const press = useLongPress({
		onLongPress: ({ x }) => {
			const audio = audioRef.current;
			// Only `playbackRate`, not the default — this lasts as long as the finger does. The
			// images follow because the element is their clock.
			if (x < BOOST_ZONE && audio) {
				audio.playbackRate = boostedRate(rate);
				rateRef.current = boostedRate(rate);
				setBoosted(true);
				return;
			}
			onLongPress();
		},
		onRelease: () => {
			setBoosted(false);
			rateRef.current = rate;
			const audio = audioRef.current;
			if (audio) {
				audio.playbackRate = rate;
			}
		},
		onTap: () => tap.current(),
		// A carousel is the one thing here with somewhere sideways to go.
		onSwipe: (direction) => swipe.current(direction),
	});

	const startFallback = useCallback((offset: number) => {
		fallbackRef.current = { startedAt: performance.now(), offset };
		setPaused(false);
	}, []);

	/** Laps of the audio already banked, so the images run on a clock that only goes forwards. */
	const lapRef = useRef<Lap>({ banked: 0, last: 0 });

	/** Where the clock stands right now, in track seconds, whichever clock is running. */
	const elapsed = useCallback(() => {
		const fallback = fallbackRef.current;
		if (fallback) {
			return userPausedRef.current
				? fallback.offset
				: fallback.offset + ((performance.now() - fallback.startedAt) / 1000) * rateRef.current;
		}
		return lapRef.current.banked + (audioRef.current?.currentTime ?? 0);
	}, []);

	useEffect(() => {
		registerMedia(audioRef.current);
		return () => registerMedia(null);
	}, [registerMedia]);

	// Same reason as the video slides: an unmounted element keeps its audio resource until it is
	// collected, and on iOS the supply is small enough that a few swipes exhaust it.
	useLayoutEffect(() => {
		const audio = audioRef.current;
		if (!audio) {
			return;
		}
		// Assigned here rather than as a prop for the same reason the video slide does it: React
		// does not know this effect's cleanup cleared the attribute, so under StrictMode's double
		// invoke the element came back without a source and the slideshow had no clock to run on.
		audio.src = post.media.url;
		audio.load();
		return () => {
			audio.pause();
			audio.removeAttribute("src");
			audio.load();
		};
	}, [post.media.url]);

	useEffect(() => {
		const audio = audioRef.current;
		if (!audio) {
			return;
		}
		audio.volume = playbackVolume(post, volume);
		// Keep the element playing even with the sound off. Autoplay policy allows a muted
		// element, and `currentTime` is the clock the images run on — stopping it would freeze
		// the slideshow whenever the user mutes.
		audio.muted = muted;
		// The images are timed off this element, so the rate reaches the slideshow for free — and
		// the default is set alongside it because the media element load algorithm resets
		// `playbackRate` to `defaultPlaybackRate` every time a slide mounts. See the video slide.
		audio.defaultPlaybackRate = rate;
		audio.playbackRate = rate;
	}, [muted, volume, rate, post]);

	/*
	 * The other half of the correction, and the half that needs a graph rather than a number.
	 *
	 * Nothing happens here until the sound has been turned on: the element is queued, and the
	 * gesture that creates the audio context flushes the queue. Which is also why this is its own
	 * effect — it must not re-run on every volume or rate change, since the routing it performs
	 * is permanent and only the gain value is worth revisiting.
	 */
	useEffect(() => {
		const element = audioRef.current;
		if (!element) {
			return;
		}
		return boost(element, boostFor(post));
	}, [post]);

	/**
	 * Re-anchor the wall clock when the rate changes, then adopt the new rate.
	 *
	 * The fallback measures from a fixed instant, so without this a rate change would re-scale
	 * every second already elapsed and the slideshow would jump — backwards, on a slow-down. The
	 * order is the whole point: the seconds already run are banked at the rate they were run at,
	 * and only then does `rateRef` move on. Layout rather than passive, so no frame can be drawn
	 * with the new rate against the old anchor.
	 *
	 * The audio element needs none of this — `currentTime` is already in track seconds.
	 */
	useLayoutEffect(() => {
		if (fallbackRef.current) {
			fallbackRef.current = { startedAt: performance.now(), offset: elapsed() };
		}
		rateRef.current = rate;
	}, [rate, elapsed]);

	useEffect(() => {
		const audio = audioRef.current;
		if (!audio) {
			return;
		}
		if (!active) {
			audio.pause();
			press.cancel();
			if (distance > 1) {
				audio.currentTime = 0;
				fallbackRef.current = null;
				// The laps belong to this visit; coming back to the post starts it over.
				lapRef.current = { banked: 0, last: 0 };
				previous.current = 0;
				shiftRef.current = 0;
				setIndex(0);
				setProgress(0);
			}
			return;
		}
		userPausedRef.current = false;
		// The sheet decides when this resumes; see the hold effect below.
		if (suspendedRef.current) {
			return;
		}
		void audio.play().catch(() => {
			// Refused: fall back to a wall clock, or the images would sit on frame 1 forever and
			// the post would look broken rather than silent.
			startFallback(elapsed());
		});
	}, [active, distance, startFallback, elapsed, press.cancel]);

	// The clock. Driven by the audio element wherever possible, which means a stall, a seek, or a
	// scrub drags the images along with it for free.
	useEffect(() => {
		if (!active || total === 0) {
			return;
		}
		const cycle = perImage * total;
		let raf = 0;

		const tick = () => {
			const audio = audioRef.current;
			// A rejected play() is not the only way the clock can die: the browser may also let
			// play() resolve and then stop the element a moment later. Either way the images must
			// keep moving, so anything that leaves an active slide's audio stopped without the
			// viewer asking for it hands the clock to the wall clock instead.
			if (audio?.paused && !fallbackRef.current && !userPausedRef.current) {
				startFallback(elapsed());
			}
			// Fold this reading into the running total before anything is derived from it; a
			// looping track is otherwise a clock that keeps starting over. See `clock.ts`.
			if (audio && !fallbackRef.current) {
				lapRef.current = bankLap(lapRef.current, audio.currentTime, audio.duration);
			}
			const within = (((elapsed() + shiftRef.current) % cycle) + cycle) % cycle;
			/*
			 * A slideshow has no `ended` event to wait for: the audio loops on purpose, because it
			 * is the clock. What "finished" means here is the images having been all the way round,
			 * so it is read off the cycle wrapping.
			 *
			 * The half-cycle threshold is what separates a wrap from a seek. Tapping an earlier
			 * segment also moves the clock backwards, and without it every such tap would count as
			 * the post ending and scroll away from what was just asked for.
			 */
			if (within < previous.current - cycle / 2 && autoAdvanceRef.current) {
				onEndedRef.current();
			}
			previous.current = within;
			setIndex(Math.min(total - 1, Math.floor(within / perImage)));
			setProgress((within % perImage) / perImage);
			raf = requestAnimationFrame(tick);
		};

		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, [active, perImage, total, startFallback, elapsed]);

	useEffect(() => {
		onPausedChange(paused);
	}, [paused, onPausedChange]);

	/* --------------------------------------------------------------------------- image loading */

	// Never unset a loaded src: re-decoding the same JPEG on every loop is exactly the stutter
	// this is meant to avoid. Instead, keep a bounded set of indexes that have been shown.
	const [loaded, setLoaded] = useState<number[]>([0]);
	useEffect(() => {
		setLoaded((previous) => {
			const wanted = [
				index,
				(index + 1) % Math.max(total, 1),
				(index - 1 + total) % Math.max(total, 1),
			];
			const next = previous.filter((i) => !wanted.includes(i));
			const merged = [...wanted, ...next].slice(0, LRU_SIZE);
			return merged.length === previous.length && merged.every((v, i) => v === previous[i])
				? previous
				: merged;
		});
	}, [index, total]);

	const seekToSegment = useCallback(
		(segment: number) => {
			const at = segment * perImage;
			// The track is left exactly where it is. Moving to another image is a request about the
			// pictures, and seeking the audio to serve it dropped the music into the middle of a bar
			// on every arrow key, every swipe and every tap on a segment.
			shiftRef.current = shiftFor(at, elapsed(), perImage * total);
			// Brought into step with the reading the next tick will take. Without it the jump
			// backwards looks like the cycle coming round, and auto scroll leaves for the next post
			// the moment anyone steps back an image.
			previous.current = at;
			setIndex(segment);
			setProgress(0);
		},
		[perImage, total, elapsed],
	);

	const toggle = useCallback(() => {
		const audio = audioRef.current;
		const fallback = fallbackRef.current;
		if (fallback) {
			// On the wall clock there is no element to pause, so freeze and resume the clock
			// itself — the viewer still gets a working play/pause.
			if (userPausedRef.current) {
				fallbackRef.current = {
					startedAt: performance.now(),
					offset: fallback.offset,
				};
				userPausedRef.current = false;
				setPaused(false);
			} else {
				// Banked through the shared reader, so the rate is applied in one place only.
				fallbackRef.current = { startedAt: performance.now(), offset: elapsed() };
				userPausedRef.current = true;
				setPaused(true);
			}
			return;
		}
		if (!audio) {
			return;
		}
		if (audio.paused) {
			userPausedRef.current = false;
			void audio.play().catch(() => startFallback(elapsed()));
		} else {
			userPausedRef.current = true;
			audio.pause();
		}
	}, [startFallback, elapsed]);

	/** Move one image, wrapping. The clock follows, whichever clock is currently running. */
	const step = useCallback(
		(delta: number) => {
			if (total > 0) {
				seekToSegment((((index + delta) % total) + total) % total);
			}
		},
		[index, total, seekToSegment],
	);

	// Register once for the slide's lifetime. `step` closes over the image index, so it gets a new
	// identity every time the slideshow advances; going through a ref keeps that churn out of the
	// registration instead of tearing the map entry down and rebuilding it during playback.
	const latest = useRef<SlideControls>({ toggle, step });
	latest.current = { toggle, step };

	tap.current = () => {
		// With the interface cleared, the tap that brings it back is the whole gesture.
		if (chromeHidden) {
			onRestoreChrome();
			return;
		}
		toggle();
	};

	swipe.current = (delta) => step(delta);
	useEffect(() => {
		const id = post.id;
		registerControls(id, {
			toggle: () => latest.current.toggle(),
			step: (delta) => latest.current.step(delta),
		});
		return () => registerControls(id, null);
	}, [registerControls, post.id]);

	/**
	 * Hold for the long-press sheet.
	 *
	 * Goes through `toggle` rather than pausing the element, because on the wall-clock fallback
	 * there is no element to pause — and `userPausedRef` is what the tick reads to tell a stall it
	 * should work around from a stop that was asked for. Two ways of stopping this thing would not
	 * stay in agreement.
	 *
	 * `ours` is the reason this is not simply "pause on open, play on close": a post the viewer had
	 * already paused must still be paused when the sheet goes away. Only a pause the sheet caused
	 * is a pause the sheet may take back.
	 */
	const ours = useRef(false);
	useEffect(() => {
		if (suspended) {
			if (!userPausedRef.current) {
				ours.current = true;
				latest.current.toggle();
			}
			return;
		}
		if (!ours.current) {
			return;
		}
		ours.current = false;
		// The feed may have moved on underneath the sheet; resuming then would run a slideshow
		// nobody is looking at.
		if (activeRef.current) {
			latest.current.toggle();
		}
	}, [suspended]);

	if (total === 0) {
		return (
			<div className={styles.slide}>
				<div className={styles.broken}>
					<p>No images were downloaded for this carousel.</p>
					<code>./ttdl.py get {post.author.handle ? `@${post.author.handle}` : ""}</code>
				</div>
			</div>
		);
	}

	return (
		// Like the video slides, the gesture is on the slide rather than on the images, so the
		// segments and the counter are inside the surface that listens rather than beside it. The
		// keyboard drives a carousel through the controls it registers with the feed, which owns
		// the key handling — so this needs no key handler of its own.
		<div className={styles.slide} data-held={suspended || undefined} {...press.handlers}>
			{/* The photo on screen, not the cover: the wash used to stay on image one while the
			    slideshow ran through the other five. */}
			{(urls[index] ?? post.cover?.url) && (
				<img
					src={urls[index] ?? (post.cover?.url as string)}
					alt=""
					className={styles.backdrop}
					aria-hidden
				/>
			)}

			<div className={styles.stack}>
				{urls.map((url, i) =>
					loaded.includes(i) ? (
						<img
							key={url}
							src={url}
							alt=""
							className={styles.photo}
							data-on={i === index || undefined}
							// A slide at opacity 0 still counts as in-viewport, so lazy loading here
							// would fetch every image at once. Mounting is the control.
							decoding="async"
							// Scaled with the rate, or the pan would still be crawling across a
							// picture the clock had already left. Both are left off entirely when the
							// effect is off, so nothing animates a picture that was never meant to move.
							style={pan ? { animationDuration: `${perImage / rate}s` } : undefined}
							data-pan={pan ? (i % 2 === 0 ? "in" : "out") : undefined}
						/>
					) : null,
				)}
			</div>

			{boosted && (
				<div className={styles.boost} aria-hidden>
					{boostedRate(rate)}× speed
				</div>
			)}

			{/* Placed against the picture rather than the window; see `.frame`. */}
			<div className={styles.frame}>
				{/* Story-style segments rather than a scrubber: a carousel has discrete steps. */}
				<div className={styles.segments} data-hidden={suspended || chromeHidden || undefined}>
					{Array.from({ length: expected ?? total }, (_, i) => {
						const missing = i >= total;
						return (
							<PressButton
								// The image URL is the natural identity; segments past `total` are the
								// ones ttdl never got, and their position is all they have.
								key={urls[i] ?? `missing-${i}`}
								className={styles.segment}
								data-missing={missing || undefined}
								onPress={() => {
									if (!missing) {
										seekToSegment(i);
									}
								}}
								aria-label={missing ? `Image ${i + 1} was not downloaded` : `Go to image ${i + 1}`}
							>
								<span className={styles.segmentTrack}>
									<span
										className={styles.segmentFill}
										style={{
											transform: `scaleX(${i < index ? 1 : i === index ? progress : 0})`,
										}}
									/>
								</span>
							</PressButton>
						);
					})}
				</div>

				<div className={styles.counter} data-hidden={suspended || chromeHidden || undefined}>
					{index + 1}/{total}
					{expected !== null && expected > total && (
						<span className={styles.counterWarn}> · {expected - total} missing</span>
					)}
				</div>
			</div>

			{/* This is a music track pulled off a slideshow post; no caption track exists for it,
			    and inventing an empty one would only add a control that does nothing. */}
			{/* biome-ignore lint/a11y/useMediaCaption: see above */}
			<audio
				ref={audioRef}
				// `src` is set by the effect above, not here.
				loop
				preload={mayBuffer ? "auto" : "metadata"}
				onPlay={() => setPaused(false)}
				onPause={() => setPaused(true)}
			/>
		</div>
	);
}

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Post } from "../../shared/types.ts";
import { usePlayer } from "../store/player.ts";
import styles from "./Slide.module.css";

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
	registerControls: (id: string, controls: CarouselControls | null) => void;
	/** Same staged-buffering rule the video slides follow, so both media paths agree. */
	mayBuffer: boolean;
}

export interface CarouselControls {
	toggle: () => void;
	step: (delta: number) => void;
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
}: CarouselSlideProps) {
	const audioRef = useRef<HTMLAudioElement>(null);
	const muted = usePlayer((state) => state.muted);
	const volume = usePlayer((state) => state.volume);

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

	const startFallback = useCallback((offset: number) => {
		fallbackRef.current = { startedAt: performance.now(), offset };
		setPaused(false);
	}, []);

	useEffect(() => {
		registerMedia(audioRef.current);
		return () => registerMedia(null);
	}, [registerMedia]);

	// Same reason as the video slides: an unmounted element keeps its audio resource until it is
	// collected, and on iOS the supply is small enough that a few swipes exhaust it.
	useLayoutEffect(() => {
		const audio = audioRef.current;
		return () => {
			if (!audio) {
				return;
			}
			audio.pause();
			audio.removeAttribute("src");
			audio.load();
		};
	}, []);

	useEffect(() => {
		const audio = audioRef.current;
		if (!audio) {
			return;
		}
		audio.volume = volume;
		// Keep the element playing even with the sound off. Autoplay policy allows a muted
		// element, and `currentTime` is the clock the images run on — stopping it would freeze
		// the slideshow whenever the user mutes.
		audio.muted = muted;
	}, [muted, volume]);

	useEffect(() => {
		const audio = audioRef.current;
		if (!audio) {
			return;
		}
		if (!active) {
			audio.pause();
			if (distance > 1) {
				audio.currentTime = 0;
				fallbackRef.current = null;
				setIndex(0);
				setProgress(0);
			}
			return;
		}
		userPausedRef.current = false;
		void audio.play().catch(() => {
			// Refused: fall back to a wall clock, or the images would sit on frame 1 forever and
			// the post would look broken rather than silent.
			startFallback(audio.currentTime);
		});
	}, [active, distance, startFallback]);

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
				startFallback(audio.currentTime);
			}
			const fallback = fallbackRef.current;
			let elapsed: number;
			if (fallback) {
				elapsed = userPausedRef.current
					? fallback.offset
					: fallback.offset + (performance.now() - fallback.startedAt) / 1000;
			} else if (audio) {
				elapsed = audio.currentTime;
			} else {
				elapsed = 0;
			}
			const within = ((elapsed % cycle) + cycle) % cycle;
			setIndex(Math.min(total - 1, Math.floor(within / perImage)));
			setProgress((within % perImage) / perImage);
			raf = requestAnimationFrame(tick);
		};

		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, [active, perImage, total, startFallback]);

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
			const audio = audioRef.current;
			if (fallbackRef.current) {
				fallbackRef.current = { startedAt: performance.now(), offset: at };
			} else if (audio) {
				audio.currentTime = at % Math.max(audio.duration || perImage * total, 0.001);
			}
			setIndex(segment);
			setProgress(0);
		},
		[perImage, total],
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
				fallbackRef.current = {
					startedAt: performance.now(),
					offset: fallback.offset + (performance.now() - fallback.startedAt) / 1000,
				};
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
			void audio.play().catch(() => startFallback(audio.currentTime));
		} else {
			userPausedRef.current = true;
			audio.pause();
		}
	}, [startFallback]);

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
	const latest = useRef<CarouselControls>({ toggle, step });
	latest.current = { toggle, step };
	useEffect(() => {
		const id = post.id;
		registerControls(id, {
			toggle: () => latest.current.toggle(),
			step: (delta) => latest.current.step(delta),
		});
		return () => registerControls(id, null);
	}, [registerControls, post.id]);

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
		<div className={styles.slide}>
			{post.cover && <img src={post.cover.url} alt="" className={styles.backdrop} aria-hidden />}

			<div className={styles.stack} onClick={toggle}>
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
							style={{ animationDuration: `${perImage}s` }}
							data-pan={i % 2 === 0 ? "in" : "out"}
						/>
					) : null,
				)}
			</div>

			{/* Story-style segments rather than a scrubber: a carousel has discrete steps. */}
			<div className={styles.segments}>
				{Array.from({ length: expected ?? total }, (_, i) => {
					const missing = i >= total;
					return (
						<button
							// The image URL is the natural identity; segments past `total` are the
							// ones ttdl never got, and their position is all they have.
							key={urls[i] ?? `missing-${i}`}
							className={styles.segment}
							data-missing={missing || undefined}
							onClick={(event) => {
								event.stopPropagation();
								if (!missing) {
									seekToSegment(i);
								}
							}}
							aria-label={missing ? `Image ${i + 1} was not downloaded` : `Go to image ${i + 1}`}
						>
							<span
								className={styles.segmentFill}
								style={{
									transform: `scaleX(${i < index ? 1 : i === index ? progress : 0})`,
								}}
							/>
						</button>
					);
				})}
			</div>

			<div className={styles.counter}>
				{index + 1}/{total}
				{expected !== null && expected > total && (
					<span className={styles.counterWarn}> · {expected - total} missing</span>
				)}
			</div>

			{/* This is a music track pulled off a slideshow post; no caption track exists for it,
			    and inventing an empty one would only add a control that does nothing. */}
			{/* biome-ignore lint/a11y/useMediaCaption: see above */}
			<audio
				ref={audioRef}
				src={post.media.url}
				loop
				preload={mayBuffer ? "auto" : "metadata"}
				onPlay={() => setPaused(false)}
				onPause={() => setPaused(true)}
			/>
		</div>
	);
}

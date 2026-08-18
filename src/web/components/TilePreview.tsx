import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Post } from "../../shared/types.ts";
import styles from "./PostTile.module.css";

/**
 * How much of a post a hover shows before it starts over.
 *
 * A preview is a sample, not a viewing: six seconds is enough to tell what a post is, and looping
 * inside them is what stops a pointer left resting on a tile from reading a long post end to end.
 * It is not a cap on bytes and does not pretend to be one — a browser buffers ahead as it likes,
 * and the server answers an open-ended request with up to 8 MB, which for an ordinary post is the
 * whole file. It is a cap on how far past the opening that can ever go.
 */
const PREVIEW_SECONDS = 6;

/** How long each image of a carousel holds before the next one. */
const PHOTO_MS = 1100;

/**
 * The post itself, playing in its own tile.
 *
 * Silent without exception, and not wired to the player's mute state: sound arriving from a grid
 * because a pointer crossed it is not a setting anybody chose. The element is only mounted once
 * the pointer has rested, so this component's whole life is one hover.
 */
function VideoPreview({ post }: { post: Post }) {
	const ref = useRef<HTMLVideoElement>(null);
	const [playing, setPlaying] = useState(false);

	/**
	 * Point the element at the file, and hand the decoder back on the way out.
	 *
	 * The emptying is the same one the feed's slides do, for a sharper version of the same reason:
	 * detaching an element does not release what it holds, and a pointer moving down a column mints
	 * one of these every second or so, so without it the page accumulates media resources for as
	 * long as somebody is browsing. Layout, not passive, so it runs before the next tile's element
	 * is created rather than after.
	 *
	 * The source is assigned here rather than written as a `src` prop because those two halves have
	 * to be symmetrical. As a prop it is React that owns the attribute, and React does not know this
	 * cleanup removed it — under StrictMode, which mounts every effect twice, the teardown ran
	 * against a perfectly good element and the remount set no source back, leaving a `<video>` that
	 * would never load anything. Setting it alongside the cleanup that clears it keeps the pair
	 * honest however many times React chooses to run them.
	 */
	useLayoutEffect(() => {
		const video = ref.current;
		if (!video) {
			return;
		}
		video.src = post.media.url;
		// Required after either assignment: the resource selection algorithm is what actually starts
		// the fetch, and autoplay follows from it.
		video.load();
		return () => {
			video.pause();
			video.removeAttribute("src");
			video.load();
		};
	}, [post.media.url]);

	return (
		<video
			ref={ref}
			className={styles.preview}
			// Held back until there is a moving picture to show: revealed on mount, the element
			// would paint a black rectangle over the cover for as long as the file takes to open,
			// which over a wireless link to a NAS is long enough to read as a fault.
			data-visible={playing || undefined}
			autoPlay
			muted
			loop
			playsInline
			preload="auto"
			aria-hidden
			tabIndex={-1}
			onPlaying={() => setPlaying(true)}
			onCanPlay={(event) => {
				// autoplay on a muted element is permitted everywhere, but a refusal here is silent
				// and would leave the cover sitting there — so ask once more when there is data.
				const video = event.currentTarget;
				if (video.paused) {
					void video.play().catch(() => undefined);
				}
			}}
			onTimeUpdate={(event) => {
				const video = event.currentTarget;
				if (video.currentTime > PREVIEW_SECONDS) {
					// Back to the start rather than on to the next window: the first seconds are
					// buffered, so this is a loop the browser can serve without asking for anything.
					video.currentTime = 0;
				}
			}}
		/>
	);
}

/**
 * A carousel has no video to play — its `media` is the sound file — so the preview is the images,
 * stepped rather than crossfaded, which is how the post itself moves through them.
 */
function PhotoPreview({ urls }: { urls: string[] }) {
	// From the second image, because the first is what the cover is already showing: starting at
	// zero would spend the first beat of the hover repeating the still it replaced.
	const [index, setIndex] = useState(() => (urls.length > 1 ? 1 : 0));
	const [loaded, setLoaded] = useState(false);

	useEffect(() => {
		if (urls.length < 2) {
			return;
		}
		const timer = setInterval(() => setIndex((current) => (current + 1) % urls.length), PHOTO_MS);
		return () => clearInterval(timer);
	}, [urls.length]);

	// Fetch the next one while this one is up, so each step is a swap between decoded images rather
	// than a gap the cover shows through.
	useEffect(() => {
		const next = urls[(index + 1) % urls.length];
		if (next) {
			const image = new Image();
			image.src = next;
		}
	}, [index, urls]);

	const src = urls[index];
	if (!src) {
		return null;
	}

	return (
		<img
			className={styles.preview}
			data-visible={loaded || undefined}
			src={src}
			alt=""
			aria-hidden
			decoding="async"
			onLoad={() => setLoaded(true)}
		/>
	);
}

/** Nothing at all for a post whose file is missing — a ghost has no frames to show. */
export function TilePreview({ post }: { post: Post }) {
	if (post.kind === "carousel") {
		const urls = post.photos?.urls ?? [];
		return urls.length > 0 ? <PhotoPreview urls={urls} /> : null;
	}
	return post.media.kind === "video" ? <VideoPreview post={post} /> : null;
}

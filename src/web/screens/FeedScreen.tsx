import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { parseQuery, serializeQuery } from "../../shared/filters.ts";
import type { Post } from "../../shared/types.ts";
import {
	ApiError,
	flatten,
	useArchive,
	useNeighbors,
	usePosts,
	useRawInfo,
} from "../api/client.ts";
import { BackIcon, InfoIcon, MuteIcon, SoundIcon } from "../components/Icons.tsx";
import { ActionRail } from "../feed/ActionRail.tsx";
import { Caption } from "../feed/Caption.tsx";
import { type CarouselControls, CarouselSlide } from "../feed/CarouselSlide.tsx";
import { DebugPanel } from "../feed/DebugPanel.tsx";
import { VideoSlide } from "../feed/VideoSlide.tsx";
import { usePlayer } from "../store/player.ts";
import empty from "./Empty.module.css";
import styles from "./FeedScreen.module.css";

/**
 * How many slides either side of the active one keep their media mounted.
 *
 * This is set by the decoder budget, not by DOM cost: browsers cap concurrent hardware video
 * decoders, and mobile Safari's cap is low. Five elements is comfortably inside every limit while
 * still making prev/next instant.
 */
const WINDOW = 2;

export function FeedScreen({ params }: { params: { archiveId: string; postId: string } }) {
	const { archiveId, postId } = params;
	const search = useSearch();
	const [, navigate] = useLocation();
	const query = useMemo(() => parseQuery(new URLSearchParams(search)), [search]);
	const filterKey = serializeQuery(query);

	const archive = useArchive(archiveId);
	// The same key the grid used, so arriving from a tile finds every page already cached.
	const posts = usePosts(archiveId, query);
	const items = useMemo(() => flatten(posts.data), [posts.data]);

	const containerRef = useRef<HTMLDivElement>(null);
	const [activeIndex, setActiveIndex] = useState(0);
	const [paused, setPaused] = useState(true);
	const [showInfo, setShowInfo] = useState(false);
	const mediaRefs = useRef(new Map<string, HTMLMediaElement>());
	const controlRefs = useRef(new Map<string, CarouselControls>());
	const didInitialScroll = useRef(false);
	/** The archive the arrival state above belongs to; see the layout effect. */
	const lastArchive = useRef(archiveId);
	/**
	 * Whether the deep-linked post has been found and scrolled to.
	 *
	 * Until it is, the feed is showing the first post while the real target is still being paged
	 * in — and letting the URL sync run in that window would replace the requested id with the
	 * first one, losing the deep link before it could ever resolve.
	 */
	const [located, setLocated] = useState(false);
	/**
	 * The slide that has reported it can play, by index; -1 before any has.
	 *
	 * Storing the index rather than a boolean is what makes "the *active* slide is ready" true by
	 * construction. As a boolean it needed an effect to clear it on every change of active slide,
	 * and that effect belongs to this component — so it ran *after* the slide's own effect had
	 * already reported readiness, and clobbered it. A slide that arrived pre-buffered fires no
	 * further `canplay`, so the flag then stayed false for good and neighbours never preloaded.
	 */
	const [readyIndex, setReadyIndex] = useState(-1);

	const muted = usePlayer((state) => state.muted);
	const toggleMuted = usePlayer((state) => state.toggleMuted);
	const markInteracted = usePlayer((state) => state.markInteracted);
	const restoreSound = usePlayer((state) => state.restoreSound);

	const targetIndex = useMemo(() => items.findIndex((p) => p.id === postId), [items, postId]);

	// Where the post sits in this view. Arriving from the grid the pages are already cached, the
	// target is found on the first render, and this never runs; on a cold deep link it is what
	// stops the feed paging blindly.
	const neighbors = useNeighbors(archiveId, postId, query, targetIndex === -1 && !located);
	const position = neighbors.data?.position ?? null;
	// -1 means the id is not in this view at all — a stale bookmark, or a filter that excludes it.
	const unreachable = position === -1;
	// Once the position query has given up, paging has to carry on without it.
	const positionUnknown = position === null && !neighbors.isPending;

	const { hasNextPage, isFetchingNextPage, fetchNextPage } = posts;

	// A deep link can name a post that lives past the first page. Page towards its known position
	// and stop there — but never let a failed position query strand the feed: without an answer,
	// fall back to walking pages until the post turns up or the archive runs out.
	useEffect(() => {
		if (targetIndex !== -1 || unreachable) {
			return;
		}
		if (position === null && !positionUnknown) {
			return; // still asking; give it a moment before paging blindly
		}
		const needMore = position === null || items.length <= position;
		if (needMore && hasNextPage && !isFetchingNextPage) {
			void fetchNextPage();
		}
	}, [
		targetIndex,
		position,
		positionUnknown,
		unreachable,
		items.length,
		hasNextPage,
		isFetchingNextPage,
		fetchNextPage,
	]);

	// Jump to the requested post once, without animating — this is an arrival, not a navigation.
	useLayoutEffect(() => {
		const container = containerRef.current;
		if (!container) {
			return;
		}
		// wouter reuses this component across feed routes, so a move to another archive has to
		// clear the arrival state or the new deep link would be treated as already handled.
		if (lastArchive.current !== archiveId) {
			lastArchive.current = archiveId;
			didInitialScroll.current = false;
			setLocated(false);
			return;
		}
		if (didInitialScroll.current) {
			return;
		}
		if (targetIndex < 0) {
			// Either the id is not in this view, or we have paged to the end without finding it.
			// Release the URL sync so the feed settles on what it is actually showing rather than
			// freezing on a dead id — and do it without depending on the position query.
			if (unreachable || (items.length > 0 && !hasNextPage)) {
				didInitialScroll.current = true;
				setLocated(true);
			}
			return;
		}
		container.scrollTop = targetIndex * container.clientHeight;
		setActiveIndex(targetIndex);
		didInitialScroll.current = true;
		setLocated(true);
	}, [targetIndex, unreachable, archiveId, items.length, hasNextPage]);

	/* --------------------------------------------------------------------------- active tracking */

	/**
	 * Which slide is on screen, read off the scroll position.
	 *
	 * This was an IntersectionObserver, which is the better instrument on paper — it stays off the
	 * main thread's scroll path. But it only ever reports threshold *crossings*, and a crossing
	 * that never gets sampled is simply lost: fling through several slides while the main thread is
	 * busy decoding video, or let the tab go hidden mid-scroll, and `activeIndex` is left pointing
	 * at a slide the user has long since passed, with no later event that would ever correct it.
	 *
	 * That is the stall. The slide you are looking at is not the active one, so it was paused and
	 * left showing its poster — until a tap plays it directly, or a trip out to the grid and back
	 * rebuilds the index from the URL. Both "fixes" work without the feed ever noticing it was wrong.
	 *
	 * Slots are exactly one viewport tall and snap, so the scroll position *is* the index. Reading
	 * it on every frame the scroller moved can be a frame stale, but it cannot get stuck.
	 */
	useEffect(() => {
		const container = containerRef.current;
		if (!container || items.length === 0) {
			return;
		}
		let frame = 0;
		const sync = () => {
			frame = 0;
			const height = container.clientHeight;
			if (height === 0) {
				return;
			}
			const index = Math.min(
				Math.max(Math.round(container.scrollTop / height), 0),
				items.length - 1,
			);
			setActiveIndex((was) => (was === index ? was : index));
		};
		const onScroll = () => {
			// One read per frame, no matter how many scroll events the fling produces.
			if (frame === 0) {
				frame = requestAnimationFrame(sync);
			}
		};
		container.addEventListener("scroll", onScroll, { passive: true });
		// The feed can also arrive at a position that never moves again — a deep link that paged in
		// underneath us, a resize — so settle once here instead of waiting for a scroll to happen.
		sync();
		return () => {
			container.removeEventListener("scroll", onScroll);
			cancelAnimationFrame(frame);
		};
	}, [items.length]);

	// Keep the URL on the post you are looking at — with replace, or the back button turns into a
	// per-post rewind through hundreds of entries.
	const activePost = items[activeIndex];
	useEffect(() => {
		// Not until the deep-linked post has been located — see `located`.
		if (!located || !activePost || activePost.id === postId) {
			return;
		}
		navigate(`/a/${archiveId}/feed/${activePost.id}${filterKey ? `?${filterKey}` : ""}`, {
			replace: true,
		});
	}, [located, activePost, postId, archiveId, filterKey, navigate]);

	// Fetch ahead while scrolling, so the feed never runs out under the user.
	useEffect(() => {
		if (activeIndex >= items.length - 5 && hasNextPage && !isFetchingNextPage) {
			void fetchNextPage();
		}
	}, [activeIndex, items.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

	/* -------------------------------------------------------------------------------- navigation */

	const goTo = useCallback(
		(index: number) => {
			const container = containerRef.current;
			if (!container) {
				return;
			}
			const clamped = Math.min(Math.max(index, 0), items.length - 1);
			container.scrollTo({ top: clamped * container.clientHeight, behavior: "smooth" });
		},
		[items.length],
	);

	/**
	 * Leave a breadcrumb so the grid can scroll to — and outline — the post being left.
	 *
	 * It has to be dropped on every slide rather than on the way out, because the browser's own
	 * back — the swipe, the hardware button, the ⌘← — never runs any handler of ours. Writing it
	 * only in the button's onClick meant the most common way of leaving the feed left no trail at
	 * all, and the grid came back at the top.
	 */
	useEffect(() => {
		if (activePost) {
			sessionStorage.setItem(`ttdl-viewer:from:${archiveId}`, activePost.id);
		}
	}, [activePost, archiveId]);

	const backToGrid = useCallback(() => {
		navigate(`/a/${archiveId}${filterKey ? `?${filterKey}` : ""}`);
	}, [archiveId, filterKey, navigate]);

	const currentMedia = useCallback(
		() => (activePost ? mediaRefs.current.get(activePost.id) : undefined),
		[activePost],
	);

	// A carousel registers its own play/pause and step, because neither can be done correctly
	// from out here: its audio element is only sometimes the clock, and pausing that element
	// directly is indistinguishable from the browser stopping it.
	const currentControls = useCallback(
		() => (activePost ? controlRefs.current.get(activePost.id) : undefined),
		[activePost],
	);

	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			const target = event.target as HTMLElement | null;
			// Never hijack typing.
			if (target?.closest("input, textarea, select, [contenteditable]")) {
				return;
			}
			markInteracted();
			const media = currentMedia();
			const controls = currentControls();

			switch (event.key) {
				case "ArrowDown":
				case "j":
				case "PageDown":
					event.preventDefault();
					goTo(activeIndex + 1);
					break;
				case "ArrowUp":
				case "k":
				case "PageUp":
					event.preventDefault();
					goTo(activeIndex - 1);
					break;
				case " ":
					event.preventDefault();
					if (controls) {
						controls.toggle();
					} else if (media) {
						if (media.paused) {
							void media.play().catch(() => undefined);
						} else {
							media.pause();
						}
					}
					break;
				case "ArrowLeft":
					// A carousel has discrete steps, so an arrow means one image, not five seconds.
					if (controls) {
						controls.step(-1);
					} else if (media) {
						media.currentTime = Math.max(0, media.currentTime - 5);
					}
					break;
				case "ArrowRight":
					if (controls) {
						controls.step(1);
					} else if (media && Number.isFinite(media.duration)) {
						media.currentTime = Math.min(media.duration, media.currentTime + 5);
					}
					break;
				case "m":
					toggleMuted();
					break;
				case "i":
					setShowInfo((was) => !was);
					break;
				case "Escape":
					if (showInfo) {
						setShowInfo(false);
					} else {
						backToGrid();
					}
					break;
				case "f":
					void containerRef.current?.requestFullscreen?.().catch(() => undefined);
					break;
				default:
					if (/^[0-9]$/.test(event.key) && media && Number.isFinite(media.duration)) {
						media.currentTime = (Number(event.key) / 10) * media.duration;
					}
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [
		activeIndex,
		goTo,
		backToGrid,
		toggleMuted,
		markInteracted,
		showInfo,
		currentMedia,
		currentControls,
	]);

	const registerMedia = useCallback(
		(id: string) => (element: HTMLMediaElement | null) => {
			if (element) {
				mediaRefs.current.set(id, element);
			} else {
				mediaRefs.current.delete(id);
			}
		},
		[],
	);

	/**
	 * Spend the touch that begins a swipe on the slides it is about to reach.
	 *
	 * Safari hands an element the right to start itself only once it has played inside a gesture;
	 * an element that has never played has no such right, and the play() the feed issues on arrival
	 * is refused. Nothing about swiping counts — so the sound survives exactly as long as the tap
	 * that started it, and then the feed goes quiet until it is tapped again.
	 *
	 * The touch that starts a swipe *is* a gesture, though, and the next slides are already
	 * mounted. Starting and immediately stopping them here, muted so none of it is audible, is what
	 * gives them that right before they need it. Elements that have played are left alone — they
	 * already have it, and the active one is playing.
	 */
	const primeForGesture = useCallback(() => {
		// Every mounted element, not just the next one. Priming has to land *before* a slide is
		// needed — a play() started on the touch that is already swiping onto it has not been
		// counted by the time it arrives, which is why narrowing this to the slide below only moved
		// the failure further out instead of removing it. Reaching the whole window primes each
		// element a couple of swipes ahead of its turn, and the element count holding steady is
		// what says the resources this spends are handed straight back.
		// Never the active slide. Priming ends in a pause and a rewind, which is the right thing to
		// do to a slide waiting its turn and precisely the wrong thing to do to the one on screen —
		// and it qualifies, because a slide that has not finished loading is still paused.
		const activeId = items[activeIndexRef.current]?.id;
		for (const [id, media] of mediaRefs.current) {
			if (id === activeId || media.played.length > 0 || !media.paused) {
				continue;
			}
			/*
			 * Start and stop within the same tick, never across a promise.
			 *
			 * What unlocks the element is the play() call happening inside the gesture, not the
			 * playback that follows — so there is nothing to wait for, and waiting was the bug:
			 * between play() and a .then() the element is genuinely playing, and it is only silent
			 * for as long as the mute set around it survives. Slides two away were reaching the
			 * speakers under the post being watched, doubling it up or replacing it outright.
			 * Stopping synchronously means it is never audible and never overlaps.
			 */
			media.muted = true;
			const started = media.play();
			media.pause();
			media.currentTime = 0;
			media.muted = usePlayer.getState().muted;
			// The pause above rejects the play() it interrupted; that rejection is the intent here.
			if (started) {
				void started.catch(() => undefined);
			}
		}
	}, [items]);

	const onFeedPointerDown = useCallback(() => {
		markInteracted();
		// Order matters: the sound comes back first, so the elements primed below are primed in the
		// state the next slide will actually be started in.
		restoreSound();
		primeForGesture();
	}, [markInteracted, restoreSound, primeForGesture]);

	// Takes the id as an argument rather than returning a per-id closure, so the slide receives
	// one stable function and does not re-register itself on every parent render.
	const registerControls = useCallback((id: string, controls: CarouselControls | null) => {
		if (controls) {
			controlRefs.current.set(id, controls);
		} else {
			controlRefs.current.delete(id);
		}
	}, []);

	// Read through a ref so the callback can stay stable: the slides take it as a prop, and a new
	// identity on every render would re-run the effect that starts playback.
	const activeIndexRef = useRef(activeIndex);
	activeIndexRef.current = activeIndex;
	const markActiveReady = useCallback(() => setReadyIndex(activeIndexRef.current), []);

	const rawInfo = useRawInfo(archiveId, activePost?.id ?? null, showInfo);

	// Not part of the query object: this is a debugging switch, not a view, and it has no business
	// in the cache key or in a shared URL's meaning. Read once, because the URL is rewritten from
	// the filter on every slide — which drops the flag on the first swipe.
	const [debug] = useState(() => new URLSearchParams(window.location.search).get("debug") === "1");

	/* --------------------------------------------------------------------------------- rendering */

	if (posts.isPending) {
		return <div className={styles.loading}>Loading…</div>;
	}

	if (items.length === 0) {
		return (
			<div className={empty.empty}>
				<h1 className={empty.title}>Nothing to play</h1>
				<p className={empty.body}>This filter matches no posts in {archive.data?.name}.</p>
				<Link href={`/a/${archiveId}`} className={empty.action}>
					Back to the grid
				</Link>
			</div>
		);
	}

	return (
		// Capture on the whole screen: every touch is a gesture worth spending, including the ones
		// that land on the chrome buttons rather than on the feed itself.
		<div className={styles.wrap} onPointerDownCapture={onFeedPointerDown}>
			<div
				className={styles.feed}
				ref={containerRef}
				onPointerDown={onFeedPointerDown}
				tabIndex={-1}
			>
				{/*
				 * Every post gets a slot; only the window gets content. An empty fixed-height div
				 * costs one node and no paint, and keeping all of them means native scroll-snap,
				 * the native scrollbar, and scroll restoration all work without being reinvented.
				 */}
				{items.map((post, index) => {
					const distance = Math.abs(index - activeIndex);
					return (
						<div key={post.id} className={styles.slot} data-index={index}>
							{distance <= WINDOW && (
								<Slide
									post={post}
									active={index === activeIndex}
									distance={distance}
									onPausedChange={index === activeIndex ? setPaused : noop}
									registerMedia={registerMedia(post.id)}
									registerControls={registerControls}
									mayBuffer={distance === 0 || (distance === 1 && readyIndex === activeIndex)}
									onReady={index === activeIndex ? markActiveReady : noop}
								/>
							)}
						</div>
					);
				})}
			</div>

			<div className={styles.chrome}>
				<button className={styles.back} onClick={backToGrid} aria-label="Back to the grid">
					<BackIcon />
				</button>
				<div className={styles.chromeRight}>
					<button
						className={styles.chromeButton}
						onClick={() => {
							markInteracted();
							toggleMuted();
						}}
						aria-label={muted ? "Unmute" : "Mute"}
					>
						{muted ? <MuteIcon /> : <SoundIcon />}
					</button>
					<button
						className={styles.chromeButton}
						data-on={showInfo || undefined}
						onClick={() => setShowInfo((was) => !was)}
						aria-label="Show the raw metadata"
					>
						<InfoIcon />
					</button>
				</div>
			</div>

			{activePost && (
				<>
					<div className={styles.scrim} />
					<Caption
						post={activePost}
						onHashtag={(tag) =>
							navigate(`/a/${archiveId}?${serializeQuery({ ...query, hashtag: [tag] })}`)
						}
					/>
					<ActionRail post={activePost} paused={paused} />
					<div className={styles.position}>
						{/*
						 * Once there are no more pages, what is loaded is all that can be reached —
						 * including when the sequence was cut short by a cursor whose post ttdl
						 * removed. Showing the view's total then would promise posts that no longer
						 * arrive.
						 */}
						{activeIndex + 1} /{" "}
						{hasNextPage ? (posts.data?.pages[0]?.total ?? items.length) : items.length}
					</div>
				</>
			)}

			{debug && <DebugPanel scroller={containerRef} />}

			{showInfo && (
				<aside className={styles.drawer}>
					<header className={styles.drawerHead}>
						<h2>Raw metadata</h2>
						<button onClick={() => setShowInfo(false)} aria-label="Close">
							×
						</button>
					</header>
					{rawInfo.isError ? (
						<div className={styles.drawerEmpty}>
							<p>{rawInfo.error.message}</p>
							{rawInfo.error instanceof ApiError && rawInfo.error.failure.hint && (
								<pre className={empty.command}>{rawInfo.error.failure.hint}</pre>
							)}
						</div>
					) : (
						<pre className={styles.drawerBody}>{JSON.stringify(rawInfo.data, null, 2) ?? "…"}</pre>
					)}
				</aside>
			)}
		</div>
	);
}

function noop() {}

interface SlideProps {
	post: Post;
	active: boolean;
	distance: number;
	onPausedChange: (paused: boolean) => void;
	registerMedia: (element: HTMLMediaElement | null) => void;
	registerControls: (id: string, controls: CarouselControls | null) => void;
	mayBuffer: boolean;
	onReady: () => void;
}

// Hashtags are handled by the Caption, which the feed renders once at the container level rather
// than per slide — so nothing hashtag-shaped is threaded through here.
function Slide({
	post,
	active,
	distance,
	onPausedChange,
	registerMedia,
	registerControls,
	mayBuffer,
	onReady,
}: SlideProps) {
	return post.kind === "video" ? (
		<VideoSlide
			post={post}
			active={active}
			distance={distance}
			onPausedChange={onPausedChange}
			registerMedia={registerMedia}
			mayBuffer={mayBuffer}
			onReady={onReady}
		/>
	) : (
		<CarouselSlide
			post={post}
			active={active}
			distance={distance}
			onPausedChange={onPausedChange}
			registerMedia={registerMedia}
			registerControls={registerControls}
			mayBuffer={mayBuffer}
		/>
	);
}

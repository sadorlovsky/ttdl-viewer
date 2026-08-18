import {
	type PointerEvent as ReactPointerEvent,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
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
import { PostMenu } from "../feed/PostMenu.tsx";
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

	const wrapRef = useRef<HTMLDivElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const [activeIndex, setActiveIndex] = useState(0);
	const [paused, setPaused] = useState(true);
	const [showInfo, setShowInfo] = useState(false);
	/** The long-press sheet. Open means the active slide is held, not merely covered. */
	const [menuOpen, setMenuOpen] = useState(false);
	// Read by the pointer-down handler, which is memoised and must not be rebuilt per slide.
	const menuOpenRef = useRef(menuOpen);
	menuOpenRef.current = menuOpen;
	/**
	 * Clear display: every overlay out of the way until the next tap on the media.
	 *
	 * Deliberately not persisted. It is a way of looking at one thing, not a preference — coming
	 * back to a feed with no controls and no memory of having asked for that is a trap, and the
	 * only way out of it is a tap nothing on screen suggests.
	 */
	const [chromeHidden, setChromeHidden] = useState(false);
	const [fullscreen, setFullscreen] = useState(false);
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
	/**
	 * Read the index off the scroll position, now.
	 *
	 * Held in a ref so a gesture can demand it. A fling ends before the snap does, and the frame
	 * that would have caught up is one the browser has not drawn yet — so the first press or tap
	 * after a swipe arrives while the feed still believes the previous post is the one on screen.
	 * Everything that gesture then reaches for is the wrong post: the speaker unmutes an element
	 * that is no longer showing, and the speed-up runs a video that is not playing. Both were
	 * reported as "works, but not the first time".
	 */
	const syncActive = useRef<() => void>(() => {});

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
		syncActive.current = sync;
		const onScroll = () => {
			// One read per frame, no matter how many scroll events the fling produces.
			if (frame === 0) {
				frame = requestAnimationFrame(sync);
			}
		};
		container.addEventListener("scroll", onScroll, { passive: true });
		// The snap carries on after the finger has gone, and its last movement may not get a frame.
		// Not every browser has this event, which is why it is an addition and not the mechanism.
		container.addEventListener("scrollend", sync, { passive: true });
		// The feed can also arrive at a position that never moves again — a deep link that paged in
		// underneath us, a resize — so settle once here instead of waiting for a scroll to happen.
		sync();
		return () => {
			container.removeEventListener("scroll", onScroll);
			container.removeEventListener("scrollend", sync);
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

	/**
	 * Change the sound, inside the gesture that asked for it.
	 *
	 * The store alone is not enough: applying the new value is left to each slide's effect, which
	 * runs after this handler returns, and a browser deciding whether an element may make noise
	 * looks at the gesture it is being asked from. Setting it here, on the element on screen, is
	 * what makes the request the viewer's rather than the page's.
	 *
	 * Turning the sound *on* needs more than that, and only for video. WebKit admits an element to
	 * the platform's audio session once, when it starts; a video that started muted was admitted as
	 * a silent one, and its `play()` is short-circuited while it is already playing — so asking
	 * again changes nothing, the session is never re-admitted with audio, and the element is then
	 * stopped outright for having become audible without permission. That is the whole of the
	 * speaker button working everywhere except on an iPhone, and working there for slideshows,
	 * whose `<audio>` was admitted with sound from the start.
	 *
	 * Stopping it first is what makes the `play()` real. The order is load-bearing: paused, then
	 * unmuted, then started, with nothing awaited in between — a single `await` anywhere here ends
	 * the gesture and hands back the same refusal.
	 *
	 * The post has to have been playing. One the viewer paused should not start again just because
	 * they reached for the speaker.
	 */
	const toggleSound = useCallback(() => {
		markInteracted();
		toggleMuted();
		const media = currentMedia();
		if (!media) {
			return;
		}
		const nowMuted = usePlayer.getState().muted;
		const wasPlaying = !media.paused;
		if (nowMuted) {
			media.muted = true;
			return;
		}
		if (wasPlaying && media instanceof HTMLVideoElement) {
			// The slide would read the pause below as the browser stopping the post on its own and
			// race this with a resume of its own; the flag is consumed there. Carousels are left
			// alone — their audio has none of this trouble, and a gap in the clock the images run
			// on is a real cost to pay for a problem they do not have.
			media.dataset.soundSwap = "1";
			media.pause();
		}
		media.muted = false;
		media.volume = usePlayer.getState().volume;
		if (wasPlaying) {
			void media.play().catch(() => undefined);
		}
	}, [markInteracted, toggleMuted, currentMedia]);

	/* ---------------------------------------------------------------------- the long-press sheet */

	const openMenu = useCallback(() => setMenuOpen(true), []);
	const closeMenu = useCallback(() => setMenuOpen(false), []);

	const toggleFullscreen = useCallback(() => {
		// The wrapper rather than the scroller, so the caption, the rail and the chrome come along.
		if (document.fullscreenElement) {
			void document.exitFullscreen?.().catch(() => undefined);
		} else {
			void wrapRef.current?.requestFullscreen?.().catch(() => undefined);
		}
	}, []);

	// Fullscreen can also be left by Escape or by the browser's own chrome, neither of which tells
	// us anything — so the label is driven by the event rather than by what we last asked for.
	useEffect(() => {
		const sync = () => setFullscreen(document.fullscreenElement !== null);
		document.addEventListener("fullscreenchange", sync);
		sync();
		return () => document.removeEventListener("fullscreenchange", sync);
	}, []);

	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			const target = event.target as HTMLElement | null;
			// Never hijack typing.
			if (target?.closest("input, textarea, select, [contenteditable]")) {
				return;
			}
			// The sheet is modal, and it handles its own Escape. Letting these through would scroll
			// the feed underneath it, leaving the menu open over a post it no longer belongs to.
			if (menuOpen) {
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
					// A keypress is a gesture too, so it goes the same way the button does.
					toggleSound();
					break;
				case "i":
					setShowInfo((was) => !was);
					break;
				case "Escape":
					// Innermost first: a cleared display is a state you can be stuck in, and
					// Escape is the only way out of it that does not involve guessing.
					if (chromeHidden) {
						setChromeHidden(false);
					} else if (showInfo) {
						setShowInfo(false);
					} else {
						backToGrid();
					}
					break;
				case "f":
					toggleFullscreen();
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
		toggleSound,
		markInteracted,
		showInfo,
		currentMedia,
		currentControls,
		menuOpen,
		chromeHidden,
		toggleFullscreen,
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

	const onFeedPointerDown = useCallback(
		(event: ReactPointerEvent) => {
			// The sheet lives inside this subtree, so its taps arrive here too. Priming is for touches
			// that are about to become swipes; spending one on a menu row starts and stops elements
			// behind a post that is deliberately held, which is audible often enough to matter.
			if (menuOpenRef.current) {
				return;
			}
			// Before anything reads which post is on screen. This runs at capture, ahead of every
			// gesture handler below it, so a press landing in the moment after a swipe is answered
			// by the post the viewer is actually looking at.
			syncActive.current();
			markInteracted();
			/*
			 * Everywhere except the control that owns the sound.
			 *
			 * This runs on the way down, and the speaker button acts on the way up — so on the one
			 * tap that means "turn the sound on", the gesture had already turned it on and the
			 * button dutifully turned it back off. Nothing moved. It only happened while the mute
			 * was the policy's rather than the viewer's, which is most of the time on arrival and
			 * none of the time afterwards: a control that works, then does not, then does again.
			 *
			 * Order still matters for every other tap: the sound comes back first, so the elements
			 * primed below are primed in the state the next slide will actually be started in.
			 */
			if (!(event.target as HTMLElement | null)?.closest("[data-sound]")) {
				restoreSound();
			}
			primeForGesture();
		},
		[markInteracted, restoreSound, primeForGesture],
	);

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

	/**
	 * Auto scroll: the post that just finished hands the feed to the next one.
	 *
	 * Read off the ref rather than taking the index as an argument, because the slide that reports
	 * finishing does not know where it sits — and the last post is not a special case worth
	 * writing: `goTo` clamps, so the feed comes to rest on the final frame of the final post,
	 * which is what reaching the end of an archive should look like.
	 */
	const advance = useCallback(() => goTo(activeIndexRef.current + 1), [goTo]);

	const restoreChrome = useCallback(() => setChromeHidden(false), []);

	/**
	 * The shape of the post on screen, handed to the overlay layer so it can sit on the picture
	 * rather than on the window.
	 *
	 * 9:16 is the fallback in two cases that are not failures. A carousel's `media` is its audio
	 * track and has no dimensions at all, and a post ttdl fetched without metadata has none either
	 * — both are portrait in practice, and portrait is what the whole layout assumes elsewhere.
	 */
	const stage = useMemo(() => {
		const media = activePost?.media;
		// The dimensions rather than `aspectRatio`, which is rounded to two places on the way out of
		// the API — enough to put the edge of the interface a couple of pixels off the edge of the
		// picture, which is exactly the seam this box exists to close.
		const ratio =
			media?.width && media.height ? media.width / media.height : (media?.aspectRatio ?? 9 / 16);
		return { "--stage": String(ratio) } as React.CSSProperties;
	}, [activePost]);

	const rawInfo = useRawInfo(archiveId, activePost?.id ?? null, showInfo);

	// Not part of the query object: this is a debugging switch, not a view, and it has no business
	// in the cache key or in a shared URL's meaning. The URL is read once for the initial value,
	// because it is rewritten from the filter on every slide — which drops the flag on the first
	// swipe — and from then on the menu is what owns it.
	const [debug, setDebug] = useState(
		() => new URLSearchParams(window.location.search).get("debug") === "1",
	);

	/**
	 * Picture-in-Picture, or null when it cannot be offered.
	 *
	 * Two ways it cannot: the browser has none, or this post is a carousel — whose media element is
	 * an `<audio>`, and there is no picture to put in a picture. A menu row that explains itself by
	 * doing nothing is worse than a menu row that is not there.
	 */
	const pip = useMemo(() => {
		if (!document.pictureInPictureEnabled || activePost?.kind !== "video") {
			return null;
		}
		return () => {
			const media = mediaRefs.current.get(activePost.id);
			if (media instanceof HTMLVideoElement) {
				void media.requestPictureInPicture().catch(() => undefined);
			}
		};
		// Recomputed per slide: what is offered depends on the post the sheet would open over.
	}, [activePost]);

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
		// The shape of the post is declared here rather than on the overlay layer, because the
		// slides need it too: a carousel draws its own segment bar and counter, and those have to
		// line up with the same frame everything else is placed against.
		<div
			className={styles.wrap}
			ref={wrapRef}
			style={stage}
			onPointerDownCapture={onFeedPointerDown}
		>
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
									// Only the slide the sheet was opened over is held by it. A
									// neighbour is already paused, and telling it otherwise would
									// have it start playing off screen when the sheet closed.
									suspended={menuOpen && index === activeIndex}
									onLongPress={openMenu}
									chromeHidden={chromeHidden}
									onRestoreChrome={restoreChrome}
									onEnded={advance}
								/>
							)}
						</div>
					);
				})}
			</div>

			{/*
			 * Everything below is chrome, and a hold or a cleared display takes all of it away
			 * together. One attribute on the wrapper rather than a flag threaded through each
			 * overlay: they go and come back as one thing, and anything that only mostly disappears
			 * defeats the point of asking.
			 */}
			<div className={styles.overlays} data-hidden={menuOpen || chromeHidden || undefined}>
				<div className={styles.chrome}>
					<button className={styles.back} onClick={backToGrid} aria-label="Back to the grid">
						<BackIcon />
					</button>
					<div className={styles.chromeRight}>
						<button
							className={styles.chromeButton}
							// Marks the one place the feed's own "spend the gesture" handler must keep
							// its hands off; see onFeedPointerDown.
							data-sound
							onClick={toggleSound}
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
			</div>

			{/*
			 * The one thing a cleared display leaves on screen, and only for a moment.
			 *
			 * Without it the gesture out is unguessable: nothing is left to suggest that a tap does
			 * anything, and the obvious reading of a screen with no controls is that it broke.
			 */}
			{chromeHidden && <div className={styles.hint}>Tap to show the interface</div>}

			{debug && <DebugPanel scroller={containerRef} />}

			{menuOpen && activePost && (
				<PostMenu
					post={activePost}
					onClose={closeMenu}
					onClearDisplay={() => setChromeHidden(true)}
					onFullscreen={toggleFullscreen}
					fullscreen={fullscreen}
					onPip={pip}
					onRawInfo={() => setShowInfo(true)}
					debug={debug}
					onDebugChange={setDebug}
				/>
			)}

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
	suspended: boolean;
	onLongPress: () => void;
	chromeHidden: boolean;
	onRestoreChrome: () => void;
	onEnded: () => void;
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
	suspended,
	onLongPress,
	chromeHidden,
	onRestoreChrome,
	onEnded,
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
			suspended={suspended}
			onLongPress={onLongPress}
			chromeHidden={chromeHidden}
			onRestoreChrome={onRestoreChrome}
			onEnded={onEnded}
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
			suspended={suspended}
			onLongPress={onLongPress}
			chromeHidden={chromeHidden}
			onRestoreChrome={onRestoreChrome}
			onEnded={onEnded}
		/>
	);
}

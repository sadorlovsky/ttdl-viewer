import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { parseQuery, serializeQuery } from "../../shared/filters.ts";
import type { Archive, Post, PostQuery } from "../../shared/types.ts";
import { flatten, totalOf, useArchive, usePosts } from "../api/client.ts";
import { Avatar } from "../components/Avatar.tsx";
import { FilterBar } from "../components/FilterBar.tsx";
import { BackIcon } from "../components/Icons.tsx";
import { PostTile } from "../components/PostTile.tsx";
import { bytes, date, dateRange } from "../lib/format.ts";
import empty from "./Empty.module.css";
import styles from "./ProfileScreen.module.css";

/** Mirrors `--tile-gap`, which the row's grid uses; the estimate has to subtract the same gutters. */
const TILE_GAP = 2;

/** Column count by width, mirroring how short-video apps step from 3-up on phones to 6-up wide. */
function columnsFor(width: number): number {
	if (width < 520) {
		return 3;
	}
	if (width < 760) {
		return 4;
	}
	if (width < 1100) {
		return 5;
	}
	return 6;
}

type Tab = "all" | "video" | "carousel" | "incomplete";

const TABS: Array<{ id: Tab; label: string }> = [
	{ id: "all", label: "Posts" },
	{ id: "video", label: "Videos" },
	{ id: "carousel", label: "Photos" },
	{ id: "incomplete", label: "Incomplete" },
];

function tabToQuery(tab: Tab): Pick<PostQuery, "kind" | "status"> {
	switch (tab) {
		case "video":
			return { kind: "video" };
		case "carousel":
			return { kind: "carousel" };
		case "incomplete":
			return { status: "incomplete" };
		default:
			return {};
	}
}

function activeTab(query: PostQuery): Tab {
	if (query.status === "incomplete") {
		return "incomplete";
	}
	if (query.kind === "video") {
		return "video";
	}
	if (query.kind === "carousel") {
		return "carousel";
	}
	return "all";
}

/** A person for a profile archive; the archive itself for a list, which has no single author. */
function ArchiveHeader({
	archive,
	query,
	onQuery,
}: {
	archive: Archive;
	query: PostQuery;
	onQuery: (next: PostQuery) => void;
}) {
	const { counts } = archive;
	const selected = new Set(query.author ?? []);

	const facts = [
		`${counts.posts.toLocaleString()} posts`,
		counts.videos > 0 ? `${counts.videos.toLocaleString()} videos` : null,
		counts.carousels > 0 ? `${counts.carousels.toLocaleString()} carousels` : null,
		archive.bytes > 0 ? bytes(archive.bytes) : null,
		dateRange(archive.dateRange) || null,
	].filter(Boolean);

	const author = archive.primaryAuthor;
	const card = archive.card;
	// Counts from the card are dated, and shown as dated. The archive's own facts above are not:
	// those are true of the files right now, while these were true on the day ttdl asked.
	const recorded = card
		? [
				card.stats.followers !== null ? `${card.stats.followers.toLocaleString()} followers` : null,
				card.stats.hearts !== null ? `${card.stats.hearts.toLocaleString()} likes` : null,
			]
				.filter(Boolean)
				.join(" · ")
		: "";

	return (
		<header className={styles.header}>
			<Link href="/" className={styles.back} aria-label="Back to the library">
				<BackIcon />
			</Link>

			<div className={styles.identity}>
				{archive.kind === "profile" && author ? (
					<>
						<Avatar seed={author.avatar} src={author.avatarUrl} size={96} />
						<div className={styles.names}>
							<h1 className={styles.handle}>
								@{author.handle}
								{card?.verified && (
									<span className={styles.verified} title="Verified when this card was taken">
										✓
									</span>
								)}
							</h1>
							{author.name && <p className={styles.nickname}>{author.name}</p>}
						</div>
					</>
				) : (
					<>
						<Avatar seed={{ letter: archive.name.slice(0, 1).toUpperCase(), hue: 210 }} size={96} />
						<div className={styles.names}>
							<h1 className={styles.handle}>{archive.name}</h1>
							<p className={styles.nickname}>
								{archive.authors.length} authors
								{archive.source ? ` · built from ${archive.source}` : ""}
							</p>
						</div>
					</>
				)}
			</div>

			{card?.signature && <p className={styles.bio}>{card.signature}</p>}
			{card?.bioLink && <p className={styles.bioLink}>{card.bioLink}</p>}

			{/*
			 * Two lines rather than one, because they are two different kinds of claim. The facts
			 * are counted from the files on disk and are true now; the card was true on the day
			 * ttdl asked, and a follower count with no date on it is simply false a year later.
			 */}
			<p className={styles.facts}>{facts.join(" · ")}</p>
			{card && recorded && (
				<p className={styles.recorded}>
					{recorded} · recorded {date(card.fetchedAt)}
				</p>
			)}

			{counts.missing > 0 && (
				<p className={styles.gap}>
					ttdl could not fetch {counts.missing} more {counts.missing === 1 ? "post" : "posts"}
					{counts.withoutInfo > 0 ? `, and ${counts.withoutInfo} here have no metadata` : ""}
				</p>
			)}

			{archive.kind === "list" && archive.authors.length > 1 && (
				<div className={styles.chips}>
					{archive.authors.map((a) => {
						const on = selected.has(a.handle);
						return (
							<button
								key={a.handle || "unknown"}
								className={styles.chip}
								data-on={on || undefined}
								onClick={() => {
									const next = new Set(selected);
									if (on) {
										next.delete(a.handle);
									} else {
										next.add(a.handle);
									}
									onQuery({ ...query, author: next.size ? [...next] : undefined });
								}}
							>
								<Avatar seed={a.avatar} size={20} />
								<span className={styles.chipName}>
									{a.handle ? `@${a.handle}` : "Unknown author"}
								</span>
								<span className={styles.chipCount}>{a.postCount}</span>
							</button>
						);
					})}
				</div>
			)}
		</header>
	);
}

export function ProfileScreen({ params }: { params: { archiveId: string } }) {
	const { archiveId } = params;
	const search = useSearch();
	const [, navigate] = useLocation();
	const query = useMemo(() => parseQuery(new URLSearchParams(search)), [search]);

	const archive = useArchive(archiveId);
	const posts = usePosts(archiveId, query);
	const items = useMemo(() => flatten(posts.data), [posts.data]);
	const total = totalOf(posts.data);

	const setQuery = useCallback(
		(next: PostQuery) => {
			const serialized = serializeQuery(next);
			navigate(`/a/${archiveId}${serialized ? `?${serialized}` : ""}`, { replace: true });
		},
		[archiveId, navigate],
	);

	/* -------------------------------------------------------------------- the virtualized grid */

	const scrollRef = useRef<HTMLDivElement>(null);
	const innerRef = useRef<HTMLDivElement>(null);
	const gridRef = useRef<HTMLDivElement>(null);
	const [columns, setColumns] = useState(3);
	/**
	 * Whether the column count has been measured rather than assumed.
	 *
	 * It starts at 3 and the observer that corrects it fires a beat later, so anything that reads
	 * the layout before then is reading a guess. Restoring a scroll position from that guess picks
	 * the wrong row — index/3 rather than index/6 — and lands nowhere near the post.
	 */
	const [measured, setMeasured] = useState(false);

	/**
	 * How far the grid sits below the top of the scroller.
	 *
	 * The virtualizer measures from the scroller's origin, but the grid starts under the header,
	 * the tabs and the filter bar. Without being told about that gap every range it computes is
	 * off by exactly this much — `overscan` happens to paper over it while scrolling, which is why
	 * it went unnoticed, but `scrollToIndex` lands short by the same amount every time.
	 */
	const [gridOffset, setGridOffset] = useState(0);

	const measureGrid = useCallback(() => {
		const scroll = scrollRef.current;
		const grid = gridRef.current;
		if (!scroll || !grid) {
			return;
		}
		const offset =
			grid.getBoundingClientRect().top - scroll.getBoundingClientRect().top + scroll.scrollTop;
		// Sub-pixel churn would loop back through the observer below, so only a real move counts.
		setGridOffset((was) => (Math.abs(was - offset) < 1 ? was : offset));
	}, []);

	// After every render, because that is when the header above the grid appears, grows a row of
	// author chips, or gains active filter tags — and it costs two rect reads to be right.
	useLayoutEffect(measureGrid);

	useLayoutEffect(() => {
		const inner = innerRef.current;
		if (!inner) {
			return;
		}
		// Also catch the moves no render of ours accounts for: a web font landing, an image
		// resolving. Purely additive — the layout effect above is what guarantees a first value.
		const observer = new ResizeObserver(measureGrid);
		observer.observe(inner);
		return () => observer.disconnect();
	}, [measureGrid]);

	useLayoutEffect(() => {
		const element = scrollRef.current;
		if (!element) {
			return;
		}
		const apply = (width: number) => {
			setColumns(columnsFor(width));
			setMeasured(true);
		};
		// Measured synchronously first, and only then handed to an observer. A ResizeObserver's
		// opening callback needs a rendering frame, and a tab that is in the background — restored
		// from another app, say — is not given one, so anything waiting on that first callback waits
		// indefinitely. clientWidth is readable the moment this runs.
		apply(element.clientWidth);
		const observer = new ResizeObserver(([entry]) => {
			if (entry) {
				apply(entry.contentRect.width);
			}
		});
		observer.observe(element);
		return () => observer.disconnect();
	}, []);

	const rows = Math.ceil(items.length / columns);
	const [rowHeight, setRowHeight] = useState(220);

	useLayoutEffect(() => {
		const inner = innerRef.current;
		if (!inner) {
			return;
		}
		// The content column's width, not the scroller's: the column is capped at 1120px, so on a
		// wide screen the two differ by hundreds of pixels. Measuring the scroller made every row
		// estimate that much too tall, which the virtualizer duly honoured — a band of empty space
		// under each row of tiles, and every scrolled-to position short by the accumulated error.
		const padding = Number.parseFloat(getComputedStyle(inner).paddingInline || "0") * 2;
		const width = inner.clientWidth - padding;
		if (width <= 0) {
			return;
		}
		// Tiles are 9:16, so a row's height follows from the column width — no dynamic
		// measurement, which keeps the virtualizer's estimates exact.
		const tile = (width - TILE_GAP * (columns - 1)) / columns;
		setRowHeight(Math.round(tile * (16 / 9)) + TILE_GAP);
	}, [columns]);

	const virtualizer = useVirtualizer({
		count: rows,
		getScrollElement: () => scrollRef.current,
		estimateSize: () => rowHeight,
		overscan: 3,
		scrollMargin: gridOffset,
	});

	// rowHeight is read by estimateSize, which the virtualizer holds as a closure, so a changed
	// row height is exactly what has to trigger a re-measure even though this body never names it.
	// biome-ignore lint/correctness/useExhaustiveDependencies: see above
	useEffect(() => {
		virtualizer.measure();
	}, [rowHeight, virtualizer]);

	// Fetch the next page as the last virtual row comes into view.
	const virtualRows = virtualizer.getVirtualItems();
	const lastRow = virtualRows[virtualRows.length - 1];
	useEffect(() => {
		if (!lastRow) {
			return;
		}
		if (lastRow.index >= rows - 2 && posts.hasNextPage && !posts.isFetchingNextPage) {
			void posts.fetchNextPage();
		}
	}, [lastRow, rows, posts]);

	/* ------------------------------------------------- returning from the feed, at the same spot */

	const [cameFrom, setCameFrom] = useState<string | null>(null);

	useEffect(() => {
		const stored = sessionStorage.getItem(`ttdl-viewer:from:${archiveId}`);
		if (stored) {
			setCameFrom(stored);
			sessionStorage.removeItem(`ttdl-viewer:from:${archiveId}`);
		}
	}, [archiveId]);

	// Restore once and only once. `items` grows with every fetched page, so without this latch the
	// effect would re-run on each one and drag the grid back to the tile the user already left —
	// and since scrolling is what fetches the next page, they could never get past it.
	const restored = useRef(false);
	useEffect(() => {
		// Restoring is a one-shot, so it must not fire against a layout that is still assumed. Both
		// the column count and the gap above the grid start out as placeholders, and a scroll
		// computed from either lands somewhere the post is not — with the latch already down, so
		// nothing corrects it afterwards.
		if (restored.current || !cameFrom || items.length === 0 || !measured || gridOffset === 0) {
			return;
		}
		const index = items.findIndex((p) => p.id === cameFrom);
		if (index === -1) {
			return;
		}
		restored.current = true;
		virtualizer.scrollToIndex(Math.floor(index / columns), { align: "center" });
	}, [cameFrom, items, columns, virtualizer, gridOffset, measured]);

	const openPost = useCallback(
		(post: Post) => {
			const serialized = serializeQuery(query);
			navigate(`/a/${archiveId}/feed/${post.id}${serialized ? `?${serialized}` : ""}`);
		},
		[archiveId, navigate, query],
	);

	/* ------------------------------------------------------------------- the sliding tab underline */

	const tab = activeTab(query);
	const tabsRef = useRef<HTMLElement>(null);
	const underlineRef = useRef<HTMLSpanElement>(null);

	// Read off the DOM rather than measured text, so it never drifts from what actually rendered —
	// the same reasoning as `measureGrid` above. `.tabs` is this element's offsetParent (it is
	// `position: relative`), so a plain `offsetLeft` is already in the right coordinate space.
	const measureTabUnderline = useCallback(() => {
		const nav = tabsRef.current;
		const underline = underlineRef.current;
		const active = nav?.querySelector<HTMLButtonElement>("button[data-on]");
		if (!nav || !underline || !active) {
			return;
		}
		const inset = 16; // matches DESIGN.md: "inset 16px from each edge"
		underline.style.transform = `translateX(${active.offsetLeft + inset}px) scaleX(${active.offsetWidth - inset * 2})`;
	}, []);

	// `measureTabUnderline` reads `data-on` off the DOM rather than closing over `tab`, so a changed
	// tab is exactly what has to trigger a re-measure even though this call never names it.
	// biome-ignore lint/correctness/useExhaustiveDependencies: see above
	useLayoutEffect(measureTabUnderline, [tab, measureTabUnderline]);

	useEffect(() => {
		window.addEventListener("resize", measureTabUnderline);
		return () => window.removeEventListener("resize", measureTabUnderline);
	}, [measureTabUnderline]);

	/* ------------------------------------------------------------------------------- rendering */

	if (archive.isError) {
		return (
			<div className={empty.empty}>
				<h1 className={empty.title}>No such archive</h1>
				<p className={empty.body}>{archive.error.message}</p>
				<Link href="/" className={empty.action}>
					Back to the library
				</Link>
			</div>
		);
	}

	return (
		<div className={styles.screen} ref={scrollRef}>
			<div className={styles.inner} ref={innerRef}>
				{archive.data && <ArchiveHeader archive={archive.data} query={query} onQuery={setQuery} />}

				<nav className={styles.tabs} aria-label="Post kind" ref={tabsRef}>
					{TABS.map(({ id, label }) => (
						<button
							key={id}
							className={styles.tab}
							data-on={tab === id || undefined}
							onClick={() =>
								setQuery({ ...query, kind: undefined, status: undefined, ...tabToQuery(id) })
							}
						>
							{label}
						</button>
					))}
					<span className={styles.underline} ref={underlineRef} aria-hidden="true" />
				</nav>

				<FilterBar
					archiveId={archiveId}
					archive={archive.data}
					query={query}
					onQuery={setQuery}
					total={total}
					loading={posts.isFetching}
				/>

				{posts.isPending ? (
					<p className={styles.status}>Loading posts…</p>
				) : items.length === 0 ? (
					<div className={styles.none}>
						<p className={empty.body}>No posts match this view.</p>
						{archive.data?.counts.withoutInfo ? (
							<pre className={empty.command}>./ttdl.py meta {archive.data.name}</pre>
						) : null}
					</div>
				) : (
					<div
						ref={gridRef}
						className={styles.gridWrap}
						style={{ height: virtualizer.getTotalSize() }}
					>
						{virtualRows.map((row) => (
							<div
								key={row.key}
								className={styles.row}
								style={{
									height: row.size,
									// `start` is in scroller coordinates, so it already counts the gap the
									// grid is offset by — which this element is physically inside of.
									transform: `translateY(${row.start - gridOffset}px)`,
									gridTemplateColumns: `repeat(${columns}, 1fr)`,
								}}
							>
								{items.slice(row.index * columns, row.index * columns + columns).map((post) => (
									<PostTile
										key={post.id}
										post={post}
										onOpen={openPost}
										highlighted={post.id === cameFrom}
										showAuthor={archive.data?.kind === "list"}
									/>
								))}
							</div>
						))}
					</div>
				)}

				{posts.isFetchingNextPage && <p className={styles.status}>Loading more…</p>}
			</div>
		</div>
	);
}

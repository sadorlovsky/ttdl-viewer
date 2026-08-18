import { useEffect, useMemo, useRef, useState } from "react";
import type { Archive, PostQuery, PostSort } from "../../shared/types.ts";
import { useHashtags, useStats } from "../api/client.ts";
import styles from "./FilterBar.module.css";
import { ChevronDownIcon, SearchIcon } from "./Icons.tsx";

/**
 * The menu offers (key, direction) pairs, not sort keys.
 *
 * "Oldest" is "Newest" read backwards — same key, opposite `order` — and there is no separate
 * direction control for it to live in. So an entry has to name the pair, and every other entry has
 * to say `order` too: leaving it alone would carry a chosen `asc` over to the next key and turn
 * "Most liked" into least-liked, without anything on screen admitting to it.
 */
interface SortOption {
	id: string;
	label: string;
	sort: PostSort;
	/** Omitted means descending — the default, which `serializeQuery` keeps out of the URL. */
	order?: "asc";
	/**
	 * Hidden unless a TikTok export was loaded.
	 *
	 * Nothing on disk records when a post was saved, so without the export every post's date is
	 * null — the sort still runs, falls back to publication order, and looks broken rather than
	 * empty. An option that cannot do what it says is worse than one that is not there.
	 */
	needsLikes?: boolean;
}

interface DurationPreset {
	id: string;
	label: string;
	min?: number;
	max?: number;
}

const DURATION_PRESETS: DurationPreset[] = [
	{ id: "short", label: "Under 15s", max: 15 },
	{ id: "medium", label: "15s – 1 min", min: 15, max: 60 },
	{ id: "long", label: "1 – 3 min", min: 60, max: 180 },
	{ id: "extended", label: "Over 3 min", min: 180 },
];

/** Whole calendar years the archive's own dates span, newest first — quick filter chips. */
function yearsInRange(range: { first: number; last: number }): number[] {
	const firstYear = new Date(range.first * 1000).getUTCFullYear();
	const lastYear = new Date(range.last * 1000).getUTCFullYear();
	const years: number[] = [];
	for (let year = lastYear; year >= firstYear; year--) {
		years.push(year);
	}
	return years;
}

/** Mirrors `dayToUnix` in the server's query filter, so a year chip's bounds match what it queries. */
function yearBounds(year: number): { from: string; to: string } {
	return { from: `${year}-01-01`, to: `${year}-12-31` };
}

function dateRangeLabel(from: string | undefined, to: string | undefined): string {
	if (from && to) {
		return from === to ? from : `${from} – ${to}`;
	}
	return from ? `Since ${from}` : `Until ${to}`;
}

const NEWEST: SortOption = { id: "date", label: "Newest", sort: "date" };

const SORTS: SortOption[] = [
	NEWEST,
	{ id: "date-asc", label: "Oldest", sort: "date", order: "asc" },
	// Beside the publication dates, because they answer the same shape of question — but they are a
	// different date entirely: when you saved the post, which only the TikTok export knows.
	{ id: "liked", label: "Recently saved", sort: "liked", needsLikes: true },
	{ id: "liked-asc", label: "First saved", sort: "liked", order: "asc", needsLikes: true },
	{ id: "likes", label: "Most liked", sort: "likes" },
	{ id: "views", label: "Most viewed", sort: "views" },
	{ id: "comments", label: "Most discussed", sort: "comments" },
	// "Most saved" read as the viewer's own saves once those had dates of their own. This counts
	// how many people on TikTok bookmarked the post — someone else's number, not yours.
	{ id: "saves", label: "Most bookmarked", sort: "saves" },
	{ id: "duration", label: "Longest", sort: "duration" },
	{ id: "random", label: "Shuffle", sort: "random" },
];

interface FilterBarProps {
	archiveId: string;
	archive: Archive | undefined;
	query: PostQuery;
	onQuery: (next: PostQuery) => void;
	total: number;
	loading: boolean;
}

export function FilterBar({ archiveId, archive, query, onQuery, total, loading }: FilterBarProps) {
	// The input is local so typing stays responsive; the URL (and therefore the query) follows
	// after a pause, which also keeps the history from filling with half-typed words.
	const [text, setText] = useState(query.q ?? "");
	const [open, setOpen] = useState(false);
	const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
	const hashtags = useHashtags(archiveId, open);
	// One value for the whole server, already cached by every other screen — no extra request.
	const stats = useStats();
	const hasLikes = Boolean(stats.data?.likesDir);

	useEffect(() => {
		setText(query.q ?? "");
	}, [query.q]);

	useEffect(() => () => clearTimeout(timer.current), []);

	const commit = (value: string) => {
		setText(value);
		clearTimeout(timer.current);
		timer.current = setTimeout(() => {
			onQuery({ ...query, q: value.trim() || undefined });
		}, 220);
	};

	// A shared URL can carry any (sort, order) combination, including ones with no entry here —
	// `?sort=likes&order=asc` is a valid view the menu simply cannot name. Falling back to the first
	// entry keeps the select from rendering blank while the results stay whatever the URL asked for.
	const wantsAsc = query.order === "asc" ? "asc" : undefined;
	const current =
		SORTS.find((s) => s.sort === (query.sort ?? "date") && s.order === wantsAsc) ?? NEWEST;

	// The export-only entries are hidden — unless the URL already asks for one, in which case the
	// select would have a value with no option behind it and would render blank. Keeping the chosen
	// entry visible is the difference between "not offered here" and "something is broken".
	const options = SORTS.filter(
		(option) => hasLikes || !option.needsLikes || option.id === current.id,
	);

	const activeTags = query.hashtag ?? [];
	const toggleTag = (tag: string) => {
		const next = activeTags.includes(tag)
			? activeTags.filter((t) => t !== tag)
			: [...activeTags, tag];
		onQuery({ ...query, hashtag: next.length ? next : undefined });
	};

	const years = useMemo(
		() => (archive?.dateRange ? yearsInRange(archive.dateRange) : []),
		[archive?.dateRange],
	);

	const activeDuration = DURATION_PRESETS.find(
		(preset) => preset.min === query.minDuration && preset.max === query.maxDuration,
	);
	const setDuration = (preset: DurationPreset) => {
		const isActive = activeDuration?.id === preset.id;
		onQuery({
			...query,
			minDuration: isActive ? undefined : preset.min,
			maxDuration: isActive ? undefined : preset.max,
		});
	};
	const clearDuration = () => onQuery({ ...query, minDuration: undefined, maxDuration: undefined });

	const setYear = (year: number) => {
		const bounds = yearBounds(year);
		const isActive = query.from === bounds.from && query.to === bounds.to;
		onQuery({
			...query,
			from: isActive ? undefined : bounds.from,
			to: isActive ? undefined : bounds.to,
		});
	};
	const setFrom = (value: string) => onQuery({ ...query, from: value || undefined });
	const setTo = (value: string) => onQuery({ ...query, to: value || undefined });
	const clearDate = () => onQuery({ ...query, from: undefined, to: undefined });

	const hasExtraFilters = Boolean(activeDuration) || Boolean(query.from) || Boolean(query.to);

	// One row, every kind of active filter, the same "read it, then remove it" affordance —
	// a hashtag is not privileged over a duration bucket or a date range.
	const activeFilters: Array<{ key: string; label: string; onRemove: () => void }> = [
		...(activeDuration
			? [{ key: "duration", label: activeDuration.label, onRemove: clearDuration }]
			: []),
		...(query.from || query.to
			? [{ key: "date", label: dateRangeLabel(query.from, query.to), onRemove: clearDate }]
			: []),
		...activeTags.map((tag) => ({
			key: `tag:${tag}`,
			label: `#${tag}`,
			onRemove: () => toggleTag(tag),
		})),
	];
	const clearAll = () =>
		onQuery({
			...query,
			hashtag: undefined,
			minDuration: undefined,
			maxDuration: undefined,
			from: undefined,
			to: undefined,
		});

	return (
		<div className={styles.bar}>
			<label className={styles.search}>
				<SearchIcon className={styles.searchIcon} />
				<input
					type="search"
					value={text}
					placeholder="Search captions, authors, sounds"
					onChange={(event) => commit(event.target.value)}
					className={styles.input}
					// The feed's keyboard shortcuts must not fire while typing here.
					data-typing
				/>
			</label>

			<span className={styles.selectWrap}>
				<select
					className={styles.select}
					value={current.id}
					onChange={(event) => {
						const chosen = SORTS.find((s) => s.id === event.target.value) ?? NEWEST;
						onQuery({
							...query,
							sort: chosen.sort,
							order: chosen.order,
							// A fresh seed each time "Shuffle" is chosen, kept stable across reloads.
							seed: chosen.sort === "random" ? String(Date.now() % 100000) : undefined,
						});
					}}
				>
					{options.map((option) => (
						<option key={option.id} value={option.id}>
							{option.label}
						</option>
					))}
				</select>
				<ChevronDownIcon size={14} className={styles.selectChevron} />
			</span>

			<button
				className={styles.more}
				data-on={open || hasExtraFilters || activeTags.length > 0 || undefined}
				onClick={() => setOpen((was) => !was)}
			>
				Filters
			</button>

			<span className={styles.count}>
				{loading ? "…" : `${total.toLocaleString()} ${total === 1 ? "post" : "posts"}`}
			</span>

			{activeFilters.length > 0 && (
				<div className={styles.active}>
					{activeFilters.map((filter) => (
						<button key={filter.key} className={styles.activeTag} onClick={filter.onRemove}>
							{filter.label}
							<span className={styles.remove}>×</span>
						</button>
					))}
					{activeFilters.length > 1 && (
						<button className={styles.clearAll} onClick={clearAll}>
							Clear all
						</button>
					)}
				</div>
			)}

			{open && (
				<div className={styles.popover}>
					<div className={styles.section}>
						<p className={styles.sectionLabel}>Duration</p>
						<div className={styles.tagCloud}>
							{DURATION_PRESETS.map((preset) => (
								<button
									key={preset.id}
									className={styles.tag}
									data-on={activeDuration?.id === preset.id || undefined}
									onClick={() => setDuration(preset)}
								>
									{preset.label}
								</button>
							))}
						</div>
					</div>

					<div className={styles.section}>
						<p className={styles.sectionLabel}>Date</p>
						{years.length > 0 && (
							<div className={styles.tagCloud}>
								{years.map((year) => {
									const bounds = yearBounds(year);
									return (
										<button
											key={year}
											className={styles.tag}
											data-on={(query.from === bounds.from && query.to === bounds.to) || undefined}
											onClick={() => setYear(year)}
										>
											{year}
										</button>
									);
								})}
							</div>
						)}
						<div className={styles.dateRow}>
							<input
								type="date"
								className={styles.dateInput}
								value={query.from ?? ""}
								onChange={(event) => setFrom(event.target.value)}
								aria-label="From date"
							/>
							<span className={styles.dateSep}>–</span>
							<input
								type="date"
								className={styles.dateInput}
								value={query.to ?? ""}
								onChange={(event) => setTo(event.target.value)}
								aria-label="To date"
							/>
						</div>
					</div>

					<div className={styles.section}>
						<p className={styles.sectionLabel}>Hashtags</p>
						{hashtags.isPending && <p className={styles.popoverEmpty}>Counting tags…</p>}
						{hashtags.data?.length === 0 && (
							<p className={styles.popoverEmpty}>No hashtags in this archive.</p>
						)}
						<div className={styles.tagCloud}>
							{hashtags.data?.map(({ tag, count }) => (
								<button
									key={tag}
									className={styles.tag}
									data-on={activeTags.includes(tag) || undefined}
									onClick={() => toggleTag(tag)}
								>
									#{tag}
									<span className={styles.tagCount}>{count}</span>
								</button>
							))}
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

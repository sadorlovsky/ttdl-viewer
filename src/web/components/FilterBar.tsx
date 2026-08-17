import { useEffect, useRef, useState } from "react";
import type { PostQuery, PostSort } from "../../shared/types.ts";
import { useHashtags } from "../api/client.ts";
import styles from "./FilterBar.module.css";
import { SearchIcon } from "./Icons.tsx";

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
}

const NEWEST: SortOption = { id: "date", label: "Newest", sort: "date" };

const SORTS: SortOption[] = [
	NEWEST,
	{ id: "date-asc", label: "Oldest", sort: "date", order: "asc" },
	{ id: "likes", label: "Most liked", sort: "likes" },
	{ id: "views", label: "Most viewed", sort: "views" },
	{ id: "comments", label: "Most discussed", sort: "comments" },
	{ id: "saves", label: "Most saved", sort: "saves" },
	{ id: "duration", label: "Longest", sort: "duration" },
	{ id: "random", label: "Shuffle", sort: "random" },
];

interface FilterBarProps {
	archiveId: string;
	query: PostQuery;
	onQuery: (next: PostQuery) => void;
	total: number;
	loading: boolean;
}

export function FilterBar({ archiveId, query, onQuery, total, loading }: FilterBarProps) {
	// The input is local so typing stays responsive; the URL (and therefore the query) follows
	// after a pause, which also keeps the history from filling with half-typed words.
	const [text, setText] = useState(query.q ?? "");
	const [open, setOpen] = useState(false);
	const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
	const hashtags = useHashtags(archiveId, open);

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

	const activeTags = query.hashtag ?? [];
	const toggleTag = (tag: string) => {
		const next = activeTags.includes(tag)
			? activeTags.filter((t) => t !== tag)
			: [...activeTags, tag];
		onQuery({ ...query, hashtag: next.length ? next : undefined });
	};

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
				{SORTS.map((option) => (
					<option key={option.id} value={option.id}>
						{option.label}
					</option>
				))}
			</select>

			<button
				className={styles.more}
				data-on={open || undefined}
				onClick={() => setOpen((was) => !was)}
			>
				Tags
			</button>

			<span className={styles.count}>
				{loading ? "…" : `${total.toLocaleString()} ${total === 1 ? "post" : "posts"}`}
			</span>

			{activeTags.length > 0 && (
				<div className={styles.active}>
					{activeTags.map((tag) => (
						<button key={tag} className={styles.activeTag} onClick={() => toggleTag(tag)}>
							#{tag}
							<span className={styles.remove}>×</span>
						</button>
					))}
				</div>
			)}

			{open && (
				<div className={styles.popover}>
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
			)}
		</div>
	);
}

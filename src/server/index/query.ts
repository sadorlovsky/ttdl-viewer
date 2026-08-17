import type { Post, PostPage, PostQuery, PostSort } from "../../shared/types.ts";

const DEFAULT_LIMIT = 30;

/** The value a post is ordered by, for a given sort. Null sorts last in either direction. */
function sortValue(post: Post, sort: PostSort): number | null {
	switch (sort) {
		case "likes":
			return post.stats.likes;
		case "views":
			return post.stats.views;
		case "comments":
			return post.stats.comments;
		case "saves":
			return post.stats.saves;
		case "duration":
			return post.duration;
		case "liked":
			return post.liked?.at ?? null;
		default:
			return post.createdAt;
	}
}

function dayToUnix(day: string, endOfDay: boolean): number {
	const at = Date.parse(`${day}T${endOfDay ? "23:59:59" : "00:00:00"}Z`);
	return Number.isFinite(at) ? Math.floor(at / 1000) : Number.NaN;
}

function matchesText(post: Post, needle: string): boolean {
	const haystacks = [
		post.description,
		post.title,
		post.author.handle,
		post.author.name,
		post.music?.track,
		post.music?.artists.join(" "),
	];
	return haystacks.some((h) => h?.toLowerCase().includes(needle));
}

export function filterPosts(posts: Post[], query: PostQuery): Post[] {
	const status = query.status ?? "complete";
	const needle = query.q?.trim().toLowerCase();
	const authors = query.author ? new Set(query.author) : null;
	const tags = query.hashtag && query.hashtag.length > 0 ? query.hashtag : null;
	const from = query.from ? dayToUnix(query.from, false) : null;
	const to = query.to ? dayToUnix(query.to, true) : null;

	return posts.filter((post) => {
		if (status !== "all" && post.status !== status) {
			return false;
		}
		if (query.kind && post.kind !== query.kind) {
			return false;
		}
		if (authors && !authors.has(post.author.handle)) {
			return false;
		}
		if (tags && !tags.every((tag) => post.hashtags.includes(tag))) {
			return false;
		}
		if (from !== null && post.createdAt < from) {
			return false;
		}
		if (to !== null && post.createdAt > to) {
			return false;
		}
		if (query.minDuration !== undefined && (post.duration ?? 0) < query.minDuration) {
			return false;
		}
		if (query.maxDuration !== undefined && (post.duration ?? Infinity) > query.maxDuration) {
			return false;
		}
		if (needle && !matchesText(post, needle)) {
			return false;
		}
		return true;
	});
}

/** xmur3 + mulberry32: a seeded shuffle, so "random" order survives a page reload. */
function seededShuffle(posts: Post[], seed: string): Post[] {
	let h = 1779033703 ^ seed.length;
	for (let i = 0; i < seed.length; i++) {
		h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
		h = (h << 13) | (h >>> 19);
	}
	let a = h >>> 0;
	const next = () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
	const out = [...posts];
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(next() * (i + 1));
		[out[i], out[j]] = [out[j] as Post, out[i] as Post];
	}
	return out;
}

export function sortPosts(posts: Post[], query: PostQuery): Post[] {
	const sort = query.sort ?? "date";
	if (sort === "random") {
		return seededShuffle(posts, query.seed ?? "0");
	}
	const direction = (query.order ?? "desc") === "desc" ? 1 : -1;
	return [...posts].sort((a, b) => {
		const av = sortValue(a, sort);
		const bv = sortValue(b, sort);
		// Posts with no value for the chosen key sort last either way — an archive with no
		// metadata must not float to the top of a "most liked" list.
		if (av === null && bv === null) {
			// Same fallback ordering as below, and it has to obey `order` and break ties the same
			// way: an archive with no metadata puts every pair through this branch, and the keyset
			// cursor needs the result to be total and stable, not just consistent-looking.
			if (a.createdAt !== b.createdAt) {
				return (b.createdAt - a.createdAt) * direction;
			}
			return compareIds(b.id, a.id) * direction;
		}
		if (av === null) {
			return 1;
		}
		if (bv === null) {
			return -1;
		}
		if (av !== bv) {
			return (bv - av) * direction;
		}
		return compareIds(b.id, a.id) * direction;
	});
}

/**
 * Order two post ids numerically.
 *
 * They are decimal strings of at least 15 digits, so a plain `<` is wrong the moment two ids
 * differ in length: a 15-digit id starting with 9 sorts above a 19-digit one starting with 1.
 * Comparing length first, then lexicographically, is the numeric order without going through
 * BigInt on every comparison.
 */
function compareIds(a: string, b: string): number {
	if (a.length !== b.length) {
		return a.length - b.length;
	}
	return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Keyset pagination.
 *
 * The cursor names the last post of the previous page, not an offset. That matters because ttdl
 * and this viewer routinely run at the same time: a rescan landing mid-scroll shifts every offset
 * after the insertion point, which shows up as duplicated and skipped posts in an infinite feed.
 * Resuming from an id is immune to that.
 */
function encodeCursor(post: Post): string {
	return Buffer.from(post.id, "utf8").toString("base64url");
}

function decodeCursor(cursor: string): string | null {
	try {
		return Buffer.from(cursor, "base64url").toString("utf8") || null;
	} catch {
		return null;
	}
}

export function paginate(ordered: Post[], query: PostQuery): PostPage {
	const limit = query.limit ?? DEFAULT_LIMIT;
	let start = 0;

	if (query.cursor) {
		const afterId = decodeCursor(query.cursor);
		const index = afterId ? ordered.findIndex((p) => p.id === afterId) : -1;
		if (index === -1) {
			// The cursor's post is gone — ttdl deleted or renamed it between pages. Ending the
			// sequence is the only safe answer: restarting from the top would append page one to
			// an infinite feed, duplicating keys and handing back the very same cursor, so the
			// client would fetch it forever.
			return { items: [], total: ordered.length, cursor: null };
		}
		start = index + 1;
	}

	const items = ordered.slice(start, start + limit);
	const last = items[items.length - 1];
	const more = start + items.length < ordered.length;

	return {
		items,
		total: ordered.length,
		cursor: more && last ? encodeCursor(last) : null,
	};
}

export function queryPosts(posts: Post[], query: PostQuery): PostPage {
	return paginate(sortPosts(filterPosts(posts, query), query), query);
}

/** Position of one post within a filtered view, plus its neighbours — for feed deep links. */
export function neighbors(posts: Post[], query: PostQuery, postId: string) {
	const ordered = sortPosts(filterPosts(posts, query), query);
	const index = ordered.findIndex((p) => p.id === postId);
	if (index === -1) {
		return { prev: null, next: null, position: -1, total: ordered.length };
	}
	return {
		prev: ordered[index - 1]?.id ?? null,
		next: ordered[index + 1]?.id ?? null,
		position: index,
		total: ordered.length,
	};
}

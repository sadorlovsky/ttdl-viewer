import type { PostKind, PostQuery, PostSort, PostStatus } from "./types.ts";

/**
 * One implementation of the query string, used by both the server route and the app's URL state.
 *
 * Keeping it shared is what stops the API contract and the "share this view" URL from drifting
 * apart, and it means `serializeQuery(q)` doubles as the React Query cache key — which is why
 * opening the feed from a grid tile reuses the pages already fetched instead of refetching.
 */

const SORTS: PostSort[] = [
	"date",
	"likes",
	"views",
	"comments",
	"saves",
	"duration",
	"liked",
	"random",
];

const DEFAULTS = { sort: "date" as PostSort, order: "desc" as const, status: "complete" as const };

function one(params: URLSearchParams, key: string): string | undefined {
	const value = params.get(key);
	return value === null || value === "" ? undefined : value;
}

function many(params: URLSearchParams, key: string): string[] | undefined {
	const values = params.getAll(key).filter((v) => v !== "");
	return values.length > 0 ? values : undefined;
}

function int(params: URLSearchParams, key: string): number | undefined {
	const raw = one(params, key);
	if (raw === undefined) {
		return undefined;
	}
	const parsed = Number(raw);
	return Number.isFinite(parsed) ? parsed : undefined;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseQuery(params: URLSearchParams): PostQuery {
	const query: PostQuery = {};

	const q = one(params, "q");
	if (q) {
		query.q = q;
	}
	const author = many(params, "author");
	if (author) {
		query.author = author;
	}
	const hashtag = many(params, "hashtag");
	if (hashtag) {
		query.hashtag = hashtag.map((t) => t.replace(/^#/, "").toLowerCase());
	}

	const kind = one(params, "kind");
	if (kind === "video" || kind === "carousel") {
		query.kind = kind satisfies PostKind;
	}
	const status = one(params, "status");
	if (status === "complete" || status === "incomplete" || status === "all") {
		query.status = status as PostStatus | "all";
	}

	const from = one(params, "from");
	if (from && DATE_RE.test(from)) {
		query.from = from;
	}
	const to = one(params, "to");
	if (to && DATE_RE.test(to)) {
		query.to = to;
	}

	const minDuration = int(params, "minDuration");
	if (minDuration !== undefined) {
		query.minDuration = minDuration;
	}
	const maxDuration = int(params, "maxDuration");
	if (maxDuration !== undefined) {
		query.maxDuration = maxDuration;
	}

	const sort = one(params, "sort");
	if (sort && (SORTS as string[]).includes(sort)) {
		query.sort = sort as PostSort;
	}
	const order = one(params, "order");
	if (order === "asc" || order === "desc") {
		query.order = order;
	}
	const seed = one(params, "seed");
	if (seed) {
		query.seed = seed;
	}
	const limit = int(params, "limit");
	if (limit !== undefined) {
		query.limit = Math.min(Math.max(Math.trunc(limit), 1), 200);
	}
	const cursor = one(params, "cursor");
	if (cursor) {
		query.cursor = cursor;
	}

	return query;
}

/**
 * Serialize back to a query string, omitting defaults and the cursor.
 *
 * Dropping the cursor is deliberate: this string identifies a *view*, and the cursor identifies a
 * position within it. Including it would give every page of an infinite scroll a different cache
 * key for the same filter.
 */
export function serializeQuery(query: PostQuery): string {
	const params = new URLSearchParams();

	if (query.q) {
		params.set("q", query.q);
	}
	for (const author of query.author ?? []) {
		params.append("author", author);
	}
	for (const tag of query.hashtag ?? []) {
		params.append("hashtag", tag);
	}
	if (query.kind) {
		params.set("kind", query.kind);
	}
	if (query.status && query.status !== DEFAULTS.status) {
		params.set("status", query.status);
	}
	if (query.from) {
		params.set("from", query.from);
	}
	if (query.to) {
		params.set("to", query.to);
	}
	if (query.minDuration !== undefined) {
		params.set("minDuration", String(query.minDuration));
	}
	if (query.maxDuration !== undefined) {
		params.set("maxDuration", String(query.maxDuration));
	}
	if (query.sort && query.sort !== DEFAULTS.sort) {
		params.set("sort", query.sort);
	}
	if (query.order && query.order !== DEFAULTS.order) {
		params.set("order", query.order);
	}
	if (query.seed) {
		params.set("seed", query.seed);
	}
	if (query.limit !== undefined) {
		params.set("limit", String(query.limit));
	}

	params.sort(); // stable key regardless of the order the caller filled the object in
	return params.toString();
}

/** True when the query is the plain default view. */
export function isDefaultQuery(query: PostQuery): boolean {
	return serializeQuery({ ...query, limit: undefined }) === "";
}

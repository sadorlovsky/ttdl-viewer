/**
 * Ordering and pagination.
 *
 * Every case here corresponds to a bug that was live: a stale cursor that restarted the sequence
 * at page one, an id tie-break that compared 19-digit decimal strings lexicographically, and a
 * comparator branch that ignored `order` whenever the sort key was absent. The symptoms all
 * appear only under conditions that are awkward to reach by hand — a post deleted mid-scroll, two
 * posts sharing a timestamp, an archive with no metadata — which is exactly why they are pinned
 * here rather than left to manual checking.
 */
import { describe, expect, test } from "bun:test";
import { paginate, queryPosts, sortPosts } from "../src/server/index/query.ts";
import type { Post, PostQuery } from "../src/shared/types.ts";

function postId(tail: number, timestamp = 1_704_067_200): string {
	return ((BigInt(timestamp) << 32n) | BigInt(tail)).toString();
}

interface Overrides {
	id?: string;
	createdAt?: number;
	likes?: number | null;
}

function makePost({ id = postId(1), createdAt = 1_704_067_200, likes = null }: Overrides): Post {
	return {
		id,
		archiveId: "a",
		kind: "video",
		status: "complete",
		createdAt,
		createdAtSource: "info",
		title: "t",
		description: null,
		hashtags: [],
		duration: null,
		author: {
			handle: "u",
			name: null,
			id: null,
			secUid: null,
			profileUrl: null,
			postCount: 0,
			avatar: { letter: "U", hue: 0 },
			avatarUrl: null,
		},
		music: null,
		stats: { views: null, likes, comments: null, shares: null, saves: null },
		media: {
			url: "/m",
			ext: ".mp4",
			bytes: 1,
			width: null,
			height: null,
			kind: "video",
			fps: null,
			aspectRatio: null,
		},
		cover: null,
		photos: null,
		loudnessGain: null,
		hasInfo: true,
		webpageUrl: null,
		liked: null,
	};
}

const ids = (posts: Post[]) => posts.map((p) => p.id);

describe("id tie-break", () => {
	// A 15-digit id and a 19-digit one: lexicographically "9…" beats "1…", numerically it does not.
	const short = "999999999999999";
	const long = postId(1); // 19 digits, starts with 7
	const sameInstant = [makePost({ id: short }), makePost({ id: long })];

	test("ids of different lengths compare numerically, not lexicographically", () => {
		const desc = sortPosts(sameInstant, {});
		expect(ids(desc)).toEqual([long, short]);
	});

	test("the tie-break follows the requested order", () => {
		const asc = sortPosts(sameInstant, { order: "asc" });
		expect(ids(asc)).toEqual([short, long]);
	});

	test("ordering is total, so it does not depend on input order", () => {
		const forward = ids(sortPosts(sameInstant, {}));
		const backward = ids(sortPosts([...sameInstant].reverse(), {}));
		expect(forward).toEqual(backward);
	});
});

describe("sorting by an absent key", () => {
	// An archive with no metadata puts every pair through the both-null branch.
	const a = makePost({ id: postId(1), createdAt: 200, likes: null });
	const b = makePost({ id: postId(2), createdAt: 100, likes: null });

	test("falls back to date, newest first by default", () => {
		expect(ids(sortPosts([b, a], { sort: "likes" }))).toEqual([a.id, b.id]);
	});

	test("the fallback obeys order=asc rather than ignoring it", () => {
		expect(ids(sortPosts([a, b], { sort: "likes", order: "asc" }))).toEqual([b.id, a.id]);
	});

	test("posts sharing a timestamp still get a stable tie-break", () => {
		const x = makePost({ id: postId(1), createdAt: 100, likes: null });
		const y = makePost({ id: postId(2), createdAt: 100, likes: null });
		expect(ids(sortPosts([x, y], { sort: "likes" }))).toEqual(
			ids(sortPosts([y, x], { sort: "likes" })),
		);
	});

	test("posts with no value sort below posts that have one, in either order", () => {
		const withValue = makePost({ id: postId(3), createdAt: 50, likes: 10 });
		const without = makePost({ id: postId(4), createdAt: 999, likes: null });
		expect(ids(sortPosts([without, withValue], { sort: "likes" }))[0]).toBe(withValue.id);
		expect(ids(sortPosts([without, withValue], { sort: "likes", order: "asc" }))[0]).toBe(
			withValue.id,
		);
	});
});

describe("keyset pagination", () => {
	const posts = Array.from({ length: 10 }, (_, i) =>
		makePost({ id: postId(i + 1), createdAt: 1000 - i }),
	);
	const page = (query: PostQuery) => paginate(posts, query);

	test("walks the list without repeating or skipping", () => {
		const first = page({ limit: 4 });
		expect(ids(first.items)).toEqual(ids(posts.slice(0, 4)));
		expect(first.total).toBe(10);
		expect(first.cursor).not.toBeNull();

		const second = page({ limit: 4, cursor: first.cursor as string });
		expect(ids(second.items)).toEqual(ids(posts.slice(4, 8)));

		const third = page({ limit: 4, cursor: second.cursor as string });
		expect(ids(third.items)).toEqual(ids(posts.slice(8)));
		expect(third.cursor).toBeNull();
	});

	test("a cursor whose post has vanished ends the sequence instead of restarting it", () => {
		const first = page({ limit: 4 });
		// ttdl deletes the post the cursor names, between one page and the next.
		const without = posts.filter((p) => p.id !== (posts[3] as Post).id);
		const next = paginate(without, { limit: 4, cursor: first.cursor as string });

		expect(next.items).toEqual([]);
		// Null, or the client would be handed back the very same cursor and fetch it forever.
		expect(next.cursor).toBeNull();
		// Specifically NOT page one again, which would duplicate keys in an infinite feed.
		expect(ids(next.items)).not.toEqual(ids(first.items));
	});

	test("a malformed cursor is treated the same way, not as 'start over'", () => {
		const next = page({ limit: 4, cursor: "!!!not-base64!!!" });
		expect(next.items).toEqual([]);
		expect(next.cursor).toBeNull();
	});

	test("the last page reports no cursor even when it is exactly full", () => {
		const exact = paginate(posts.slice(0, 4), { limit: 4 });
		expect(exact.items).toHaveLength(4);
		expect(exact.cursor).toBeNull();
	});
});

describe("queryPosts", () => {
	test("hides incomplete posts by default and shows them on request", () => {
		const complete = makePost({ id: postId(1) });
		const incomplete = { ...makePost({ id: postId(2) }), status: "incomplete" as const };
		const all = [complete, incomplete];

		expect(ids(queryPosts(all, {}).items)).toEqual([complete.id]);
		expect(queryPosts(all, { status: "all" }).items).toHaveLength(2);
		expect(ids(queryPosts(all, { status: "incomplete" }).items)).toEqual([incomplete.id]);
	});
});

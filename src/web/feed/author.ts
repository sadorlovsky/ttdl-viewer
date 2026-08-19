import { serializeQuery } from "../../shared/filters.ts";
import type { Post } from "../../shared/types.ts";

/**
 * Everything this author left in this archive: where that is, and what to call it.
 *
 * Two controls on the feed point at it — the rail's avatar and the caption's handle — and they are
 * the same offer made twice, so they have to agree about both halves of it. Stated once here rather
 * than written out at each of them, because the half that drifts is the sentence: a label that
 * describes a slightly different destination than the one beside it is worse than no label.
 *
 * The query resets rather than narrowing what is already on screen. Reaching for an author is
 * asking to see that author, not to intersect them with the filter you happened to arrive under —
 * which is also why this takes no current query to merge with.
 */
export function authorHref(post: Post): string {
	// An author with no metadata has an empty handle, which the query model carries as a hyphen —
	// so the no-author view is reachable exactly the way every other author's is.
	return `/a/${post.archiveId}?${serializeQuery({ author: [post.author.handle] })}`;
}

export function authorLabel(post: Post): string {
	return post.author.handle
		? `Show everything by @${post.author.handle} in this archive`
		: "Show everything with no author in this archive";
}

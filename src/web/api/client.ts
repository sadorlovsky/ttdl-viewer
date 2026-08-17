import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { serializeQuery } from "../../shared/filters.ts";
import type { Archive, Post, PostPage, PostQuery, Stats } from "../../shared/types.ts";

export interface ApiFailure {
	code: string;
	message: string;
	hint?: string;
}

const DEFAULT_PAGE_SIZE = 30;

export class ApiError extends Error {
	constructor(readonly failure: ApiFailure) {
		super(failure.message);
	}
}

async function get<T>(path: string): Promise<T> {
	const response = await fetch(path, { headers: { Accept: "application/json" } });
	if (!response.ok) {
		const body: unknown = await response.json().catch(() => null);
		const failure =
			body && typeof body === "object" && "error" in body
				? (body as { error: ApiFailure }).error
				: { code: "HTTP", message: `${response.status} ${response.statusText}` };
		throw new ApiError(failure);
	}
	return (await response.json()) as T;
}

export function useStats() {
	return useQuery({ queryKey: ["stats"], queryFn: () => get<Stats>("/api/stats") });
}

export function useArchives() {
	return useQuery({ queryKey: ["archives"], queryFn: () => get<Archive[]>("/api/archives") });
}

export function useArchive(archiveId: string) {
	return useQuery({
		queryKey: ["archive", archiveId],
		queryFn: () => get<Archive>(`/api/archives/${archiveId}`),
	});
}

/**
 * The one query the grid and the feed share.
 *
 * The key is (archive, serialized filter) — deliberately without the cursor — so opening the feed
 * from a grid tile finds every page already in the cache and renders instantly instead of
 * refetching the same posts under a different key.
 */
export function usePosts(archiveId: string, query: PostQuery, enabled = true) {
	const filterKey = serializeQuery(query);
	return useInfiniteQuery({
		queryKey: ["posts", archiveId, filterKey],
		enabled,
		initialPageParam: null as string | null,
		queryFn: ({ pageParam }) => {
			const params = new URLSearchParams(filterKey);
			// serializeQuery already carries an explicit limit; only fill in the default when the
			// view did not ask for one, or a shared URL's page size would be silently ignored.
			if (!params.has("limit")) {
				params.set("limit", String(DEFAULT_PAGE_SIZE));
			}
			if (pageParam) {
				params.set("cursor", pageParam);
			}
			return get<PostPage>(`/api/archives/${archiveId}/posts?${params}`);
		},
		getNextPageParam: (last: PostPage) => last.cursor,
	});
}

export interface Neighbors {
	prev: string | null;
	next: string | null;
	/** Index of the post within the filtered view, or -1 when it is not in it at all. */
	position: number;
	total: number;
}

/**
 * Where a post sits in the current view.
 *
 * This is what makes a deep link cheap: without it the feed has to page blindly until the post
 * turns up, and for an id that is not in the view at all it would walk the whole archive before
 * giving up.
 */
export function useNeighbors(
	archiveId: string,
	postId: string,
	query: PostQuery,
	enabled: boolean,
) {
	const filterKey = serializeQuery(query);
	return useQuery({
		queryKey: ["neighbors", archiveId, filterKey, postId],
		// The key necessarily carries postId, and the feed rewrites postId on every snap — so
		// without this gate simply scrolling would fire one request per post passed. It is only
		// ever needed before the target has been found.
		enabled,
		// The deep-link path cannot advance without an answer here, so it is worth more than one
		// attempt; and a position cached from before a rescan would point the pager at the wrong
		// index, so it is never served stale.
		retry: 2,
		staleTime: 0,
		queryFn: () =>
			get<Neighbors>(
				`/api/archives/${archiveId}/posts/${postId}/neighbors${filterKey ? `?${filterKey}` : ""}`,
			),
	});
}

export function usePost(archiveId: string, postId: string | null) {
	return useQuery({
		queryKey: ["post", archiveId, postId],
		enabled: postId !== null,
		queryFn: () => get<Post>(`/api/archives/${archiveId}/posts/${postId}`),
	});
}

export function useRawInfo(archiveId: string, postId: string | null, enabled: boolean) {
	return useQuery({
		queryKey: ["info", archiveId, postId],
		enabled: enabled && postId !== null,
		queryFn: () => get<Record<string, unknown>>(`/api/archives/${archiveId}/posts/${postId}/info`),
		retry: false,
	});
}

export function useHashtags(archiveId: string, enabled = true) {
	return useQuery({
		queryKey: ["hashtags", archiveId],
		enabled,
		queryFn: () =>
			get<Array<{ tag: string; count: number }>>(`/api/archives/${archiveId}/hashtags?limit=60`),
	});
}

/** Flatten the infinite query into the single ordered list every screen actually wants. */
export function flatten(pages: { pages: PostPage[] } | undefined): Post[] {
	return pages?.pages.flatMap((page) => page.items) ?? [];
}

export function totalOf(pages: { pages: PostPage[] } | undefined): number {
	return pages?.pages[0]?.total ?? 0;
}

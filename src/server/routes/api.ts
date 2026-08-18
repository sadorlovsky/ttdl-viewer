import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseQuery } from "../../shared/filters.ts";
import type { AuthorSummary } from "../../shared/types.ts";
import { rankFuzzy } from "../index/fuzzy.ts";
import { neighbors, queryPosts } from "../index/query.ts";
import type { Registry } from "../index/registry.ts";

const VERSION = "0.1.0";

export function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
	});
}

export function fail(code: string, message: string, status: number, hint?: string): Response {
	return json({ error: hint ? { code, message, hint } : { code, message } }, status);
}

type Req = Request & { params: Record<string, string> };
type Handler = (request: Req) => Response;

const archiveOf = (registry: Registry, request: Req) => {
	const id = request.params.archiveId;
	return id ? registry.get(id) : undefined;
};

export function apiRoutes(
	registry: Registry,
	config: { root: string; likesDir: string | null },
): Record<string, Handler | Record<string, Handler>> {
	const needArchive = (request: Req) =>
		fail(
			"ARCHIVE_NOT_FOUND",
			`No archive "${request.params.archiveId}"`,
			404,
			"Check /api/archives for the archives that were found.",
		);

	return {
		"/api/stats": () => {
			const stats = registry.stats();
			return json({
				root: config.root,
				likesDir: config.likesDir,
				...stats,
				version: VERSION,
			});
		},

		// Full author objects are dropped here: a list archive can carry thousands of them, and
		// the library grid only ever reads `authorCount`. The one archive's own page fetches the
		// real array from the route below, where a few thousand more bytes are the cost of a
		// page you're already committed to loading.
		"/api/archives": () => json(registry.list().map((a) => ({ ...a.archive, authors: [] }))),

		"/api/archives/:archiveId": (request) => {
			const indexed = archiveOf(registry, request);
			return indexed ? json(indexed.archive) : needArchive(request);
		},

		"/api/archives/:archiveId/rescan": {
			POST: (request) => {
				const started = performance.now();
				// peek, not get: revalidating here would fold the change into the "before" side.
				const before = registry.peek(request.params.archiveId as string);
				if (!before) {
					return needArchive(request);
				}
				const previousHash = before.scan.listingHash;
				const after = registry.rescan(request.params.archiveId as string);
				if (!after) {
					// The directory could not be read at all — say so, rather than reporting a
					// successful rescan that changed nothing.
					return fail(
						"ARCHIVE_NOT_FOUND",
						`${before.archive.name} could not be read`,
						404,
						`Check that ${before.archive.displayPath} still exists and is readable.`,
					);
				}
				return json({
					changed: after.scan.listingHash !== previousHash,
					counts: after.archive.counts,
					tookMs: Math.round(performance.now() - started),
				});
			},
		},

		"/api/archives/:archiveId/posts": (request) => {
			const indexed = archiveOf(registry, request);
			if (!indexed) {
				return needArchive(request);
			}
			const query = parseQuery(new URL(request.url).searchParams);
			return json(queryPosts(indexed.posts, query));
		},

		"/api/archives/:archiveId/posts/:postId": (request) => {
			const indexed = archiveOf(registry, request);
			if (!indexed) {
				return needArchive(request);
			}
			const post = indexed.postsById.get(request.params.postId as string);
			return post ? json(post) : fail("POST_NOT_FOUND", "No such post in this archive", 404);
		},

		"/api/archives/:archiveId/posts/:postId/info": (request) => {
			const indexed = archiveOf(registry, request);
			if (!indexed) {
				return needArchive(request);
			}
			const group = indexed.scan.groups.get(request.params.postId as string);
			if (!group?.info) {
				return fail(
					"POST_NOT_FOUND",
					"This post has no .info.json",
					404,
					`Backfill it with: ttdl.py meta ${indexed.archive.name}`,
				);
			}
			try {
				const raw = readFileSync(join(indexed.scan.dir, group.info.name), "utf8");
				return new Response(raw, {
					headers: {
						"Content-Type": "application/json; charset=utf-8",
						"Cache-Control": "no-store",
					},
				});
			} catch {
				return fail("POST_NOT_FOUND", "The metadata file is no longer readable", 404);
			}
		},

		"/api/archives/:archiveId/posts/:postId/neighbors": (request) => {
			const indexed = archiveOf(registry, request);
			if (!indexed) {
				return needArchive(request);
			}
			const query = parseQuery(new URL(request.url).searchParams);
			return json(neighbors(indexed.posts, query, request.params.postId as string));
		},

		"/api/archives/:archiveId/authors": (request) => {
			const indexed = archiveOf(registry, request);
			if (!indexed) {
				return needArchive(request);
			}
			const params = new URL(request.url).searchParams;
			const q = params.get("q")?.trim() ?? "";
			const limit = Math.min(Number(params.get("limit") ?? 50) || 50, 200);
			// Fuzzy matching belongs here rather than over descriptions: there are at most a few
			// hundred authors, and nobody remembers a TikTok handle exactly.
			const authors: AuthorSummary[] = q
				? rankFuzzy(indexed.archive.authors, q, (a) => [a.handle, a.name ?? ""])
				: indexed.archive.authors;
			return json(authors.slice(0, limit));
		},

		"/api/archives/:archiveId/hashtags": (request) => {
			const indexed = archiveOf(registry, request);
			if (!indexed) {
				return needArchive(request);
			}
			const params = new URL(request.url).searchParams;
			const limit = Math.min(Number(params.get("limit") ?? 50) || 50, 500);
			const counts = new Map<string, number>();
			for (const post of indexed.posts) {
				for (const tag of post.hashtags) {
					counts.set(tag, (counts.get(tag) ?? 0) + 1);
				}
			}
			const ranked = [...counts.entries()]
				.map(([tag, count]) => ({ tag, count }))
				.sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
			const q = params.get("q")?.trim();
			return json((q ? rankFuzzy(ranked, q, (h) => [h.tag]) : ranked).slice(0, limit));
		},
	};
}

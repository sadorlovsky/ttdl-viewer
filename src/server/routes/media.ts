import { statSync } from "node:fs";
import { join } from "node:path";
import { serveFile } from "../http/range.ts";
import type { Registry } from "../index/registry.ts";

function fail(code: string, message: string, status: number): Response {
	return new Response(JSON.stringify({ error: { code, message } }), {
		status,
		headers: { "Content-Type": "application/json; charset=utf-8" },
	});
}

/**
 * Resolve a media request to a file on disk.
 *
 * This is the only place a request turns into a path, and it does so without ever concatenating a
 * request string into one: the archive id indexes a closed map built by the scanner, the post id
 * indexes that archive's group map, and the filename is read out of the group. A traversal
 * attempt lands on a missing map key, not on a parent directory.
 */
function resolve(
	registry: Registry,
	archiveId: string | undefined,
	postId: string | undefined,
	what: "media" | "cover" | "photo",
	photoIndex?: string,
): { path: string; size: number; mtimeMs: number } | Response {
	if (!archiveId || !postId) {
		return fail("MEDIA_NOT_FOUND", "Missing archive or post", 404);
	}
	const indexed = registry.get(archiveId);
	if (!indexed) {
		return fail("ARCHIVE_NOT_FOUND", `No archive ${archiveId}`, 404);
	}
	const group = indexed.scan.groups.get(postId);
	if (!group) {
		return fail("POST_NOT_FOUND", `No post ${postId}`, 404);
	}

	let name: string | undefined;
	if (what === "media") {
		name = group.media?.name;
	} else if (what === "cover") {
		name = group.cover?.name;
	} else {
		const index = Number.parseInt(photoIndex ?? "", 10);
		name = Number.isInteger(index) ? group.photos.get(index)?.name : undefined;
	}
	if (!name) {
		return fail("MEDIA_NOT_FOUND", `No ${what} for post ${postId}`, 404);
	}

	const path = join(indexed.scan.dir, name);
	try {
		const st = statSync(path);
		return { path, size: st.size, mtimeMs: st.mtimeMs };
	} catch {
		// The index is a snapshot; the file may have moved since. Say so rather than 500.
		return fail("MEDIA_NOT_FOUND", `${name} is no longer on disk`, 404);
	}
}

type Handler = (request: Request & { params: Record<string, string> }) => Response;

export function mediaRoutes(registry: Registry): Record<string, Handler> {
	const serve =
		(what: "media" | "cover" | "photo") =>
		(request: Request & { params: Record<string, string> }): Response => {
			const found = resolve(
				registry,
				request.params.archiveId,
				request.params.postId,
				what,
				request.params.index,
			);
			if (found instanceof Response) {
				return found;
			}
			return serveFile({ ...found, request });
		};

	return {
		"/media/:archiveId/:postId/media": serve("media"),
		"/media/:archiveId/:postId/cover": serve("cover"),
		"/media/:archiveId/:postId/photo/:index": serve("photo"),
	};
}

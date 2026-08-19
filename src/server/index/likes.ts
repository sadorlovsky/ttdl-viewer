/**
 * The TikTok data export, read for liked and favorited dates.
 *
 * TikTok's UI orders likes and favorites by when you saved a post, not by when it was published,
 * and nothing on disk carries that date: ttdl names files after the publication date and stamps
 * the same date on them. The export is the only place the saving date exists, which is why this
 * reads it rather than deriving it.
 *
 * The text export (Settings → Account → Download your data) writes one entry as a pair of lines:
 *
 *     Date: 2026-08-16 18:18:02 UTC
 *     Link: https://www.tiktokv.com/share/video/7673781569403751713/
 *
 * Note the host — `tiktokv.com/share/video/<id>/`, not the `tiktok.com/@user/video/<id>` form the
 * archive uses everywhere else. Only the id is taken from it, so the difference does not matter,
 * but a parser written against the familiar URL shape would match nothing at all.
 *
 * Reading the export here is the fallback, not the main path. ttdl takes `--likes` itself, and what
 * it finds it caches as `.liked.json` inside the archive — see `readLikedState`. That file is the
 * first thing looked at, because it needs no searching, survives the export being deleted, and
 * travels with the archive to storage and back. The export is read only for an archive ttdl has
 * never been given one for.
 *
 * Nobody is asked where the export lives either. People unpack it next to the archives it
 * describes, which is the one place the viewer is already looking, so `findLikes` looks there —
 * see the note on `isArchiveDir` for what keeps that affordable.
 */

import { type Dirent, existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { STATE_FILES } from "./parse-name.ts";

export type LikeKind = "like" | "favorite";

export interface LikedAt {
	at: number;
	kind: LikeKind;
}

/** Post id → when it was saved. Built once at startup; empty when no export was found. */
export type LikesIndex = Map<string, LikedAt>;

/** What the export contributed, and where it turned out to be. */
export interface Likes {
	index: LikesIndex;
	/** The directory the files were read from — for the startup line and /api/stats. */
	dir: string | null;
	/**
	 * Root-level directory names that hold the export rather than an archive.
	 *
	 * Without this the export folder is listed as an archive of its own: it is a subdirectory of
	 * the root like any other, so it appeared in the library as a profile with zero posts — a real
	 * archive that had failed to download, as far as anything on screen could tell.
	 */
	notArchives: ReadonlySet<string>;
}

/**
 * Which file means what.
 *
 * Compared lowercased: the export's own capitalisation has changed between versions, and a user
 * unpacking it on a case-insensitive filesystem can end up with anything.
 */
const EXPORT_FILES: ReadonlyArray<{ name: string; kind: LikeKind }> = [
	{ name: "like list.txt", kind: "like" },
	{ name: "favorite videos.txt", kind: "favorite" },
];

/** `Date: 2026-08-16 18:18:02 UTC` — the export writes UTC and says so on every line. */
const DATE_RE = /^Date:\s*(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})\s*UTC\s*$/;
const LINK_RE = /^Link:\s*\S*?(\d{15,})/;

/**
 * How deep to look for the export files.
 *
 * The archive unpacks as `TikTok/Likes and Favorites/Like List.txt`, but people drag the files out
 * of that nesting as often as they leave them in it, so every depth between has to work. The bound
 * keeps a directory that is neither from being walked to the bottom.
 */
const MAX_DEPTH = 4;

function findExports(dir: string, depth = 0): Array<{ path: string; kind: LikeKind }> {
	if (depth > MAX_DEPTH) {
		return [];
	}
	const found: Array<{ path: string; kind: LikeKind }> = [];
	try {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const path = join(dir, entry.name);
			if (entry.isDirectory()) {
				found.push(...findExports(path, depth + 1));
				continue;
			}
			const match = EXPORT_FILES.find((f) => f.name === entry.name.toLowerCase());
			if (match) {
				found.push({ path, kind: match.kind });
			}
		}
	} catch {
		// An unreadable directory is not an error worth stopping for: the tree may hold other
		// exports too, and one unreadable branch should not lose the rest.
	}
	return found;
}

/**
 * Entries from one export file, in the order they appear.
 *
 * A `Date:` line applies to the `Link:` line that follows it, so the date is held until a link
 * arrives. Anything else — blank lines, the "You have no data in this section" placeholder that
 * empty sections carry — is skipped rather than treated as an error.
 */
export function parseExport(text: string): Array<{ id: string; at: number }> {
	const entries: Array<{ id: string; at: number }> = [];
	let pending: number | null = null;

	for (const line of text.split("\n")) {
		const date = DATE_RE.exec(line.trim());
		if (date) {
			const at = Date.parse(`${date[1]}T${date[2]}Z`);
			pending = Number.isFinite(at) ? Math.floor(at / 1000) : null;
			continue;
		}
		const link = LINK_RE.exec(line.trim());
		if (link?.[1] !== undefined && pending !== null) {
			entries.push({ id: link[1], at: pending });
			pending = null;
		}
	}
	return entries;
}

/**
 * Fold export files into one index.
 *
 * A post can sit in both lists — 69 of them do in the archive this was written against — and the
 * two dates differ. The like wins, because that is the list the post primarily belongs to; the
 * kind is carried alongside so the UI can still say which one it came from.
 *
 * Within one list the first entry wins. The export is written newest-first, so that is the most
 * recent time the post was saved, which is what TikTok itself orders by.
 */
function indexFiles(files: ReadonlyArray<{ path: string; kind: LikeKind }>): LikesIndex {
	const index: LikesIndex = new Map();
	for (const kind of ["like", "favorite"] as const) {
		for (const file of files.filter((f) => f.kind === kind)) {
			let text: string;
			try {
				text = readFileSync(file.path, "utf8");
			} catch {
				continue;
			}
			for (const entry of parseExport(text)) {
				if (!index.has(entry.id)) {
					index.set(entry.id, { at: entry.at, kind });
				}
			}
		}
	}
	return index;
}

/** Read every export file under `dir` into one index. */
export function readLikes(dir: string | null): LikesIndex {
	return dir ? indexFiles(findExports(dir)) : new Map();
}

/** ttdl's own name for the cache it writes beside an archive (ttdl.py: LIKED_STATE). */
export const LIKED_STATE = ".liked.json";

/**
 * The saving dates ttdl already recorded for one archive, or null if it never did.
 *
 * ttdl reads the export once and writes what it found here, as `{ id: { at, kind } }` — the same
 * index this module builds, already resolved, already scoped to the archive it belongs to. Reading
 * it rather than the export is what makes the whole thing configuration-free: the file is inside a
 * directory that is being scanned anyway, so there is nothing to find and nothing to point at.
 *
 * Null and empty are different answers. Null means ttdl was never given an export for this archive
 * and the caller should look for one itself; an empty object means it was, and matched nothing.
 */
export function readLikedState(dir: string): LikesIndex | null {
	let raw: unknown;
	try {
		raw = JSON.parse(readFileSync(join(dir, LIKED_STATE), "utf8"));
	} catch {
		// Absent, unreadable, or half-written — all of which mean "ask the export instead" rather
		// than "this archive has no saved dates", which would be a different and wrong claim.
		return null;
	}
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
		return null;
	}

	const index: LikesIndex = new Map();
	for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
		if (!value || typeof value !== "object") {
			continue;
		}
		const { at, kind } = value as { at?: unknown; kind?: unknown };
		// ttdl writes both fields on every entry, but this file is state on someone else's disk:
		// a shape that does not hold up is skipped rather than trusted into the index.
		if (typeof at === "number" && Number.isFinite(at) && (kind === "like" || kind === "favorite")) {
			index.set(id, { at, kind });
		}
	}
	return index;
}

/**
 * Whether a directory is one of ttdl's archives rather than something living beside them.
 *
 * ttdl writes its own bookkeeping into every archive it creates — archive.txt and .all_ids.txt at
 * the very least — and an unpacked export carries none of it. Asking by stat rather than by
 * listing is what makes searching the root affordable at all: the archives here hold up to
 * fourteen thousand files each, and listing them all to find a two-file export costs 411 ms where
 * these stats cost 3. A directory ttdl has created but not yet written state into is walked
 * instead of skipped, which is harmless — it holds no export, so the walk finds nothing.
 */
function isArchiveDir(dir: string): boolean {
	for (const name of STATE_FILES) {
		if (existsSync(join(dir, name))) {
			return true;
		}
	}
	return false;
}

/**
 * Look for the export beside the archives, rather than inside them.
 *
 * Two places are searched: the root itself, for files dragged out flat, and every root-level
 * directory that is not an archive, for the folder an export usually keeps. Nothing else is opened,
 * so the search cannot wander into an archive of ten thousand files.
 */
function search(root: string): {
	files: Array<{ path: string; kind: LikeKind }>;
	skip: Set<string>;
} {
	const files: Array<{ path: string; kind: LikeKind }> = [];
	const skip = new Set<string>();

	let entries: Dirent[];
	try {
		entries = readdirSync(root, { withFileTypes: true });
	} catch {
		return { files, skip };
	}

	for (const entry of entries) {
		const path = join(root, entry.name);
		if (!entry.isDirectory()) {
			const match = EXPORT_FILES.find((f) => f.name === entry.name.toLowerCase());
			if (match) {
				files.push({ path, kind: match.kind });
			}
			continue;
		}
		if (entry.name.startsWith(".") || isArchiveDir(path)) {
			continue;
		}
		const found = findExports(path);
		if (found.length > 0) {
			files.push(...found);
			skip.add(entry.name);
		}
	}
	return { files, skip };
}

/**
 * The export, found rather than configured.
 *
 * `override` is the escape hatch for an export kept somewhere else entirely; when it is given the
 * root is not searched at all, so pointing at one export cannot silently pick up another.
 */
export function findLikes(root: string, override: string | null = null): Likes {
	if (override) {
		const files = findExports(override);
		return {
			index: indexFiles(files),
			dir: files.length > 0 ? override : null,
			// An override inside the root still names a directory the library would otherwise
			// list as an empty archive.
			notArchives: dirname(override) === root ? new Set([basename(override)]) : new Set(),
		};
	}

	const { files, skip } = search(root);
	return {
		index: indexFiles(files),
		// Where it was actually found, which is what the startup line has to say — "in the root"
		// and "in tiktok-export/" are different answers to "so where is it reading this from".
		dir: files[0] ? dirname(files[0].path) : null,
		notArchives: skip,
	};
}

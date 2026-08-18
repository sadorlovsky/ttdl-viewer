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
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type LikeKind = "like" | "favorite";

export interface LikedAt {
	at: number;
	kind: LikeKind;
}

/** Post id → when it was saved. Built once at startup; empty when --likes was not given. */
export type LikesIndex = Map<string, LikedAt>;

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
 * The archive unpacks as `TikTok/Likes and Favorites/Like List.txt`, but people point --likes at
 * whichever directory they happened to unpack into, so both the zip root and the leaf directory
 * have to work. The bound keeps a mistyped path from walking a home directory.
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
		// An unreadable directory is not an error worth stopping for: --likes may point at a tree
		// that holds other exports too, and one unreadable branch should not lose the rest.
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
 * Read every export file under `dir` into one index.
 *
 * A post can sit in both lists — 69 of them do in the archive this was written against — and the
 * two dates differ. The like wins, because that is the list the post primarily belongs to; the
 * kind is carried alongside so the UI can still say which one it came from.
 *
 * Within one list the first entry wins. The export is written newest-first, so that is the most
 * recent time the post was saved, which is what TikTok itself orders by.
 */
export function readLikes(dir: string | null): LikesIndex {
	const index: LikesIndex = new Map();
	if (!dir) {
		return index;
	}
	const files = findExports(dir);
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

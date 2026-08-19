import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
	type MediaExt,
	PROFILE_AVATAR,
	PROFILE_CARD,
	parseName,
	STATE_FILES,
	type ThumbExt,
} from "./parse-name.ts";

export interface FileStat {
	name: string;
	size: number;
	mtimeMs: number;
}

export interface FileGroup {
	postId: string;
	/** "20260814", or null when every filename in the group used the "NA" date segment. */
	datePart: string | null;
	media?: FileStat & { ext: MediaExt; title: string };
	info?: FileStat;
	cover?: { name: string; ext: ThumbExt };
	/** Non-empty carousel images by 1-based index. Empty files are dropped, as ttdl does. */
	photos: Map<number, FileStat>;
	photoState?: string;
	photoMarker: boolean;
}

export interface ArchiveScan {
	name: string;
	dir: string;
	groups: Map<string, FileGroup>;
	/** State files present in the archive root, by name. */
	stateFiles: Set<string>;
	/** Contents of `.source`, trimmed — present only for list-built archives. */
	source: string | null;
	/** ttdl holds a .lock for the duration of a run. */
	locked: boolean;
	/** ttdl's author card and picture, when `get` recorded them. */
	card: FileStat | null;
	avatar: FileStat | null;
	/** Sorted `name\0size\0mtime` digest of the whole listing — the tier-1 cache key. */
	listingHash: string;
	/** Total bytes of media files (not sidecars). */
	bytes: number;
}

/** Preference order when a post somehow has more than one cover. */
const COVER_RANK: Record<ThumbExt, number> = { ".jpg": 0, ".jpeg": 1, ".webp": 2, ".png": 3 };

function emptyGroup(postId: string): FileGroup {
	return { postId, datePart: null, photos: new Map(), photoMarker: false };
}

/**
 * Stat a file, or null if it is no longer there.
 *
 * ttdl and this viewer are expected to run at the same time, so a name returned by readdir can be
 * gone — or still a `.part` being renamed — by the time we ask about it. Letting that throw would
 * drop the entire archive from the index over one transient file.
 */
function statOrNull(path: string) {
	try {
		return statSync(path);
	} catch {
		return null;
	}
}

/** FNV-1a over the listing. Cheap, and we only need change detection, not cryptography. */
function fnv1a(parts: string[]): string {
	let hash = 0x811c9dc5;
	for (const part of parts) {
		for (let i = 0; i < part.length; i++) {
			hash ^= part.charCodeAt(i);
			hash = Math.imul(hash, 0x01000193) >>> 0;
		}
	}
	return hash.toString(16).padStart(8, "0");
}

/**
 * Read one archive directory into file groups.
 *
 * One readdir, then `stat` only where the answer matters: carousel images need a size (ttdl's
 * completeness rule ignores empty ones), media needs size and mtime, and `.info.json` needs both
 * for per-file cache invalidation. Covers and markers are never stat'd.
 */
export function scanArchive(root: string, name: string): ArchiveScan {
	const dir = join(root, name);
	const groups = new Map<string, FileGroup>();
	const stateFiles = new Set<string>();
	const listing: string[] = [];
	let bytes = 0;
	let card: FileStat | null = null;
	let avatar: FileStat | null = null;

	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (!entry.isFile()) {
			continue;
		}
		const fileName = entry.name;
		if (STATE_FILES.has(fileName)) {
			stateFiles.add(fileName);
			continue;
		}
		if (fileName === PROFILE_CARD || fileName === PROFILE_AVATAR) {
			const st = statOrNull(join(dir, fileName));
			if (st) {
				const stat = { name: fileName, size: st.size, mtimeMs: st.mtimeMs };
				// Into the listing hash as well: a replaced picture keeps its name, so without the
				// mtime a rescan would go on serving the old one from a cached index.
				listing.push(`${fileName}\0${st.size}\0${Math.floor(st.mtimeMs)}`);
				if (fileName === PROFILE_CARD) {
					card = stat;
				} else {
					avatar = stat;
				}
			}
			continue;
		}

		const parsed = parseName(fileName);
		if (!parsed) {
			continue;
		}

		let group = groups.get(parsed.postId);
		if (!group) {
			group = emptyGroup(parsed.postId);
			groups.set(parsed.postId, group);
		}
		// Only the media file's date counts. It is the one ttdl derived from yt-dlp's upload_date,
		// and it is what "the filename told us the date" has to mean: a carousel's images can be
		// dated even when its audio is NA, and taking the date from them would report a filename
		// as the source for a post whose filename never carried one.
		if (parsed.role.role === "media" && parsed.datePart) {
			group.datePart = parsed.datePart;
		}

		const path = join(dir, fileName);
		switch (parsed.role.role) {
			case "media": {
				const st = statOrNull(path);
				if (!st) {
					continue;
				}
				group.media = {
					name: fileName,
					size: st.size,
					mtimeMs: st.mtimeMs,
					ext: parsed.role.ext,
					title: parsed.role.title,
				};
				bytes += st.size;
				listing.push(`${fileName}\0${st.size}\0${Math.floor(st.mtimeMs)}`);
				continue;
			}
			case "info": {
				const st = statOrNull(path);
				if (!st) {
					continue;
				}
				group.info = { name: fileName, size: st.size, mtimeMs: st.mtimeMs };
				listing.push(`${fileName}\0${st.size}\0${Math.floor(st.mtimeMs)}`);
				continue;
			}
			case "cover": {
				const rank = COVER_RANK[parsed.role.ext];
				if (!group.cover || rank < COVER_RANK[group.cover.ext]) {
					group.cover = { name: fileName, ext: parsed.role.ext };
				}
				break;
			}
			case "photo": {
				const st = statOrNull(path);
				if (!st) {
					continue;
				}
				// ttdl's `has_content`: a zero-byte image is a failed download, not an image.
				if (st.size > 0) {
					group.photos.set(parsed.role.index, {
						name: fileName,
						size: st.size,
						mtimeMs: st.mtimeMs,
					});
				}
				listing.push(`${fileName}\0${st.size}\0${Math.floor(st.mtimeMs)}`);
				continue;
			}
			case "photoState": {
				group.photoState = fileName;
				break;
			}
			case "photoMarker": {
				group.photoMarker = true;
				break;
			}
		}
		listing.push(fileName);
	}

	// The group is created before its file is stat'd, so a file that could not be read leaves an
	// entry behind with nothing in it. Such a group is not a ghost — nothing was ever deleted —
	// and counting it as one would blame the archive for a transient read failure.
	for (const [postId, group] of groups) {
		const empty =
			!group.media &&
			!group.info &&
			!group.cover &&
			!group.photoState &&
			!group.photoMarker &&
			group.photos.size === 0;
		if (empty) {
			groups.delete(postId);
		}
	}

	let source: string | null = null;
	if (stateFiles.has(".source")) {
		try {
			source = readFileSync(join(dir, ".source"), "utf8").trim() || null;
		} catch {
			source = null;
		}
	}

	listing.sort();
	return {
		name,
		dir,
		groups,
		stateFiles,
		source,
		locked: stateFiles.has(".lock"),
		card,
		avatar,
		listingHash: fnv1a(listing),
		bytes,
	};
}

/** Read `expected` out of a carousel state file. Any malformed shape reads as "unknown". */
export function readExpected(dir: string, stateFile: string | undefined): number | null {
	if (!stateFile) {
		return null;
	}
	try {
		const data: unknown = JSON.parse(readFileSync(join(dir, stateFile), "utf8"));
		if (data && typeof data === "object" && "expected" in data) {
			const expected = Number((data as { expected: unknown }).expected);
			return Number.isInteger(expected) && expected > 0 ? expected : null;
		}
	} catch {
		// A truncated or absent state file means the count is simply unknown, which the
		// completeness rule already handles via the legacy branch.
	}
	return null;
}

/** Immediate subdirectories of the root — one per archive. */
/**
 * State files whose contents the index depends on, and which ttdl rewrites in place.
 *
 * Deliberately not all of STATE_FILES: ttdl.log grows on every request a run makes, so including
 * it would report a change whenever ttdl is merely running, and rename-map.txt is never read here.
 */
const STAMP_FILES = [
	"archive.txt",
	".all_ids.txt",
	"missing.txt",
	".source",
	".lock",
	// Rewritten whole every time ttdl is handed an export, and the dates in it are on every post
	// of a list archive — so a run that records them has to be noticed here.
	".liked.json",
	PROFILE_CARD,
];

/**
 * A cheap probe for "did anything change here" — seven stats against readdir's ten thousand.
 *
 * Measured on a 10,061-file archive: this takes 0.02 ms where a full listing takes 89 ms and a
 * reindex 780 ms, which is what makes it affordable on the way into a request.
 *
 * The directory's own mtime covers files appearing and disappearing — what a download does. It
 * does not move when a file is rewritten in place, so the state files are stat'd alongside it:
 * archive.txt grows line by line during a run and `check` rewrites it whole. Absence is recorded
 * too, since a .lock that vanished means a run has just finished.
 */
export function archiveStamp(root: string, name: string): string {
	const dir = join(root, name);
	const parts: string[] = [];
	for (const entry of ["", ...STAMP_FILES]) {
		try {
			const st = statSync(entry ? join(dir, entry) : dir);
			parts.push(`${entry}\0${st.size}\0${Math.floor(st.mtimeMs)}`);
		} catch {
			parts.push(`${entry}\0-`);
		}
	}
	return parts.join("|");
}

/**
 * Immediate subdirectories of the root, minus the ones that are not archives.
 *
 * `skip` carries whatever the export search claimed — a folder holding a TikTok data export is a
 * subdirectory of the root like any other, and listing it here put an archive with zero posts in
 * the library that nothing on screen could explain.
 */
export function listArchiveDirs(root: string, skip: ReadonlySet<string> = new Set()): string[] {
	return readdirSync(root, { withFileTypes: true })
		.filter((e) => e.isDirectory() && !e.name.startsWith(".") && !skip.has(e.name))
		.map((e) => e.name)
		.sort();
}

/**
 * Filename parsing, ported from ttdl.
 *
 * Everything below names the ttdl symbol it mirrors rather than a line in ttdl.py. The file is
 * edited on its own schedule and nothing here checks the numbers, so they were all wrong within
 * months; a name is what someone would grep for anyway.
 *
 * ttdl's output template (the `--output` passed by `download`) is
 *
 *     %(upload_date)s_%(id)s_%(title).80B.%(ext)s
 *
 * and its own recognizer (`NAME_RE`) is `^(?:\d{8}|NA)_(\d{15,})_`. Two things about that regex
 * carry real consequences and are worth stating rather than discovering:
 *
 *  1. It is **anchored**. A caption can easily contain a 15-digit number, and an unanchored search
 *     would happily pull the id out of the title instead of the id field.
 *  2. The date segment can be the literal `NA`, when yt-dlp had no upload date to give.
 *
 * The other trap is that a post's files do **not** share one prefix. Media, `.info.json`, and the
 * cover carry the title (`fetch_meta` derives sidecar names from the media stem), while the
 * carousel files do not (the carousel code keys on `m.group(0)[:-1]`, which stops at the
 * underscore after the id). Grouping by prefix string therefore splits carousels in half.
 * Everything here groups by the captured **id** and classifies by suffix instead.
 */

/** ttdl `NAME_RE`. Anchored — see the note above. */
const NAME_RE = /^(?:\d{8}|NA)_(\d{15,})_/;

/** ttdl `PHOTO_INDEX_RE`. `.JPG` counts, `.jpeg` does not — match ttdl exactly. */
const PHOTO_INDEX_RE = /_photo_(\d+)\.jpg$/i;

/** ttdl `THUMB_EXTS`. Videos convert to .jpg; carousels keep the original .jpeg. */
export const THUMB_EXTS = [".jpg", ".jpeg", ".webp", ".png"] as const;

export const MEDIA_EXTS = [".mp4", ".m4a", ".mp3"] as const;

export type MediaExt = (typeof MEDIA_EXTS)[number];
export type ThumbExt = (typeof THUMB_EXTS)[number];

export type FileRole =
	| { role: "media"; ext: MediaExt; title: string }
	| { role: "info" }
	| { role: "cover"; ext: ThumbExt }
	| { role: "photo"; index: number }
	| { role: "photoState" }
	| { role: "photoMarker" };

export interface ParsedName {
	postId: string;
	/** "20260814", or null when the date segment was the literal "NA". */
	datePart: string | null;
	role: FileRole;
}

function lowerEndsWith(name: string, suffix: string): boolean {
	return name.length >= suffix.length && name.slice(-suffix.length).toLowerCase() === suffix;
}

/**
 * Classify one filename.
 *
 * Returns null for anything ttdl would not recognize as part of a post — state files, unrelated
 * junk, and names whose extension we have no business serving.
 */
export function parseName(name: string): ParsedName | null {
	const match = NAME_RE.exec(name);
	if (!match) {
		return null;
	}
	const postId = match[1];
	if (postId === undefined) {
		return null;
	}
	const datePart = name.startsWith("NA_") ? null : name.slice(0, 8);
	const rest = name.slice(match[0].length);

	// Carousel sidecars first: they are the only names keyed on the title-less prefix, so `rest`
	// is exactly "photo_NN.jpg" / "photo.json" / "photo.complete" for them. Checking them first
	// also keeps a title ending in "_photo" from being mistaken for one.
	const photo = PHOTO_INDEX_RE.exec(name);
	if (photo?.[1] !== undefined) {
		const index = Number.parseInt(photo[1], 10);
		// ttdl writes 1-based indexes; a 0 would mean a name we do not understand.
		return index > 0 ? { postId, datePart, role: { role: "photo", index } } : null;
	}
	if (lowerEndsWith(name, "_photo.json")) {
		return { postId, datePart, role: { role: "photoState" } };
	}
	if (lowerEndsWith(name, "_photo.complete")) {
		return { postId, datePart, role: { role: "photoMarker" } };
	}
	if (lowerEndsWith(name, ".info.json")) {
		return { postId, datePart, role: { role: "info" } };
	}

	const dot = rest.lastIndexOf(".");
	if (dot <= 0) {
		return null;
	}
	const ext = rest.slice(dot).toLowerCase();
	const title = rest.slice(0, dot);

	if ((MEDIA_EXTS as readonly string[]).includes(ext)) {
		return { postId, datePart, role: { role: "media", ext: ext as MediaExt, title } };
	}
	if ((THUMB_EXTS as readonly string[]).includes(ext)) {
		return { postId, datePart, role: { role: "cover", ext: ext as ThumbExt } };
	}
	return null;
}

/**
 * Publication time from the post id alone (ttdl `post_day`).
 *
 * The upper 32 bits of a TikTok id are Unix seconds. BigInt is not optional here: ids exceed
 * Number.MAX_SAFE_INTEGER, and `Number(id) >> 32` silently returns garbage.
 */
export function idToUnix(postId: string): number {
	return Number(BigInt(postId) >> 32n);
}

/**
 * Undo the one substitution a title carries in a filename, for display.
 *
 * yt-dlp writes `／` where the caption had `/`, since the real character would be a directory
 * separator; ttdl's `adopt` reproduces that when it renames a foreign file.
 */
export function displayTitle(title: string): string {
	return title.replaceAll("／", "/").trim();
}

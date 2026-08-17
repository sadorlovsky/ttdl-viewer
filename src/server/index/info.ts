import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Normalized view of a yt-dlp `.info.json`.
 *
 * Reading thousands of these means thousands of chances to meet a shape that does not match, so
 * every field goes through a reader that returns null rather than throwing. A schema library
 * would be ceremony here: the dict has ~55 fields, every one of them optional in practice, and
 * a validator strict enough to be worth running would reject real files.
 */
export interface NormalizedInfo {
	title: string | null;
	description: string | null;
	timestamp: number | null;
	duration: number | null;

	uploader: string | null;
	uploaderId: string | null;
	uploaderUrl: string | null;
	channel: string | null;
	channelId: string | null;

	track: string | null;
	album: string | null;
	artists: string[];

	views: number | null;
	likes: number | null;
	comments: number | null;
	shares: number | null;
	saves: number | null;

	width: number | null;
	height: number | null;
	fps: number | null;
	aspectRatio: number | null;

	webpageUrl: string | null;
	hashtags: string[];
}

type Dict = Record<string, unknown>;

function str(value: unknown): string | null {
	return typeof value === "string" && value.trim() !== "" ? value : null;
}

function num(value: unknown): number | null {
	if (typeof value === "number" && Number.isFinite(value)) {
		return value;
	}
	// yt-dlp occasionally writes numeric strings; accept them, reject everything else.
	if (typeof value === "string" && value.trim() !== "") {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : null;
	}
	return null;
}

function strArray(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [];
	}
	return value.filter((v): v is string => typeof v === "string" && v.trim() !== "");
}

/** TikTok captions are hashtag-dense, and hashtags are the best facet the archive offers. */
export function extractHashtags(description: string | null): string[] {
	if (!description) {
		return [];
	}
	const found = description.match(/#[\p{L}\p{N}_]+/gu) ?? [];
	const seen = new Set<string>();
	for (const tag of found) {
		seen.add(tag.slice(1).toLowerCase());
	}
	return [...seen];
}

/**
 * Pick geometry from the top level, falling back to the largest format entry.
 *
 * `formats[]` is read here and then discarded — it is most of the file's bytes and, more
 * importantly, it is full of live signed CDN URLs. Keeping them in the normalized post would put
 * a remote URL one careless `<img src>` away from the render path, so nothing downstream ever
 * sees them.
 */
function geometry(dict: Dict): { width: number | null; height: number | null } {
	const width = num(dict.width);
	const height = num(dict.height);
	if (width && height) {
		return { width, height };
	}
	if (!Array.isArray(dict.formats)) {
		return { width, height };
	}
	let best: { width: number; height: number } | null = null;
	for (const entry of dict.formats) {
		if (!entry || typeof entry !== "object") {
			continue;
		}
		const w = num((entry as Dict).width);
		const h = num((entry as Dict).height);
		if (w && h && (!best || w * h > best.width * best.height)) {
			best = { width: w, height: h };
		}
	}
	return { width: width ?? best?.width ?? null, height: height ?? best?.height ?? null };
}

export function normalizeInfo(raw: unknown): NormalizedInfo | null {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
		return null;
	}
	const dict = raw as Dict;
	const description = str(dict.description) ?? str(dict.title);
	const { width, height } = geometry(dict);

	// `artists` is the modern field; older archives wrote artist/creator instead.
	const artists = strArray(dict.artists);
	if (artists.length === 0) {
		const legacy = str(dict.artist) ?? str(dict.creator);
		if (legacy) {
			artists.push(...legacy.split(/,\s*|\s+&\s+/).filter(Boolean));
		}
	}

	const aspect = num(dict.aspect_ratio);

	return {
		title: str(dict.title),
		description,
		timestamp: num(dict.timestamp),
		duration: num(dict.duration),

		uploader: str(dict.uploader),
		uploaderId: str(dict.uploader_id),
		uploaderUrl: str(dict.uploader_url),
		channel: str(dict.channel),
		channelId: str(dict.channel_id),

		track: str(dict.track),
		album: str(dict.album),
		artists,

		views: num(dict.view_count),
		likes: num(dict.like_count),
		comments: num(dict.comment_count),
		shares: num(dict.repost_count),
		saves: num(dict.save_count),

		width,
		height,
		fps: num(dict.fps),
		aspectRatio: aspect ?? (width && height ? width / height : null),

		webpageUrl: str(dict.webpage_url) ?? str(dict.original_url),
		hashtags: extractHashtags(description),
	};
}

/** Read and normalize one info file. A missing or corrupt file simply means "no metadata". */
export function readInfo(dir: string, fileName: string | undefined): NormalizedInfo | null {
	if (!fileName) {
		return null;
	}
	try {
		return normalizeInfo(JSON.parse(readFileSync(join(dir, fileName), "utf8")));
	} catch {
		return null;
	}
}

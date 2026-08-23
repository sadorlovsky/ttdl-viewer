import { avatarSeed } from "../../shared/avatar.ts";
import type { AuthorSummary, DateSource, Post } from "../../shared/types.ts";
import { classify } from "./complete.ts";
import type { NormalizedInfo } from "./info.ts";
import type { LikesIndex } from "./likes.ts";
import type { LoudnessIndex } from "./loudness.ts";
import { displayTitle, idToUnix } from "./parse-name.ts";
import type { FileGroup } from "./scan.ts";

/** Handle used when nothing in the archive says who made a post. */
export const UNKNOWN_HANDLE = "";

export function authorFrom(info: NormalizedInfo | null, fallbackHandle: string): AuthorSummary {
	const handle = info?.uploader ?? fallbackHandle;
	const name = info?.channel ?? null;
	return {
		handle,
		name,
		id: info?.uploaderId ?? null,
		secUid: info?.channelId ?? null,
		profileUrl: info?.uploaderUrl ?? (handle ? `https://www.tiktok.com/@${handle}` : null),
		postCount: 0,
		avatar: avatarSeed(handle, name),
		// Filled in by the registry, which is the only level that knows the archive's own card.
		avatarUrl: null,
	};
}

/**
 * Resolve the publish time.
 *
 * Three sources, in descending order of precision, and the last one always works: the upper 32
 * bits of the post id are Unix seconds, so `createdAt` is never null even for an archive with no
 * metadata at all. The filename's date is only day-granular, so when it is present we still take
 * the time of day from the id.
 */
function resolveDate(
	group: FileGroup,
	info: NormalizedInfo | null,
): { at: number; source: DateSource } {
	if (info?.timestamp) {
		return { at: info.timestamp, source: "info" };
	}
	return { at: idToUnix(group.postId), source: group.datePart ? "filename" : "postid" };
}

export interface BuildContext {
	archiveId: string;
	/** Used as the author when the archive is a single-account one and metadata is missing. */
	fallbackHandle: string;
	expected: number | null;
	/** Saving dates from the TikTok export. Empty unless --likes was given. */
	likes?: LikesIndex;
	/** Volume corrections from `loudness.json`. Empty unless ttdl has measured this archive. */
	loudness?: LoudnessIndex;
}

/**
 * Turn one file group into a Post, or null when the group is not a post at all.
 *
 * Every URL produced here is local and carries `?v=<mtime>`, which makes the immutable cache
 * header on the media routes safe: a rewritten file is a different URL.
 */
export function buildPost(
	group: FileGroup,
	info: NormalizedInfo | null,
	ctx: BuildContext,
): Post | null {
	const classified = classify(group, ctx.expected);
	const media = group.media;
	if (!classified || !media) {
		return null;
	}

	const base = `/media/${ctx.archiveId}/${group.postId}`;
	const version = Math.floor(media.mtimeMs);
	const { at, source } = resolveDate(group, info);
	const isVideo = classified.kind === "video";

	// The positions travel with the URLs. A carousel can be missing an image from the middle, and
	// once the URLs are packed into an array the gap is no longer visible in it — the strip would
	// then hatch the last segment and show every picture after the gap one place too early.
	const positions = isVideo ? [] : [...group.photos.keys()].sort((a, b) => a - b);
	const photos = isVideo
		? null
		: {
				count: group.photos.size,
				expected: ctx.expected,
				urls: positions.map((index) => `${base}/photo/${index}?v=${version}`),
				indexes: positions,
			};

	return {
		id: group.postId,
		archiveId: ctx.archiveId,
		kind: classified.kind,
		status: classified.status,

		createdAt: at,
		createdAtSource: source,

		// With no metadata the filename is all there is — and it is genuinely useful, because it
		// holds the first 80 bytes of the caption.
		title: info?.title ?? displayTitle(media.title),
		description: info?.description ?? null,
		hashtags: info?.hashtags ?? [],
		duration: info?.duration ?? null,

		author: authorFrom(info, ctx.fallbackHandle),
		music: info ? { track: info.track, album: info.album, artists: info.artists } : null,
		stats: {
			views: info?.views ?? null,
			likes: info?.likes ?? null,
			comments: info?.comments ?? null,
			shares: info?.shares ?? null,
			saves: info?.saves ?? null,
		},

		media: {
			url: `${base}/media?v=${version}`,
			ext: media.ext,
			bytes: media.size,
			kind: isVideo ? "video" : "audio",
			width: isVideo ? (info?.width ?? null) : null,
			height: isVideo ? (info?.height ?? null) : null,
			fps: isVideo ? (info?.fps ?? null) : null,
			aspectRatio: isVideo ? (info?.aspectRatio ?? null) : null,
		},
		cover: group.cover
			? {
					url: `${base}/cover?v=${version}`,
					ext: group.cover.ext,
					bytes: null,
					width: null,
					height: null,
				}
			: null,
		photos,

		loudnessGain: ctx.loudness?.get(group.postId) ?? null,

		hasInfo: info !== null,
		webpageUrl: info?.webpageUrl ?? null,
		liked: ctx.likes?.get(group.postId) ?? null,
	};
}

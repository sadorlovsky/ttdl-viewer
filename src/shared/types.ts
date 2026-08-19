/** The contract between the Bun server and the React app. Imported by both sides. */

export type ArchiveKind = "profile" | "list";
export type PostKind = "video" | "carousel";
export type PostStatus = "complete" | "incomplete";
/** Where `createdAt` came from, so the UI can mark an inferred date as inferred. */
export type DateSource = "info" | "filename" | "postid";

/** A deterministic generative avatar. No profile picture is ever downloaded, so none exists. */
export interface AvatarSeed {
	letter: string;
	hue: number;
}

export interface AuthorSummary {
	/** `uploader`, without the "@". Empty string when the archive gives no way to know. */
	handle: string;
	/** `channel` — the display nickname. */
	name: string | null;
	id: string | null;
	/** `channel_id`, the MS4wLjABAAAA… secUid. */
	secUid: string | null;
	/** Shown and copyable; never fetched. */
	profileUrl: string | null;
	postCount: number;
	avatar: AvatarSeed;
	/**
	 * A local URL for `avatar.jpg`, when ttdl recorded one — never a CDN address. The seed above
	 * stays either way: most authors in a list archive have no card, and a picture that fails to
	 * load must fall back to something rather than to an empty circle.
	 */
	avatarUrl: string | null;
}

/**
 * ttdl's `profile.json` — the author as TikTok described them on the day it was taken.
 *
 * Unlike everything else in an archive, this is a snapshot of something that moves, which is why
 * `fetchedAt` travels with it and every screen showing a count shows the date too.
 */
export interface ProfileCard {
	/** Unix seconds. Every number below has changed since. */
	fetchedAt: number;
	handle: string;
	nickname: string | null;
	/** The profile bio. */
	signature: string | null;
	bioLink: string | null;
	verified: boolean;
	private: boolean;
	/** When the account itself was created. */
	createdAt: number | null;
	stats: {
		followers: number | null;
		following: number | null;
		hearts: number | null;
		/** TikTok's own claim about the account, not a target: an archive can hold more. */
		videos: number | null;
		friends: number | null;
	};
}

export interface ArchiveCounts {
	/** Complete posts — what the default view shows. */
	posts: number;
	videos: number;
	carousels: number;
	/** Carousels whose audio is present but whose images are not all there. */
	incomplete: number;
	/** Metadata or a cover with no media file: a post that was deleted from disk. */
	ghosts: number;
	withoutInfo: number;
	/** Lines in archive.txt / .all_ids.txt / missing.txt — ttdl's own view of the same archive. */
	archived: number;
	known: number;
	missing: number;
}

export interface Archive {
	/** encodeURIComponent(directory name) — the key every API route takes. */
	id: string;
	name: string;
	kind: ArchiveKind;
	/** Contents of `.source`; list archives only. */
	source: string | null;
	displayPath: string;
	counts: ArchiveCounts;
	/**
	 * One for a profile archive, many for a list. Sorted by post count, descending.
	 *
	 * Empty on `/api/archives` — a list archive can carry thousands of authors, and the library
	 * grid only ever shows the count. `authorCount` below is the cheap version of the same fact;
	 * the full array is worth its weight only on the one archive's own page, from `/api/archives/:id`.
	 */
	authors: AuthorSummary[];
	authorCount: number;
	primaryAuthor: AuthorSummary | null;
	/** ttdl's author card, when `get` recorded one. A list archive never has one. */
	card: ProfileCard | null;
	dateRange: { first: number; last: number } | null;
	bytes: number;
	scannedAt: number;
	/** ttdl holds a .lock while it runs — the UI shows a "downloading now" banner. */
	downloadInProgress: boolean;
	cover: string | null;
}

export interface MediaRef {
	url: string;
	ext: string;
	bytes: number | null;
	width: number | null;
	height: number | null;
}

export interface PostStats {
	views: number | null;
	likes: number | null;
	comments: number | null;
	/** `repost_count`. */
	shares: number | null;
	saves: number | null;
}

export interface Post {
	id: string;
	archiveId: string;
	kind: PostKind;
	status: PostStatus;

	/** Unix seconds. Always present — the post id alone is enough to derive it. */
	createdAt: number;
	createdAtSource: DateSource;

	/** `info.title`, or the title segment of the filename when there is no metadata. */
	title: string;
	description: string | null;
	hashtags: string[];
	duration: number | null;

	author: AuthorSummary;
	music: { track: string | null; album: string | null; artists: string[] } | null;
	stats: PostStats;

	media: MediaRef & { kind: "video" | "audio"; fps: number | null; aspectRatio: number | null };
	cover: MediaRef | null;

	/** Carousel only. */
	photos: {
		/** Images actually on disk and non-empty. */
		count: number;
		/** From `_photo.json`; null for a legacy carousel with no recorded count. */
		expected: number | null;
		urls: string[];
	} | null;

	/**
	 * Decibels this post needs to play at the same loudness as the rest of the archive, from
	 * ttdl's `loudness.json`.
	 *
	 * Null when nothing measured this post: an archive ttdl has not run `loudness` over, a post
	 * with no soundtrack, a download that was cut short. Every one of those means the same thing
	 * to a player — leave the volume alone — but they are all different from a measured 0.0.
	 *
	 * Negative on most posts, since TikTok's own mixes sit well above any sane target. A positive
	 * one is already capped by the headroom the file's true peak leaves, so applying it in full
	 * cannot clip.
	 */
	loudnessGain: number | null;

	hasInfo: boolean;
	/** Displayed and copyable; never rendered as a live href. */
	webpageUrl: string | null;
	liked: { at: number; kind: "like" | "favorite" } | null;
}

export interface PostPage {
	items: Post[];
	total: number;
	/** Opaque keyset cursor. Null means the end. */
	cursor: string | null;
}

export type PostSort =
	| "date"
	| "likes"
	| "views"
	| "comments"
	| "saves"
	| "duration"
	| "liked"
	| "random";

export interface PostQuery {
	q?: string;
	author?: string[];
	kind?: PostKind;
	status?: PostStatus | "all";
	/** YYYY-MM-DD. */
	from?: string;
	to?: string;
	minDuration?: number;
	maxDuration?: number;
	hashtag?: string[];
	sort?: PostSort;
	order?: "asc" | "desc";
	seed?: string;
	limit?: number;
	cursor?: string;
}

export interface ApiError {
	error: { code: string; message: string; hint?: string };
}

export interface Stats {
	root: string;
	likesDir: string | null;
	archives: number;
	posts: number;
	bytes: number;
	builtAt: number | null;
	version: string;
}

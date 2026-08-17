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
	/** One for a profile archive, many for a list. Sorted by post count, descending. */
	authors: AuthorSummary[];
	primaryAuthor: AuthorSummary | null;
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

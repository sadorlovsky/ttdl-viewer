import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { avatarSeed } from "../../shared/avatar.ts";
import type { Archive, ArchiveCounts, AuthorSummary, Post } from "../../shared/types.ts";
import { buildPost, UNKNOWN_HANDLE } from "./build.ts";
import { readInfo } from "./info.ts";
import { type LikesIndex, readLikedState } from "./likes.ts";
import { readCard } from "./profile.ts";
import {
	type ArchiveScan,
	archiveStamp,
	listArchiveDirs,
	readExpected,
	scanArchive,
} from "./scan.ts";

/** Where an archive's saving dates came from — for the startup line, not for the API. */
export type LikedFrom = "ttdl" | "export" | null;

export interface IndexedArchive {
	archive: Archive;
	scan: ArchiveScan;
	likedFrom: LikedFrom;
	/** Newest first — the default order for every screen. */
	posts: Post[];
	postsById: Map<string, Post>;
	/** The cheap probe as it read when this index was built — see `archiveStamp`. */
	stamp: string;
}

/** Count the lines of one of ttdl's state files, so the UI can show ttdl's own view of the gap. */
function countLines(dir: string, name: string, present: boolean): number {
	if (!present) {
		return 0;
	}
	try {
		const text = readFileSync(join(dir, name), "utf8");
		return text.split("\n").filter((line) => line.trim() !== "").length;
	} catch {
		return 0;
	}
}

function collectAuthors(posts: Post[]): AuthorSummary[] {
	const byHandle = new Map<string, AuthorSummary>();
	for (const post of posts) {
		const existing = byHandle.get(post.author.handle);
		if (existing) {
			existing.postCount++;
			// A post that carries metadata can fill in fields an earlier bare post left null.
			existing.name ??= post.author.name;
			existing.id ??= post.author.id;
			existing.secUid ??= post.author.secUid;
			existing.profileUrl ??= post.author.profileUrl;
			if (existing.name && existing.avatar.letter === "?") {
				existing.avatar = avatarSeed(existing.handle, existing.name);
			}
		} else {
			byHandle.set(post.author.handle, { ...post.author, postCount: 1 });
		}
	}
	return [...byHandle.values()].sort(
		(a, b) => b.postCount - a.postCount || a.handle.localeCompare(b.handle),
	);
}

/**
 * When each post in this archive was saved, and where that answer came from.
 *
 * Only an archive built from a list has such a date at all. A profile archive holds posts an
 * account published, not posts anybody saved, so ttdl records nothing for one — and the viewer
 * used to disagree, applying a single export to every archive at once. That put a saving date on
 * the handful of posts you had happened to like from an account you also archive in full: seven
 * posts out of 3,307 in one archive here, which is not an ordering anyone can use and not a claim
 * the archive supports.
 *
 * `.liked.json` first, because it is ttdl's own answer and needs no searching. The export is read
 * only for a list archive ttdl was never handed one for.
 */
function likedFor(scan: ArchiveScan, fallback: LikesIndex): { likes: LikesIndex; from: LikedFrom } {
	if (scan.source === null) {
		return { likes: EMPTY_LIKES, from: null };
	}
	const recorded = readLikedState(scan.dir);
	if (recorded) {
		return { likes: recorded, from: "ttdl" };
	}
	return fallback.size > 0
		? { likes: fallback, from: "export" }
		: { likes: EMPTY_LIKES, from: null };
}

const EMPTY_LIKES: LikesIndex = new Map();

function indexArchive(root: string, name: string, fallback: LikesIndex): IndexedArchive {
	const scan = scanArchive(root, name);
	const archiveId = encodeURIComponent(name);
	// A list archive's directory name says nothing about authorship (ttdl downloads those posts
	// through /@/video/<id>, so `owner` is empty) — only .info.json can name the author there.
	const kind = scan.source !== null ? "list" : "profile";
	const fallbackHandle = kind === "profile" ? name : UNKNOWN_HANDLE;
	const { likes, from: likedFrom } = likedFor(scan, fallback);

	const posts: Post[] = [];
	let ghosts = 0;
	let withoutInfo = 0;

	for (const group of scan.groups.values()) {
		if (!group.media) {
			ghosts++;
			continue;
		}
		const info = readInfo(scan.dir, group.info?.name);
		const expected = readExpected(scan.dir, group.photoState);
		const post = buildPost(group, info, { archiveId, fallbackHandle, expected, likes });
		if (!post) {
			ghosts++;
			continue;
		}
		if (!post.hasInfo) {
			withoutInfo++;
		}
		posts.push(post);
	}

	posts.sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? 1 : -1));

	const counts: ArchiveCounts = {
		posts: posts.filter((p) => p.status === "complete").length,
		videos: posts.filter((p) => p.kind === "video").length,
		carousels: posts.filter((p) => p.kind === "carousel").length,
		incomplete: posts.filter((p) => p.status === "incomplete").length,
		ghosts,
		withoutInfo,
		archived: countLines(scan.dir, "archive.txt", scan.stateFiles.has("archive.txt")),
		known: countLines(scan.dir, ".all_ids.txt", scan.stateFiles.has(".all_ids.txt")),
		missing: countLines(scan.dir, "missing.txt", scan.stateFiles.has("missing.txt")),
	};

	const authors = collectAuthors(posts);
	const card = scan.card ? readCard(scan.dir) : null;
	// Matched by the handle the card names, not by position: a directory can be renamed, and the
	// wrong face on the wrong person is worse than no face at all. `?v=` is the picture's mtime,
	// which is what makes the immutable cache header on the media route safe after a replacement.
	if (card && scan.avatar) {
		const url = `/media/${archiveId}/avatar?v=${Math.floor(scan.avatar.mtimeMs)}`;
		for (const author of authors) {
			if (author.handle === card.handle) {
				author.avatarUrl = url;
			}
		}
		// Again over the posts: each carries its own copy of the author, and that copy is what the
		// feed's action rail renders.
		for (const post of posts) {
			if (post.author.handle === card.handle) {
				post.author.avatarUrl = url;
			}
		}
	}
	const newest = posts[0];
	const oldest = posts[posts.length - 1];

	const archive: Archive = {
		id: archiveId,
		name,
		kind,
		source: scan.source,
		displayPath: scan.dir,
		counts,
		authors,
		authorCount: authors.length,
		primaryAuthor: kind === "profile" ? (authors[0] ?? null) : null,
		card,
		dateRange: newest && oldest ? { first: oldest.createdAt, last: newest.createdAt } : null,
		bytes: scan.bytes,
		scannedAt: Math.floor(Date.now() / 1000),
		downloadInProgress: scan.locked,
		cover: posts.find((p) => p.cover)?.cover?.url ?? null,
	};

	return {
		archive,
		scan,
		likedFrom,
		posts,
		postsById: new Map(posts.map((p) => [p.id, p])),
		// Taken after the scan, never before: a file that landed while we were reading would
		// otherwise be covered by a stamp that predates it and stay invisible until the next change.
		stamp: archiveStamp(root, name),
	};
}

/**
 * How long an archive under an active download may go on serving a stale index.
 *
 * A run moves its directory with every file it writes, so without a bound the viewer would reindex
 * on every request and spend more time scanning than answering. An idle archive has no such
 * problem and is checked each time.
 */
const LOCKED_REVALIDATE_MS = 30_000;

/**
 * The in-memory index.
 *
 * It owns two different things on purpose. The post objects are what the JSON API serves; the
 * `scan.groups` map is what turns a URL into a filename, and it is the only thing that ever does.
 * No string from a request is joined into a path anywhere — an archive id is looked up in a closed
 * set, a post id in that archive's map, and the filename comes out of the group.
 */
export class Registry {
	private archives = new Map<string, IndexedArchive>();
	private builtAt: number | null = null;
	/** When each archive was last reindexed, to bound how often a running download triggers one. */
	private reindexedAt = new Map<string, number>();

	constructor(
		private readonly root: string,
		/**
		 * The export found beside the archives, for list archives ttdl never recorded dates for.
		 * Empty when there is none; those posts then have `liked: null` and sorting by it puts
		 * them all last.
		 */
		private readonly fallbackLikes: LikesIndex = new Map(),
		/** Root-level names the export search claimed, which are therefore not archives. */
		private readonly notArchives: ReadonlySet<string> = new Set(),
	) {}

	rebuild(): void {
		const next = new Map<string, IndexedArchive>();
		for (const name of listArchiveDirs(this.root, this.notArchives)) {
			try {
				const indexed = indexArchive(this.root, name, this.fallbackLikes);
				next.set(indexed.archive.name, indexed);
			} catch (error) {
				// One unreadable directory must not take down the whole app; a folder that fails
				// to index is far less confusing than a server that will not start.
				console.error(`failed to index ${name}:`, error);
			}
		}
		this.archives = next;
		this.reindexedAt = new Map([...next.keys()].map((name) => [name, Date.now()]));
		this.builtAt = Math.floor(Date.now() / 1000);
	}

	/** Rebuild one archive's index in place. Null when its directory cannot be read at all. */
	private reindex(name: string): IndexedArchive | null {
		this.reindexedAt.set(name, Date.now());
		try {
			const indexed = indexArchive(this.root, name, this.fallbackLikes);
			this.archives.set(name, indexed);
			return indexed;
		} catch (error) {
			// The directory can be gone, renamed, or unreadable by the time this runs. Guarding
			// each stat covered a vanished file; the directory itself failing has to answer with a
			// refusal, not a 500.
			console.error(`failed to rescan ${name}:`, error);
			return null;
		}
	}

	/**
	 * Reindex an archive whose files moved since it was indexed.
	 *
	 * This is what keeps the viewer current without a filesystem watcher: ttdl writes, and the next
	 * request notices. The probe is a handful of stats — 0.02 ms against a reindex's 780 — so an
	 * idle archive pays essentially nothing to be checked on every request.
	 */
	private revalidate(indexed: IndexedArchive): IndexedArchive {
		const name = indexed.archive.name;
		if (archiveStamp(this.root, name) === indexed.stamp) {
			return indexed;
		}
		// Something moved. A run rewrites its directory continuously, so an archive being written
		// to right now is held to an interval rather than reindexed per request — but only while
		// the lock is still there, because the run ending is itself the change most worth seeing.
		if (existsSync(join(this.root, name, ".lock"))) {
			if (Date.now() - (this.reindexedAt.get(name) ?? 0) < LOCKED_REVALIDATE_MS) {
				return indexed;
			}
		}
		return this.reindex(name) ?? indexed;
	}

	/**
	 * Pick up archives that appeared or vanished since the last look.
	 *
	 * A first download creates its directory while the server is already running, and nothing else
	 * here would ever look for it — the index is built from one listing at startup.
	 */
	private sync(): void {
		let names: Set<string>;
		try {
			names = new Set(listArchiveDirs(this.root, this.notArchives));
		} catch (error) {
			// The root being unreadable for a moment is no reason to forget what is already
			// indexed; serving a stale list beats serving an empty one.
			console.error(`failed to list ${this.root}:`, error);
			return;
		}
		for (const name of names) {
			if (!this.archives.has(name)) {
				this.reindex(name);
			}
		}
		for (const name of [...this.archives.keys()]) {
			if (!names.has(name)) {
				this.archives.delete(name);
				this.reindexedAt.delete(name);
			}
		}
	}

	rescan(archiveId: string): IndexedArchive | null {
		const existing = this.peek(archiveId);
		return existing ? this.reindex(existing.archive.name) : null;
	}

	/**
	 * Look an archive up by the id the client put in a URL.
	 *
	 * The map is keyed by the directory name, not by `archive.id`. The id is that name percent-
	 * encoded so it can sit in a path, and Bun's router hands `params` back already decoded — so an
	 * archive called "TikTok Saved" arrives here as "TikTok Saved" while its id is "TikTok%20Saved".
	 * Keying by the encoded form made every archive whose name needed encoding unreachable, which
	 * a name like "downloads" never revealed. Decoding is still attempted for a caller that passes
	 * the id verbatim, and a malformed escape is a miss rather than a thrown URIError.
	 */
	get(archiveId: string): IndexedArchive | undefined {
		const existing = this.peek(archiveId);
		if (existing) {
			return this.revalidate(existing);
		}
		// A miss is not necessarily a 404: the archive may have been created after startup.
		this.sync();
		return this.peek(archiveId);
	}

	/**
	 * The indexed archive exactly as it stands, without checking the disk.
	 *
	 * `rescan` uses this to read the index it is about to replace — going through `get` would
	 * revalidate first and then report that its own rescan changed nothing.
	 */
	peek(archiveId: string): IndexedArchive | undefined {
		const direct = this.archives.get(archiveId);
		if (direct) {
			return direct;
		}
		try {
			return this.archives.get(decodeURIComponent(archiveId));
		} catch {
			return undefined;
		}
	}

	list(): IndexedArchive[] {
		this.sync();
		// Over a copy: revalidating replaces entries in the map being walked.
		for (const indexed of [...this.archives.values()]) {
			this.revalidate(indexed);
		}
		return [...this.archives.values()].sort(
			(a, b) => b.archive.counts.posts - a.archive.counts.posts,
		);
	}

	stats() {
		let posts = 0;
		let bytes = 0;
		for (const indexed of this.archives.values()) {
			posts += indexed.posts.length;
			bytes += indexed.archive.bytes;
		}
		return { archives: this.archives.size, posts, bytes, builtAt: this.builtAt };
	}
}

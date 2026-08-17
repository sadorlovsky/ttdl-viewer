import { readFileSync } from "node:fs";
import { join } from "node:path";
import { avatarSeed } from "../../shared/avatar.ts";
import type { Archive, ArchiveCounts, AuthorSummary, Post } from "../../shared/types.ts";
import { buildPost, UNKNOWN_HANDLE } from "./build.ts";
import { readInfo } from "./info.ts";
import { type ArchiveScan, listArchiveDirs, readExpected, scanArchive } from "./scan.ts";

export interface IndexedArchive {
	archive: Archive;
	scan: ArchiveScan;
	/** Newest first — the default order for every screen. */
	posts: Post[];
	postsById: Map<string, Post>;
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

function indexArchive(root: string, name: string): IndexedArchive {
	const scan = scanArchive(root, name);
	const archiveId = encodeURIComponent(name);
	// A list archive's directory name says nothing about authorship (ttdl downloads those posts
	// through /@/video/<id>, so `owner` is empty) — only .info.json can name the author there.
	const kind = scan.source !== null ? "list" : "profile";
	const fallbackHandle = kind === "profile" ? name : UNKNOWN_HANDLE;

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
		const post = buildPost(group, info, { archiveId, fallbackHandle, expected });
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
		primaryAuthor: kind === "profile" ? (authors[0] ?? null) : null,
		dateRange: newest && oldest ? { first: oldest.createdAt, last: newest.createdAt } : null,
		bytes: scan.bytes,
		scannedAt: Math.floor(Date.now() / 1000),
		downloadInProgress: scan.locked,
		cover: posts.find((p) => p.cover)?.cover?.url ?? null,
	};

	return {
		archive,
		scan,
		posts,
		postsById: new Map(posts.map((p) => [p.id, p])),
	};
}

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

	constructor(private readonly root: string) {}

	rebuild(): void {
		const next = new Map<string, IndexedArchive>();
		for (const name of listArchiveDirs(this.root)) {
			try {
				const indexed = indexArchive(this.root, name);
				next.set(indexed.archive.name, indexed);
			} catch (error) {
				// One unreadable directory must not take down the whole app; a folder that fails
				// to index is far less confusing than a server that will not start.
				console.error(`failed to index ${name}:`, error);
			}
		}
		this.archives = next;
		this.builtAt = Math.floor(Date.now() / 1000);
	}

	rescan(archiveId: string): IndexedArchive | null {
		const existing = this.get(archiveId);
		if (!existing) {
			return null;
		}
		try {
			const indexed = indexArchive(this.root, existing.archive.name);
			this.archives.set(existing.archive.name, indexed);
			return indexed;
		} catch (error) {
			// Same reasoning as rebuild: the directory can be gone, renamed, or unreadable by the
			// time a rescan asks for it. Guarding each stat covered a vanished file; the directory
			// itself failing has to answer with a refusal, not a 500.
			console.error(`failed to rescan ${existing.archive.name}:`, error);
			return null;
		}
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

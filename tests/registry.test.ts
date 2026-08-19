/**
 * Keeping the in-memory index current while ttdl writes underneath it.
 *
 * The index is built from one listing at startup, so without this a download that finished ten
 * minutes ago stays invisible until the server restarts. These tests pin when a reindex happens
 * and — just as much — when it must not: an archive being written to right now would otherwise be
 * rebuilt on every request, and each rebuild costs three orders of magnitude more than the check.
 *
 * The sleeps are not padding. The change probe reads mtimes at millisecond resolution, and these
 * tests write their files far faster than that; real archives are written seconds apart.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Registry } from "../src/server/index/registry.ts";

function postId(tail: number, timestamp = 1_704_067_200): string {
	return ((BigInt(timestamp) << 32n) | BigInt(tail)).toString();
}

let root: string;
let dir: string;

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "ttdl-viewer-registry-"));
	dir = join(root, "acc");
	mkdirSync(dir);
});

afterEach(() => {
	rmSync(root, { recursive: true, force: true });
});

/** One post, in the shape ttdl leaves behind: a dated filename carrying the id. */
function addPost(where: string, tail: number): void {
	writeFileSync(join(where, `20240101_${postId(tail)}_clip.mp4`), "video");
}

function built(): Registry {
	const registry = new Registry(root);
	registry.rebuild();
	return registry;
}

describe("when each post was saved", () => {
	/** ttdl marks an archive built from a list with `.source`; a profile archive has none. */
	function asList(where: string): void {
		writeFileSync(join(where, ".source"), "downloads/ids.txt\n");
	}

	function record(where: string, id: string, at: number): void {
		writeFileSync(join(where, ".liked.json"), JSON.stringify({ [id]: { at, kind: "like" } }));
	}

	test("comes from what ttdl recorded beside the archive", () => {
		const id = postId(1);
		addPost(dir, 1);
		asList(dir);
		record(dir, id, 1662317057);

		const post = built().get("acc")?.posts[0];
		expect(post?.liked).toEqual({ at: 1662317057, kind: "like" });
	});

	test("falls back to an export only where ttdl recorded nothing", () => {
		const id = postId(1);
		addPost(dir, 1);
		asList(dir);

		const fallback = new Map([[id, { at: 999, kind: "like" as const }]]);
		const registry = new Registry(root, fallback);
		registry.rebuild();
		expect(registry.get("acc")?.posts[0]?.liked?.at).toBe(999);
		expect(registry.get("acc")?.likedFrom).toBe("export");
	});

	test("what ttdl recorded wins over an export sitting in the root", () => {
		const id = postId(1);
		addPost(dir, 1);
		asList(dir);
		record(dir, id, 1662317057);

		const registry = new Registry(root, new Map([[id, { at: 999, kind: "like" as const }]]));
		registry.rebuild();
		// The export is a snapshot someone downloaded by hand; ttdl's cache is the archive's own
		// answer, and it is the one that stays true after the export folder is deleted.
		expect(registry.get("acc")?.posts[0]?.liked?.at).toBe(1662317057);
		expect(registry.get("acc")?.likedFrom).toBe("ttdl");
	});

	test("a profile archive gets none, even when the export knows the post", () => {
		const id = postId(1);
		addPost(dir, 1);
		// No .source: these posts were published by the account, not saved by anybody. An export
		// naming one of them means you once liked it, which is not a date this archive can order by
		// — it would apply to a handful of posts and leave the rest null.
		const registry = new Registry(root, new Map([[id, { at: 999, kind: "like" as const }]]));
		registry.rebuild();
		expect(registry.get("acc")?.posts[0]?.liked).toBeNull();
		expect(registry.get("acc")?.likedFrom).toBeNull();
	});

	test("a run that records dates is picked up without a restart", () => {
		const id = postId(1);
		addPost(dir, 1);
		asList(dir);
		const registry = built();
		expect(registry.get("acc")?.posts[0]?.liked).toBeNull();

		Bun.sleepSync(2);
		record(dir, id, 1662317057);

		// .liked.json is in the change probe, so ttdl writing one has to invalidate the index —
		// otherwise the dates appear only after the server is restarted.
		expect(registry.get("acc")?.posts[0]?.liked?.at).toBe(1662317057);
	});
});

describe("a directory that is not an archive", () => {
	test("is kept out of the library, at startup and on every later look", () => {
		addPost(dir, 1);
		mkdirSync(join(root, "tiktok-export"));

		const registry = new Registry(root, new Map(), new Set(["tiktok-export"]));
		registry.rebuild();
		expect(registry.list().map((a) => a.archive.name)).toEqual(["acc"]);

		// sync() runs off its own listing, so a claimed name has to be honoured there too — or the
		// export folder reappears as an empty archive the moment anything triggers a resync.
		expect(registry.get("tiktok-export")).toBeUndefined();
		expect(registry.list().map((a) => a.archive.name)).toEqual(["acc"]);
	});
});

describe("an archive that changed on disk", () => {
	test("is reindexed on the next look", () => {
		addPost(dir, 1);
		const registry = built();
		expect(registry.get("acc")?.posts).toHaveLength(1);

		Bun.sleepSync(2);
		addPost(dir, 2);

		expect(registry.get("acc")?.posts).toHaveLength(2);
	});

	test("is left alone when nothing moved", () => {
		addPost(dir, 1);
		const registry = built();
		const first = registry.get("acc");

		// Identity rather than contents: a reindex would hand back a newly built object, and the
		// point here is that it does not run at all.
		expect(registry.get("acc")).toBe(first);
	});

	test("is not reread by peek, which rescan needs to report what changed", () => {
		addPost(dir, 1);
		const registry = built();

		Bun.sleepSync(2);
		addPost(dir, 2);

		expect(registry.peek("acc")?.posts).toHaveLength(1);
		expect(registry.get("acc")?.posts).toHaveLength(2);
	});
});

describe("an archive with a download in progress", () => {
	test("is held to an interval instead of reindexed per request", () => {
		addPost(dir, 1);
		writeFileSync(join(dir, ".lock"), "4242");
		const registry = built();
		const first = registry.get("acc");

		Bun.sleepSync(2);
		addPost(dir, 2);

		expect(registry.get("acc")).toBe(first);
	});

	test("is reindexed as soon as the lock is gone", () => {
		addPost(dir, 1);
		writeFileSync(join(dir, ".lock"), "4242");
		const registry = built();
		registry.get("acc");

		Bun.sleepSync(2);
		addPost(dir, 2);
		// The run finishing is the change most worth seeing, so it does not wait out the interval.
		unlinkSync(join(dir, ".lock"));

		expect(registry.get("acc")?.posts).toHaveLength(2);
	});
});

describe("an archive directory that appears after startup", () => {
	test("shows up in the list", () => {
		addPost(dir, 1);
		const registry = built();
		expect(registry.list()).toHaveLength(1);

		const later = join(root, "later");
		mkdirSync(later);
		addPost(later, 2);

		expect(registry.list().map((a) => a.archive.name)).toEqual(["acc", "later"]);
	});

	test("is served by id rather than answering 404", () => {
		const registry = built();

		const later = join(root, "later");
		mkdirSync(later);
		addPost(later, 2);

		expect(registry.get("later")?.posts).toHaveLength(1);
	});
});

describe("an archive directory that vanished", () => {
	test("drops out of the list", () => {
		addPost(dir, 1);
		const registry = built();
		rmSync(dir, { recursive: true, force: true });

		expect(registry.list()).toHaveLength(0);
	});
});

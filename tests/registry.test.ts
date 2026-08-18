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

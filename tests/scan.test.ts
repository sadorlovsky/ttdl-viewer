/**
 * Scanning an archive that is being written underneath us.
 *
 * ttdl and this viewer are expected to run at the same time, so a name returned by readdir can be
 * gone by the time we stat it. That used to throw straight out of scanArchive and take the whole
 * archive out of the index; these tests pin the tolerance, and the date-provenance rule that the
 * same pass got wrong.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { scanArchive } from "../src/server/index/scan.ts";

function postId(tail: number, timestamp = 1_704_067_200): string {
	return ((BigInt(timestamp) << 32n) | BigInt(tail)).toString();
}

let root: string;
let dir: string;

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "ttdl-viewer-scan-"));
	dir = join(root, "archive");
	mkdirSync(dir);
});

afterEach(() => {
	// The unreadable-directory test drops the permission bits; put them back so cleanup works.
	try {
		chmodSync(dir, 0o700);
	} catch {
		// already gone, or never changed
	}
	rmSync(root, { recursive: true, force: true });
});

const scan = () => scanArchive(dirname(dir), basename(dir));
const write = (name: string, content = "x") => writeFileSync(join(dir, name), content);

describe("a file that cannot be stat'd", () => {
	test("is skipped without taking the archive down", () => {
		const id = postId(1);
		write(`20240101_${id}_clip.mp4`, "video");

		// Read but not search: readdir still lists the entries, statSync on any of them fails.
		chmodSync(dir, 0o400);
		if (canStat(join(dir, `20240101_${id}_clip.mp4`))) {
			// Running as a user who bypasses the permission check (root); the race this stands in
			// for cannot be reproduced here, so do not assert on a setup that did not take.
			return;
		}

		// The point: this returns rather than throwing. Before the guard it threw ENOENT/EACCES
		// out of scanArchive, and the caller dropped the entire archive from the index.
		const result = scan();
		expect(result.groups.size).toBe(0);
		expect(result.bytes).toBe(0);
	});
});

function canStat(path: string): boolean {
	try {
		statSync(path);
		return true;
	} catch {
		return false;
	}
}

describe("date provenance", () => {
	test("a dated media file sets datePart", () => {
		const id = postId(2);
		write(`20240101_${id}_clip.mp4`, "video");
		expect(scan().groups.get(id)?.datePart).toBe("20240101");
	});

	test("an NA media file leaves datePart null even when its images are dated", () => {
		// ttdl names carousel sidecars off the title-less prefix, and their date segment can
		// differ from the audio's. Taking the date from them would claim a filename told us the
		// upload date when none did, and the UI would drop its "inferred" badge.
		const id = postId(3);
		write(`NA_${id}_sound.m4a`, "audio");
		write(`20240101_${id}_photo_01.jpg`, "image");
		write(`20240101_${id}_photo.json`, JSON.stringify({ expected: 1 }));

		const group = scan().groups.get(id);
		expect(group?.datePart).toBeNull();
		// The images still group with the audio — only the date is refused.
		expect(group?.photos.size).toBe(1);
	});

	test("a cover alone never supplies a date, because it never makes a post", () => {
		const id = postId(4);
		write(`20240101_${id}_ghost.jpg`, "image");
		write(`20240101_${id}_ghost.info.json`, "{}");

		const group = scan().groups.get(id);
		expect(group?.media).toBeUndefined();
		expect(group?.datePart).toBeNull();
	});
});

describe("listing hash", () => {
	test("is stable across scans of an unchanged directory", () => {
		write(`20240101_${postId(5)}_clip.mp4`, "video");
		expect(scan().listingHash).toBe(scan().listingHash);
	});

	test("changes when a post is added", () => {
		write(`20240101_${postId(6)}_clip.mp4`, "video");
		const before = scan().listingHash;
		write(`20240102_${postId(7)}_other.mp4`, "video");
		expect(scan().listingHash).not.toBe(before);
	});
});

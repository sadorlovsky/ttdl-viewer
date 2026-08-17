/**
 * Parity with ttdl's completeness rule.
 *
 * Every case here is ported from `/Users/zach/code/ttdl/tests/test_ttdl.py:52-140`. The point is
 * not to test our own code twice — it is that if ttdl's rule ever changes, this suite is what
 * tells us, instead of the viewer quietly disagreeing with the tool that wrote the files.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { classify } from "../src/server/index/complete.ts";
import { readExpected, scanArchive } from "../src/server/index/scan.ts";

/** ttdl's `post_id` test helper: upper 32 bits are a timestamp, lower bits a counter. */
function postId(tail: number, timestamp = 1_704_067_200): string {
	return ((BigInt(timestamp) << 32n) | BigInt(tail)).toString();
}

let root: string;
let dir: string;

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "ttdl-viewer-parity-"));
	dir = join(root, "archive");
	mkdirSync(dir);
});

afterEach(() => {
	rmSync(root, { recursive: true, force: true });
});

function write(name: string, content = "x"): void {
	writeFileSync(join(dir, name), content);
}

/** The set of post ids this archive considers complete — our equivalent of `complete_ids`. */
function completeIds(): Set<string> {
	const scan = scanArchive(dirname(dir), basename(dir));
	const ids = new Set<string>();
	for (const [id, group] of scan.groups) {
		const result = classify(group, readExpected(scan.dir, group.photoState));
		if (result?.status === "complete") {
			ids.add(id);
		}
	}
	return ids;
}

function classifyOne(id: string) {
	const scan = scanArchive(dirname(dir), basename(dir));
	const group = scan.groups.get(id);
	return group ? classify(group, readExpected(scan.dir, group.photoState)) : null;
}

describe("complete_ids parity", () => {
	test("photo audio requires a picture; a lone cover and a foreign name are not posts", () => {
		const video = postId(1);
		const carousel = postId(2);
		const audioOnly = postId(3);

		write(`20240101_${video}_video.mp4`);
		write(`20240101_${carousel}_sound.m4a`);
		write(`20240101_${carousel}_photo_01.JPG`); // uppercase extension counts, as in ttdl
		write(`20240101_${audioOnly}_sound.mp3`);
		write(`20240101_${video}_thumb.jpg`);
		write("not-an-archive-file.mp4");

		expect(completeIds()).toEqual(new Set([video, carousel]));
		// The audio-only post is still a post — just an incomplete one. ttdl drops it; we surface it.
		expect(classifyOne(audioOnly)).toEqual({ kind: "carousel", status: "incomplete" });
	});

	test("a state file with a count rejects a partial carousel, and accepts it once filled", () => {
		const carousel = postId(4);
		const prefix = `20240101_${carousel}`;

		write(`${prefix}_sound.m4a`, "audio");
		write(`${prefix}_photo_01.jpg`, "image");
		write(`${prefix}_photo.json`, JSON.stringify({ expected: 3, status: "partial" }));

		expect(completeIds()).toEqual(new Set());

		write(`${prefix}_photo_02.jpg`, "image");
		write(`${prefix}_photo_03.jpg`, "image");
		write(`${prefix}_photo.json`, JSON.stringify({ expected: 3, status: "complete" }));
		write(`${prefix}_photo.complete`, "complete\n");

		expect(completeIds()).toEqual(new Set([carousel]));
	});

	test("a legacy carousel whose repair never reached the page stays complete", () => {
		const carousel = postId(5);
		const prefix = `20240101_${carousel}`;

		write(`${prefix}_sound.m4a`, "audio");
		write(`${prefix}_photo_01.jpg`, "image");
		// expected: null means the count is unknown; the post was complete before and must stay so.
		write(`${prefix}_photo.json`, JSON.stringify({ expected: null, status: "unavailable" }));

		expect(completeIds()).toEqual(new Set([carousel]));
	});

	test("a legacy carousel with no state file at all stays complete", () => {
		const carousel = postId(6);
		const prefix = `20240101_${carousel}`;

		write(`${prefix}_sound.m4a`, "audio");
		for (const i of [1, 2, 3]) {
			write(`${prefix}_photo_0${i}.jpg`, "image");
		}

		expect(completeIds()).toEqual(new Set([carousel]));
	});

	test("incomplete carousels are exactly those still missing images", () => {
		const [done, partial, bare, video] = [postId(7), postId(8), postId(9), postId(10)];

		write(`20240101_${video}_clip.mp4`, "video");

		write(`20240101_${done}_sound.m4a`, "audio");
		write(`20240101_${done}_photo_01.jpg`, "image");
		write(`20240101_${done}_photo.json`, JSON.stringify({ expected: 1 }));

		write(`20240101_${partial}_sound.m4a`, "audio");
		write(`20240101_${partial}_photo_01.jpg`, "image");
		write(`20240101_${partial}_photo.json`, JSON.stringify({ expected: 2 }));

		write(`20240101_${bare}_sound.mp3`, "audio");

		expect(completeIds()).toEqual(new Set([done, video]));
		expect(classifyOne(partial)?.status).toBe("incomplete");
		expect(classifyOne(bare)?.status).toBe("incomplete");
	});
});

describe("completeness details ttdl relies on but does not spell out in its tests", () => {
	test("a zero-byte image does not count (ttdl has_content)", () => {
		const carousel = postId(11);
		const prefix = `20240101_${carousel}`;

		write(`${prefix}_sound.m4a`, "audio");
		write(`${prefix}_photo_01.jpg`, "image");
		write(`${prefix}_photo_02.jpg`, ""); // empty = failed download
		write(`${prefix}_photo.json`, JSON.stringify({ expected: 2 }));

		expect(completeIds()).toEqual(new Set());
	});

	test("an orphan info.json and cover never become a post", () => {
		const ghost = postId(12);
		write(`20240101_${ghost}_deleted.info.json`, "{}");
		write(`20240101_${ghost}_deleted.jpg`, "image");

		expect(completeIds()).toEqual(new Set());
		expect(classifyOne(ghost)).toBeNull();
	});

	test("a carousel groups by id even when its audio and images carry different dates", () => {
		const carousel = postId(13);
		write(`NA_${carousel}_sound.m4a`, "audio");
		write(`20240101_${carousel}_photo_01.jpg`, "image");
		write(`20240101_${carousel}_photo_02.jpg`, "image");
		write(`20240101_${carousel}_photo.json`, JSON.stringify({ expected: 2 }));

		expect(completeIds()).toEqual(new Set([carousel]));
	});

	test("a malformed state file reads as 'count unknown', not as zero", () => {
		const carousel = postId(14);
		const prefix = `20240101_${carousel}`;
		write(`${prefix}_sound.m4a`, "audio");
		write(`${prefix}_photo_01.jpg`, "image");
		write(`${prefix}_photo.json`, "{ truncated");

		// Falls back to the legacy rule rather than declaring the post broken.
		expect(completeIds()).toEqual(new Set([carousel]));
	});

	test("expected: 0 is not a complete carousel", () => {
		const carousel = postId(15);
		const prefix = `20240101_${carousel}`;
		write(`${prefix}_sound.m4a`, "audio");
		write(`${prefix}_photo.json`, JSON.stringify({ expected: 0 }));

		expect(completeIds()).toEqual(new Set());
	});
});

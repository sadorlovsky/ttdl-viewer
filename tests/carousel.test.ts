/**
 * Where a carousel's missing images actually are.
 *
 * A download can stop after image 3 of 5, but it can also lose image 2 on its own. The played
 * sequence is dense either way — it is the pictures that exist — so the positions have to travel
 * beside it, or the strip can only guess that every gap is at the end.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildPost } from "../src/server/index/build.ts";
import { readExpected, scanArchive } from "../src/server/index/scan.ts";
import { STATE_DIR } from "../src/server/index/state.ts";
import { segmentSlots } from "../src/web/feed/carousel.ts";

function postId(tail: number, timestamp = 1_704_067_200): string {
	return ((BigInt(timestamp) << 32n) | BigInt(tail)).toString();
}

let root: string;
let dir: string;

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "ttdl-viewer-carousel-"));
	dir = join(root, "archive");
	mkdirSync(join(dir, STATE_DIR), { recursive: true });
});

afterEach(() => {
	rmSync(root, { recursive: true, force: true });
});

/** A carousel whose images are the given positions, out of `expected`. */
function carousel(id: string, present: number[], expected: number | null): void {
	const prefix = `20240101_${id}`;
	writeFileSync(join(dir, `${prefix}_sound.m4a`), "audio");
	for (const at of present) {
		writeFileSync(join(dir, `${prefix}_photo_${String(at).padStart(2, "0")}.jpg`), "image");
	}
	writeFileSync(join(dir, `${prefix}_photo.json`), JSON.stringify({ expected }));
}

function build(id: string) {
	const scan = scanArchive(root, "archive");
	const group = scan.groups.get(id);
	if (!group) {
		throw new Error(`no group for ${id}`);
	}
	return buildPost(group, null, {
		archiveId: "a1",
		fallbackHandle: "handle",
		expected: readExpected(scan.dir, group.photoState),
	});
}

describe("carousel positions", () => {
	test("a gap in the middle keeps the positions of the images around it", () => {
		const id = postId(1);
		carousel(id, [1, 3], 3);

		const post = build(id);

		expect(post?.photos?.count).toBe(2);
		expect(post?.photos?.expected).toBe(3);
		// Image 2 is the one that never arrived. Without these the strip would call image 3
		// missing and show image 3 in image 2's place.
		expect(post?.photos?.indexes).toEqual([1, 3]);
		expect(post?.photos?.urls[0]).toContain("/photo/1?");
		expect(post?.photos?.urls[1]).toContain("/photo/3?");
	});

	test("a download that stopped early reads as trailing, because it is", () => {
		const id = postId(2);
		carousel(id, [1, 2], 4);

		const post = build(id);

		expect(post?.photos?.indexes).toEqual([1, 2]);
		expect(post?.photos?.count).toBe(2);
	});

	test("a legacy carousel with no recorded count still carries its positions", () => {
		const id = postId(3);
		carousel(id, [1, 2, 3], null);

		const post = build(id);

		expect(post?.photos?.expected).toBeNull();
		expect(post?.photos?.indexes).toEqual([1, 2, 3]);
	});

	test("positions come out in order whatever readdir returned", () => {
		const id = postId(4);
		carousel(id, [3, 1, 2], 3);

		const post = build(id);

		expect(post?.photos?.indexes).toEqual([1, 2, 3]);
	});
});

describe("segment strip", () => {
	test("a hole in the middle marks the position that is actually absent", () => {
		// Images 1 and 3 arrived out of 3. Segment 2 is the empty one, and segment 3 plays the
		// second image in the sequence. Counting along the sequence marked segment 3 absent and
		// showed image 3 under segment 2.
		expect(segmentSlots(3, [1, 3])).toEqual([0, -1, 1]);
	});

	test("a download that stopped early leaves its holes at the end", () => {
		expect(segmentSlots(4, [1, 2])).toEqual([0, 1, -1, -1]);
	});

	test("a complete carousel maps one to one", () => {
		expect(segmentSlots(3, [1, 2, 3])).toEqual([0, 1, 2]);
	});

	test("with no recorded count the sequence is all there is", () => {
		// A legacy carousel records no count, so nothing says a position is missing at all.
		expect(segmentSlots(null, [1, 2, 4])).toEqual([0, 1, 2]);
		expect(segmentSlots(null, [])).toEqual([]);
	});

	test("the strip is as long as the recorded count, even if more images are on disk", () => {
		// A sidecar claiming fewer images than the archive holds is not something ttdl produces.
		// The strip follows the count, as it did before, so the extra image keeps its place in the
		// played sequence but has no segment of its own.
		expect(segmentSlots(2, [1, 2, 3])).toEqual([0, 1]);
	});
});

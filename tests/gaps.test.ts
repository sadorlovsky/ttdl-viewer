import { describe, expect, test } from "bun:test";
import { gapClauses } from "../src/shared/gaps.ts";
import type { ArchiveCounts } from "../src/shared/types.ts";

/** Every count zeroed; each test names only the ones it is about. */
function counts(over: Partial<ArchiveCounts> = {}): ArchiveCounts {
	return {
		posts: 0,
		videos: 0,
		carousels: 0,
		incomplete: 0,
		ghosts: 0,
		withoutInfo: 0,
		archived: 0,
		known: 0,
		missing: 0,
		...over,
	};
}

describe("gapClauses", () => {
	test("says nothing about an archive with nothing missing", () => {
		expect(gapClauses(counts({ posts: 98, archived: 98, known: 98 }))).toEqual([]);
	});

	test("reports what ttdl recorded as unfetchable", () => {
		expect(gapClauses(counts({ archived: 3095, known: 3915, missing: 820 }))).toEqual([
			"ttdl could not fetch 820 more posts",
		]);
	});

	test("counts metadata gaps even when every post was fetched", () => {
		// The old header only mentioned metadata alongside a failed fetch, so this archive — 201
		// posts with no .info.json and nothing missing — said nothing at all.
		expect(gapClauses(counts({ archived: 3095, known: 3095, withoutInfo: 201 }))).toEqual([
			"201 here have no metadata",
		]);
	});

	test("reports an id that was listed and neither fetched nor refused", () => {
		expect(gapClauses(counts({ archived: 2622, known: 2623 }))).toEqual([
			"1 more is listed but not on disk",
		]);
	});

	test("stays quiet when the listing is smaller than the archive", () => {
		// A profile that deleted posts: 3,307 on disk against 3,305 still listed. The subtraction
		// goes negative and must not surface as a gap.
		expect(gapClauses(counts({ archived: 3307, known: 3305, missing: 1 }))).toEqual([
			"ttdl could not fetch 1 more post",
		]);
	});

	test("does not count a failure twice as a shortfall", () => {
		// 4,608 listed, 4,592 on disk, 20 recorded failures — more failures than the 16-post
		// shortfall, because a later run got some of them. The remainder is negative, so only the
		// failures are worth reporting.
		const result = gapClauses(
			counts({ archived: 4592, known: 4608, missing: 20, withoutInfo: 4, ghosts: 19 }),
		);
		expect(result).toEqual([
			"ttdl could not fetch 20 more posts",
			"4 here have no metadata",
			"19 here have no media file",
		]);
	});

	test("names a post whose media file is gone", () => {
		expect(gapClauses(counts({ ghosts: 1 }))).toEqual(["1 here has no media file"]);
	});

	test("singularises every clause", () => {
		expect(gapClauses(counts({ missing: 1, known: 3, archived: 1, withoutInfo: 1 }))).toEqual([
			"ttdl could not fetch 1 more post",
			"1 more is listed but not on disk",
			"1 here has no metadata",
		]);
	});
});

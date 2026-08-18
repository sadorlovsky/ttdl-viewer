import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseExport, readLikes } from "../src/server/index/likes.ts";

const LIKED = "7673781569403751713";
const FAVED = "7665402245407722773";
const BOTH = "7544319994159467832";

function entry(date: string, id: string): string {
	return `Date: ${date} UTC\nLink: https://www.tiktokv.com/share/video/${id}/\n\n`;
}

describe("parseExport", () => {
	test("reads Date/Link pairs and converts UTC to unix seconds", () => {
		expect(parseExport(entry("2026-08-16 18:18:02", LIKED))).toEqual([
			{ id: LIKED, at: Date.parse("2026-08-16T18:18:02Z") / 1000 },
		]);
	});

	test("ignores the placeholder an empty section carries", () => {
		expect(parseExport("Favorite Comment:\n\nYou have no data in this section\n")).toEqual([]);
	});

	test("a Date line without a Link produces nothing", () => {
		expect(parseExport("Date: 2026-08-16 18:18:02 UTC\n\nDate: 2026-08-15 10:00:00 UTC\n")).toEqual(
			[],
		);
	});

	test("the date in a Date line is never mistaken for a post id", () => {
		// 2026-08-16 18:18:02 holds no run of 15 digits, but a parser matching digits anywhere in
		// the entry rather than in the Link line would still find one across the pair.
		const parsed = parseExport(entry("2026-08-16 18:18:02", LIKED));
		expect(parsed).toHaveLength(1);
		expect(parsed[0]?.id).toBe(LIKED);
	});
});

describe("readLikes", () => {
	function exportDir(): string {
		// The real export unpacks two levels down; --likes may point at either end of that.
		const root = mkdtempSync(join(tmpdir(), "ttdl-likes-"));
		const dir = join(root, "TikTok", "Likes and Favorites");
		mkdirSync(dir, { recursive: true });
		writeFileSync(
			join(dir, "Like List.txt"),
			entry("2026-08-16 18:18:02", LIKED) + entry("2026-03-01 09:00:00", BOTH),
		);
		writeFileSync(
			join(dir, "Favorite Videos.txt"),
			entry("2026-08-14 22:07:26", FAVED) + entry("2026-05-20 12:00:00", BOTH),
		);
		return root;
	}

	test("finds the export below the given directory and labels each kind", () => {
		const index = readLikes(exportDir());
		expect(index.get(LIKED)).toEqual({ at: Date.parse("2026-08-16T18:18:02Z") / 1000, kind: "like" });
		expect(index.get(FAVED)).toEqual({
			at: Date.parse("2026-08-14T22:07:26Z") / 1000,
			kind: "favorite",
		});
	});

	test("a post in both lists keeps its like date, not the favorite one", () => {
		expect(readLikes(exportDir()).get(BOTH)).toEqual({
			at: Date.parse("2026-03-01T09:00:00Z") / 1000,
			kind: "like",
		});
	});

	test("no export directory yields an empty index rather than throwing", () => {
		expect(readLikes(null).size).toBe(0);
		expect(readLikes(join(tmpdir(), "ttdl-likes-does-not-exist")).size).toBe(0);
	});

	test("within one list the first entry wins — the export is written newest-first", () => {
		const root = mkdtempSync(join(tmpdir(), "ttdl-likes-"));
		writeFileSync(
			join(root, "Like List.txt"),
			entry("2026-08-16 18:18:02", LIKED) + entry("2020-01-01 00:00:00", LIKED),
		);
		expect(readLikes(root).get(LIKED)?.at).toBe(Date.parse("2026-08-16T18:18:02Z") / 1000);
	});
});

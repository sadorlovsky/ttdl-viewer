import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findLikes, parseExport, readLikedState, readLikes } from "../src/server/index/likes.ts";
import { STATE_DIR } from "../src/server/index/state.ts";

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
		expect(index.get(LIKED)).toEqual({
			at: Date.parse("2026-08-16T18:18:02Z") / 1000,
			kind: "like",
		});
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

describe("findLikes", () => {
	/** An archive root with one real ttdl archive in it, and whatever else a test wants. */
	function root(): string {
		const dir = mkdtempSync(join(tmpdir(), "ttdl-root-"));
		const archive = join(dir, "someone", STATE_DIR);
		mkdirSync(archive, { recursive: true });
		writeFileSync(join(archive, "archive.txt"), `${LIKED}\n`);
		writeFileSync(join(archive, ".all_ids.txt"), `${LIKED}\n`);
		return dir;
	}

	function writeExport(dir: string): void {
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, "Like List.txt"), entry("2026-08-16 18:18:02", LIKED));
	}

	test("finds an export folder sitting beside the archives, and claims its name", () => {
		const dir = root();
		writeExport(join(dir, "tiktok-export"));

		const likes = findLikes(dir);
		expect(likes.index.get(LIKED)?.kind).toBe("like");
		expect(likes.dir).toBe(join(dir, "tiktok-export"));
		// Claimed, so the library does not list the export as an archive with zero posts.
		expect([...likes.notArchives]).toEqual(["tiktok-export"]);
	});

	test("finds the files dragged out flat into the root itself", () => {
		const dir = root();
		writeExport(dir);

		const likes = findLikes(dir);
		expect(likes.index.size).toBe(1);
		expect(likes.dir).toBe(dir);
		// Nothing to hide: no directory was involved.
		expect(likes.notArchives.size).toBe(0);
	});

	test("keeps TikTok's own nesting", () => {
		const dir = root();
		writeExport(join(dir, "TikTok", "Likes and Favorites"));
		expect(findLikes(dir).index.size).toBe(1);
		expect([...findLikes(dir).notArchives]).toEqual(["TikTok"]);
	});

	test("never opens an archive, so a post named like the export is not read as one", () => {
		const dir = root();
		// A file with the export's name inside an archive: found only by a search that walks
		// archives, which is exactly what the state-file check exists to prevent.
		writeFileSync(join(dir, "someone", "Like List.txt"), entry("2026-08-16 18:18:02", LIKED));

		const likes = findLikes(dir);
		expect(likes.index.size).toBe(0);
		expect(likes.dir).toBeNull();
		expect(likes.notArchives.size).toBe(0);
	});

	test("no export anywhere is the ordinary case, not an error", () => {
		const likes = findLikes(root());
		expect(likes.index.size).toBe(0);
		expect(likes.dir).toBeNull();
	});

	test("an override is read instead of the root, and still claims its folder", () => {
		const dir = root();
		writeExport(join(dir, "tiktok-export"));
		const elsewhere = mkdtempSync(join(tmpdir(), "ttdl-elsewhere-"));
		writeFileSync(join(elsewhere, "Favorite Videos.txt"), entry("2026-08-14 22:07:26", FAVED));

		const likes = findLikes(dir, elsewhere);
		// The root's own export is not merged in: one export was named, one export is read.
		expect(likes.index.has(LIKED)).toBe(false);
		expect(likes.index.get(FAVED)?.kind).toBe("favorite");
		expect(likes.dir).toBe(elsewhere);
	});

	test("an override inside the root still keeps its folder out of the library", () => {
		const dir = root();
		writeExport(join(dir, "tiktok-export"));
		expect([...findLikes(dir, join(dir, "tiktok-export")).notArchives]).toEqual(["tiktok-export"]);
	});
});

describe("readLikedState", () => {
	function archive(contents: string | null): string {
		const dir = mkdtempSync(join(tmpdir(), "ttdl-state-"));
		if (contents !== null) {
			mkdirSync(join(dir, STATE_DIR));
			writeFileSync(join(dir, STATE_DIR, ".liked.json"), contents);
		}
		return dir;
	}

	test("reads what ttdl recorded, kinds and all", () => {
		const index = readLikedState(
			archive(JSON.stringify({ [LIKED]: { at: 1662317057, kind: "like" } })),
		);
		expect(index?.get(LIKED)).toEqual({ at: 1662317057, kind: "like" });
	});

	test("no file is null, not an empty index", () => {
		// The difference decides whether the caller goes looking for an export: "ttdl was never
		// given one here" and "ttdl was given one and it matched nothing" are different facts.
		expect(readLikedState(archive(null))).toBeNull();
		expect(readLikedState(archive("{}"))?.size).toBe(0);
	});

	test("a half-written or corrupt file reads as no file", () => {
		expect(readLikedState(archive('{"7673781569403751713": {"at": 16623'))).toBeNull();
		expect(readLikedState(archive("[]"))).toBeNull();
	});

	test("entries that do not hold up are skipped, not trusted", () => {
		const index = readLikedState(
			archive(
				JSON.stringify({
					[LIKED]: { at: 1662317057, kind: "like" },
					[FAVED]: { at: "yesterday", kind: "favorite" },
					[BOTH]: { at: 1662317057, kind: "bookmarked" },
				}),
			),
		);
		expect([...(index?.keys() ?? [])]).toEqual([LIKED]);
	});
});

/**
 * Reading ttdl's author card.
 *
 * The card is the one file in an archive written by a program that is still evolving, and it can
 * also arrive from storage half-copied. So the reader validates rather than casts, and these tests
 * pin what "invalid" is allowed to cost: a missing count, never a missing screen.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { readCard } from "../src/server/index/profile.ts";
import { scanArchive } from "../src/server/index/scan.ts";

let root: string;
let dir: string;

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "ttdl-viewer-profile-"));
	dir = join(root, "archive");
	mkdirSync(dir);
});

afterEach(() => {
	rmSync(root, { recursive: true, force: true });
});

const write = (name: string, content: string) => writeFileSync(join(dir, name), content);
const writeCard = (card: unknown) => write("profile.json", JSON.stringify(card));

/** The shape ttdl actually writes, with an invented account in it. */
const REAL_CARD = {
	fetched_at: 1787021404,
	handle: "mossbank",
	nickname: "Mossbank",
	id: "6612300000000000000",
	sec_uid: "MS4wLjABAAAAexampleSecUid",
	signature: "bio text",
	bio_link: "https://example.com/bio",
	verified: false,
	private: false,
	created_at: 1600000000,
	avatar: "avatar.jpg",
	stats: { followers: 123456, following: 65, hearts: 7654321, videos: 481, friends: 13 },
};

describe("readCard", () => {
	test("reads what ttdl writes", () => {
		writeCard(REAL_CARD);

		const card = readCard(dir);

		expect(card?.handle).toBe("mossbank");
		expect(card?.nickname).toBe("Mossbank");
		expect(card?.bioLink).toBe("https://example.com/bio");
		expect(card?.createdAt).toBe(1600000000);
		expect(card?.stats.followers).toBe(123456);
		expect(card?.stats.hearts).toBe(7654321);
	});

	test("is null when there is no card at all", () => {
		expect(readCard(dir)).toBeNull();
	});

	test("is null for a truncated file", () => {
		write("profile.json", '{"fetched_at": 1787');

		expect(readCard(dir)).toBeNull();
	});

	test("is null without a date, because a count with no date is not worth showing", () => {
		writeCard({ handle: "alice", stats: { followers: 10 } });

		expect(readCard(dir)).toBeNull();
	});

	test("keeps the card when a count is missing rather than dropping the author", () => {
		// An older ttdl, or a page that answered with the poorer of the two author shapes.
		writeCard({ fetched_at: 1787021404, handle: "alice", stats: { followers: null } });

		const card = readCard(dir);

		expect(card?.handle).toBe("alice");
		expect(card?.stats.followers).toBeNull();
		expect(card?.stats.videos).toBeNull();
		expect(card?.signature).toBeNull();
		expect(card?.verified).toBe(false);
	});

	test("refuses a count that is not a number", () => {
		// TikTok's own statsV2 spells its numbers as strings; ttdl converts, but a card written by
		// something else must not put "123456" where the UI does toLocaleString().
		writeCard({ fetched_at: 1, handle: "alice", stats: { followers: "123456" } });

		expect(readCard(dir)?.stats.followers).toBeNull();
	});
});

describe("scanning", () => {
	test("finds the card and the picture without treating them as posts", () => {
		writeCard(REAL_CARD);
		write("avatar.jpg", "picture");
		write("20240101_7673909736131038495_clip.mp4", "video");

		const scan = scanArchive(dirname(dir), basename(dir));

		expect(scan.card?.name).toBe("profile.json");
		expect(scan.avatar?.name).toBe("avatar.jpg");
		expect(scan.groups.size).toBe(1);
		// The picture is not media, so it must not inflate the archive's size.
		expect(scan.bytes).toBe("video".length);
	});

	test("moves the listing hash when the picture is replaced", () => {
		write("avatar.jpg", "old picture");
		const before = scanArchive(dirname(dir), basename(dir)).listingHash;

		write("avatar.jpg", "new picture, same name");

		// Same filename, so without this the cached index would keep serving the old face.
		expect(scanArchive(dirname(dir), basename(dir)).listingHash).not.toBe(before);
	});

	test("reports no card when the archive has none", () => {
		write("20240101_7673909736131038495_clip.mp4", "video");

		const scan = scanArchive(dirname(dir), basename(dir));

		expect(scan.card).toBeNull();
		expect(scan.avatar).toBeNull();
	});
});

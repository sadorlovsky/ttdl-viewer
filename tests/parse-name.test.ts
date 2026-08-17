import { describe, expect, test } from "bun:test";
import { idToUnix, parseName, STATE_FILES } from "../src/server/index/parse-name.ts";

const ID = "7673909736131038495";

describe("parseName", () => {
	test("video post", () => {
		expect(parseName(`20260814_${ID}_Caption text here.mp4`)).toEqual({
			postId: ID,
			datePart: "20260814",
			role: { role: "media", ext: ".mp4", title: "Caption text here" },
		});
	});

	test("carousel audio, both extensions", () => {
		expect(parseName(`20260811_${ID}_A photo post.m4a`)?.role).toEqual({
			role: "media",
			ext: ".m4a",
			title: "A photo post",
		});
		expect(parseName(`20260811_${ID}_A photo post.mp3`)?.role).toEqual({
			role: "media",
			ext: ".mp3",
			title: "A photo post",
		});
	});

	test("NA date segment yields a null datePart but still parses", () => {
		const parsed = parseName(`NA_${ID}_No upload date.mp4`);
		expect(parsed?.postId).toBe(ID);
		expect(parsed?.datePart).toBeNull();
	});

	test("sidecars carrying the title", () => {
		expect(parseName(`20260814_${ID}_Caption.info.json`)?.role).toEqual({ role: "info" });
		expect(parseName(`20260814_${ID}_Caption.jpg`)?.role).toEqual({ role: "cover", ext: ".jpg" });
		// Carousel covers keep the original .jpeg (ttdl.py:357).
		expect(parseName(`20260814_${ID}_Caption.jpeg`)?.role).toEqual({ role: "cover", ext: ".jpeg" });
		expect(parseName(`20260814_${ID}_Caption.webp`)?.role).toEqual({ role: "cover", ext: ".webp" });
		expect(parseName(`20260814_${ID}_Caption.png`)?.role).toEqual({ role: "cover", ext: ".png" });
	});

	test("carousel sidecars use the title-less prefix", () => {
		expect(parseName(`20260814_${ID}_photo_01.jpg`)?.role).toEqual({ role: "photo", index: 1 });
		expect(parseName(`20260814_${ID}_photo_12.jpg`)?.role).toEqual({ role: "photo", index: 12 });
		expect(parseName(`20260814_${ID}_photo.json`)?.role).toEqual({ role: "photoState" });
		expect(parseName(`20260814_${ID}_photo.complete`)?.role).toEqual({ role: "photoMarker" });
	});

	test("photo index is case-insensitive on .JPG but rejects .jpeg — ttdl PHOTO_INDEX_RE", () => {
		expect(parseName(`20260814_${ID}_photo_07.JPG`)?.role).toEqual({ role: "photo", index: 7 });
		// .jpeg does not match ttdl's regex, so it must fall through to "cover", not "photo".
		expect(parseName(`20260814_${ID}_photo_07.jpeg`)?.role).toEqual({
			role: "cover",
			ext: ".jpeg",
		});
	});

	test("a media file and its carousel images group under the same id despite different prefixes", () => {
		// Exactly the shape ttdl's own tests build (tests/test_ttdl.py:70-88).
		const audio = parseName(`20240101_${ID}_sound.m4a`);
		const image = parseName(`20240101_${ID}_photo_01.jpg`);
		expect(audio?.postId).toBe(ID);
		expect(image?.postId).toBe(ID);
	});

	test("even a mismatched date segment groups by id", () => {
		expect(parseName(`NA_${ID}_sound.m4a`)?.postId).toBe(ID);
		expect(parseName(`20240101_${ID}_photo_01.jpg`)?.postId).toBe(ID);
	});

	test("the regex is anchored: a 15-digit number inside the title is not the id", () => {
		const parsed = parseName(`20260814_${ID}_call me on 123456789012345 ok.mp4`);
		expect(parsed?.postId).toBe(ID);
		expect(parsed?.role).toEqual({
			role: "media",
			ext: ".mp4",
			title: "call me on 123456789012345 ok",
		});
	});

	test("a name that only contains an id is not a post file", () => {
		expect(parseName(`${ID}.mp4`)).toBeNull();
		expect(parseName(`some-video-${ID}.mp4`)).toBeNull();
		expect(parseName("not-an-archive-file.mp4")).toBeNull();
	});

	test("id must be at least 15 digits", () => {
		expect(parseName("20260814_12345678901234_short.mp4")).toBeNull();
		expect(parseName("20260814_123456789012345_ok.mp4")?.postId).toBe("123456789012345");
	});

	test("state files are not posts", () => {
		for (const name of STATE_FILES) {
			expect(parseName(name)).toBeNull();
		}
		expect(parseName(".DS_Store")).toBeNull();
	});

	test("unknown extensions are rejected rather than guessed at", () => {
		expect(parseName(`20260814_${ID}_Caption.part`)).toBeNull();
		expect(parseName(`20260814_${ID}_Caption.tmp`)).toBeNull();
		expect(parseName(`20260814_${ID}_Caption.mkv`)).toBeNull();
	});

	test("titles keep every character ttdl allows, including the slash substitute", () => {
		const parsed = parseName(`20260814_${ID}_a／b 🎬 مرحبا.mp4`);
		expect(parsed?.role).toEqual({ role: "media", ext: ".mp4", title: "a／b 🎬 مرحبا" });
	});

	test("a title cut mid-word by the 80-byte truncation still parses", () => {
		// ttdl truncates to 80 bytes, so the last word is routinely chopped.
		const parsed = parseName(`20260814_${ID}_Пример очень длинного описа.mp4`);
		expect(parsed?.postId).toBe(ID);
	});

	test("a title truncated mid-UTF-8 parses from raw bytes", () => {
		// APFS refuses to store such a name, so this case can only be tested off-disk.
		const bytes = new Uint8Array([
			...new TextEncoder().encode(`20260814_${ID}_при`),
			0xd0, // dangling lead byte of a 2-byte sequence
			...new TextEncoder().encode(".mp4"),
		]);
		const name = new TextDecoder().decode(bytes); // lone 0xd0 becomes U+FFFD
		expect(parseName(name)?.postId).toBe(ID);
	});
});

describe("idToUnix", () => {
	test("recovers the publish time from the upper 32 bits", () => {
		// 7673909736131038495 >> 32 === 1786930101 -> 2026-08-15T20:08:21Z
		expect(idToUnix(ID)).toBe(Number(BigInt(ID) >> 32n));
		expect(new Date(idToUnix(ID) * 1000).getUTCFullYear()).toBe(2026);
	});

	test("BigInt is required — Number() would lose precision", () => {
		// The naive version is off by a wide margin; this asserts we did not write it.
		expect(idToUnix(ID)).not.toBe(Number(ID) / 2 ** 32);
		expect(idToUnix("6800000000000000000")).toBeGreaterThan(1_500_000_000);
	});
});

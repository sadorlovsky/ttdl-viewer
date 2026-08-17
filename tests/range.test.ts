import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseRange, serveFile } from "../src/server/http/range.ts";

describe("parseRange", () => {
	const SIZE = 1000;

	test("an ordinary chunk", () => {
		expect(parseRange("bytes=0-499", SIZE)).toEqual({ start: 0, end: 499 });
		expect(parseRange("bytes=100-199", SIZE)).toEqual({ start: 100, end: 199 });
	});

	test("the two-byte probe Safari opens with", () => {
		expect(parseRange("bytes=0-1", SIZE)).toEqual({ start: 0, end: 1 });
	});

	test("open-ended runs to the end of the file", () => {
		expect(parseRange("bytes=500-", SIZE)).toEqual({ start: 500, end: 999 });
	});

	test("the suffix form takes the last N bytes", () => {
		expect(parseRange("bytes=-100", SIZE)).toEqual({ start: 900, end: 999 });
		// A suffix longer than the file is legal and means "the whole file".
		expect(parseRange("bytes=-5000", SIZE)).toEqual({ start: 0, end: 999 });
	});

	test("an end past EOF is clamped, not rejected", () => {
		expect(parseRange("bytes=900-99999", SIZE)).toEqual({ start: 900, end: 999 });
	});

	test("a start at or past EOF is unsatisfiable", () => {
		expect(parseRange("bytes=1000-", SIZE)).toBe("unsatisfiable");
		expect(parseRange("bytes=99999-", SIZE)).toBe("unsatisfiable");
	});

	test("a backwards range is unsatisfiable", () => {
		expect(parseRange("bytes=500-100", SIZE)).toBe("unsatisfiable");
	});

	test("multi-range falls back to a full response rather than multipart", () => {
		expect(parseRange("bytes=0-99,200-299", SIZE)).toBeNull();
	});

	test("absent or malformed headers mean no range", () => {
		expect(parseRange(null, SIZE)).toBeNull();
		expect(parseRange("", SIZE)).toBeNull();
		expect(parseRange("items=0-99", SIZE)).toBeNull();
		expect(parseRange("bytes=abc", SIZE)).toBeNull();
		expect(parseRange("bytes=-", SIZE)).toBeNull();
	});

	test("the unit is matched case-insensitively and tolerates whitespace", () => {
		expect(parseRange("BYTES=0-9", SIZE)).toEqual({ start: 0, end: 9 });
		expect(parseRange(" bytes=0-9 ", SIZE)).toEqual({ start: 0, end: 9 });
	});
});

describe("serveFile", () => {
	const dir = mkdtempSync(join(tmpdir(), "ttdl-viewer-range-"));
	const path = join(dir, "clip.mp4");
	const body = Buffer.alloc(20 * 1024 * 1024, 7); // larger than the open-ended cap
	writeFileSync(path, body);
	const args = { path, size: body.length, mtimeMs: 1_700_000_000_000 };
	const get = (headers?: HeadersInit, method = "GET") =>
		serveFile({ ...args, request: new Request("http://x/clip.mp4", { method, headers }) });

	test("a plain request is a 200 with the full length", () => {
		const response = get();
		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Length")).toBe(String(body.length));
		expect(response.headers.get("Accept-Ranges")).toBe("bytes");
		expect(response.headers.get("Content-Type")).toBe("video/mp4");
	});

	test("a range request is a 206 with an exact Content-Range", () => {
		const response = get({ Range: "bytes=0-99" });
		expect(response.status).toBe(206);
		expect(response.headers.get("Content-Range")).toBe(`bytes 0-99/${body.length}`);
		expect(response.headers.get("Content-Length")).toBe("100");
	});

	test("an open-ended range on a large file is clamped to 8 MiB", () => {
		// Chrome simply asks for the next chunk; memory stays flat instead of one request
		// pinning a whole large file.
		const response = get({ Range: "bytes=0-" });
		expect(response.status).toBe(206);
		expect(response.headers.get("Content-Length")).toBe(String(8 * 1024 * 1024));
		expect(response.headers.get("Content-Range")).toBe(`bytes 0-8388607/${body.length}`);
	});

	test("a range past EOF is a 416 carrying the real size", () => {
		const response = get({ Range: `bytes=${body.length}-` });
		expect(response.status).toBe(416);
		expect(response.headers.get("Content-Range")).toBe(`bytes */${body.length}`);
	});

	test("HEAD answers with headers and no body", async () => {
		const response = get(undefined, "HEAD");
		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Length")).toBe(String(body.length));
		expect(await response.arrayBuffer()).toHaveLength(0);
	});

	test("a matching ETag is a 304", () => {
		const etag = get().headers.get("ETag");
		expect(etag).toBeTruthy();
		expect(get({ "If-None-Match": etag as string }).status).toBe(304);
		expect(get({ "If-None-Match": '"stale"' }).status).toBe(200);
	});

	test("an unserveable extension is a 404, never octet-stream", () => {
		const response = serveFile({
			path: join(dir, "notes.txt"),
			size: 10,
			mtimeMs: 0,
			request: new Request("http://x/notes.txt"),
		});
		expect(response.status).toBe(404);
	});

	test("m4a is audio/mp4 — Safari refuses the alternatives", () => {
		const response = serveFile({
			path: join(dir, "sound.m4a"),
			size: 10,
			mtimeMs: 0,
			request: new Request("http://x/sound.m4a"),
		});
		expect(response.headers.get("Content-Type")).toBe("audio/mp4");
	});

	test("cleanup", () => {
		rmSync(dir, { recursive: true, force: true });
		expect(true).toBe(true);
	});
});

import { isTimeBased, mimeFor } from "./mime.ts";

/**
 * An open-ended request is clamped to this much. Chrome simply asks again for the next chunk, and
 * memory stays flat instead of one `bytes=0-` on a large video pinning a whole response.
 */
const OPEN_ENDED_CAP = 8 * 1024 * 1024;

export type ParsedRange = { start: number; end: number } | "unsatisfiable" | null;

/**
 * Parse a Range header against a known size.
 *
 * All three legal forms have to work, and each comes from a real client:
 *   `bytes=0-499`  an ordinary chunk
 *   `bytes=500-`   open-ended — what Safari sends after its opening probe
 *   `bytes=-500`   suffix — some seek implementations ask this way
 *
 * Multi-range (`bytes=0-99,200-299`) returns null, i.e. "serve the whole thing with a 200". That
 * is spec-legal and far simpler than assembling multipart/byteranges, and no media element needs
 * it.
 *
 * Returns null for "no usable range, send 200", "unsatisfiable" for a 416.
 */
export function parseRange(header: string | null, size: number): ParsedRange {
	if (!header) {
		return null;
	}
	const match = /^bytes=(.+)$/i.exec(header.trim());
	if (!match?.[1]) {
		return null;
	}
	const spec = match[1];
	if (spec.includes(",")) {
		return null; // multi-range: fall back to 200
	}

	const parts = /^(\d*)-(\d*)$/.exec(spec.trim());
	if (!parts) {
		return null;
	}
	const [, rawStart = "", rawEnd = ""] = parts;

	if (rawStart === "" && rawEnd === "") {
		return null;
	}

	if (rawStart === "") {
		// Suffix form: the last N bytes.
		const suffix = Number.parseInt(rawEnd, 10);
		if (!Number.isFinite(suffix) || suffix <= 0) {
			return "unsatisfiable";
		}
		if (size === 0) {
			return "unsatisfiable";
		}
		return { start: Math.max(0, size - suffix), end: size - 1 };
	}

	const start = Number.parseInt(rawStart, 10);
	if (!Number.isFinite(start) || start >= size) {
		return "unsatisfiable";
	}

	if (rawEnd === "") {
		return { start, end: size - 1 };
	}
	const end = Number.parseInt(rawEnd, 10);
	if (!Number.isFinite(end) || end < start) {
		return "unsatisfiable";
	}
	return { start, end: Math.min(end, size - 1) };
}

export interface ServeOptions {
	path: string;
	size: number;
	mtimeMs: number;
	request: Request;
	/** Set when the caller already knows the type; otherwise it is derived from the extension. */
	mime?: string;
}

/**
 * Serve a file with conditional and range support.
 *
 * `Bun.file(path).slice(a, b)` hands back a Blob that Bun streams without copying, so the whole
 * thing is a header exercise rather than a plumbing one.
 */
export function serveFile(options: ServeOptions): Response {
	const { path, size, mtimeMs, request } = options;
	const mime = options.mime ?? mimeFor(path);
	if (!mime) {
		return new Response(
			JSON.stringify({ error: { code: "MEDIA_NOT_FOUND", message: "Unsupported media type" } }),
			{ status: 404, headers: { "Content-Type": "application/json; charset=utf-8" } },
		);
	}

	const etag = `"${size.toString(16)}-${Math.floor(mtimeMs).toString(16)}"`;
	const headers: Record<string, string> = {
		"Content-Type": mime,
		"Accept-Ranges": "bytes",
		ETag: etag,
		"Last-Modified": new Date(mtimeMs).toUTCString(),
		// The URL carries ?v=<mtime>, so a changed file is a changed URL and this is safe.
		"Cache-Control": "public, max-age=31536000, immutable",
	};

	if (request.headers.get("if-none-match") === etag) {
		return new Response(null, { status: 304, headers });
	}

	const isHead = request.method === "HEAD";
	const range = parseRange(request.headers.get("range"), size);

	if (range === "unsatisfiable") {
		return new Response(null, {
			status: 416,
			headers: { ...headers, "Content-Range": `bytes */${size}` },
		});
	}

	const file = Bun.file(path);

	if (range === null) {
		return new Response(isHead ? null : file, {
			status: 200,
			headers: { ...headers, "Content-Length": String(size) },
		});
	}

	let { start, end } = range;
	// Only clamp what the client left open-ended, and only for media that streams; an image is
	// always cheaper to send whole than to make the browser ask twice.
	if (end === size - 1 && isTimeBased(mime) && end - start + 1 > OPEN_ENDED_CAP) {
		end = start + OPEN_ENDED_CAP - 1;
	}

	return new Response(isHead ? null : file.slice(start, end + 1), {
		status: 206,
		headers: {
			...headers,
			"Content-Range": `bytes ${start}-${end}/${size}`,
			"Content-Length": String(end - start + 1),
		},
	});
}

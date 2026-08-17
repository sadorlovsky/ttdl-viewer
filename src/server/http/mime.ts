/**
 * Content types for the only extensions ttdl produces.
 *
 * `.m4a` must be `audio/mp4`. Safari refuses `audio/m4a` and `audio/x-m4a` outright, and a
 * carousel that will not play in Safari looks like a broken post rather than a wrong header.
 *
 * Anything not listed is a 404 rather than `application/octet-stream`: if the indexer produced it,
 * the indexer is wrong and should say so instead of shipping bytes the browser has to guess at.
 */
const TYPES: Record<string, string> = {
	".mp4": "video/mp4",
	".m4a": "audio/mp4",
	".mp3": "audio/mpeg",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".webp": "image/webp",
	".png": "image/png",
};

export function mimeFor(name: string): string | null {
	const dot = name.lastIndexOf(".");
	if (dot === -1) {
		return null;
	}
	return TYPES[name.slice(dot).toLowerCase()] ?? null;
}

export function isTimeBased(mime: string): boolean {
	return mime.startsWith("video/") || mime.startsWith("audio/");
}

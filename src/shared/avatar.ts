import type { AvatarSeed } from "./types.ts";

function fnv1a(text: string): number {
	let hash = 0x811c9dc5;
	for (let i = 0; i < text.length; i++) {
		hash ^= text.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}
	return hash >>> 0;
}

/**
 * Derive a stable avatar from a handle.
 *
 * ttdl never downloads profile pictures, so there is no image to show — and inventing a network
 * request to fetch one would break the only promise this app makes. A letter on a hue derived
 * from the handle is at least consistent: the same person looks the same everywhere in the app,
 * across sessions and archives.
 */
export function avatarSeed(handle: string, name?: string | null): AvatarSeed {
	const source = (name?.trim() || handle.trim()) ?? "";
	// Intl.Segmenter so an emoji or a combining sequence yields one glyph, not half of one.
	const first = source
		? (Array.from(new Intl.Segmenter().segment(source), (s) => s.segment)[0] ?? "?")
		: "?";
	return {
		letter: first.toUpperCase(),
		hue: handle ? fnv1a(handle) % 360 : 0,
	};
}

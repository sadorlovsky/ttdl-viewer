import type { FileGroup } from "./scan.ts";

export type PostKind = "video" | "carousel";
export type PostStatus = "complete" | "incomplete";

export interface Classified {
	kind: PostKind;
	status: PostStatus;
}

/** ttdl `carousel_complete`: every index from 1..expected must be present. */
function carouselComplete(expected: number, have: ReadonlySet<number>): boolean {
	if (expected <= 0) {
		return false;
	}
	for (let i = 1; i <= expected; i++) {
		if (!have.has(i)) {
			return false;
		}
	}
	return true;
}

/**
 * Decide what a group of files is, mirroring ttdl's `complete_ids`.
 *
 * The rules, in ttdl's own terms:
 *   - an .mp4 is a complete post, full stop;
 *   - an .m4a/.mp3 is a carousel, complete only when its images are all present. The count comes
 *     from `_photo.json`; an archive predating that marker has no count, and there the legacy rule
 *     applies — the completion marker, or failing that a single non-empty image, is enough;
 *   - a lone cover or .info.json is not a post at all.
 *
 * One deliberate divergence: ttdl *drops* incomplete carousels, because for ttdl "incomplete"
 * means "fetch it again". A viewer has the opposite obligation — hiding a partially downloaded
 * post from the archive's own browser is exactly wrong — so it is returned with
 * `status: "incomplete"` and the caller decides whether to show it.
 *
 * @param expected `expected` read out of the group's `_photo.json`, or null when unknown.
 */
export function classify(group: FileGroup, expected: number | null): Classified | null {
	const media = group.media;
	if (!media) {
		return null;
	}
	if (media.ext === ".mp4") {
		return { kind: "video", status: "complete" };
	}

	const have = new Set(group.photos.keys()); // already filtered to non-empty files by the scan
	const complete =
		expected !== null
			? carouselComplete(expected, have)
			: // No count: a repair stopped before the page could be read, so the images on disk are
				// all we know about. Falling back to the old rule keeps a fully downloaded legacy
				// carousel from looking lost.
				group.photoMarker || have.size > 0;

	return { kind: "carousel", status: complete ? "complete" : "incomplete" };
}

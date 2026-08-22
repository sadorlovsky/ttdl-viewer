/**
 * Where ttdl keeps everything about an archive that is not the media itself.
 *
 * One subdirectory, `<archive>/.ttdl/` (ttdl.py: STATE_DIR), holding the archive-level state:
 * `archive.txt`, `.all_ids.txt`, `missing.txt`, the author's card and picture, `loudness.json`,
 * `.liked.json`, `.source`, `.lock`, and the files this viewer never reads. The archive directory
 * itself holds only media and the per-post sidecars that describe one post rather than the archive
 * — `.info.json`, covers, `*_photo.json`, `*_photo.complete` — and those are still found by
 * `parseName` in the listing, where they have always been.
 *
 * ttdl wrote all of this flat, beside the videos, until the `.ttdl/` layout; an archive made then
 * is migrated by the first mutating ttdl command, under the archive lock. Nothing here reads the
 * flat spot: this viewer never writes to an archive and so cannot migrate one, and a fallback that
 * only ttdl can retire is a fallback that never gets retired. An archive ttdl has not touched since
 * the move reads as an archive with no state — no card, no counts, no `.source` — until one ttdl
 * command moves it, which is the same command that would have been run anyway to add a post to it.
 */

import { join } from "node:path";

/** ttdl's STATE_DIR. */
export const STATE_DIR = ".ttdl";

/** ttdl's PROFILE_CARD / PROFILE_AVATAR — the author's card and picture, under `.ttdl/`. */
export const PROFILE_CARD = "profile.json";
export const PROFILE_AVATAR = "avatar.jpg";

/**
 * Where one of ttdl's archive-level state files lives.
 *
 * The name is always a constant from this codebase, never a string from a request — this joins a
 * path and is held to the same rule as everything else that does.
 */
export function statePath(dir: string, name: string): string {
	return join(dir, STATE_DIR, name);
}

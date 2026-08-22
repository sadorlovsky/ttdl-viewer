/**
 * ttdl's `.ttdl/loudness.json`, read for the one number a player needs.
 *
 * TikTok mixes wildly — a whispered voiceover sits next to something compressed into a wall — so
 * watching an archive means riding the volume knob. ttdl measures every post to EBU R128 and
 * writes the result beside the media rather than re-encoding it: the archive keeps the bytes
 * TikTok served, and the correction is arithmetic somebody downstream can apply or ignore.
 *
 *     { "target_i": -14.0, "target_tp": -1.0,
 *       "posts": { "7467909701850696968": { "i": -8.9, "tp": -0.2, "lra": 4.1,
 *                                           "thresh": -19.2, "gain": -5.1 } } }
 *
 * Only `gain` is taken. The measurements around it are what that number was derived from, and
 * re-deriving it here would mean disagreeing with ttdl about the target — which is a setting of
 * the archive, not of the viewer: `ttdl.py loudness --target -16` recomputes every gain in place,
 * and this reads whatever it decided.
 *
 * Two kinds of entry carry no gain at all, and both mean "leave this post alone": a post with no
 * soundtrack is stored as `{"audio": false}`, and a post ttdl could not measure is not stored at
 * all, because on an archive that is what a truncated download looks like.
 */

import { readFileSync } from "node:fs";
import { statePath } from "./state.ts";

/** ttdl's own name for the sidecar (ttdl.py: LOUDNESS_FILE). */
export const LOUDNESS_FILE = "loudness.json";

/** Post id → decibels to apply, as ttdl worked them out. Empty for an unmeasured archive. */
export type LoudnessIndex = Map<string, number>;

const EMPTY: LoudnessIndex = new Map();

/**
 * The gains ttdl recorded for one archive.
 *
 * Absent, unreadable, and half-written all read as "nothing measured here", which is the same
 * answer the player wants anyway: every post plays at the volume it was mastered at, exactly as
 * it did before any of this existed. There is nothing to fall back to and so nothing to report.
 */
export function readLoudness(dir: string): LoudnessIndex {
	let raw: unknown;
	try {
		raw = JSON.parse(readFileSync(statePath(dir, LOUDNESS_FILE), "utf8"));
	} catch {
		return EMPTY;
	}
	if (!raw || typeof raw !== "object") {
		return EMPTY;
	}
	const posts = (raw as { posts?: unknown }).posts;
	if (!posts || typeof posts !== "object" || Array.isArray(posts)) {
		return EMPTY;
	}

	const index: LoudnessIndex = new Map();
	for (const [id, entry] of Object.entries(posts as Record<string, unknown>)) {
		if (!entry || typeof entry !== "object") {
			continue;
		}
		const gain = (entry as { gain?: unknown }).gain;
		// Written by another program, on someone else's disk, and read for a value that goes
		// straight onto an audio element: a shape that does not hold up is skipped rather than
		// trusted. `audio: false` lands here too, having no gain to take.
		if (typeof gain === "number" && Number.isFinite(gain)) {
			index.set(id, gain);
		}
	}
	return index;
}

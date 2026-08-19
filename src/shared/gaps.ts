import type { ArchiveCounts } from "./types.ts";

/**
 * Everything an archive is missing, in the words the archive can actually justify.
 *
 * Four different absences hide behind "incomplete", and only one of them is a post you can look
 * at. Naming them separately is the whole point: "ttdl could not fetch 820 posts" and "201 posts
 * here have no metadata" are answered by different commands, and one of them is not a problem with
 * the download at all.
 *
 * Returned as independent clauses rather than one sentence so the caller can render them as a list
 * and so each can be tested on its own.
 */
export function gapClauses(counts: ArchiveCounts): string[] {
	const clauses: string[] = [];

	if (counts.missing > 0) {
		clauses.push(
			`ttdl could not fetch ${counts.missing} more ${counts.missing === 1 ? "post" : "posts"}`,
		);
	}

	/*
	 * Ids ttdl has listed for this archive that are neither on disk nor recorded as failures.
	 *
	 * Subtracting all three and clamping is not defensive coding, it is the only honest way to read
	 * these files. `.all_ids.txt` is a listing and `archive.txt` is a receipt, and neither is a
	 * subset of the other: a profile that deletes posts leaves an archive holding more than the
	 * listing knows about (one here is at 3,307 downloaded against 3,305 listed), and `missing.txt`
	 * can name an id that a later run went on to get (another is at 20 recorded failures against a
	 * 16-post shortfall). So the difference is worth reporting only when it survives both, which
	 * across six real archives it does exactly once — for a single post that was listed and then
	 * never fetched or refused.
	 */
	const unaccounted = counts.known - counts.archived - counts.missing;
	if (unaccounted > 0) {
		clauses.push(`${unaccounted} more ${unaccounted === 1 ? "is" : "are"} listed but not on disk`);
	}

	// Stated on its own terms rather than tacked onto the line above, which it used to be — an
	// archive with no failed fetches and a hundred posts holding no metadata said nothing at all.
	if (counts.withoutInfo > 0) {
		clauses.push(
			`${counts.withoutInfo} here ${counts.withoutInfo === 1 ? "has" : "have"} no metadata`,
		);
	}

	// A cover or an .info.json whose media file is gone: this post was here and is not any more,
	// which is a different fact from ttdl never having got it, and the library card already says it.
	if (counts.ghosts > 0) {
		clauses.push(`${counts.ghosts} here ${counts.ghosts === 1 ? "has" : "have"} no media file`);
	}

	return clauses;
}

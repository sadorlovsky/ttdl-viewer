/**
 * The volume correction, from the file ttdl writes to the element that plays.
 *
 * Two halves that fail differently. Reading is a parser aimed at a file another program wrote —
 * where the interesting cases are the entries that carry no gain, since a post with no soundtrack
 * and a post ttdl could not open both have to end up as "leave it alone" rather than as zero.
 * Applying is arithmetic, and the case that matters there is the one deliberately not applied: a
 * boost, which `HTMLMediaElement.volume` cannot express and which this screen does not go through
 * WebAudio to get.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type LoudnessIndex, readLoudness } from "../src/server/index/loudness.ts";
import { Registry } from "../src/server/index/registry.ts";
import type { Post } from "../src/shared/types.ts";
import { playbackVolume } from "../src/web/feed/loudness.ts";

const LOUD = "7467909701850696968";

function withSidecar(content: string): LoudnessIndex {
	const dir = mkdtempSync(join(tmpdir(), "ttdl-viewer-loudness-"));
	try {
		writeFileSync(join(dir, "loudness.json"), content);
		return readLoudness(dir);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

/** The sidecar as ttdl writes it, with whatever entries a test needs. */
function sidecar(posts: Record<string, unknown>): string {
	return JSON.stringify({ target_i: -14.0, target_tp: -1.0, posts }, null, 2);
}

describe("readLoudness", () => {
	test("takes the gain ttdl derived, and nothing else from the entry", () => {
		const index = withSidecar(
			sidecar({ [LOUD]: { i: -8.9, tp: -0.2, lra: 4.1, thresh: -19.2, gain: -5.1 } }),
		);
		expect([...index]).toEqual([[LOUD, -5.1]]);
	});

	test("a post with no soundtrack has no gain, which is not a gain of zero", () => {
		// ttdl records `{"audio": false}` so it never measures the file again. Reading that as 0
		// would be the same answer by accident, but it would also make an unmeasurable post
		// indistinguishable from a measured one for anything that asks later.
		const index = withSidecar(sidecar({ [LOUD]: { audio: false } }));
		expect(index.has(LOUD)).toBe(false);
	});

	test("a silent post keeps its measured zero", () => {
		const index = withSidecar(sidecar({ [LOUD]: { i: -70, tp: -70, silent: true, gain: 0.0 } }));
		expect(index.get(LOUD)).toBe(0);
	});

	test("an archive ttdl has never measured reads as no corrections at all", () => {
		const dir = mkdtempSync(join(tmpdir(), "ttdl-viewer-loudness-"));
		expect(readLoudness(dir).size).toBe(0);
		rmSync(dir, { recursive: true, force: true });
	});

	test("a half-written file is no corrections rather than an error", () => {
		// ttdl writes this atomically, but it also writes it every hundred posts during a scan
		// that can take minutes — and the viewer reads archives while ttdl runs, by design.
		expect(withSidecar(`{"target_i": -14.0, "posts": {"${LOUD}`).size).toBe(0);
	});

	test("a file of the right kind but the wrong shape is skipped, not trusted", () => {
		expect(withSidecar('{"posts": []}').size).toBe(0);
		expect(withSidecar(sidecar({ [LOUD]: "-5.1" })).size).toBe(0);
		expect(withSidecar(sidecar({ [LOUD]: { gain: "-5.1" } })).size).toBe(0);
		expect(withSidecar(sidecar({ [LOUD]: { gain: null } })).size).toBe(0);
	});
});

describe("playbackVolume", () => {
	const post = (loudnessGain: number | null) => ({ loudnessGain }) as Post;

	test("a loud post is pulled down by the decibels ttdl asked for", () => {
		// −6.02 dB is half the amplitude, which is the one conversion worth pinning by hand.
		expect(playbackVolume(post(-6.0206), 1)).toBeCloseTo(0.5, 4);
	});

	test("the viewer's own volume stays the outer term", () => {
		expect(playbackVolume(post(-6.0206), 0.4)).toBeCloseTo(0.2, 4);
		expect(playbackVolume(post(-6.0206), 0)).toBe(0);
	});

	test("a post asking to be made louder is left alone", () => {
		// Not a policy about loudness — `volume` is capped at 1, and the only way to exceed it is
		// a WebAudio graph this screen deliberately does not build. See the module comment.
		expect(playbackVolume(post(9), 1)).toBe(1);
		expect(playbackVolume(post(9), 0.5)).toBe(0.5);
	});

	test("an unmeasured post plays exactly as it did before any of this existed", () => {
		expect(playbackVolume(post(null), 1)).toBe(1);
		expect(playbackVolume(post(null), 0.3)).toBe(0.3);
	});

	test("the result is always a volume an element will accept", () => {
		for (const gain of [-0.01, -14, -60, -200]) {
			const volume = playbackVolume(post(gain), 1);
			expect(volume).toBeGreaterThanOrEqual(0);
			expect(volume).toBeLessThanOrEqual(1);
		}
	});
});

describe("an archive on disk", () => {
	let root: string;
	let dir: string;

	function postId(tail: number, timestamp = 1_704_067_200): string {
		return ((BigInt(timestamp) << 32n) | BigInt(tail)).toString();
	}

	function addPost(tail: number): string {
		const id = postId(tail);
		writeFileSync(join(dir, `20240101_${id}_clip.mp4`), "video");
		return id;
	}

	function measure(gains: Record<string, number>): void {
		writeFileSync(
			join(dir, "loudness.json"),
			sidecar(Object.fromEntries(Object.entries(gains).map(([id, gain]) => [id, { gain }]))),
		);
	}

	function built(): Registry {
		const registry = new Registry(root);
		registry.rebuild();
		return registry;
	}

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), "ttdl-viewer-loudness-archive-"));
		dir = join(root, "acc");
		mkdirSync(dir);
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	test("carries the correction onto the post it belongs to", () => {
		const loud = addPost(1);
		const quiet = addPost(2);
		measure({ [loud]: -5.1 });

		const posts = built().get("acc")?.postsById;
		expect(posts?.get(loud)?.loudnessGain).toBe(-5.1);
		// Measured or not, every post is still a post: an archive half-way through a scan must
		// not lose the ones the scan has not reached.
		expect(posts?.get(quiet)?.loudnessGain).toBeNull();
	});

	test("a measuring run is picked up without a restart", () => {
		const id = addPost(1);
		const registry = built();
		expect(registry.get("acc")?.postsById.get(id)?.loudnessGain).toBeNull();

		Bun.sleepSync(2);
		measure({ [id]: -5.1 });

		// loudness.json is in the change probe. `ttdl.py loudness` over a finished archive
		// rewrites nothing else at all, so without that the numbers would sit unread until the
		// next download — and the whole point is running it on an archive that is already there.
		expect(registry.get("acc")?.postsById.get(id)?.loudnessGain).toBe(-5.1);
	});
});

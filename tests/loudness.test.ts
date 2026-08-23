/**
 * The volume correction, from the file ttdl writes to the element that plays.
 *
 * Two halves that fail differently. Reading is a parser aimed at a file another program wrote —
 * where the interesting cases are the entries that carry no gain, since a post with no soundtrack
 * and a post ttdl could not open both have to end up as "leave it alone" rather than as zero.
 * Applying is arithmetic, and what is worth pinning there is which of the two routes a correction
 * takes: `HTMLMediaElement.volume` cannot amplify and on iOS does nothing at all, so a gain node
 * carries whatever it cannot — and the viewer's switch is upstream of that choice, since a
 * correction of 0 needs no route.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type LoudnessIndex, readLoudness } from "../src/server/index/loudness.ts";
import { Registry } from "../src/server/index/registry.ts";
import { STATE_DIR } from "../src/server/index/state.ts";
import type { Post } from "../src/shared/types.ts";
import {
	correctionFor,
	correctionReaches,
	elementVolume,
	graphPermitted,
	MAX_BOOST_DB,
	needsGraph,
	nodeGain,
	normalizeOverride,
} from "../src/web/feed/loudness.ts";

const LOUD = "7467909701850696968";

function withSidecar(content: string): LoudnessIndex {
	const dir = mkdtempSync(join(tmpdir(), "ttdl-viewer-loudness-"));
	try {
		mkdirSync(join(dir, STATE_DIR));
		writeFileSync(join(dir, STATE_DIR, "loudness.json"), content);
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

describe("correctionFor", () => {
	const post = (loudnessGain: number | null) => ({ loudnessGain }) as Post;

	test("is the shift ttdl asked for", () => {
		expect(correctionFor(post(-5.1), true)).toBe(-5.1);
		expect(correctionFor(post(4.4), true)).toBe(4.4);
	});

	test("is nothing for a post nothing measured", () => {
		// An archive ttdl never ran `loudness` over, a post with no sound, a download that was cut
		// short. All three arrive as null and all three mean "leave this alone".
		expect(correctionFor(post(null), true)).toBe(0);
		expect(correctionFor(post(0), true)).toBe(0);
	});

	test("amplification stops at the ceiling, attenuation does not", () => {
		// A real archive here holds posts measured at -41 LUFS, which ask for +26 dB. ttdl is
		// right not to cap that — it does not know what the file will be played on — and this is
		// where the policy belongs: past the ceiling what gets amplified is the noise floor.
		// Downwards there is nothing to protect against: attenuation cannot clip.
		expect(correctionFor(post(26.12), true)).toBe(MAX_BOOST_DB);
		expect(correctionFor(post(-26.12), true)).toBe(-26.12);
	});

	test("is nothing at all with the switch off, in either direction", () => {
		// The whole switch is this line. Both directions, because turning it off has to mean the
		// post plays as it was mastered — not "the quiet ones stay quiet while the loud ones are
		// still pulled down", which is the half-correction `?boost=0` leaves behind on a browser
		// that honours `volume`, and which is exactly what this is not.
		expect(correctionFor(post(-5.1), false)).toBe(0);
		expect(correctionFor(post(26.12), false)).toBe(0);
	});

	test("off costs nothing downstream, because 0 needs no graph", () => {
		// Not a restatement of `needsGraph`: it is the reason the switch is affordable. A post
		// whose correction is 0 is never routed, so with the switch off no element is handed to a
		// `MediaElementAudioSourceNode` and no `AudioContext` is created — on either kind of
		// browser, including the one where `volume` does not work.
		expect(needsGraph(correctionFor(post(26.12), false), true)).toBe(false);
		expect(needsGraph(correctionFor(post(26.12), false), false)).toBe(false);
	});
});

describe("normalizeOverride", () => {
	test("a URL that says nothing decides nothing", () => {
		// Null rather than true: the answer belongs to the stored setting, and this has to be able
		// to say so instead of overruling it with a default.
		expect(normalizeOverride("")).toBe(null);
		expect(normalizeOverride("?debug=1")).toBe(null);
	});

	test("`?normalize=0` turns the correction off for the visit", () => {
		expect(normalizeOverride("?normalize=0")).toBe(false);
		expect(normalizeOverride("?debug=1&normalize=0")).toBe(false);
	});

	test("`?normalize=1` turns it on, which is not the same as saying nothing", () => {
		// Worth having: it is how a link demonstrates the correction to somebody who has turned it
		// off on their own machine, without changing what they have set.
		expect(normalizeOverride("?normalize=1")).toBe(true);
	});

	test("anything else in the flag is not an answer", () => {
		expect(normalizeOverride("?normalize=yes")).toBe(null);
		expect(normalizeOverride("?normalize=")).toBe(null);
	});

	test("it is a different flag from `?boost`, which forbids only the graph", () => {
		// The two are documented separately because they turn off different things, and a reader
		// who assumes one is an alias of the other gets a device hatch where they wanted a
		// setting. `?boost=0` leaves `volume` correcting whatever it can.
		expect(graphPermitted("?normalize=0", true, false)).toBe(true);
		expect(normalizeOverride("?boost=0")).toBe(null);
	});
});

describe("the two ways a level is expressed", () => {
	test("without a graph, only attenuation survives", () => {
		// -6.02 dB is half the amplitude, which is the one conversion worth pinning by hand.
		expect(elementVolume(-6.0206, 1)).toBeCloseTo(0.5, 4);
		// And a post asking to be amplified is simply left where it is: `volume` stops at 1.
		expect(elementVolume(9, 1)).toBe(1);
		expect(elementVolume(9, 0.4)).toBe(0.4);
	});

	test("with a graph, both directions go through the node", () => {
		expect(nodeGain(-6.0206, 1)).toBeCloseTo(0.5, 4);
		expect(nodeGain(6.0206, 1)).toBeCloseTo(2, 4);
	});

	test("a post that should not be heard is silent in the node, whatever its correction", () => {
		// Not `element.muted`: the feed starts its neighbours deliberately, muted, to win them the
		// right to play later, and a mute that does not reach the graph makes the whole window
		// audible at once — which sums, and a sum clips.
		expect(nodeGain(12, 1, false)).toBe(0);
		expect(nodeGain(-6, 1, false)).toBe(0);
		expect(nodeGain(0, 1, false)).toBe(0);
	});

	test("the viewer's volume stays the outer term either way", () => {
		expect(elementVolume(-6.0206, 0.4)).toBeCloseTo(0.2, 4);
		expect(nodeGain(6.0206, 0.5)).toBeCloseTo(1, 4);
		expect(elementVolume(-3, 0)).toBe(0);
		expect(nodeGain(12, 0)).toBe(0);
	});

	test("what an element is given is always a volume it will accept", () => {
		for (const correction of [-0.01, -14, -60, -200, 3, 12]) {
			const volume = elementVolume(correction, 1);
			expect(volume).toBeGreaterThanOrEqual(0);
			expect(volume).toBeLessThanOrEqual(1);
		}
	});
});

describe("needsGraph", () => {
	test("a post that asked for nothing is left where it is", () => {
		expect(needsGraph(0, true)).toBe(false);
		expect(needsGraph(0, false)).toBe(false);
	});

	test("amplification always needs one, because `volume` stops at 1", () => {
		expect(needsGraph(4.4, true)).toBe(true);
	});

	test("attenuation needs one only where `volume` is ignored", () => {
		// Which is iOS, and is the bug this rule exists for: with `volume` alone an iPhone got
		// every quiet post lifted and not one loud post lowered, leaving the archive louder than
		// it started and exactly as uneven.
		expect(needsGraph(-5.1, true)).toBe(false);
		expect(needsGraph(-5.1, false)).toBe(true);
	});
});

describe("graphPermitted", () => {
	test("the iOS family never gets a graph, whatever the flag or the probe say", () => {
		// The pipeline does not change the playback rate of a routed element, and the rate is a
		// feature. Two subtler bans leaked: a volume getter that stores what it cannot play
		// answers "volume works", and `?boost=1` — the flag the first iPhone test was run with,
		// which an address bar remembers — used to force the graph anywhere. See the module.
		expect(graphPermitted("", true, true)).toBe(false);
		expect(graphPermitted("", false, true)).toBe(false);
		expect(graphPermitted("?boost=1", true, true)).toBe(false);
		expect(graphPermitted("?boost=1&debug=1", false, true)).toBe(false);
	});

	test("elsewhere the graph is allowed wherever `volume` works", () => {
		expect(graphPermitted("", true, false)).toBe(true);
		expect(graphPermitted("?debug=1", true, false)).toBe(true);
	});

	test("elsewhere a browser that ignores `volume` gets no graph", () => {
		expect(graphPermitted("", false, false)).toBe(false);
		expect(graphPermitted("?debug=1", false, false)).toBe(false);
	});

	test("`?boost=0` forbids the graph anywhere", () => {
		expect(graphPermitted("?boost=0", true, false)).toBe(false);
		expect(graphPermitted("?debug=1&boost=0", false, false)).toBe(false);
	});

	test("`?boost=1` forces it past the volume-probe rule, and only that rule", () => {
		expect(graphPermitted("?boost=1", false, false)).toBe(true);
		expect(graphPermitted("?boost=1", true, false)).toBe(true);
	});

	test("anything else in the flag is not an answer", () => {
		expect(graphPermitted("?boost=no", true, false)).toBe(true);
		expect(graphPermitted("?boost=no", false, false)).toBe(false);
		expect(graphPermitted("?boost=", true, false)).toBe(true);
	});
});

describe("correctionReaches", () => {
	test("either route is enough", () => {
		expect(correctionReaches(true, false, false)).toBe(true);
		expect(correctionReaches(false, true, false)).toBe(true);
		expect(correctionReaches(true, true, false)).toBe(true);
	});

	test("a browser with neither gets nothing, and is offered nothing", () => {
		// This is what the sheet asks before drawing the switch: with no graph and no `volume`
		// there is no position of it that changes a post.
		expect(correctionReaches(false, false, false)).toBe(false);
	});

	test("the iOS family reaches nothing, whatever the volume probe says", () => {
		// The probe is why this takes the platform as well: a getter that stores the value while
		// the sound ignores it answers "volume works", and the switch would be drawn on the one
		// platform where it can do nothing. Same blind spot the graph ban stopped relying on.
		expect(correctionReaches(false, true, true)).toBe(false);
		expect(correctionReaches(false, false, true)).toBe(false);
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
		mkdirSync(join(dir, STATE_DIR), { recursive: true });
		writeFileSync(
			join(dir, STATE_DIR, "loudness.json"),
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

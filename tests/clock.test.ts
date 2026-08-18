import { describe, expect, test } from "bun:test";
import { bankLap, type Lap, rebase } from "../src/web/feed/clock.ts";

/** Read a whole run of `currentTime` samples, the way the rAF loop would. */
function run(samples: number[], duration: number, from: Lap = { banked: 0, last: 0 }): number[] {
	let state = from;
	return samples.map((sample) => {
		state = bankLap(state, sample, duration);
		return state.banked + sample;
	});
}

describe("bankLap", () => {
	test("a track that never comes round is just its own clock", () => {
		expect(run([0, 2, 4, 6, 8], 10)).toEqual([0, 2, 4, 6, 8]);
	});

	test("the reading going backwards is the track coming round", () => {
		// An eleven second track read past its end: 10, then 1 means one whole lap has passed.
		expect(run([8, 10, 1, 3], 11)).toEqual([8, 10, 12, 14]);
	});

	test("laps accumulate", () => {
		expect(run([9, 1, 9, 1, 9], 10)).toEqual([9, 11, 19, 21, 29]);
	});

	/**
	 * The reported bug, end to end.
	 *
	 * Eleven images at 2.5s each need 27.5s; the track is 11s. Read straight off `currentTime` the
	 * images reach picture five, the track comes round, and they are dragged back to the first —
	 * for ever. The clock has to pass 27.5 for the last picture to be reachable at all.
	 */
	test("a slideshow longer than its track still reaches its last image", () => {
		const perImage = 2.5;
		const images = 11;
		const cycle = perImage * images;
		const track = 11;

		let state: Lap = { banked: 0, last: 0 };
		const reached = new Set<number>();
		// Three laps of the track at a tenth of a second, which is more than the 27.5s needed.
		for (let step = 0; step <= 330; step++) {
			const currentTime = (step / 10) % track;
			state = bankLap(state, currentTime, track);
			const at = state.banked + currentTime;
			reached.add(Math.min(images - 1, Math.floor((((at % cycle) + cycle) % cycle) / perImage)));
		}
		expect(reached.size).toBe(images);
		expect(reached.has(images - 1)).toBe(true);
	});

	test("jitter within the tolerance is not a lap", () => {
		// A decoding element can report a shade behind itself; that must not add a whole track.
		expect(run([5, 4.9, 5.1], 10)).toEqual([5, 4.9, 5.1]);
	});

	test("an unknown duration banks what was last seen", () => {
		// Before metadata arrives there is no length to add, so the furthest point reached stands in.
		expect(run([7, 0.5], Number.NaN)).toEqual([7, 7.5]);
	});
});

describe("rebase", () => {
	test("a seek past the end of the track keeps the clock, and winds the track round", () => {
		// The last of eleven images sits at 25s; an 11s track is 3s into its third lap there.
		const { banked, into } = rebase(25, 11);
		expect(into).toBeCloseTo(3);
		expect(banked + into).toBeCloseTo(25);
	});

	test("a seek within the first lap banks nothing", () => {
		expect(rebase(7.5, 11)).toMatchObject({ banked: 0, into: 7.5 });
	});

	test("the next reading after a seek is not mistaken for a lap", () => {
		const { into, ...lap } = rebase(25, 11);
		// The tick that follows reads exactly what the seek asked for; nothing may be added.
		expect(bankLap(lap, into, 11).banked).toBe(lap.banked);
	});
});

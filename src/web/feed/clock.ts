/**
 * Turning a looping track into a clock that only goes forwards.
 *
 * A slideshow is timed off its audio's `currentTime`, and that track loops — so the reading hands
 * itself back to nought every time it comes round. While the images fit inside the track that is
 * harmless, because both wrap together. When they do not, the pictures were dragged back to the
 * first one mid-way through, and a post with more images than its track had seconds for could
 * never reach its last picture at all.
 *
 * A looping element announces this in no other way: `loop` is precisely what suppresses `ended`.
 * The only sign is the reading going backwards, so that is what is watched for.
 *
 * Extracted from the component because the rAF loop it lives in cannot be run in a test, and the
 * arithmetic here is the whole of the fix.
 */

/**
 * How far back a reading may jump before it counts as the track coming round.
 *
 * A decoding element is not sampled to the microsecond and can report a value a shade behind the
 * last one; treating that as a lap would add a whole track's length to the clock for nothing.
 */
const LAP_TOLERANCE = 0.25;

export interface Lap {
	/** Seconds of track already played by whole loops. Add `currentTime` for the real elapsed. */
	banked: number;
	/** The reading this was computed against, to be handed back on the next call. */
	last: number;
}

/**
 * Fold one `currentTime` reading into a running total.
 *
 * `duration` is the track's length, and the previous reading stands in for it while that is still
 * unknown — a lap has to be worth something, and where the reading was last seen is the closest
 * thing to the truth available before metadata arrives.
 */
export function bankLap(state: Lap, currentTime: number, duration: number): Lap {
	if (currentTime >= state.last - LAP_TOLERANCE) {
		return state.last === currentTime ? state : { banked: state.banked, last: currentTime };
	}
	const lap = Number.isFinite(duration) && duration > 0 ? duration : state.last;
	return { banked: state.banked + lap, last: currentTime };
}

/**
 * Where the clock has to stand for a given moment of the slideshow, and where the track stands
 * within its own loop to match.
 *
 * Seeking is the one thing that legitimately moves the reading backwards, so it re-bases the count
 * rather than being detected as a lap: a tap on an earlier segment is not the track coming round,
 * and counting it as one would put the images a whole track ahead of the sound.
 */
export function rebase(at: number, duration: number): Lap & { into: number } {
	const track = Number.isFinite(duration) && duration > 0 ? duration : at || 1;
	const into = at % track;
	return { banked: at - into, last: into, into };
}

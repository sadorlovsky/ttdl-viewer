/**
 * Press-and-hold near the leading edge to run the post fast, the way the app this imitates does.
 *
 * Kept out of both slide components because they need to agree about it exactly: the zone decides
 * whether a hold means "faster" or "open the sheet", and a carousel that disagreed with a video by
 * a few per cent would be a gesture that works on some posts and opens a menu on others.
 */

/**
 * How much of the surface, measured from the left, belongs to the speed-up.
 *
 * A third rather than a half: the rest of the surface still has to be a comfortable target for the
 * sheet, which is the gesture people will reach for deliberately. The speed-up is the one you fall
 * into while watching, so it wants the edge your thumb already rests on.
 */
export const BOOST_ZONE = 1 / 3;

/** Twice whatever the viewer chose, so the gesture always does something they can feel. */
const BOOST_FACTOR = 2;

/** The ceiling browsers will decode without dropping the audio, and past useful in any case. */
const MAX_RATE = 4;

export function boostedRate(rate: number): number {
	return Math.min(MAX_RATE, rate * BOOST_FACTOR);
}

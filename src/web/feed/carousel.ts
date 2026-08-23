/**
 * Laying a carousel's segment strip over the images that actually arrived.
 *
 * The strip has one segment per image the post is supposed to have. The played sequence holds only
 * the images on disk, packed together, so the two line up only while nothing is missing from the
 * middle. A refused page leaves a hole anywhere, and counting along the sequence then puts every
 * later image one segment too early and marks the wrong one absent.
 */

/**
 * For each carousel position, where its image sits in the played sequence, or -1 when that
 * position never arrived.
 *
 * `positions` holds the position of each played image, numbered from 1 as ttdl names them. When
 * the post records no count there is nothing to lay the sequence over, so the sequence is the
 * whole truth and each segment is its own image.
 */
export function segmentSlots(expected: number | null, positions: readonly number[]): number[] {
	if (expected === null) {
		return positions.map((_, slot) => slot);
	}
	return Array.from({ length: expected }, (_, i) => positions.indexOf(i + 1));
}

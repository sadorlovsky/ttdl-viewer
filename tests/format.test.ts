/**
 * Relative times, at every unit boundary.
 *
 * The table this reads from pairs a threshold with a unit, and pairing it with the unit one step
 * down is invisible until you check a value in the middle of a range: two hours reported as two
 * minutes is still a plausible-looking string.
 */
import { describe, expect, test } from "bun:test";
import { ago } from "../src/web/lib/format.ts";

const NOW = 1_000_000_000;
const said = (secondsAgo: number) => ago(NOW - secondsAgo, NOW);

describe("ago", () => {
	test("counts in the largest unit the gap has filled", () => {
		expect(said(30)).toBe("30 seconds ago");
		expect(said(300)).toBe("5 minutes ago");
		expect(said(7200)).toBe("2 hours ago");
		expect(said(90_000)).toBe("1 day ago");
		expect(said(1_814_400)).toBe("3 weeks ago");
		expect(said(63_115_200)).toBe("2 years ago");
	});

	test("changes unit exactly at the boundary", () => {
		expect(said(59)).toBe("59 seconds ago");
		expect(said(60)).toBe("1 minute ago");
		expect(said(3599)).toBe("59 minutes ago");
		expect(said(3600)).toBe("1 hour ago");
		expect(said(86_399)).toBe("23 hours ago");
		expect(said(86_400)).toBe("1 day ago");
		expect(said(604_800)).toBe("1 week ago");
		expect(said(2_629_800)).toBe("1 month ago");
		expect(said(31_557_600)).toBe("1 year ago");
	});

	test("agrees with itself about singulars, and does not go negative", () => {
		expect(said(1)).toBe("1 second ago");
		expect(said(0)).toBe("0 seconds ago");
		// A file stamped in the future is a clock disagreement, not a countdown.
		expect(said(-500)).toBe("0 seconds ago");
	});
});

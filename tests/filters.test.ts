/**
 * The query string, as a round trip.
 *
 * `serializeQuery` and `parseQuery` are one contract used from both ends — the server route reads
 * what the app's URL wrote — so a value that cannot survive the round trip is a filter that
 * silently does nothing. That is exactly what happened to the author with no metadata: its handle
 * is the empty string, `?author=` and "no author filter" parse identically, and the chip counted
 * 201 posts while doing nothing when pressed.
 */
import { describe, expect, test } from "bun:test";
import { parseQuery, serializeQuery } from "../src/shared/filters.ts";

const round = (query: Parameters<typeof serializeQuery>[0]) =>
	parseQuery(new URLSearchParams(serializeQuery(query)));

describe("the author filter", () => {
	test("carries an ordinary handle unchanged", () => {
		expect(round({ author: ["kyudisen"] }).author).toEqual(["kyudisen"]);
	});

	test("survives the round trip for a post whose metadata never arrived", () => {
		// The empty handle is what `build.ts` gives a post in a list archive with no .info.json.
		expect(round({ author: [""] }).author).toEqual([""]);
	});

	test("keeps the two apart when both are selected", () => {
		expect(round({ author: ["", "kyudisen"] }).author).toEqual(["", "kyudisen"]);
	});

	test("writes the unknown author as a hyphen, which no handle can contain", () => {
		expect(serializeQuery({ author: [""] })).toBe("author=-");
	});

	test("leaves no filter as no filter", () => {
		expect(round({}).author).toBeUndefined();
		expect(parseQuery(new URLSearchParams("author=")).author).toBeUndefined();
	});
});

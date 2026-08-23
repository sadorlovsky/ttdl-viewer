/**
 * Query parameters the API routes read for themselves.
 *
 * Post queries go through `parseQuery`, which clamps. The author and hashtag routes take `?limit=`
 * straight off the URL, and a number that is never checked for a lower bound ends up in
 * `Array.slice`, where a negative one counts from the end.
 */
import { describe, expect, test } from "bun:test";
import { limitOf } from "../src/server/routes/api.ts";

const asked = (value?: string) =>
	limitOf(new URLSearchParams(value === undefined ? "" : `limit=${value}`), 50, 200);

describe("limitOf", () => {
	test("a negative limit falls back instead of trimming the tail", () => {
		// `authors.slice(0, -5)` answers with the list minus its last five entries, which looks
		// like a real answer and is not one.
		expect(asked("-5")).toBe(50);
		expect(asked("0")).toBe(50);
	});

	test("anything unreadable falls back", () => {
		expect(asked()).toBe(50);
		expect(asked("abc")).toBe(50);
		expect(asked("Infinity")).toBe(50);
	});

	test("a real limit is taken, capped, and whole", () => {
		expect(asked("10")).toBe(10);
		expect(asked("9999")).toBe(200);
		expect(asked("10.7")).toBe(10);
	});
});

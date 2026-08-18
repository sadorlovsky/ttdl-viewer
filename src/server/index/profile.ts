import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ProfileCard } from "../../shared/types.ts";
import { PROFILE_CARD } from "./parse-name.ts";

function text(value: unknown): string | null {
	return typeof value === "string" && value.trim() !== "" ? value : null;
}

function num(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Read ttdl's `profile.json`.
 *
 * Checked field by field rather than cast. This file is written by another program and can arrive
 * from storage as well, so an older format or a truncated copy has to degrade to "no card" instead
 * of putting `undefined` where the UI expects a number. Only `fetchedAt` is load-bearing enough to
 * reject the whole file over: every count in here is a snapshot, and a snapshot with no date is
 * not worth showing.
 */
export function readCard(dir: string): ProfileCard | null {
	let raw: unknown;
	try {
		raw = JSON.parse(readFileSync(join(dir, PROFILE_CARD), "utf8"));
	} catch {
		return null;
	}
	if (typeof raw !== "object" || raw === null) {
		return null;
	}
	const card = raw as Record<string, unknown>;
	const fetchedAt = num(card.fetched_at);
	if (fetchedAt === null) {
		return null;
	}
	const stats = (typeof card.stats === "object" && card.stats !== null ? card.stats : {}) as Record<
		string,
		unknown
	>;
	return {
		fetchedAt,
		handle: text(card.handle) ?? "",
		nickname: text(card.nickname),
		signature: text(card.signature),
		bioLink: text(card.bio_link),
		verified: card.verified === true,
		private: card.private === true,
		createdAt: num(card.created_at),
		stats: {
			followers: num(stats.followers),
			following: num(stats.following),
			hearts: num(stats.hearts),
			videos: num(stats.videos),
			friends: num(stats.friends),
		},
	};
}

/**
 * A small subsequence matcher, in the spirit of fzf.
 *
 * Deliberately not a dependency and deliberately not applied to descriptions: fuzzy matching over
 * thousands of captions is slow and mostly returns noise, while fuzzy matching over a few hundred
 * handles is instant and genuinely useful, because handles are unmemorable by design.
 */

interface Score {
	score: number;
	matched: boolean;
}

function scoreOne(candidate: string, needle: string): Score {
	const haystack = candidate.toLowerCase();
	const query = needle.toLowerCase();
	if (query === "") {
		return { score: 0, matched: true };
	}
	if (haystack === query) {
		return { score: 1000, matched: true };
	}
	if (haystack.startsWith(query)) {
		return { score: 800 - haystack.length, matched: true };
	}
	const direct = haystack.indexOf(query);
	if (direct !== -1) {
		return { score: 600 - direct - haystack.length / 10, matched: true };
	}

	// Subsequence walk: every query character must appear in order. Adjacent hits and hits at a
	// word boundary score higher, which is what makes "kl" find "kitchenlab" ahead of "kaleil".
	let score = 0;
	let position = -1;
	let previous = -2;
	for (const char of query) {
		const found = haystack.indexOf(char, position + 1);
		if (found === -1) {
			return { score: 0, matched: false };
		}
		score += found === previous + 1 ? 12 : 4;
		if (found === 0 || ".-_ ".includes(haystack[found - 1] ?? "")) {
			score += 8;
		}
		previous = found;
		position = found;
	}
	return { score: score - haystack.length / 20, matched: true };
}

/**
 * Rank items by the best score across the fields the accessor exposes, dropping non-matches.
 * Ties keep the input order, which for authors means the more prolific one stays first.
 */
export function rankFuzzy<T>(items: T[], needle: string, fields: (item: T) => string[]): T[] {
	const query = needle.trim();
	if (query === "") {
		return items;
	}
	const scored: Array<{ item: T; score: number; index: number }> = [];
	items.forEach((item, index) => {
		let best = 0;
		let matched = false;
		for (const field of fields(item)) {
			if (!field) {
				continue;
			}
			const result = scoreOne(field, query);
			if (result.matched && result.score > best) {
				best = result.score;
				matched = true;
			}
		}
		if (matched) {
			scored.push({ item, score: best, index });
		}
	});
	return scored.sort((a, b) => b.score - a.score || a.index - b.index).map((entry) => entry.item);
}

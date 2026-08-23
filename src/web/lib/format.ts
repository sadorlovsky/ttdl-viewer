/** Compact count, in the style short-video apps use: 1.2M, 14.3K, 987. */
export function count(value: number | null): string {
	// A null is not a zero. An archive with no metadata must not claim the post had no likes.
	if (value === null) {
		return "—";
	}
	if (value < 1000) {
		return String(value);
	}
	if (value < 1_000_000) {
		const k = value / 1000;
		return `${k < 10 ? k.toFixed(1).replace(/\.0$/, "") : Math.round(k)}K`;
	}
	if (value < 1_000_000_000) {
		const m = value / 1_000_000;
		return `${m < 10 ? m.toFixed(1).replace(/\.0$/, "") : Math.round(m)}M`;
	}
	return `${(value / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`;
}

export function duration(seconds: number | null): string {
	if (seconds === null || !Number.isFinite(seconds)) {
		return "";
	}
	const total = Math.round(seconds);
	const m = Math.floor(total / 60);
	const s = total % 60;
	return `${m}:${String(s).padStart(2, "0")}`;
}

export function bytes(value: number): string {
	if (value < 1024) {
		return `${value} B`;
	}
	const units = ["KB", "MB", "GB", "TB"];
	let size = value / 1024;
	let unit = 0;
	while (size >= 1024 && unit < units.length - 1) {
		size /= 1024;
		unit++;
	}
	return `${size < 10 ? size.toFixed(1) : Math.round(size)} ${units[unit]}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Aug 14, 2026" — unambiguous, and short enough for a tile caption. */
export function date(unix: number): string {
	const at = new Date(unix * 1000);
	return `${MONTHS[at.getMonth()]} ${at.getDate()}, ${at.getFullYear()}`;
}

/**
 * "Aug 14, 2026 at 20:27:37" — the whole instant, for a tooltip on a date that shows only the day.
 *
 * The time of day is real on every post in every archive, which is not obvious and is the reason
 * this is worth offering. ttdl names files with a date and no clock, so the seconds look like they
 * should be a midnight the indexer invented — they are not: the upper 32 bits of a post id are Unix
 * seconds, and the indexer takes the time of day from there whenever metadata is absent. The number
 * behind this string is always a second TikTok recorded, whether it arrived from `createTime` or
 * from the id.
 *
 * A 24-hour clock and no timezone, to agree with `date()` above: both render the viewer's local
 * time, and this one has to name the same day the line under the pointer does.
 */
export function dateTime(unix: number): string {
	const at = new Date(unix * 1000);
	const pad = (value: number) => String(value).padStart(2, "0");
	return `${date(unix)} at ${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}`;
}

/** "Mar 2021" — for a date range in an archive header. */
export function monthYear(unix: number): string {
	const at = new Date(unix * 1000);
	return `${MONTHS[at.getMonth()]} ${at.getFullYear()}`;
}

export function dateRange(range: { first: number; last: number } | null): string {
	if (!range) {
		return "";
	}
	const first = monthYear(range.first);
	const last = monthYear(range.last);
	return first === last ? first : `${first} – ${last}`;
}

/** "3 days ago" — used where a relative time reads better than an absolute one. */
export function ago(unix: number, now = Date.now() / 1000): string {
	const seconds = Math.max(0, now - unix);
	// Each row reads "under this many seconds, count in this unit". The unit belongs to the row
	// the value stops at, not the one before it: the table used to pair a threshold with the unit
	// beneath it, so two hours came out as two minutes and three weeks as three days.
	const steps = [
		{ under: 60, per: 1, name: "second" },
		{ under: 3600, per: 60, name: "minute" },
		{ under: 86400, per: 3600, name: "hour" },
		{ under: 604800, per: 86400, name: "day" },
		{ under: 2629800, per: 604800, name: "week" },
		{ under: 31557600, per: 2629800, name: "month" },
	];
	// 2629800 is an average month and 31557600 an average year, both in seconds.
	const step = steps.find((s) => seconds < s.under) ?? { per: 31557600, name: "year" };
	const value = Math.floor(seconds / step.per);
	return `${value} ${step.name}${value === 1 ? "" : "s"} ago`;
}

/**
 * Split a caption so hashtags can be rendered as their own interactive spans.
 *
 * Each part carries its offset in the source string, which gives React a stable identity that
 * does not depend on array position.
 */
export function splitHashtags(
	text: string,
): Array<{ text: string; tag: string | null; at: number }> {
	const parts: Array<{ text: string; tag: string | null; at: number }> = [];
	const regex = /#[\p{L}\p{N}_]+/gu;
	let last = 0;
	for (const match of text.matchAll(regex)) {
		const start = match.index ?? 0;
		if (start > last) {
			parts.push({ text: text.slice(last, start), tag: null, at: last });
		}
		parts.push({ text: match[0], tag: match[0].slice(1).toLowerCase(), at: start });
		last = start + match[0].length;
	}
	if (last < text.length) {
		parts.push({ text: text.slice(last), tag: null, at: last });
	}
	return parts;
}

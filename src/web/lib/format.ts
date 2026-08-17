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
	const units: Array<[number, string]> = [
		[60, "second"],
		[3600, "minute"],
		[86400, "hour"],
		[604800, "day"],
		[2629800, "week"],
		[31557600, "month"],
	];
	let divisor = 1;
	let name = "second";
	for (const [limit, unit] of units) {
		if (seconds < limit) {
			break;
		}
		divisor = limit;
		name = unit;
	}
	if (seconds >= 31557600) {
		divisor = 31557600;
		name = "year";
	}
	const value = Math.floor(seconds / (name === "second" ? 1 : divisor));
	return `${value} ${name}${value === 1 ? "" : "s"} ago`;
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

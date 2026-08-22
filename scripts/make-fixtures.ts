/**
 * Generate a fake ttdl archive tree so the whole stack can be exercised without downloading
 * anything from TikTok.
 *
 * This is not a convenience — no real ttdl archive exists on this machine, so it is the only way
 * any of this code gets run. Every edge case that the ttdl filename format can produce is
 * represented here on purpose, because each one is a branch in the indexer that would otherwise
 * ship untested.
 *
 * Usage:  bun run fixtures [--big] [--out fixtures/downloads] [--seed 1]
 */
import {
	constants,
	copyFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	utimesSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { LOUDNESS_FILE } from "../src/server/index/loudness.ts";
import { PROFILE_AVATAR, PROFILE_CARD, STATE_DIR } from "../src/server/index/state.ts";

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
	const i = args.indexOf(`--${name}`);
	return i === -1 ? undefined : args[i + 1];
};
const has = (name: string) => args.includes(`--${name}`);

const OUT = flag("out") ?? "fixtures/downloads";
const BIG = has("big");
const SEED = Number(flag("seed") ?? 1);

const ffmpeg = Bun.which("ffmpeg");
if (!ffmpeg) {
	console.error(
		"ffmpeg not found. Fixtures need it to synthesize media.\n" + "  brew install ffmpeg\n",
	);
	process.exit(4);
}

/* ------------------------------------------------------------------ deterministic randomness */

// Math.random() would make every run produce a different tree, which turns any golden snapshot
// into a flake. mulberry32 is 5 lines and fully reproducible from --seed.
function rng(seed: number) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
const rand = rng(SEED);
const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)] as T;
const between = (lo: number, hi: number) => lo + rand() * (hi - lo);

/* --------------------------------------------------------------------------- post ids & time */

/** Build an id whose upper 32 bits are a real Unix time, exactly like TikTok's. */
function makeId(unix: number, counter: number): string {
	return ((BigInt(unix) << 32n) | BigInt(counter & 0xffffffff)).toString();
}

const DAY = 86_400;
let idCounter = 1000;

/** Post publish times spread over roughly five years, ending a few days before "now". */
function makeTimestamp(index: number, total: number): number {
	const newest = 1_786_800_000; // 2026-08-14
	const oldest = newest - 5 * 365 * DAY;
	const span = (newest - oldest) / Math.max(total, 1);
	return Math.floor(oldest + span * (total - index) + between(0, span * 0.8));
}

/* ------------------------------------------------------------------------------ media making */

/**
 * The muzak loop every fixture is scored with, in place of the sine tone that used to stand in
 * for a soundtrack. A full-scale sine is genuinely unpleasant to sit through, and these fixtures
 * exist to be watched — a soundtrack nobody can stand is a soundtrack nobody checks.
 *
 * Four bars at 135.1 BPM, cut on the bar and crossfaded into itself, so `-stream_loop -1` can
 * repeat it under a video of any length without a seam at the join.
 */
const LOOP = join(import.meta.dir, "assets", "elevator-loop.flac");
if (!existsSync(LOOP)) {
	console.error(`Missing ${LOOP}\nThe fixture soundtrack is committed to the repo; restore it.\n`);
	process.exit(5);
}

/**
 * Neighbouring posts have to stay distinguishable by ear while scrolling — the one virtue of the
 * old per-hue sine frequency, and worth keeping. Hue picks a semitone instead of a frequency.
 *
 * The divisor is 30, not 12: the hues in use (0, 30, 60, 100, 140, 190, 220, 260, 300) collapse
 * onto three distinct values under `% 12`, which would have left most posts sounding alike.
 */
const semitoneFor = (hue: number) => (Math.round(hue / 30) % 12) - 6;

/**
 * Pitch by resampling — the loop plays off-speed, like a record at the wrong rpm, which shifts
 * tempo along with pitch. That is the point: it needs no time-stretcher (librubberband is not in
 * every ffmpeg build) and cannot smear the loop's edges, so the seam survives transposition.
 * `asetrate` leaves the stream declaring the wrong rate, hence `aresample` behind it.
 */
const transpose = (semitone: number) =>
	`asetrate=${Math.round(48_000 * 2 ** (semitone / 12))},aresample=48000`;

/** Cache-key fragment: a bare minus would render `muzak-13--3.mp3`, which reads as a typo. */
const semitoneTag = (semitone: number) => (semitone < 0 ? `m${-semitone}` : `p${semitone}`);

const CACHE = join(OUT, "..", ".media-cache");

function sh(cmd: string[]): void {
	const proc = Bun.spawnSync(cmd, { stdout: "pipe", stderr: "pipe" });
	if (proc.exitCode !== 0) {
		throw new Error(`${cmd[0]} failed:\n${proc.stderr.toString()}`);
	}
}

interface VideoSpec {
	key: string;
	width: number;
	height: number;
	duration: number;
	hue: number;
}

/**
 * Render one video into the cache, once. `testsrc2` burns in a frame counter and timecode, so
 * "am I looking at the right post, and is it actually advancing" is answerable at a glance; the
 * per-post hue makes neighbouring posts distinguishable while scrolling.
 */
function video(spec: VideoSpec): string {
	const path = join(CACHE, `${spec.key}-muzak.mp4`);
	if (existsSync(path)) {
		return path;
	}
	sh([
		ffmpeg as string,
		"-y",
		"-f",
		"lavfi",
		"-i",
		`testsrc2=size=${spec.width}x${spec.height}:rate=30:duration=${spec.duration}`,
		"-stream_loop",
		"-1",
		"-i",
		LOOP,
		"-map",
		"0:v",
		"-map",
		"1:a",
		"-vf",
		`hue=h=${spec.hue}`,
		"-af",
		transpose(semitoneFor(spec.hue)),
		"-c:v",
		"libx264",
		"-pix_fmt",
		"yuv420p",
		"-preset",
		"ultrafast",
		"-c:a",
		"aac",
		// A looped input never ends, so `-shortest` has nothing to measure against: the length
		// has to be stated outright.
		"-t",
		String(spec.duration),
		"-movflags",
		"+faststart",
		path,
	]);
	return path;
}

/** A solid-colour JPEG. Distinct colours are what make the carousel-advance test possible. */
function solidJpeg(color: string, width = 720, height = 1280): string {
	const path = join(CACHE, `solid-${color}-${width}x${height}.jpg`);
	if (existsSync(path)) {
		return path;
	}
	sh([
		ffmpeg as string,
		"-y",
		"-f",
		"lavfi",
		"-i",
		`color=c=${color}:size=${width}x${height}`,
		"-frames:v",
		"1",
		path,
	]);
	return path;
}

/** A cover extracted from the video itself, so tiles look like the post they belong to. */
function cover(videoPath: string, key: string, ext: ".jpg" | ".jpeg" | ".webp" | ".png"): string {
	const path = join(CACHE, `cover-${key}${ext}`);
	if (existsSync(path)) {
		return path;
	}
	sh([ffmpeg as string, "-y", "-i", videoPath, "-frames:v", "1", "-q:v", "4", path]);
	return path;
}

/**
 * A standalone soundtrack file — what a carousel post carries beside its images. The semitone is
 * a parameter for the same reason the video's is: two posts in a row that sound identical make a
 * carousel-advance bug invisible.
 */
function audio(durationSeconds: number, semitone: number): string {
	const path = join(CACHE, `muzak-${durationSeconds}-${semitoneTag(semitone)}.m4a`);
	if (existsSync(path)) {
		return path;
	}
	sh([
		ffmpeg as string,
		"-y",
		"-stream_loop",
		"-1",
		"-i",
		LOOP,
		"-af",
		transpose(semitone),
		"-t",
		String(durationSeconds),
		"-c:a",
		"aac",
		path,
	]);
	return path;
}

function audioMp3(durationSeconds: number, semitone: number): string {
	const path = join(CACHE, `muzak-${durationSeconds}-${semitoneTag(semitone)}.mp3`);
	if (existsSync(path)) {
		return path;
	}
	sh([
		ffmpeg as string,
		"-y",
		"-stream_loop",
		"-1",
		"-i",
		LOOP,
		"-af",
		transpose(semitone),
		"-t",
		String(durationSeconds),
		"-c:a",
		"libmp3lame",
		path,
	]);
	return path;
}

/**
 * Copy-on-write clone. Distinct inodes, so each copy gets its own mtime — hard links would share
 * one, and the cache-invalidation tests depend on per-file mtimes being independent.
 */
function clone(src: string, dst: string): void {
	copyFileSync(src, dst, constants.COPYFILE_FICLONE);
}

/* ---------------------------------------------------------------------------------- captions */

const WORDS = [
	"morning",
	"routine",
	"recipe",
	"berlin",
	"cat",
	"sunset",
	"gym",
	"coffee",
	"study",
	"travel",
	"budget",
	"apartment",
	"guitar",
	"rain",
	"market",
	"hike",
	"snow",
	"desk",
	"pasta",
	"bike",
	"museum",
	"night",
	"train",
	"garden",
	"book",
	"beach",
	"winter",
];
const TAGS = [
	"fyp",
	"foryou",
	"viral",
	"asmr",
	"recipe",
	"travel",
	"diy",
	"catsoftiktok",
	"berlin",
	"studytok",
	"booktok",
	"coffee",
	"minimalism",
	"vlog",
	"outfit",
];

function caption(): string {
	const length = 3 + Math.floor(rand() * 9);
	const words = Array.from({ length }, () => pick(WORDS)).join(" ");
	const tagCount = Math.floor(rand() * 4);
	const tags = Array.from({ length: tagCount }, () => `#${pick(TAGS)}`).join(" ");
	return tags ? `${words} ${tags}` : words;
}

/** ttdl truncates the filename title to 80 bytes without splitting a character (ttdl.py:534). */
function titleFor(description: string): string {
	const safe = description.replaceAll("/", "／");
	const bytes = new TextEncoder().encode(safe).slice(0, 80);
	return new TextDecoder("utf-8", { fatal: false }).decode(bytes).replace(/�+$/, "").trim();
}

/* ------------------------------------------------------------------------------- info.json */

interface Author {
	handle: string;
	nickname: string;
	uid: string;
	secUid: string;
}

const TRACKS = [
	{ track: "original sound", artists: ["unknown"] },
	{ track: "Slow Motion", artists: ["Nightbus"] },
	{ track: "Kitchen Tape", artists: ["Ola Mor", "Ruth Vane"] },
	{ track: "Blue Hour", artists: ["saela"] },
];

interface InfoOptions {
	id: string;
	description: string;
	timestamp: number;
	author: Author;
	duration: number;
	width: number;
	height: number;
	kind: "video" | "carousel";
	/** Simulate a pre-`artists` archive, which used artist/creator instead. */
	legacyArtist?: boolean;
}

function infoJson(o: InfoOptions): string {
	const music = pick(TRACKS);
	const stats = {
		view_count: Math.floor(between(500, 4_000_000)),
		like_count: Math.floor(between(10, 400_000)),
		comment_count: Math.floor(between(0, 9_000)),
		repost_count: Math.floor(between(0, 20_000)),
		save_count: Math.floor(between(0, 60_000)),
	};
	const info: Record<string, unknown> = {
		id: o.id,
		title: o.description.slice(0, 72),
		description: o.description,
		timestamp: o.timestamp,
		upload_date: new Date(o.timestamp * 1000).toISOString().slice(0, 10).replaceAll("-", ""),
		duration: o.duration,
		uploader: o.author.handle,
		uploader_id: o.author.uid,
		uploader_url: `https://www.tiktok.com/@${o.author.handle}`,
		channel: o.author.nickname,
		channel_id: o.author.secUid,
		channel_url: `https://www.tiktok.com/@${o.author.handle}`,
		track: music.track,
		album: null,
		availability: "public",
		webpage_url: `https://www.tiktok.com/@${o.author.handle}/${
			o.kind === "video" ? "video" : "photo"
		}/${o.id}`,
		original_url: `https://www.tiktok.com/@${o.author.handle}/video/${o.id}`,
		width: o.width,
		height: o.height,
		aspect_ratio: Number((o.width / o.height).toFixed(4)),
		fps: 30,
		ext: o.kind === "video" ? "mp4" : "m4a",
		resolution: `${o.width}x${o.height}`,
		extractor: "TikTok",
		extractor_key: "TikTok",
		epoch: 1_786_900_000,
		_version: { version: "2026.07.04" },
		...stats,
		// The bulky fields the indexer must drop rather than retain: real archives carry dozens of
		// format entries with signed CDN URLs, and a viewer that keeps them is one careless
		// <img src> away from making a network request.
		formats: [
			{
				format_id: "download_addr-0",
				url: `https://v16-webapp.tiktok.com/${o.id}/video.mp4?sig=deadbeef`,
				ext: "mp4",
				vcodec: "h264",
				acodec: "aac",
				width: o.width,
				height: o.height,
				tbr: 1400,
				filesize: 2_400_000,
				format_note: "Direct video",
			},
			{
				format_id: "bytevc1_720p",
				url: `https://v19-webapp.tiktok.com/${o.id}/h265.mp4?sig=cafebabe`,
				ext: "mp4",
				vcodec: "h265",
				acodec: "aac",
				width: o.width,
				height: o.height,
				tbr: 900,
				filesize: 1_500_000,
				format_note: "watermark-free",
			},
		],
		thumbnails: [
			{ id: "cover", url: `https://p16-sign.tiktokcdn.com/${o.id}/cover.jpeg`, preference: 0 },
			{
				id: "dynamicCover",
				url: `https://p16-sign.tiktokcdn.com/${o.id}/dyn.webp`,
				preference: -1,
			},
		],
		thumbnail: `https://p16-sign.tiktokcdn.com/${o.id}/cover.jpeg`,
	};
	if (o.legacyArtist) {
		info.artist = music.artists.join(", ");
		info.creator = music.artists[0];
	} else {
		info.artists = music.artists;
	}
	return `${JSON.stringify(info, null, 2)}\n`;
}

/* -------------------------------------------------------------------------- archive building */

interface WrittenPost {
	id: string;
	timestamp: number;
	files: string[];
}

class ArchiveWriter {
	readonly dir: string;
	readonly posts: WrittenPost[] = [];
	private readonly missing: Array<[string, number, string]> = [];

	constructor(root: string, name: string) {
		this.dir = join(root, name);
		mkdirSync(this.dir, { recursive: true });
	}

	private stamp(files: string[], timestamp: number): void {
		// ttdl's set_times (ttdl.py:794) stamps every file in a post group with the publish time.
		// Replicating it is not cosmetic: without it, mtimes here would be write-time, and the
		// cache-invalidation logic would be tested under conditions that never occur in reality.
		const when = new Date(timestamp * 1000);
		for (const file of files) {
			utimesSync(join(this.dir, file), when, when);
		}
	}

	write(name: string, content: string): void {
		writeFileSync(join(this.dir, name), content);
	}

	/**
	 * One of ttdl's archive-level state files, in the `.ttdl/` ttdl keeps them in.
	 *
	 * The directory is created lazily, as ttdl creates it: a directory nothing has written state
	 * into — the unrelated-files one below — has to look like something that is not an archive,
	 * which is exactly what an empty `.ttdl/` sitting in it would stop it looking like.
	 */
	writeState(name: string, content: string): void {
		mkdirSync(join(this.dir, STATE_DIR), { recursive: true });
		writeFileSync(join(this.dir, STATE_DIR, name), content);
	}

	copy(name: string, src: string): void {
		clone(src, join(this.dir, name));
	}

	copyState(name: string, src: string): void {
		mkdirSync(join(this.dir, STATE_DIR), { recursive: true });
		clone(src, join(this.dir, STATE_DIR, name));
	}

	writeBytes(name: string, content: Uint8Array): void {
		writeFileSync(join(this.dir, name), content);
	}

	record(id: string, timestamp: number, files: string[]): void {
		this.stamp(files, timestamp);
		this.posts.push({ id, timestamp, files });
	}

	noteMissing(id: string, timestamp: number, error: string): void {
		this.missing.push([id, timestamp, error]);
	}

	/**
	 * ttdl's author card and picture, which `get` records for a profile archive (snap_profile).
	 *
	 * `fetched_at` is deliberately older than the newest post and the counts deliberately are not
	 * round: the header prints the date beside them, and a card stamped with round numbers and
	 * today's date would never exercise the thing that makes it honest.
	 */
	card(author: Author, picture: string): void {
		this.writeState(
			PROFILE_CARD,
			`${JSON.stringify(
				{
					fetched_at: 1_787_000_000,
					handle: author.handle,
					nickname: author.nickname,
					id: author.uid,
					sec_uid: author.secUid,
					signature: "Fixtures, and the occasional carousel 🎞\nnot a real account",
					bio_link: "https://example.invalid/fixtures",
					verified: true,
					private: false,
					created_at: 1_637_746_623,
					avatar: "avatar.jpg",
					stats: {
						followers: 759_605,
						following: 65,
						hearts: 41_756_403,
						// Fewer than the archive holds, as TikTok's own count routinely is.
						videos: 31,
						friends: 13,
					},
				},
				null,
				2,
			)}\n`,
		);
		this.copyState(PROFILE_AVATAR, picture);
	}

	/**
	 * ttdl's loudness sidecar, as `ttdl.py loudness` leaves it (ttdl.py: LOUDNESS_FILE).
	 *
	 * The numbers are invented but the arithmetic is ttdl's: an integrated loudness and a true
	 * peak are drawn per post, and the gain is derived from them exactly as ttdl derives it —
	 * capped upwards by the headroom the peak leaves, never capped downwards. Inventing the gain
	 * directly would have been three lines shorter and would have produced a file whose numbers
	 * do not agree with each other, which is precisely what a reader written against it would
	 * then be trusted not to notice.
	 *
	 * Three kinds of entry the viewer has to survive are seeded deliberately: a post with no
	 * soundtrack, a silent one, and posts left unmeasured — the state ttdl leaves behind when a
	 * download was cut short, and the state every post is in before `loudness` has ever run.
	 */
	measure(): void {
		const target = -14.0;
		const ceiling = -1.0;
		const posts: Record<string, unknown> = {};

		this.posts.forEach((post, index) => {
			// Every eleventh post is left out: unmeasured is not an error state, it is what the
			// scan has not reached yet.
			if (index % 11 === 7) {
				return;
			}
			if (index % 23 === 5) {
				posts[post.id] = { audio: false };
				return;
			}
			if (index % 29 === 9) {
				posts[post.id] = { i: -70.0, tp: -70.0, lra: 0.0, thresh: -70.0, silent: true, gain: 0.0 };
				return;
			}
			// TikTok's own mixes cluster well above any target, which is why the corrections in a
			// real sidecar are almost all cuts.
			const i = Number(between(-19, -5).toFixed(1));
			const tp = Number(between(-2.5, 0.2).toFixed(1));
			let gain = target - i;
			if (gain > 0) {
				gain = Math.min(gain, Math.max(ceiling - tp, 0));
			}
			posts[post.id] = {
				i,
				tp,
				lra: Number(between(1.5, 11).toFixed(1)),
				thresh: Number((i - between(9, 11)).toFixed(1)),
				gain: Number(gain.toFixed(2)),
			};
		});

		this.writeState(
			LOUDNESS_FILE,
			`${JSON.stringify({ target_i: target, target_tp: ceiling, posts }, null, 2)}\n`,
		);
	}

	finish(source: string | null): void {
		const ids = this.posts.map((p) => p.id).sort();
		this.writeState("archive.txt", `${ids.map((id) => `tiktok ${id}`).join("\n")}\n`);
		this.writeState(
			".all_ids.txt",
			`${[...ids, ...this.missing.map(([id]) => id)].sort().join("\n")}\n`,
		);
		this.writeState(
			"missing.txt",
			`${this.missing
				.map(([id, ts, err]) => `${id}  ${new Date(ts * 1000).toISOString().slice(0, 10)}  ${err}`)
				.join("\n")}\n`,
		);
		this.writeState(
			"rename-map.txt",
			"old-download-name-7300000000000000001.mp4\t20240101_7300000000000000001_adopted.mp4\n",
		);
		this.writeState(
			"ttdl.log",
			"[download] Downloading playlist\n[info] Writing video metadata as JSON\n",
		);
		if (source !== null) {
			this.writeState(".source", `${source}\n`);
		}
		// Written last, exactly as ttdl's migration writes it last: its presence is the claim that
		// everything else in here is where the current layout says it should be.
		this.writeState("version", "1\n");
	}
}

const AUTHORS: Author[] = [
	{
		handle: "testuser",
		nickname: "Test User",
		uid: "6700000000000000001",
		secUid: "MS4wLjABAAAAtestuser",
	},
	{
		handle: "kitchenlab",
		nickname: "Kitchen Lab 🍳",
		uid: "6700000000000000002",
		secUid: "MS4wLjABAAAAkitchen",
	},
	{
		handle: "berlin.daily",
		nickname: "berlin daily",
		uid: "6700000000000000003",
		secUid: "MS4wLjABAAAAberlin",
	},
	{
		handle: "mossandstone",
		nickname: "moss & stone",
		uid: "6700000000000000004",
		secUid: "MS4wLjABAAAAmoss",
	},
	{
		handle: "night_owl_92",
		nickname: "night owl",
		uid: "6700000000000000005",
		secUid: "MS4wLjABAAAAnight",
	},
	{
		handle: "paperplane",
		nickname: "paper plane ✈",
		uid: "6700000000000000006",
		secUid: "MS4wLjABAAAApaper",
	},
];

const SHAPES = [
	{ key: "portrait", width: 540, height: 960, duration: 6, hue: 0 },
	{ key: "portrait2", width: 540, height: 960, duration: 9, hue: 60 },
	{ key: "portrait3", width: 540, height: 960, duration: 4, hue: 140 },
	{ key: "portrait4", width: 540, height: 960, duration: 12, hue: 220 },
	{ key: "portrait5", width: 540, height: 960, duration: 7, hue: 300 },
];
const SHAPE_43 = { key: "four-three", width: 640, height: 480, duration: 8, hue: 30 };
const SHAPE_11 = { key: "square", width: 600, height: 600, duration: 5, hue: 190 };
const SHAPE_SHORT = { key: "very-short", width: 540, height: 960, duration: 0.8, hue: 100 };
const SHAPE_LONG = { key: "very-long", width: 540, height: 960, duration: 45, hue: 260 };

const CAROUSEL_COLORS = [
	"red",
	"orange",
	"yellow",
	"green",
	"cyan",
	"blue",
	"purple",
	"magenta",
	"white",
	"gray",
	"pink",
	"brown",
];

interface VideoPostOptions {
	archive: ArchiveWriter;
	author: Author;
	timestamp: number;
	shape: VideoSpec;
	description?: string;
	/** Write the filename with the literal "NA" date segment. */
	naDate?: boolean;
	withInfo?: boolean;
	withCover?: boolean;
	coverExt?: ".jpg" | ".jpeg" | ".webp" | ".png";
	legacyArtist?: boolean;
	/**
	 * Write only the opening bytes of the video: a real header with no playable stream.
	 *
	 * This is the download interrupted part-way, and it is the one failure the indexer cannot see.
	 * The file is named correctly and is not empty, so the post is complete by every rule ttdl and
	 * the scanner apply — it is only the browser, at play time, that discovers there is nothing to
	 * decode. Nothing else in these fixtures reaches the feed's media-failure state.
	 */
	truncatedVideo?: boolean;
}

function addVideoPost(o: VideoPostOptions): string {
	const id = makeId(o.timestamp, idCounter++);
	const description = o.description ?? caption();
	const title = titleFor(description);
	const datePart = o.naDate
		? "NA"
		: new Date(o.timestamp * 1000).toISOString().slice(0, 10).replaceAll("-", "");
	const stem = `${datePart}_${id}_${title}`;
	const files: string[] = [];

	const videoPath = video(o.shape);
	if (o.truncatedVideo) {
		o.archive.writeBytes(`${stem}.mp4`, readFileSync(videoPath).subarray(0, 2048));
	} else {
		o.archive.copy(`${stem}.mp4`, videoPath);
	}
	files.push(`${stem}.mp4`);

	if (o.withCover !== false) {
		const ext = o.coverExt ?? ".jpg";
		o.archive.copy(`${stem}${ext}`, cover(videoPath, o.shape.key, ext));
		files.push(`${stem}${ext}`);
	}
	if (o.withInfo !== false) {
		o.archive.write(
			`${stem}.info.json`,
			infoJson({
				id,
				description,
				timestamp: o.timestamp,
				author: o.author,
				duration: o.shape.duration,
				width: o.shape.width,
				height: o.shape.height,
				kind: "video",
				legacyArtist: o.legacyArtist,
			}),
		);
		files.push(`${stem}.info.json`);
	}

	o.archive.record(id, o.timestamp, files);
	return id;
}

interface CarouselOptions {
	archive: ArchiveWriter;
	author: Author;
	timestamp: number;
	images: number;
	/** What `_photo.json` claims. Omit for a state file with no count (the legacy branch). */
	expected?: number | null;
	/** Skip the `_photo.json` sidecar entirely (a very old archive). */
	noState?: boolean;
	withMarker?: boolean;
	description?: string;
	audioExt?: ".m4a" | ".mp3";
	coverExt?: ".jpg" | ".jpeg" | ".webp" | ".png";
	withInfo?: boolean;
	/** Write a zero-byte image at this index — ttdl's has_content must reject it. */
	emptyImageAt?: number;
	/** Use a different date segment for the images than for the audio. */
	imagesDatePart?: string;
	naDate?: boolean;
}

function addCarouselPost(o: CarouselOptions): string {
	const id = makeId(o.timestamp, idCounter++);
	const description = o.description ?? caption();
	const title = titleFor(description);
	const datePart = o.naDate
		? "NA"
		: new Date(o.timestamp * 1000).toISOString().slice(0, 10).replaceAll("-", "");
	const audioExt = o.audioExt ?? ".m4a";
	const duration = Math.round(between(12, 30));
	const stem = `${datePart}_${id}_${title}`;
	// The title-less prefix — this is what the carousel sidecars are keyed on (ttdl.py:610).
	const bare = `${o.imagesDatePart ?? datePart}_${id}`;
	const files: string[] = [];

	const audioPath = audioExt === ".mp3" ? audioMp3(duration, -3) : audio(duration, 2);
	o.archive.copy(`${stem}${audioExt}`, audioPath);
	files.push(`${stem}${audioExt}`);

	const coverExt = o.coverExt ?? ".jpeg";
	o.archive.copy(`${stem}${coverExt}`, solidJpeg(CAROUSEL_COLORS[0] as string));
	files.push(`${stem}${coverExt}`);

	for (let i = 1; i <= o.images; i++) {
		const name = `${bare}_photo_${String(i).padStart(2, "0")}.jpg`;
		if (o.emptyImageAt === i) {
			o.archive.write(name, "");
		} else {
			const color = CAROUSEL_COLORS[(i - 1) % CAROUSEL_COLORS.length] as string;
			o.archive.copy(name, solidJpeg(color));
		}
		files.push(name);
	}

	if (!o.noState) {
		const expected = o.expected === undefined ? o.images : o.expected;
		const downloaded = Array.from({ length: o.images }, (_, i) => i + 1).filter(
			(i) => i !== o.emptyImageAt,
		);
		const state: Record<string, unknown> = { post_id: id, downloaded };
		if (expected !== null) {
			state.expected = expected;
			state.status = downloaded.length >= expected ? "complete" : "partial";
		} else {
			state.status = "pending";
		}
		o.archive.write(`${bare}_photo.json`, `${JSON.stringify(state, null, 2)}\n`);
		files.push(`${bare}_photo.json`);
	}

	const expectedCount = o.expected === undefined ? o.images : o.expected;
	const complete =
		o.withMarker ?? (expectedCount !== null && o.images >= expectedCount && !o.emptyImageAt);
	if (complete) {
		o.archive.write(`${bare}_photo.complete`, "complete\n");
		files.push(`${bare}_photo.complete`);
	}

	if (o.withInfo !== false) {
		o.archive.write(
			`${stem}.info.json`,
			infoJson({
				id,
				description,
				timestamp: o.timestamp,
				author: o.author,
				duration,
				width: 1080,
				height: 1440,
				kind: "carousel",
			}),
		);
		files.push(`${stem}.info.json`);
	}

	o.archive.record(id, o.timestamp, files);
	return id;
}

/* ---------------------------------------------------------------------------------- the tree */

function buildTestUser(root: string): void {
	const a = new ArchiveWriter(root, "testuser");
	const author = AUTHORS[0] as Author;
	const total = 40;
	let n = 0;
	const next = () => makeTimestamp(n++, total);

	// A plain run of ordinary video posts — the common case, and most of the grid.
	for (let i = 0; i < 22; i++) {
		addVideoPost({ archive: a, author, timestamp: next(), shape: pick(SHAPES) as VideoSpec });
	}

	// --- the edge cases, one per line of the plan's table ---

	// yt-dlp had no upload date: the filename carries the literal "NA".
	addVideoPost({
		archive: a,
		author,
		timestamp: next(),
		shape: SHAPES[0] as VideoSpec,
		naDate: true,
	});

	// The `meta` gap: no .info.json at all. Must still play, with the title from the filename.
	addVideoPost({
		archive: a,
		author,
		timestamp: next(),
		shape: SHAPES[1] as VideoSpec,
		withInfo: false,
	});

	// No cover: the grid tile needs a fallback.
	addVideoPost({
		archive: a,
		author,
		timestamp: next(),
		shape: SHAPES[2] as VideoSpec,
		withCover: false,
	});

	// A pre-`artists` archive, which used artist/creator instead.
	addVideoPost({
		archive: a,
		author,
		timestamp: next(),
		shape: SHAPES[3] as VideoSpec,
		legacyArtist: true,
	});

	// Letterboxing: neither is 9:16, so the blurred backdrop has to carry them.
	addVideoPost({ archive: a, author, timestamp: next(), shape: SHAPE_43 });
	addVideoPost({ archive: a, author, timestamp: next(), shape: SHAPE_11 });

	// Scrubber extremes.
	addVideoPost({ archive: a, author, timestamp: next(), shape: SHAPE_SHORT });
	addVideoPost({ archive: a, author, timestamp: next(), shape: SHAPE_LONG });

	// A caption dense with hashtags — caption clamping and the hashtag facet.
	addVideoPost({
		archive: a,
		author,
		timestamp: next(),
		shape: SHAPES[4] as VideoSpec,
		description: `thirty tags incoming ${TAGS.concat(TAGS)
			.map((t) => `#${t}`)
			.join(" ")}`,
	});

	// A title with the slash substitute, emoji, RTL text, and a 15-digit number: proof that
	// NAME_RE must stay anchored, or the id gets picked out of the caption.
	addVideoPost({
		archive: a,
		author,
		timestamp: next(),
		shape: SHAPES[0] as VideoSpec,
		description: "before/after 🎬 مرحبا call 123456789012345 now",
	});

	// Complete carousels, including the .mp3 variant and a .webp cover.
	addCarouselPost({ archive: a, author, timestamp: next(), images: 8 });
	addCarouselPost({ archive: a, author, timestamp: next(), images: 3, audioExt: ".mp3" });
	addCarouselPost({ archive: a, author, timestamp: next(), images: 5, coverExt: ".webp" });

	// Incomplete: the state file says 8, only 5 landed, no completion marker.
	addCarouselPost({
		archive: a,
		author,
		timestamp: next(),
		images: 5,
		expected: 8,
		withMarker: false,
	});

	// A video whose file is a header and nothing else. Indexes as a complete post, because it is
	// one by every rule that can be applied to a filename and a byte count; fails at play time.
	addVideoPost({
		archive: a,
		author,
		timestamp: next(),
		shape: SHAPES[0] as VideoSpec,
		description: "the download that stopped half way",
		truncatedVideo: true,
	});

	// A state file with no count at all: the legacy "one image is enough" rule applies.
	addCarouselPost({ archive: a, author, timestamp: next(), images: 4, expected: null });

	// A zero-byte image must not count toward completeness (ttdl's has_content).
	addCarouselPost({ archive: a, author, timestamp: next(), images: 6, emptyImageAt: 3 });

	// Audio dated NA while the images are dated normally: proves grouping by id, not by prefix.
	addCarouselPost({
		archive: a,
		author,
		timestamp: next(),
		images: 4,
		naDate: true,
		imagesDatePart: "20240101",
	});

	// An orphan info.json + cover with no media: a `meta` run whose video was later deleted.
	// It must be counted as a ghost, never rendered as a post.
	{
		const ghostTs = next();
		const ghostId = makeId(ghostTs, idCounter++);
		const stem = `${new Date(ghostTs * 1000).toISOString().slice(0, 10).replaceAll("-", "")}_${ghostId}_deleted post`;
		a.write(
			`${stem}.info.json`,
			infoJson({
				id: ghostId,
				description: "deleted post",
				timestamp: ghostTs,
				author,
				duration: 5,
				width: 540,
				height: 960,
				kind: "video",
			}),
		);
		a.copy(`${stem}.jpg`, cover(video(SHAPES[0] as VideoSpec), "portrait", ".jpg"));
	}

	// Posts ttdl could not fetch, so the archive knows about gaps it cannot fill.
	a.noteMissing(makeId(1_750_000_000, 9001), 1_750_000_000, "Unable to extract universal data");
	a.noteMissing(makeId(1_740_000_000, 9002), 1_740_000_000, "Video currently unavailable");
	a.noteMissing(makeId(1_730_000_000, 9003), 1_730_000_000, "—");

	a.card(author, solidJpeg("teal", 640, 640));

	a.measure();
	a.finish(null);
	console.log(`  testuser        ${a.posts.length} posts`);
}

function buildLiked(root: string): void {
	const a = new ArchiveWriter(root, "liked");
	const total = 60;
	let n = 0;
	const next = () => makeTimestamp(n++, total);

	for (let i = 0; i < 48; i++) {
		const author = pick(AUTHORS);
		if (i % 7 === 3) {
			addCarouselPost({ archive: a, author, timestamp: next(), images: 3 + (i % 5) });
		} else {
			addVideoPost({ archive: a, author, timestamp: next(), shape: pick(SHAPES) as VideoSpec });
		}
	}
	// Four posts with no metadata at all. In a list archive the directory name says nothing about
	// authorship, so these have no derivable author and land in the "Unknown author" bucket.
	for (let i = 0; i < 4; i++) {
		addVideoPost({
			archive: a,
			author: pick(AUTHORS),
			timestamp: next(),
			shape: pick(SHAPES) as VideoSpec,
			withInfo: false,
		});
	}

	a.measure();
	a.finish("Like List.txt");
	console.log(`  liked           ${a.posts.length} posts, ${AUTHORS.length} authors`);
	writeLikesExport(root, a);
}

/**
 * The TikTok data export, in the real stanza format. ttdl's read_list (ttdl.py:853) greps only the
 * ids out of this and throws away the dates — which is exactly the information a "recently liked"
 * ordering needs, so the viewer reads the file itself.
 */
function writeLikesExport(root: string, liked: ArchiveWriter): void {
	const dir = join(root, "..", "export", "Likes and Favorites");
	mkdirSync(dir, { recursive: true });

	const sorted = [...liked.posts].sort((x, y) => y.timestamp - x.timestamp);
	const covered = sorted.slice(0, Math.floor(sorted.length * 0.7));

	// Liked dates are unrelated to publish dates — that is the whole point of the enrichment.
	const stanza = (id: string, at: number) =>
		`Date: ${new Date(at * 1000).toISOString().slice(0, 19).replace("T", " ")} UTC\n` +
		`Link: https://www.tiktokv.com/share/video/${id}/\n`;

	const likeLines = covered.map((p, i) =>
		stanza(p.id, 1_786_000_000 - i * Math.floor(between(600, 90_000))),
	);
	// Ids that exist in the export but in no archive must be ignored without complaint.
	for (let i = 0; i < 20; i++) {
		likeLines.push(stanza(makeId(1_700_000_000 + i * DAY, 5000 + i), 1_700_000_000 + i * DAY));
	}
	writeFileSync(join(dir, "Like List.txt"), `${likeLines.join("\n")}\n`);

	const favLines = covered.slice(0, 12).map((p, i) => stanza(p.id, 1_785_000_000 - i * 172_800));
	writeFileSync(join(dir, "Favorite Videos.txt"), `${favLines.join("\n")}\n`);
	writeFileSync(
		join(dir, "Favorite Collections.txt"),
		"Date: 2026-01-25 00:12:28 UTC\nTitle: Want to go\n\nDate: 2026-01-16 18:09:17 UTC\nTitle: Travel\n",
	);
	console.log(`  export/         ${covered.length} like entries + 20 unmatched`);
}

function buildEmpty(root: string): void {
	const a = new ArchiveWriter(root, "empty");
	a.finish(null);
	console.log("  empty           0 posts (state files only)");
}

function buildNotAnArchive(root: string): void {
	const dir = join(root, "not-an-archive");
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, "notes.txt"), "just some files\n");
	writeFileSync(join(dir, "random-video.mp4"), "not really a video");
	writeFileSync(join(dir, "7673909736131038495.mp4"), "an id, but not ttdl's naming");
	console.log("  not-an-archive  0 posts (unrelated files)");
}

/** Inflate the tree to ~4,000 posts with copy-on-write clones, for performance work. */
function buildBig(root: string): void {
	const a = new ArchiveWriter(root, "big");
	const author = AUTHORS[1] as Author;
	const total = 4000;
	const shapes = SHAPES.map((s) => ({ spec: s, path: video(s), key: s.key }));

	for (let i = 0; i < total; i++) {
		const timestamp = makeTimestamp(i, total);
		const id = makeId(timestamp, idCounter++);
		const description = caption();
		const title = titleFor(description);
		const datePart = new Date(timestamp * 1000).toISOString().slice(0, 10).replaceAll("-", "");
		const stem = `${datePart}_${id}_${title}`;
		const shape = shapes[i % shapes.length] as (typeof shapes)[number];

		a.copy(`${stem}.mp4`, shape.path);
		a.copy(`${stem}.jpg`, cover(shape.path, shape.key, ".jpg"));
		a.write(
			`${stem}.info.json`,
			infoJson({
				id,
				description,
				timestamp,
				author,
				duration: shape.spec.duration,
				width: shape.spec.width,
				height: shape.spec.height,
				kind: "video",
			}),
		);
		a.record(id, timestamp, [`${stem}.mp4`, `${stem}.jpg`, `${stem}.info.json`]);
	}
	a.finish(null);
	console.log(`  big             ${a.posts.length} posts (APFS clones)`);
}

/* -------------------------------------------------------------------------------------- main */

const started = performance.now();
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
mkdirSync(CACHE, { recursive: true });

console.log(`generating fixtures in ${OUT} (seed ${SEED})`);
buildTestUser(OUT);
buildLiked(OUT);
buildEmpty(OUT);
buildNotAnArchive(OUT);
if (BIG) {
	buildBig(OUT);
}

console.log(`done in ${Math.round(performance.now() - started)} ms`);

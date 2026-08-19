import { existsSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { rememberedRoot, settingsPath } from "./settings.ts";

/**
 * How the root was decided.
 *
 * Only a root someone actually named is worth remembering. Persisting one that was merely found by
 * probing would freeze a lucky guess into a setting nobody chose and nobody knows to look for.
 */
export type RootFrom = "flag" | "env" | "settings" | "probe";

export interface Config {
	/** Absolute, symlink-resolved path to the directory holding one subdirectory per archive. */
	root: string;
	rootFrom: RootFrom;
	port: number;
	host: string;
	/**
	 * An export kept somewhere other than beside the archives.
	 *
	 * Normally null: the export is found by looking where the archives already are, and saying so
	 * on the command line is not part of running this. See `findLikes`.
	 */
	likesOverride: string | null;
	serveStatic: boolean;
}

interface Flags {
	root?: string;
	port?: number;
	host?: string;
	likes?: string;
	lan?: boolean;
}

function parseFlags(argv: string[]): Flags {
	const flags: Flags = {};
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === undefined || !arg.startsWith("--")) {
			continue;
		}
		// Accept both "--root x" and "--root=x".
		const eq = arg.indexOf("=");
		const name = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
		// Bare flags are read before the value step, or `--lan` would swallow the argument after it.
		if (name === "lan") {
			flags.lan = true;
			continue;
		}
		const value = eq === -1 ? argv[++i] : arg.slice(eq + 1);
		if (value === undefined) {
			continue;
		}
		switch (name) {
			case "root":
				flags.root = value;
				break;
			case "port":
				flags.port = Number(value);
				break;
			case "host":
				flags.host = value;
				break;
			case "likes":
				flags.likes = value;
				break;
		}
	}
	return flags;
}

function isDir(path: string): boolean {
	try {
		return statSync(path).isDirectory();
	} catch {
		return false;
	}
}

/**
 * Resolve where the archives live.
 *
 * In order: what this run was told, what a previous run was told, then the places archives are
 * usually kept. `fixtures/downloads` is deliberately last of those — it holds the synthetic archive
 * `bun run fixtures` generates, and a checkout that has one would otherwise shadow the real
 * archives with 92 fabricated posts, which reads as data loss rather than as the wrong directory.
 *
 * Failing here is the single most likely first-run problem, so the error lists every candidate that
 * was tried rather than just saying "not found".
 */
function resolveRoot(explicit: string | undefined): { root: string; from: RootFrom } {
	if (explicit) {
		const abs = isAbsolute(explicit) ? explicit : resolve(process.cwd(), explicit);
		if (isDir(abs)) {
			return { root: realpathSync(abs), from: "flag" };
		}
		throw new Error(
			`No archive root at ${abs}\n\n` +
				"That is where --root or TTDL_VIEWER_ROOT points; nothing was read.",
		);
	}

	const remembered = rememberedRoot();
	if (remembered && isDir(remembered)) {
		return { root: remembered, from: "settings" };
	}

	const tried: string[] = [];
	for (const candidate of [
		"./downloads",
		"../ttdl/downloads",
		join(homedir(), "code/ttdl/downloads"),
		"./fixtures/downloads",
	]) {
		const abs = isAbsolute(candidate) ? candidate : resolve(process.cwd(), candidate);
		tried.push(abs);
		if (isDir(abs)) {
			return { root: realpathSync(abs), from: "probe" };
		}
	}

	throw new Error(
		`No archive root found. Tried:\n${tried.map((t) => `  ${t}`).join("\n")}\n\n` +
			`Pass --root <dir> once and it is remembered in ${settingsPath()}.\n` +
			"Or set TTDL_VIEWER_ROOT, or run `bun run fixtures` to generate a test archive.",
	);
}

/**
 * Loopback unless the LAN was asked for in so many words.
 *
 * This process serves arbitrary local media with no authentication in front of it, so reaching the
 * network stays a decision someone makes out loud. `--lan` is that decision spelled as what it
 * means rather than as an address to remember.
 */
function resolveHost(flags: Flags): string {
	if (flags.host) {
		return flags.host;
	}
	if (flags.lan) {
		return "0.0.0.0";
	}
	return process.env.TTDL_VIEWER_HOST ?? "127.0.0.1";
}

/**
 * An export path someone typed, checked before it is believed.
 *
 * A path that is not there used to read as "no export": the two sort options silently vanished
 * from the UI, with nothing anywhere saying why. Asking for a specific export and getting none is
 * a mistake worth stopping for — unlike finding none, which is simply the ordinary case.
 */
function resolveLikes(explicit: string | undefined): string | null {
	if (!explicit) {
		return null;
	}
	const abs = isAbsolute(explicit) ? explicit : resolve(process.cwd(), explicit);
	if (!existsSync(abs)) {
		throw new Error(
			`No TikTok export at ${abs}\n\n` +
				"--likes is only needed for an export kept away from the archives; unpack it into the " +
				"archive root and it is found on its own.",
		);
	}
	return realpathSync(abs);
}

export function loadConfig(argv: string[] = process.argv.slice(2)): Config {
	const flags = parseFlags(argv);
	const named = flags.root ?? process.env.TTDL_VIEWER_ROOT;
	const { root, from } = resolveRoot(named);

	return {
		root,
		// The flag and the variable are the same decision as far as remembering goes; which one
		// carried it only matters to the line printed at startup.
		rootFrom: named ? (flags.root ? "flag" : "env") : from,
		port: flags.port ?? Number(process.env.TTDL_VIEWER_API_PORT ?? 4174),
		host: resolveHost(flags),
		likesOverride: resolveLikes(flags.likes ?? process.env.TTDL_VIEWER_LIKES),
		serveStatic: process.env.NODE_ENV === "production",
	};
}

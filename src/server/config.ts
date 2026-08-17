import { existsSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

export interface Config {
	/** Absolute, symlink-resolved path to the directory holding one subdirectory per archive. */
	root: string;
	port: number;
	host: string;
	/** Optional TikTok data export directory, for liked/favorited dates. */
	likesDir: string | null;
	serveStatic: boolean;
}

interface Flags {
	root?: string;
	port?: number;
	host?: string;
	likes?: string;
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
 * Failing here is the single most likely first-run problem, so the error lists every candidate
 * that was tried rather than just saying "not found".
 */
function resolveRoot(explicit: string | undefined): string {
	const candidates = explicit
		? [explicit]
		: [
				process.env.TTDL_VIEWER_ROOT,
				"./downloads",
				"./fixtures/downloads",
				"../ttdl/downloads",
				join(homedir(), "code/ttdl/downloads"),
			].filter((c): c is string => Boolean(c));

	const tried: string[] = [];
	for (const candidate of candidates) {
		const abs = isAbsolute(candidate) ? candidate : resolve(process.cwd(), candidate);
		tried.push(abs);
		if (isDir(abs)) {
			return realpathSync(abs);
		}
	}

	throw new Error(
		`No archive root found. Tried:\n${tried.map((t) => `  ${t}`).join("\n")}\n\n` +
			"Pass --root <dir>, set TTDL_VIEWER_ROOT, or run `bun run fixtures` to generate a test archive.",
	);
}

export function loadConfig(argv: string[] = process.argv.slice(2)): Config {
	const flags = parseFlags(argv);
	const likes = flags.likes ?? process.env.TTDL_VIEWER_LIKES;

	return {
		root: resolveRoot(flags.root),
		port: flags.port ?? Number(process.env.TTDL_VIEWER_API_PORT ?? 4174),
		// Loopback by default: this process serves arbitrary local media and has no business
		// appearing on the LAN unless someone asks for it in so many words.
		host: flags.host ?? process.env.TTDL_VIEWER_HOST ?? "127.0.0.1",
		likesDir: likes && existsSync(likes) ? realpathSync(likes) : null,
		serveStatic: process.env.NODE_ENV === "production",
	};
}

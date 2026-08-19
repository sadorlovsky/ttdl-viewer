/**
 * The one thing this program cannot work out on its own: where the archives are.
 *
 * Everything else about a run is found rather than configured — the archives by listing the root,
 * the author by reading ttdl's card, the saving dates by reading ttdl's cache. The root is the
 * exception, because nothing on the machine says which directory ttdl downloads into, and the
 * candidates below are guesses that only happen to be right.
 *
 * So it is remembered instead of guessed twice. Told once with `--root`, later runs need no flags
 * at all. Nothing else is kept here: this is not a preferences file, and a setting that belongs to
 * one run — the port, the interface — stays on the command line where it can be seen.
 *
 * This is the only thing the program writes, and it writes it outside every archive. The promise
 * is that nothing here can damage a download, not that the process never opens a file for writing.
 */

import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

interface Settings {
	root?: string;
}

/**
 * Read at call time rather than at import, so a test can point this somewhere disposable — and so
 * `XDG_CONFIG_HOME` works on the machines that set it, without it being required on the ones that
 * do not. `~/.config` is the fallback on macOS too: it is where this class of file has ended up
 * regardless of what Apple documents.
 */
export function settingsPath(): string {
	const base = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
	return join(base, "ttdl-viewer", "config.json");
}

export function readSettings(): Settings {
	try {
		const raw: unknown = JSON.parse(readFileSync(settingsPath(), "utf8"));
		if (raw && typeof raw === "object" && !Array.isArray(raw)) {
			const { root } = raw as { root?: unknown };
			return typeof root === "string" && root !== "" ? { root } : {};
		}
	} catch {
		// No file yet, or one that has been edited into something unreadable. Either way this is a
		// convenience, and a convenience that throws on startup is worse than none.
	}
	return {};
}

export type Remembered = "saved" | "unchanged" | "failed";

/**
 * Keep this root for next time.
 *
 * Rewriting an unchanged value is reported rather than done: the file's mtime is the only trace
 * this leaves on the system, and moving it on every start would make it look like something is
 * happening when nothing is.
 */
export function rememberRoot(root: string): Remembered {
	if (readSettings().root === root) {
		return "unchanged";
	}
	const path = settingsPath();
	try {
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, `${JSON.stringify({ root }, null, "\t")}\n`);
		return "saved";
	} catch {
		// A read-only home, a container without one — neither is a reason to refuse to serve the
		// archives that were just indexed. The flag still worked; only the memory of it did not.
		return "failed";
	}
}

/** The remembered root, if it is still a directory. */
export function rememberedRoot(): string | null {
	const { root } = readSettings();
	if (!root) {
		return null;
	}
	try {
		// Resolved rather than trusted: an archive directory that has since been deleted or moved
		// must fall through to the candidates below it, not fail the startup.
		return realpathSync(root);
	} catch {
		return null;
	}
}

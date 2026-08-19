/**
 * Remembering the archive root.
 *
 * Every test here points XDG_CONFIG_HOME at a temporary directory: the module reads it at call
 * time precisely so that a test run cannot write into the machine's real config and cannot be
 * affected by what is already there.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
	readSettings,
	rememberedRoot,
	rememberRoot,
	settingsPath,
} from "../src/server/settings.ts";

let config: string;
let archives: string;
const before = process.env.XDG_CONFIG_HOME;

beforeEach(() => {
	config = mkdtempSync(join(tmpdir(), "ttdl-config-"));
	archives = mkdtempSync(join(tmpdir(), "ttdl-archives-"));
	process.env.XDG_CONFIG_HOME = config;
});

afterEach(() => {
	if (before === undefined) {
		process.env.XDG_CONFIG_HOME = undefined;
	} else {
		process.env.XDG_CONFIG_HOME = before;
	}
	rmSync(config, { recursive: true, force: true });
	rmSync(archives, { recursive: true, force: true });
});

describe("rememberRoot", () => {
	test("writes a root that a later run reads back", () => {
		expect(rememberRoot(archives)).toBe("saved");
		expect(readSettings().root).toBe(archives);
		// Resolved on the way out, as the root always is — on macOS the temp directory is a
		// symlink, and /var and /private/var must not be two different archives.
		expect(rememberedRoot()).toBe(realpathSync(archives));
	});

	test("does not rewrite an unchanged root", () => {
		rememberRoot(archives);
		// Reported rather than done: the file's mtime is the only trace this leaves, and moving it
		// on every start would suggest something happened when nothing did.
		expect(rememberRoot(archives)).toBe("unchanged");
	});

	test("replaces the previous root rather than accumulating", () => {
		const other = mkdtempSync(join(tmpdir(), "ttdl-archives-"));
		rememberRoot(archives);
		expect(rememberRoot(other)).toBe("saved");
		expect(readSettings().root).toBe(other);
		rmSync(other, { recursive: true, force: true });
	});
});

describe("reading it back", () => {
	test("no file yet is not an error", () => {
		expect(readSettings()).toEqual({});
		expect(rememberedRoot()).toBeNull();
	});

	test("a directory that has since been deleted reads as no root", () => {
		rememberRoot(archives);
		rmSync(archives, { recursive: true, force: true });
		// So the candidates below it still get their turn, rather than the startup failing on a
		// path nobody typed this time.
		expect(rememberedRoot()).toBeNull();
	});

	test("a file edited into nonsense is ignored rather than thrown over", () => {
		mkdirSync(dirname(settingsPath()), { recursive: true });
		for (const junk of ["", "not json", "[]", '{"root": 5}', '{"root": ""}']) {
			writeFileSync(settingsPath(), junk);
			expect(readSettings()).toEqual({});
			expect(rememberedRoot()).toBeNull();
		}
	});
});

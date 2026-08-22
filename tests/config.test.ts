/**
 * Resolving the archive root.
 *
 * XDG_CONFIG_HOME points at a temporary directory so that a remembered root on the machine running
 * the tests cannot be picked up instead of the one each test names.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../src/server/config.ts";

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
	chmodSync(archives, 0o755);
	rmSync(config, { recursive: true, force: true });
	rmSync(archives, { recursive: true, force: true });
});

describe("loadConfig", () => {
	test("takes a root it can read", () => {
		// mkdtemp hands back /var/... on macOS, where the resolved path is /private/var/...
		expect(loadConfig(["--root", archives]).root).toBe(realpathSync(archives));
	});

	// 0o111 is the shape the container hits: the path resolves, and listing it does not. Root
	// ignores the mode, so there is nothing to assert when the tests run as root.
	test.skipIf(process.getuid?.() === 0)("names the permission when the root cannot be listed", () => {
		chmodSync(archives, 0o111);
		expect(() => loadConfig(["--root", archives])).toThrow(/Cannot read/);
	});
});

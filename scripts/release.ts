/**
 * Bump the version, commit it, and tag the commit.
 *
 * The tag is what the Release workflow reacts to, and package.json is what the server reports over
 * /api/stats, so the two have to agree. Doing both here is what keeps them agreeing; the workflow
 * checks it again and refuses to publish if they ever drift.
 *
 *   bun run release patch      0.1.0 -> 0.1.1
 *   bun run release minor      0.1.0 -> 0.2.0
 *   bun run release major      0.1.0 -> 1.0.0
 *   bun run release 0.4.0-rc.1 an exact version, for a prerelease
 *
 * Nothing is pushed. The last line prints the command that starts the release.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Annotated on the variable, not just on the arrow: that is what lets TypeScript treat a call to
// it as the end of the road and narrow everything after it.
const die: (message: string) => never = (message) => {
	console.error(message);
	process.exit(1);
};

const run = (...args: string[]) => {
	const result = Bun.spawnSync(args, { stdio: ["inherit", "pipe", "inherit"] });
	if (result.exitCode !== 0) {
		die(`\`${args.join(" ")}\` failed`);
	}
	return result.stdout.toString().trim();
};

const bump = process.argv[2];
if (!bump) {
	die("Usage: bun run release <patch|minor|major|x.y.z>");
}

// A tag points at a commit, and a commit that is not on main is one nobody else can reach. An
// uncommitted change would be in the image but not in anything the tag describes.
if (run("git", "rev-parse", "--abbrev-ref", "HEAD") !== "main") {
	die("Not on main.");
}
if (run("git", "status", "--porcelain") !== "") {
	die("Working tree is not clean.");
}

const PACKAGE = fileURLToPath(new URL("../package.json", import.meta.url));
const source = readFileSync(PACKAGE, "utf8");
const current = (JSON.parse(source) as { version: string }).version;

// Only the three keywords need the current version taken apart. An exact version is passed
// through, which is the way out of a prerelease: 0.4.0-rc.1 has no patch to increment.
const step = (kind: string) => {
	const [major, minor, patch] = current.split(".").map(Number);
	if (
		major === undefined ||
		minor === undefined ||
		patch === undefined ||
		[major, minor, patch].some(Number.isNaN)
	) {
		die(`package.json version is ${current}; say the next one in full.`);
	}
	if (kind === "patch") {
		return `${major}.${minor}.${patch + 1}`;
	}
	if (kind === "minor") {
		return `${major}.${minor + 1}.0`;
	}
	return `${major + 1}.0.0`;
};

const next = ["patch", "minor", "major"].includes(bump) ? step(bump) : bump;

// Exact versions are taken as given, but a typo here becomes a tag, and tags are the one thing
// that is awkward to take back.
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(next)) {
	die(`Not a version: ${next}`);
}
if (run("git", "tag", "--list", `v${next}`) !== "") {
	die(`Tag v${next} already exists.`);
}

// The checks CI runs, run before the tag exists rather than after. A tag that fails CI has to be
// deleted from the remote and from every clone that fetched it.
for (const check of [
	["bun", "test"],
	["bun", "run", "typecheck"],
	["bun", "run", "lint"],
	["bun", "run", "build"],
]) {
	console.log(`\n$ ${check.join(" ")}`);
	const result = Bun.spawnSync(check, { stdio: ["inherit", "inherit", "inherit"] });
	if (result.exitCode !== 0) {
		die(`\n${check.join(" ")} failed. Nothing was changed.`);
	}
}

// Rewritten rather than re-serialized: JSON.stringify would reorder nothing but would reformat
// everything, and the diff of a release commit should be one line.
writeFileSync(PACKAGE, source.replace(`"version": "${current}"`, `"version": "${next}"`));

run("git", "add", "package.json");
run("git", "commit", "-m", `release: v${next}`);
run("git", "tag", "-a", `v${next}`, "-m", `v${next}`);

console.log(`\nv${current} -> v${next}, committed and tagged.\n`);
console.log("  git push origin main --follow-tags\n");

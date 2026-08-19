import { join, relative, resolve } from "node:path";
import { type Config, loadConfig } from "./config.ts";
import { findLikes } from "./index/likes.ts";
import { Registry } from "./index/registry.ts";
import { apiRoutes, fail } from "./routes/api.ts";
import { mediaRoutes } from "./routes/media.ts";
import { rememberRoot, settingsPath } from "./settings.ts";

let config: Config;
try {
	config = loadConfig();
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(2);
}

const likes = findLikes(config.root, config.likesOverride);
const registry = new Registry(config.root, likes.index, likes.notArchives);
const started = performance.now();
registry.rebuild();
const stats = registry.stats();
const tookMs = Math.round(performance.now() - started);

// Only a root someone named. A probed one is a guess, and freezing a guess into a setting is how
// a program ends up serving the wrong directory for months.
const remembered =
	config.rootFrom === "flag" || config.rootFrom === "env" ? rememberRoot(config.root) : null;

const DIST = join(process.cwd(), "dist");

/**
 * In production one Bun process also serves the built app.
 *
 * The client routes on paths like /a/liked/feed/7673…, which exist only in the browser — there is
 * no such file on disk. Anything that is not a real file therefore has to come back as index.html,
 * or reloading a deep link (or opening a bookmark) would 404. Only genuine misses fall through:
 * a missing asset stays a 404 rather than quietly returning HTML, which otherwise shows up as a
 * baffling "unexpected token <" in the console.
 */
async function staticHandler(request: Request): Promise<Response> {
	const url = new URL(request.url);
	const requested = url.pathname === "/" ? "/index.html" : url.pathname;

	// The path comes from the request, so it has to be resolved and checked rather than joined.
	const resolved = resolve(DIST, `.${requested}`);
	const inside = resolved === DIST || resolved.startsWith(`${DIST}/`);

	if (inside) {
		const file = Bun.file(resolved);
		if (await file.exists()) {
			return new Response(file, {
				headers: {
					// Vite fingerprints everything under /assets, so those can be cached hard;
					// index.html is the one file that must always be revalidated, or a rebuilt app
					// keeps serving the previous bundle's script tags.
					"Cache-Control": requested.startsWith("/assets/")
						? "public, max-age=31536000, immutable"
						: "no-cache",
				},
			});
		}
	}

	// A path that looks like a file the build should have emitted is a real miss.
	if (/\.[a-z0-9]+$/i.test(requested)) {
		return fail("NOT_FOUND", `No such asset: ${url.pathname}`, 404);
	}

	const index = Bun.file(join(DIST, "index.html"));
	if (!(await index.exists())) {
		return fail("NOT_FOUND", "dist/index.html is missing — run `bun run build`", 404);
	}
	return new Response(index, { headers: { "Cache-Control": "no-cache" } });
}

const server = Bun.serve({
	port: config.port,
	hostname: config.host,
	routes: {
		...apiRoutes(registry, { root: config.root, likesDir: likes.dir }),
		...mediaRoutes(registry),
	},
	fetch: (request) => {
		const url = new URL(request.url);
		if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/media/")) {
			return fail("NOT_FOUND", `No route for ${url.pathname}`, 404);
		}
		if (config.serveStatic) {
			return staticHandler(request);
		}
		return fail("NOT_FOUND", "Run `bun run dev` and use the Vite port for the UI", 404);
	},
	error: (error) => {
		console.error(error);
		return fail("INTERNAL", error.message, 500);
	},
});

/** The parenthetical after the root: where this path came from, and whether it will be next time. */
function rootNote(): string {
	if (config.rootFrom === "settings") {
		return "  (remembered)";
	}
	if (remembered === "saved") {
		return "  (remembered for next time)";
	}
	if (remembered === "failed") {
		return `  (could not be written to ${settingsPath()})`;
	}
	return "";
}

console.log(`ttdl-viewer api  http://${server.hostname}:${server.port}`);
console.log(`         root  ${config.root}${rootNote()}`);
console.log(
	`        index  ${stats.archives} archives, ${stats.posts} posts, ` +
		`${(stats.bytes / 1e9).toFixed(2)} GB in ${tookMs} ms`,
);

/**
 * What the feed can order by "recently saved", and on whose authority.
 *
 * Said per source rather than as one total, because the two mean different things to whoever is
 * reading: dates ttdl recorded are permanent, dates read out of an export sitting in the root last
 * only as long as that folder does.
 */
const dated = registry.list().filter((a) => a.likedFrom !== null);
const datedPosts = (from: string) =>
	dated
		.filter((a) => a.likedFrom === from)
		.reduce((total, a) => total + a.posts.filter((p) => p.liked).length, 0);

const plural = (n: number) => (n === 1 ? "date" : "dates");

const recorded = datedPosts("ttdl");
if (recorded > 0) {
	console.log(`        saved  ${recorded} ${plural(recorded)} recorded by ttdl`);
}
const borrowed = datedPosts("export");
if (borrowed > 0 && likes.dir) {
	const where = likes.dir === config.root ? "the root" : `${relative(config.root, likes.dir)}/`;
	console.log(`        saved  ${borrowed} ${plural(borrowed)} read from the export in ${where}`);
	// The export is a folder someone will eventually tidy away; ttdl can put these dates somewhere
	// they survive that, and it is one command.
	const names = dated.filter((a) => a.likedFrom === "export").map((a) => a.archive.name);
	console.log(
		`               to keep them: ttdl.py get ${names.map((n) => JSON.stringify(n)).join(" ")}` +
			` --likes ${likes.dir}`,
	);
}
if (stats.archives === 0) {
	console.log("\nNo archives found. Download one with ttdl, or run `bun run fixtures`.");
}

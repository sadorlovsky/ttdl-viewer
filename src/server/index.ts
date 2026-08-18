import { join, resolve } from "node:path";
import { type Config, loadConfig } from "./config.ts";
import { readLikes } from "./index/likes.ts";
import { Registry } from "./index/registry.ts";
import { apiRoutes, fail } from "./routes/api.ts";
import { mediaRoutes } from "./routes/media.ts";

let config: Config;
try {
	config = loadConfig();
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(2);
}

const likes = readLikes(config.likesDir);
const registry = new Registry(config.root, likes);
const started = performance.now();
registry.rebuild();
const stats = registry.stats();
const tookMs = Math.round(performance.now() - started);

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
		...apiRoutes(registry, config),
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

console.log(`ttdl-viewer api  http://${server.hostname}:${server.port}`);
console.log(`         root  ${config.root}`);
console.log(
	`        index  ${stats.archives} archives, ${stats.posts} posts, ` +
		`${(stats.bytes / 1e9).toFixed(2)} GB in ${tookMs} ms`,
);
if (config.likesDir) {
	console.log(`        likes  ${likes.size} saved dates from ${config.likesDir}`);
} else if (stats.archives > 0) {
	console.log("        likes  none — pass --likes <export dir> to sort by when you saved a post");
}
if (stats.archives === 0) {
	console.log("\nNo archives found. Download one with ttdl, or run `bun run fixtures`.");
}

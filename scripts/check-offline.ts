/**
 * Fail the build if anything in dist/ points at a remote host.
 *
 * This is the cheap half of the offline guarantee (the Playwright request listener is the other
 * half). It catches the case that is easy to introduce and impossible to notice: a CDN font, an
 * inlined CDN thumbnail URL that survived normalization, an analytics snippet pulled in by a
 * transitive dependency.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const DIST = join(process.cwd(), "dist");
const SCANNED = new Set([".js", ".mjs", ".css", ".html", ".json", ".map", ".svg"]);

/**
 * Remote-looking strings that can never become a request.
 *
 * Kept deliberately narrow — each entry is a specific path, not a whole host — because the value
 * of this check is entirely in what it refuses to wave through.
 */
const ALLOWED = [
	// XML namespaces. React DOM passes these to createElementNS; they identify a language, and
	// nothing ever dereferences them.
	/https?:\/\/www\.w3\.org\/(?:2000\/svg|1999\/xhtml|1999\/xlink|1998\/Math\/MathML|XML\/1998\/namespace)/g,
	// React's own console strings: the minified-error decoder and the devtools nudge. Both are
	// printed for a human to click, never fetched — and the page's CSP would refuse them anyway.
	/https?:\/\/react\.dev\/(?:errors|link)\/[\w-]*/g,
	/https?:\/\/localhost(?::\d+)?/g,
	/https?:\/\/127\.0\.0\.1(?::\d+)?/g,
];

const REMOTE = /(?:https?:)?\/\/[a-z0-9][a-z0-9.-]*\.[a-z]{2,}/gi;

function* walk(dir: string): Generator<string> {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) {
			yield* walk(path);
		} else if (entry.isFile()) {
			yield path;
		}
	}
}

let violations = 0;

try {
	statSync(DIST);
} catch {
	console.error(`check-offline: ${DIST} does not exist — run \`vite build\` first.`);
	process.exit(1);
}

for (const path of walk(DIST)) {
	if (!SCANNED.has(extname(path))) {
		continue;
	}
	let text = readFileSync(path, "utf8");
	for (const allowed of ALLOWED) {
		text = text.replace(allowed, "");
	}
	const hits = [...new Set(text.match(REMOTE) ?? [])];
	if (hits.length > 0) {
		violations += hits.length;
		console.error(`offline violation in ${relative(process.cwd(), path)}:`);
		for (const hit of hits) {
			console.error(`  ${hit}`);
		}
	}
}

if (violations > 0) {
	console.error(`\ncheck-offline: ${violations} remote reference(s) in the bundle.`);
	process.exit(1);
}

console.log("check-offline: no remote references in dist/");

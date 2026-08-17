/**
 * Run the API and the Vite dev server as one foreground process.
 *
 * Two processes, one Ctrl-C: without this, killing the terminal leaves an orphaned Bun server
 * holding the API port, and the next `bun run dev` fails on strictPort with a confusing message.
 */
const API_PORT = process.env.TTDL_VIEWER_API_PORT ?? "4174";
const WEB_PORT = process.env.TTDL_VIEWER_WEB_PORT ?? "4173";

const env = { ...process.env, TTDL_VIEWER_API_PORT: API_PORT, TTDL_VIEWER_WEB_PORT: WEB_PORT };
const passthrough = process.argv.slice(2);

const api = Bun.spawn(["bun", "--hot", "src/server/index.ts", ...passthrough], {
	env,
	stdio: ["inherit", "inherit", "inherit"],
});

const web = Bun.spawn(["bunx", "vite"], {
	env,
	stdio: ["inherit", "inherit", "inherit"],
});

let shuttingDown = false;
const shutdown = () => {
	if (shuttingDown) {
		return;
	}
	shuttingDown = true;
	api.kill();
	web.kill();
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("exit", shutdown);

// If either half dies, the other is useless — take both down so the failure is visible.
const [apiCode, webCode] = await Promise.race([
	api.exited.then((code) => [code, null] as const),
	web.exited.then((code) => [null, code] as const),
]);
shutdown();
process.exit(apiCode ?? webCode ?? 0);

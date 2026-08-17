import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const API_PORT = Number(process.env.TTDL_VIEWER_API_PORT ?? 4174);
const WEB_PORT = Number(process.env.TTDL_VIEWER_WEB_PORT ?? 4173);

/**
 * The offline guarantee, made structural.
 *
 * Production gets the strict policy. Development has to allow inline scripts and a websocket —
 * that is how Vite's HMR client works — but the parts that actually matter for "nothing leaves
 * this machine" (img, media, font, connect to anywhere but self) stay locked in both modes, so a
 * stray remote URL fails on the developer's machine instead of only on a plane.
 */
function csp(): Plugin {
	const shared = [
		"default-src 'self'",
		"img-src 'self' data: blob:",
		"media-src 'self' blob:",
		"font-src 'self'",
		"frame-src 'none'",
		"object-src 'none'",
		"base-uri 'self'",
		"form-action 'none'",
	];
	const prod = [...shared, "script-src 'self'", "style-src 'self' 'unsafe-inline'", "connect-src 'self'"];
	const dev = [
		...shared,
		"script-src 'self' 'unsafe-inline'",
		"style-src 'self' 'unsafe-inline'",
		`connect-src 'self' ws://localhost:${WEB_PORT} ws://127.0.0.1:${WEB_PORT}`,
	];

	return {
		name: "ttdl-viewer-csp",
		transformIndexHtml(html, ctx) {
			const policy = (ctx.server ? dev : prod).join("; ");
			return html.replace(
				"<!--CSP-->",
				`<meta http-equiv="Content-Security-Policy" content="${policy}" />`,
			);
		},
	};
}

export default defineConfig({
	plugins: [react(), csp()],
	server: {
		host: "127.0.0.1",
		port: WEB_PORT,
		strictPort: true,
		proxy: {
			"/api": { target: `http://127.0.0.1:${API_PORT}`, changeOrigin: false },
			"/media": { target: `http://127.0.0.1:${API_PORT}`, changeOrigin: false },
		},
	},
	build: {
		outDir: "dist",
		emptyOutDir: true,
		// Media comes off the API, never inlined — keep the bundle free of base64 payloads.
		assetsInlineLimit: 0,
	},
});

// @ts-check
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";

const REPO = "https://github.com/sadorlovsky/ttdl-viewer";

/** Dark first, light second — Starlight keys the generated CSS off `theme.type`. */
const byTheme = (dark, light) => ({ theme }) => (theme.type === "dark" ? dark : light);

export default defineConfig({
	// Served from the root of its own subdomain as static assets on a Cloudflare Worker, so there
	// is no base path. `site` is what makes the sitemap and canonical URLs absolute.
	site: "https://ttdl-viewer.orlovsky.dev",
	integrations: [
		starlight({
			title: "ttdl-viewer",
			description: "A read-only, fully offline viewer for archives downloaded by ttdl.",
			social: [{ icon: "github", label: "GitHub", href: REPO }],
			editLink: { baseUrl: `${REPO}/edit/main/docs/` },
			customCss: ["./src/styles/theme.css"],
			expressiveCode: {
				themes: ["github-dark", "github-light"],
				styleOverrides: {
					borderRadius: "0.5rem",
					borderColor: byTheme("rgb(255 255 255 / 0.12)", "rgb(0 0 0 / 0.12)"),
					codeBackground: byTheme("#1c1c1c", "#fbfbfb"),
					frames: {
						editorTabBarBackground: byTheme("#1c1c1c", "#f1f1f1"),
						terminalBackground: byTheme("#1c1c1c", "#fbfbfb"),
						terminalTitlebarBackground: byTheme("#1c1c1c", "#f1f1f1"),
					},
				},
			},
			lastUpdated: true,
			sidebar: [
				{
					label: "Start",
					items: [
						{ label: "What this is", slug: "start/what-this-is" },
						{ label: "Running it locally", slug: "start/running-it-locally" },
						{ label: "Configuration", slug: "start/configuration" },
					],
				},
				{
					label: "Guides",
					items: [
						{ label: "Liked and favorited dates", slug: "guides/liked-dates" },
						{ label: "Evening out the volume", slug: "guides/loudness" },
						{ label: "Running it in Docker", slug: "guides/docker" },
						{ label: "Running it on a Synology NAS", slug: "guides/synology" },
					],
				},
				{
					label: "Reference",
					items: [
						{ label: "HTTP API", slug: "reference/http-api" },
						{ label: "Reading ttdl's format", slug: "reference/archive-format" },
						{ label: "Fixtures and checks", slug: "reference/fixtures-and-checks" },
					],
				},
				{
					label: "Explanation",
					items: [
						{ label: "Layout", slug: "explanation/layout" },
						{ label: "Notable decisions", slug: "explanation/decisions" },
						{ label: "Known limits", slug: "explanation/known-limits" },
					],
				},
			],
		}),
	],
});

// @ts-check
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";

const REPO = "https://github.com/sadorlovsky/ttdl-viewer";

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
			// The viewer has no light mode. Neither should the page describing it — see
			// src/components/ThemeSelect.astro.
			components: { ThemeSelect: "./src/components/ThemeSelect.astro" },
			expressiveCode: {
				themes: ["github-dark"],
				styleOverrides: {
					borderRadius: "0.5rem",
					borderColor: "rgb(255 255 255 / 0.12)",
					codeBackground: "#1c1c1c",
					frames: { editorTabBarBackground: "#1c1c1c", terminalBackground: "#1c1c1c" },
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

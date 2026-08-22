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
			// English keeps the bare paths it has always had; Russian lives under /ru/. Moving the
			// English pages into an `en/` directory would have changed every published URL, and the
			// README and ttdl's own site link to them.
			defaultLocale: "root",
			locales: {
				root: { label: "English", lang: "en" },
				ru: { label: "Русский", lang: "ru" },
			},
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
					translations: { ru: "Начало" },
					items: [
						{
							label: "What this is",
							translations: { ru: "Что это такое" },
							slug: "start/what-this-is",
						},
						{
							label: "Running it locally",
							translations: { ru: "Запуск локально" },
							slug: "start/running-it-locally",
						},
						{ label: "Configuration", translations: { ru: "Настройка" }, slug: "start/configuration" },
					],
				},
				{
					label: "Guides",
					translations: { ru: "Руководства" },
					items: [
						{
							label: "Liked and favorited dates",
							translations: { ru: "Даты лайков и избранного" },
							slug: "guides/liked-dates",
						},
						{
							label: "Evening out the volume",
							translations: { ru: "Выровнять громкость" },
							slug: "guides/loudness",
						},
						{
							label: "Running it in Docker",
							translations: { ru: "Запуск в Docker" },
							slug: "guides/docker",
						},
						{
							label: "Running it on a Synology NAS",
							translations: { ru: "Запуск на Synology NAS" },
							slug: "guides/synology",
						},
					],
				},
				{
					label: "Reference",
					translations: { ru: "Справочник" },
					items: [
						{ label: "HTTP API", translations: { ru: "HTTP API" }, slug: "reference/http-api" },
						{
							label: "Reading ttdl's format",
							translations: { ru: "Чтение формата ttdl" },
							slug: "reference/archive-format",
						},
						{
							label: "Fixtures and checks",
							translations: { ru: "Фикстуры и проверки" },
							slug: "reference/fixtures-and-checks",
						},
					],
				},
				{
					label: "Explanation",
					translations: { ru: "Объяснения" },
					items: [
						{ label: "Layout", translations: { ru: "Структура" }, slug: "explanation/layout" },
						{
							label: "Notable decisions",
							translations: { ru: "Заметные решения" },
							slug: "explanation/decisions",
						},
						{
							label: "Known limits",
							translations: { ru: "Известные ограничения" },
							slug: "explanation/known-limits",
						},
					],
				},
			],
		}),
	],
});

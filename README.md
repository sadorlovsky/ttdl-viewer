# ttdl-viewer

A read-only, fully offline viewer for archives downloaded by
[ttdl](https://github.com/sadorlovsky/ttdl) — a short-video-app-shaped UI over the files already on
your disk.

Nothing leaves the machine it runs on. Nothing is fetched from a CDN — not a thumbnail, not a font,
and not the author's picture, which is shown only because ttdl already put it on disk. That is
enforced in two places rather than merely intended: a build step that fails on any remote reference
in the bundle, and a strict CSP on the page itself.

It only ever reads. Nothing here writes to an archive, renames a file, or calls ttdl — so it cannot
damage a download that took hours to fetch.

**📖 [Documentation](https://ttdl-viewer.orlovsky.dev/)** — everything below in full, plus
the HTTP API, ttdl's format, and the decisions behind both.

---

## Running it locally

Needs [Bun](https://bun.sh) 1.4+.

```bash
bun install
bun run dev
```

The UI is on <http://127.0.0.1:4173>, the API on `:4174`. With no archives on disk yet, generate a
synthetic one to look around — it needs `ffmpeg`:

```bash
bun run fixtures
```

For a single process serving the built app and the API together, as in production:

```bash
bun run build
bun run start        # everything on :4174
```

## Configuration

Every setting has a flag and an environment variable; the flag wins.

| Flag | Environment | Default | What it does |
|---|---|---|---|
| `--root <dir>` | `TTDL_VIEWER_ROOT` | remembered | Directory holding one subdirectory per archive |
| `--port <n>` | `TTDL_VIEWER_API_PORT` | `4174` | Port the server listens on |
| `--host <addr>` | `TTDL_VIEWER_HOST` | `127.0.0.1` | Interface to bind |
| `--lan` | — | off | Bind every interface — the same as `--host 0.0.0.0`, said as what it does |
| `--likes <dir>` | `TTDL_VIEWER_LIKES` | found | A TikTok export kept away from the archives |

`--host` defaults to loopback deliberately: this process serves arbitrary local media with no
authentication in front of it, and should not land on the LAN by accident.

`--root` is the one thing this cannot work out on its own, so it is asked for once and kept in
`~/.config/ttdl-viewer/config.json` — the only file this program writes, and it writes it outside
every archive:

```bash
bun run start --root ~/code/ttdl/downloads   # remembered for next time
bun run start                                # and never needed again
```

→ [Configuration in full](https://ttdl-viewer.orlovsky.dev/start/configuration/), including
what is tried when you give it nothing and why a guessed root is deliberately not kept.

## Guides

Each of these needs nothing configured here — the data is already in the archive, put there by ttdl.

- **[Liked and favorited dates](https://ttdl-viewer.orlovsky.dev/guides/liked-dates/)** —
  where TikTok's saving dates live, and the one ttdl command that records them permanently.
- **[Evening out the volume](https://ttdl-viewer.orlovsky.dev/guides/loudness/)** — EBU
  R128 gains from ttdl, applied through `element.volume` or a WebAudio graph depending on what the
  browser actually honours.
- **[Running it in Docker](https://ttdl-viewer.orlovsky.dev/guides/docker/)** — an image of
  Bun plus a few hundred kilobytes, with the archives mounted read-only.
- **[Running it on a Synology NAS](https://ttdl-viewer.orlovsky.dev/guides/synology/)** —
  Container Manager on DSM 7, and the mount permission that usually bites.

## Layout

```
src/shared/     types, query parse/serialize, avatar seed — imported by both sides
src/server/     Bun: scan → classify → build → query, plus Range-correct media serving
src/web/        React: library, profile grid, full-screen feed
scripts/        dev runner, fixture generator, offline guard
tests/          filename parsing, ttdl completeness parity, Range matrix
docs/           the documentation site (Astro + Starlight)
```

The server keeps two things apart on purpose. The post objects are what the JSON API serves; the
scanner's file-group map is what turns a URL into a filename, and it is the only thing that ever
does. No string from a request is joined into a path anywhere.

→ [HTTP API](https://ttdl-viewer.orlovsky.dev/reference/http-api/) ·
[Reading ttdl's format](https://ttdl-viewer.orlovsky.dev/reference/archive-format/) ·
[Notable decisions](https://ttdl-viewer.orlovsky.dev/explanation/decisions/)

## Checks

```bash
bun test           # filename parsing, ttdl parity, Range matrix
bun run typecheck
bun run lint
bun run build      # vite build, then the offline guard over dist/
```

`scripts/check-offline.ts` fails the build on any remote reference in the bundle. Its allow-list is
kept narrow — specific paths, never whole hosts — because the value of the check is entirely in
what it refuses to wave through.

The documentation site is its own project with its own dependencies, deployed to Cloudflare Workers
on every push that touches `docs/`:

```bash
cd docs && bun install && bun run dev
```

## Known limits

The index is in memory and built at startup, so new posts need a restart or a `rescan` call. Search
is substring, not full-text. There is **no authentication** — anything that can reach the port can
read every archive, which is why `--host` defaults to loopback. The Docker and Synology
instructions have not been run; they are written from the Dockerfile and DSM's documented
behaviour.

→ [Known limits in full](https://ttdl-viewer.orlovsky.dev/explanation/known-limits/)

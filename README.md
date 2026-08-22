<div align="center">

# ttdl-viewer

**Look at a ttdl archive the way you watched it** — a library, a profile grid, and a full-screen
feed.<br>
Nothing leaves the machine it runs on, and nothing here writes to an archive.

**Documentation: [ttdl-viewer.orlovsky.dev](https://ttdl-viewer.orlovsky.dev)**

</div>

[ttdl](https://github.com/sadorlovsky/ttdl) leaves you a directory of thousands of opaque
filenames. This reads them — including the three details of that format that break a naive indexer
— and gives you back something you can browse, search and re-watch, offline.

```bash
bun run start --root ~/code/ttdl/downloads
```

## Running it locally

Needs [Bun](https://bun.sh) 1.4+.

```bash
bun install
bun run dev
```

The UI is on <http://127.0.0.1:4173>, the API on `:4174`. For a single process serving the built
app and the API together, as in production:

```bash
bun run build
bun run start        # everything on :4174
```

→ [Running it locally](https://ttdl-viewer.orlovsky.dev/start/running-it-locally/)

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
every archive.

→ [Configuration in full](https://ttdl-viewer.orlovsky.dev/start/configuration/), including what is
tried when you give it nothing and why a guessed root is deliberately not kept.

## Recipes

**Look around before you have an archive.** The generator writes a profile archive, a list archive,
an empty one, a directory of unrelated files and a TikTok export — with every edge case the format
can produce. It needs `ffmpeg`:

```bash
bun run fixtures
```

→ [Fixtures and checks](https://ttdl-viewer.orlovsky.dev/reference/fixtures-and-checks/)

**Order by when you saved a post.** That date exists nowhere on disk; it is in the TikTok data
export, and ttdl records it into the archive permanently:

```bash
ttdl.py get "TikTok Saved" --likes tiktok-export   # once, in ttdl
```

→ [Liked and favorited dates](https://ttdl-viewer.orlovsky.dev/guides/liked-dates/)

**Stop riding the volume knob.** ttdl measures every post to EBU R128 without re-encoding it; the
viewer plays each one at the level it asks for, through `element.volume` or a WebAudio graph
depending on what the browser honours:

```bash
ttdl.py loudness @username    # once, in ttdl — offline, minutes for a few thousand
```

→ [Evening out the volume](https://ttdl-viewer.orlovsky.dev/guides/loudness/)

**Leave it running.** The runtime image is Bun plus a few hundred kilobytes — the server imports
nothing but `node:` builtins and its own files — and the archives are mounted read-only:

```bash
TTDL_ARCHIVES=$HOME/code/ttdl/downloads docker compose up -d --build
```

→ [Running it in Docker](https://ttdl-viewer.orlovsky.dev/guides/docker/) ·
[Running it on a Synology NAS](https://ttdl-viewer.orlovsky.dev/guides/synology/)

## How it works

The server scans each archive once at startup, groups files by the post id ttdl captured, and keeps
two things apart from then on. The **post objects** are what the JSON API serves; the **scanner's
file-group map** is what turns a URL into a filename, and it is the only thing that ever does. No
string from a request is joined into a path anywhere.

Nothing is fetched at runtime — not a thumbnail, not a font, not the author's picture, which is
shown only because ttdl already put it on disk. That is enforced rather than intended: a build step
fails on any remote reference in `dist/`, and a strict CSP covers the page itself.

→ [HTTP API](https://ttdl-viewer.orlovsky.dev/reference/http-api/) ·
[Reading ttdl's format](https://ttdl-viewer.orlovsky.dev/reference/archive-format/) ·
[Notable decisions](https://ttdl-viewer.orlovsky.dev/explanation/decisions/)

## Gotchas

- **New posts need a restart or a rescan.** The index is in memory and built at startup; there is
  no filesystem watcher. `POST /api/archives/<id>/rescan` rebuilds one archive in place.
- **There is no authentication.** Anything that can reach the port can read every archive, which is
  why `--host` defaults to loopback. Put a VPN or an authenticating proxy in front of it, not
  nothing.
- **Only `.ttdl/` is read.** An archive ttdl has not touched since it introduced that layout shows
  its posts and nothing else — no card, no counts, no list marker — until one ttdl command moves
  it. A viewer that never writes cannot migrate one itself.
- **Saving dates belong to list archives.** A profile archive holds posts an account published, not
  posts anybody saved, so `sort=liked` has nothing to order it by.
- **The volume is only even if ttdl measured it.** The viewer reads gains and never derives them; a
  post ttdl never measured plays exactly as it was stored.
- **Search is substring, in memory.** Fine at a few thousand posts. Fuzzy matching applies only to
  the author and hashtag pickers.
- **The Docker and Synology instructions have not been run.** They are written from the Dockerfile
  and DSM's documented behaviour.

→ [Known limits in full](https://ttdl-viewer.orlovsky.dev/explanation/known-limits/)

## Documentation

- **Start** — [What this is](https://ttdl-viewer.orlovsky.dev/start/what-this-is/) ·
  [Running it locally](https://ttdl-viewer.orlovsky.dev/start/running-it-locally/) ·
  [Configuration](https://ttdl-viewer.orlovsky.dev/start/configuration/)
- **Guides** — [Liked and favorited dates](https://ttdl-viewer.orlovsky.dev/guides/liked-dates/) ·
  [Evening out the volume](https://ttdl-viewer.orlovsky.dev/guides/loudness/) ·
  [Running it in Docker](https://ttdl-viewer.orlovsky.dev/guides/docker/) ·
  [Running it on a Synology NAS](https://ttdl-viewer.orlovsky.dev/guides/synology/)
- **Reference** — [HTTP API](https://ttdl-viewer.orlovsky.dev/reference/http-api/) ·
  [Reading ttdl's format](https://ttdl-viewer.orlovsky.dev/reference/archive-format/) ·
  [Fixtures and checks](https://ttdl-viewer.orlovsky.dev/reference/fixtures-and-checks/)
- **Explanation** — [Layout](https://ttdl-viewer.orlovsky.dev/explanation/layout/) ·
  [Notable decisions](https://ttdl-viewer.orlovsky.dev/explanation/decisions/) ·
  [Known limits](https://ttdl-viewer.orlovsky.dev/explanation/known-limits/)

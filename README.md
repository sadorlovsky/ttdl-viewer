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
authentication in front of it, and should not land on the LAN by accident. Reaching the network is
an explicit choice — `--lan` is how you make it, and the Docker image makes it too, because inside
a container loopback is reachable only from the container itself and the exposure is decided by
which port you publish.

`--likes` is an escape hatch, not part of running this. The saving dates are normally already in
the archive: see below.

### The root is remembered

`--root` is the one thing this cannot work out on its own — nothing on the machine says which
directory ttdl downloads into. So it is asked for once and kept:

```bash
bun run start --root ~/code/ttdl/downloads   # remembered for next time
bun run start                                # and never needed again
```

It lands in `~/.config/ttdl-viewer/config.json` (or `$XDG_CONFIG_HOME`), which holds that one
setting and nothing else. This is the only thing the program writes, and it writes it outside every
archive — the promise is that nothing here can damage a download, not that the process never opens
a file for writing. Only a root you actually named is kept; one that was found by looking is not,
since freezing a guess into a setting is how a program ends up serving the wrong directory for
months. Delete the file to forget it.

Given no root and nothing remembered, these are tried in order: `./downloads`, `../ttdl/downloads`,
`~/code/ttdl/downloads`, and `./fixtures/downloads` last — the synthetic archive `bun run fixtures`
generates must never shadow real ones.

## Liked and favorited dates

TikTok orders your likes and favorites by when you *saved* a post, and that date exists nowhere on
disk — ttdl names files after the publication date and stamps the same date on them. It exists only
in the TikTok data export (Settings → Account → Download your data).

**Normally there is nothing to do at all.** ttdl takes `--likes` itself, and caches what it finds as
`.liked.json` inside the archive. That file is read first, because it needs no searching, it stays
correct after the export folder is deleted, and it travels with the archive to storage and back:

```bash
ttdl.py get "TikTok Saved" --likes tiktok-export   # once, in ttdl
bun run start                                      # the dates are simply there
```

Two orderings — **Recently saved** and **First saved** — then appear in the filter bar, and each
post carries the date it was saved under its caption.

Only archives built from a list get these dates, which is ttdl's rule and now this viewer's. A
profile archive holds posts an account published, not posts anybody saved. Applying one export to
every archive — which this used to do — puts a saving date on the handful of posts you happen to
have liked from an account you also archive in full: seven posts out of 3,307 in one archive here,
which is no ordering at all.

**If ttdl was never given the export**, unpack it anywhere inside the archive root and the viewer
reads it directly, for list archives that have no dates recorded:

```
downloads/
  tiktok-export/          ← unpacked here, or with TikTok's own nesting, or loose in downloads/
    Like List.txt
    Favorite Videos.txt
  TikTok Saved/
```

Startup then says so, and prints the one ttdl command that records the dates permanently. The text
export is the format both tools read; if you downloaded the JSON one, ask ttdl for it — it owns the
export, and this only ever reads what ttdl left behind.

That search never opens an archive. ttdl leaves its own bookkeeping (`archive.txt`, `.all_ids.txt`)
in every directory it creates, and a directory carrying any of it is an archive, decided by `stat`
rather than by listing — the difference between 3 ms and 411 ms on the archives this was written
against. A directory holding the export is therefore not an archive, and is kept out of the library
instead of appearing there as a profile with zero posts.

The export is a snapshot: posts saved after you requested it are not in it until you request a new
one.

## Running it in Docker

The runtime image carries no `node_modules` at all: the server imports nothing but `node:` builtins
and its own files, and React and everything else is already bundled into `dist` at build time. So
the image is Bun plus a few hundred kilobytes of application.

```bash
docker compose up -d --build
```

Then open <http://127.0.0.1:4174> on the host.

Point it at your archives with the `TTDL_ARCHIVES` variable — the left side of the volume is the
directory ttdl writes into, the right side must stay `/archives`:

```bash
TTDL_ARCHIVES=$HOME/code/ttdl/downloads docker compose up -d --build
```

Or without compose:

```bash
docker build -t ttdl-viewer .
docker run -d --name ttdl-viewer \
  -v "$HOME/code/ttdl/downloads:/archives:ro" \
  -p 127.0.0.1:4174:4174 \
  ttdl-viewer
```

Two things about that command are deliberate:

- **`:ro`.** The viewer never writes to an archive by design; mounting read-only makes the kernel
  enforce it, so no bug in here can touch a download.
- **`127.0.0.1:4174:4174`.** This publishes the port to the host only. Use `-p 4174:4174` to reach
  it from other machines on your network — but there is no login in front of it, so only do that on
  a network you trust.

The index is built in memory at startup and there is no cache on disk, so **restart the container
after ttdl fetches new posts** (`docker restart ttdl-viewer`), or use the rescan endpoint:

```bash
curl -X POST http://127.0.0.1:4174/api/archives/<archive>/rescan
```

## Running it on a Synology NAS

DSM 7 with **Container Manager** installed. The archives already live on the NAS — typically a
shared folder such as `/volume1/media/tiktok`.

**Using Container Manager's UI (project):**

1. Copy this repository to the NAS, e.g. into `/volume1/docker/ttdl-viewer` (File Station, or
   `git clone` over SSH).
2. Container Manager → **Project** → **Create**. Set the path to that folder; it will pick up
   `docker-compose.yml`.
3. Edit the volume line so the left side is your archive share:

   ```yaml
   volumes:
     - /volume1/media/tiktok:/archives:ro
   ```

4. Decide the port line. `- "127.0.0.1:4174:4174"` keeps it reachable only from the NAS itself
   (use an SSH tunnel or a VPN); `- "4174:4174"` puts it on your LAN, unauthenticated.
5. Build and start. Open `http://<nas-ip>:4174` if you published it to the LAN.

**Over SSH instead:**

```bash
cd /volume1/docker/ttdl-viewer
sudo docker compose up -d --build
```

**If it starts but shows zero archives**, the mount is almost certainly unreadable to the
container's non-root `bun` user. Synology shares are often owned by a specific DSM account rather
than being world-readable. Check the numeric owner and tell compose to match it:

```bash
ls -ln /volume1/media/tiktok      # e.g.  drwx------ 1026 100
```

```yaml
user: "1026:100"
```

**Build architecture.** Most Synology models are x86-64 and build natively. On an ARM model
(DS220j and similar), build on the NAS itself as above rather than pushing an amd64 image to it.
Low-memory models can struggle with the Vite build step; if it is killed, build the image on your
laptop for the right platform and load it:

```bash
docker buildx build --platform linux/arm64 -t ttdl-viewer . --load
docker save ttdl-viewer | ssh nas 'sudo docker load'
```

**Putting it behind DSM's reverse proxy** (Control Panel → Login Portal → Advanced → Reverse
Proxy) works and gives you HTTPS, but adds no authentication of its own. Pair it with DSM's
firewall, a VPN, or an authenticating proxy if the NAS is reachable from outside your home.

## Where it reads from

Resolution order: `--root <dir>` → `TTDL_VIEWER_ROOT` → `./downloads` → `./fixtures/downloads` →
`../ttdl/downloads` → `~/code/ttdl/downloads`. If none exists, the server exits and lists every
path it tried.

Each immediate subdirectory of the root is one archive. A directory holding a `.source` file is a
**list** archive (`downloads/liked/`) — many authors in one flat folder, with the folder name
meaning nothing. Anything else is a **profile** archive, where the folder name is the handle.

## Reading ttdl's format

The format is only specified by `ttdl.py` itself, and three details of it will break a naive
indexer. They are ported deliberately, and locked down by
[`tests/complete.test.ts`](tests/complete.test.ts), which is ttdl's own test table
(`tests/test_ttdl.py:52-140`) transcribed one-for-one — if ttdl's rule ever changes, that suite is
what says so.

1. **A post's files do not share one prefix.** The media, `.info.json` and cover carry the caption
   in their names; the carousel sidecars do not (`fix_photos`, ttdl.py:610, cuts the prefix at the
   id). Everything here groups by the captured **post id** and classifies by suffix.
2. **`NAME_RE` is anchored.** Captions routinely contain long numbers, and an unanchored search
   pulls the "id" straight out of the caption.
3. **Carousel covers may be `.jpeg`**, while carousel *images* are always `.jpg` — `.JPG` counts,
   `.jpeg` does not (ttdl's `PHOTO_INDEX_RE`).

Two deliberate divergences from ttdl:

- **Incomplete carousels are kept.** ttdl drops them, because for ttdl "incomplete" means "fetch
  it again". A viewer has the opposite obligation, so they are surfaced with `status: incomplete`,
  play the images that exist, and show the missing ones as hatched segments. The default API
  filter is `status=complete`, so they stay opt-in — the opt-in being an amber Incomplete chip in
  the filter bar, which appears only on an archive that actually holds one.
- **A date is always resolvable.** `info.timestamp` when present, otherwise the post id itself —
  its upper 32 bits are Unix seconds (`post_day`, ttdl.py:178). `createdAtSource` is exposed so
  the UI can mark an inferred date as inferred.

`formats[]` and `thumbnails[]` are read for geometry and then **discarded**. They are most of the
file's bytes and, more to the point, they are full of live signed CDN URLs — keeping them would
put a remote URL one careless `<img src>` away from the render path.

### The author's card

`profile.json` and `avatar.jpg`, which ttdl's `get` writes for a profile archive, are read as the
archive's own files rather than as any post's: they are picked out by name, and `parseName` never
sees them.

The card is the one thing in an archive describing something that moves — a nickname, a bio, a
follower count — so it travels with the date ttdl took it, and the header prints that date beside
the numbers. `readCard` validates field by field instead of casting: the file is written by another
program and can arrive from storage half-copied, and a truncated card has to degrade to "no card"
rather than put `undefined` where the UI calls `toLocaleString()`.

The picture is matched to an author by the handle the card names, not by position, so a renamed
directory cannot put one person's face on another's posts. It also joins the listing hash, because
a replaced picture keeps its filename and a cached index would otherwise go on serving the old one.

The seeded letter-and-hue avatar has not gone anywhere. It renders *underneath* the picture, so a
file moved to storage falls back to it without a hole in the layout, and it is all there is for
every author in a list archive — those have no card, because those posts come from many accounts
and there is no one profile to ask.

## Layout

```
src/shared/     types, query parse/serialize, avatar seed — imported by both sides
src/server/     Bun: scan → classify → build → query, plus Range-correct media serving
src/web/        React: library, profile grid, full-screen feed
scripts/        dev runner, fixture generator, offline guard
tests/          filename parsing, ttdl completeness parity, Range matrix
```

The server keeps two things apart on purpose. The post objects are what the JSON API serves; the
scanner's file-group map is what turns a URL into a filename, and it is the only thing that ever
does. No string from a request is joined into a path anywhere.

## Notable decisions

**No SQLite index cache.** The plan called for one with a two-tier invalidation scheme. Measured
first instead: 4,091 posts index in **176–526 ms** with no cache at all, against a target of under
two seconds. The cache was premature, so it is not there. Revisit if an archive reaches tens of
thousands of posts.

**The feed is hand-rolled, not virtualized.** Every post gets a fixed-height slot; only the ±2
window gets content. An empty slot costs one DOM node and no paint, and keeping all of them means
native `scroll-snap` (including `scroll-snap-stop: always`), the native scrollbar, `PageDown`, and
scroll restoration all work without being reinvented. The ±2 window is set by the browser's
concurrent-video-decoder cap, not by DOM cost.

**Carousels run on the audio element's clock.** `index = floor((audio.currentTime % cycle) /
perImage)`, read in a rAF loop. A timer would drift, would keep firing in a hidden tab while the
browser throttles the audio, and could not drive a smooth segment fill. Deriving the index from
`currentTime` also means clicking a segment to seek needs no extra code — moving the audio moves
the images. When the browser refuses to run the audio at all (or stops it after `play()` already
resolved, which happens), a wall clock takes over, or the slideshow would freeze on image one and
read as a broken post.

**Hover previews stream the original file.** No preview clips are generated, no ffmpeg is in the
image, and nothing is cached to disk — a tile that has been hovered for 300ms mounts a muted
`<video>` pointed at the same `/media/:archive/:post/media` the feed uses, loops its first six
seconds, and is destroyed on the way out. Generating 240p clips is what a product does when the
media is remote and large; here it is local and averages a few megabytes, so it would buy a
smaller read at the cost of ffmpeg in the runtime image, a writable cache beside a deliberately
read-only archive mount, and an invalidation problem. The one thing the approach cannot fix is
first-frame latency: on localhost the preview appears in well under a second, over Wi-Fi to a
sleeping NAS disk it is noticeably slower, and no amount of client code changes that.

**Media sources are assigned imperatively, not as props.** Every element that plays something —
both feed slides and the grid's previews — sets `element.src` inside the same effect whose cleanup
clears it, and none of them carry a `src` prop. They have to be symmetrical: the cleanup exists to
hand the decoder back (`pause`, `removeAttribute`, `load`), React does not know the attribute it
owns was removed, and StrictMode runs every effect twice in development. With `src` as a prop the
teardown ran against a healthy element and the remount put nothing back, so in `bun run dev` every
video in the feed was an empty element that never loaded — while production, where StrictMode does
not double-invoke, was fine. A bug that appears only where the code is worked on is worth this
much ceremony to avoid.

**Pagination is keyset, not offset.** ttdl and this viewer routinely run at the same time; a
rescan landing mid-scroll shifts every offset after the insertion point, which shows up as
duplicated and skipped posts in an infinite feed.

**Counts are a readout, not controls.** This is an archive: the numbers are real captured data and
worth showing, but nothing in the action rail highlights, focuses, or presses. `null` renders as
`—` rather than `0` — an archive with no metadata must not claim a post had no likes. The only
interactive things are hashtags (local filtering) and copy-link (clipboard).

## Fixtures

No real ttdl archive existed while this was built, so the generator is not a convenience — it is
how the code gets exercised at all. It needs `ffmpeg` (`brew install ffmpeg`) and is deterministic
from `--seed`.

`bun run fixtures` writes `fixtures/downloads/` with a profile archive, a multi-author list
archive, an empty archive, a directory of unrelated files, and a TikTok data export. The profile
archive deliberately contains every edge case the format can produce: `NA` dates, posts with no
metadata, no cover, a `.jpeg` carousel cover, `expected: 8` with only five images, a state file
with no count, a zero-byte image, an orphan `.info.json`, a caption containing a 15-digit number,
a carousel whose audio and images carry different dates, 4:3 and 1:1 videos, and both `.m4a` and
`.mp3` carousels.

Every generated file's mtime is set to its post's publish time, replicating ttdl's `set_times`.
Without that, anything that reasons about mtimes would be tested under conditions that never occur.

`bun run fixtures --big` adds 4,000 posts via APFS copy-on-write clones — about 174 MB of real
disk, though `du` reports 16 GB because it cannot see shared blocks.

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

## Known limits

- **The index is in memory and built at startup.** New posts fetched by ttdl are not picked up
  until the server restarts or `POST /api/archives/<id>/rescan` is called. There is no filesystem
  watcher yet.
- **Search is substring, not full-text.** It scans descriptions, authors and track names in
  memory. Fine at a few thousand posts; an FTS index is the answer if that stops being true.
  Fuzzy matching is applied only to the author and hashtag pickers, where the candidate list is
  small and handles are genuinely hard to remember.
- **Liked/favorited dates come from ttdl, or from an export.** With neither, every post has
  `liked: null` and `sort=liked` puts them all last. Profile archives have it by design. A post
  sitting in both lists keeps its like date, since that is the list it primarily belongs to. The
  export is also a snapshot — it stops at the day you requested it.
- **No authentication.** Anything that can reach the port can read every archive. Keep it on
  loopback, a VPN, or a trusted LAN.
- **The Docker and Synology instructions above have not been run.** They are written from the
  Dockerfile and DSM's documented behaviour; the image has never been built, because no Docker
  daemon was available on the machine this was developed on. The one assumption behind the image
  that *was* verified is the important one — the server runs from `dist` plus `src/server` and
  `src/shared` with no `node_modules` present at all.

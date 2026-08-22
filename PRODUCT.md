# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary user runs [ttdl](https://github.com/sadorlovsky/ttdl) and has an archive of downloaded
short-video posts sitting on disk. They are technical enough to run a Bun command or a container,
and they are looking at media they chose to keep — often years of it, thousands of posts.

ttdl-viewer is a public companion tool, not a personal one: a stranger who just finished their
first ttdl download is a real user, and the first run has to work for them without prior knowledge
of the archive format.

Two usage scenes are both real and equally durable:

- **Desktop browser against localhost.** Laptop running `bun run dev` or `bun run start` over a
  local archive directory.
- **Phone browser over the LAN.** Server on a NAS or a desktop, viewed from a phone — touch-first,
  at real phone dimensions, where the full-screen feed matches the shape of the original app.

Tablet use is possible but was not confirmed as a target.

## Product Purpose

Make an archive on disk feel like the app it came from, without ever leaving the disk.

ttdl fetches the files; ttdl-viewer is the only way to actually *look* at what it fetched, short of
a file manager. Success is that a user can open a directory of thousands of opaque filenames and
immediately browse, search, and re-watch it the way they originally consumed it — and can trust
that doing so neither touches the network nor modifies the archive.

Three jobs are served roughly equally, and none may be sacrificed for another:

1. **Re-watch** — scroll the archive feed-style, for leisure.
2. **Find one specific post** — search, filter, sort, hashtags, date and duration ranges.
3. **Verify the archive is intact** — see what is complete, incomplete, missing, or a ghost.

## Positioning

A media viewer that treats "offline" as an enforced property rather than a promise, and
"read-only" as a structural guarantee rather than an intention.

Nothing leaves the machine: no avatar fetch, no CDN thumbnail, no webfont. That is enforced in
three independent places — a build step (`scripts/check-offline.ts`) that fails on any remote
reference in the bundle, a strict CSP on the page, and the deliberate discarding of `formats[]`
and `thumbnails[]` from metadata because they carry live signed CDN URLs. Avatars are deterministic
generative marks derived from the handle, because no profile picture is ever downloaded and
therefore none exists to show.

The one exception is stated rather than hidden, and it is the viewer's own action rather than the
product's: an **Open at the source** row in the long-press sheet, labelled *leaves the archive*,
opens the original post in a new tab with `noreferrer`. It is a named row rather than a gesture
precisely because it is the exception — it can be read before it is chosen, and reached from a
keyboard. Nothing else in the product follows a link outward, and everything above still holds for
what the app does by itself.

Nothing is written: the viewer never renames a file, never mutates an archive, and never calls
ttdl. It cannot damage a download that took hours to fetch — and the documented Docker mount is
`:ro` so the kernel enforces the same thing.

A neighboring media viewer could copy the grid and the feed. It could not truthfully copy the
claim that the build fails when a remote URL enters the bundle.

## Operating Context

- **The archive root** holds one subdirectory per archive, and each archive keeps everything ttdl
  records about it in one subdirectory of its own, `.ttdl/` — the card, the counts, the gains, the
  lock. Only that layout is read: ttdl migrates a pre-`.ttdl` archive on the first mutating command,
  and a viewer that never writes cannot migrate one itself. A directory containing a `.ttdl/.source`
  file is a **list** archive (many authors, flat, folder name meaningless); anything else is a
  **profile** archive, where the folder name is the handle.
- **ttdl and the viewer run at the same time.** A rescan can land mid-scroll, which is why
  pagination is keyset rather than offset, and why a `.ttdl/.lock` file surfaces as a "downloading now"
  banner.
- **The index lives in memory and is built at startup.** New posts appear after a restart or a
  `POST /api/archives/<id>/rescan`. There is no filesystem watcher.
- **The TikTok data export is a separate, optional input.** `--likes <dir>` reads `Like List.txt`
  and `Favorite Videos.txt` to supply liked/favorited dates that exist nowhere on disk.
- **Deployment surfaces documented:** local Bun, Docker Compose, and Synology DSM Container
  Manager. The server binds loopback by default because it serves arbitrary local media with no
  authentication in front of it.

## Capabilities and Constraints

**Capabilities**

- Library of archives, per-archive profile grid, and a full-screen post feed.
- Both post kinds: video, and carousel (images driven by the audio element's clock).
- Search across descriptions, authors, and track names; fuzzy matching only in the author and
  hashtag pickers.
- Filters: author, kind, status, date range, duration range, hashtag.
- Sorts: date, likes, views, comments, saves, duration, liked/favorited date, random.
- Range-correct media serving, so seeking and scrubbing behave.
- Copyable original post URLs and handles — displayed, never rendered as a live href. Copying and
  the one outbound navigation ("Open at the source", labelled *leaves the archive*) are both rows in
  the long-press sheet; the action rail holds no controls at all beyond the author's avatar.

**Terminology (product vocabulary, keep it consistent)**

archive · profile archive · list archive · post · video · carousel · complete · incomplete ·
ghost (metadata or cover with no media file) · liked vs. favorited · inferred date.

**Constraints**

- No network at runtime, ever. No webfont; the system font stack is the only honest option.
- Read-only. No write path to an archive exists.
- No authentication. Anything that reaches the port reads every archive.
- Search is substring, in memory — fine at a few thousand posts, not an FTS index.
- Without the TikTok export, every post has `liked: null` and that sort puts them all last.
- **Never present captured data as something it is not.** `null` renders as `—`, never `0`; an
  inferred date is marked inferred (`createdAtSource`); captured counts are a readout, not a
  control — nothing in the action rail highlights, focuses, or presses.
- Incomplete carousels are kept and surfaced (a divergence from ttdl, which drops them): they play
  the images that exist and show the missing ones as hatched segments.

## Brand Commitments

- **Name:** `ttdl-viewer`, lowercase, always. Explicitly the viewer *for* ttdl — the relationship
  to the downloader is part of the identity, not incidental.
- **Voice, as established in the README:** precise, dry, and reason-giving. It states what a thing
  does and then why that choice was made, including where something is unverified. It does not
  sell. Future copy should not become promotional.
- **No borrowed identity.** The product deliberately does not reproduce the source platform's
  logo, wordmark, or profile imagery.

## Evidence on Hand

**Real and available:**

- `bun run fixtures` — a deterministic synthetic archive generator (needs `ffmpeg`) producing a
  profile archive, a multi-author list archive, an empty archive, a directory of unrelated files,
  and a TikTok data export. It carries every edge case the format can produce, so it is the
  demonstration surface for any UI work.
- `tests/complete.test.ts` — ttdl's own test table transcribed one-for-one; the parity check.
- Measured performance: 4,091 posts index in **176–526 ms** with no cache. This is a real,
  reproducible number.
- `bun run fixtures --big` — 4,000 posts via APFS clones, for scale testing.

**Absences that future work must not fabricate:**

- No real user testimonials, adoption numbers, analytics, or press.
- The Docker and Synology instructions have never been executed — no Docker daemon was available
  on the development machine. Only the underlying assumption was verified (the server runs from
  `dist` plus `src/server` and `src/shared` with no `node_modules` present).
- No screenshots of a real (non-fixture) archive exist in the repository.

## Product Principles

1. **Enforced, not promised.** Every guarantee the product makes — offline, read-only — is backed
   by a mechanism that fails loudly, not by discipline. New features inherit that burden.
2. **Never lie about captured data.** Missing is missing, inferred is labeled inferred, and a
   number the archive does not have is never rendered as zero.
3. **Three jobs, one product.** Re-watching, finding, and verifying are equally legitimate reasons
   to open it; work that speeds one up at another's expense is a regression.
4. **Prefer the platform's own machinery.** Native scroll-snap, the native scrollbar, real Range
   requests, `PageDown`, scroll restoration — reinventing them costs more than it returns.
5. **The archive is the artifact; the interface is the window.** The content is why anyone is here.

## Accessibility & Inclusion

No external standard was specified by the user. What the codebase already establishes and future
work must preserve:

- `prefers-reduced-motion: reduce` collapses all motion durations to 1ms at the token level.
- ARIA roles and labels are already in use across the feed, tiles, captions, and icon-only
  controls; icon-only controls must keep accessible names.
- The focus ring is one of only three places the accent color is permitted to appear — focus
  visibility is a committed behavior, not decoration.
- Both a pointer/keyboard desktop scene and a touch phone scene are first-class; neither may
  regress into the other's affordances.

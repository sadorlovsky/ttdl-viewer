---
title: Fixtures and checks
description: The generator that makes an archive to develop against, and the four commands that gate a change.
---

## Fixtures

No real ttdl archive existed while this was built, so the generator is how the code gets exercised
at all. It needs `ffmpeg` (`brew install ffmpeg`) and is deterministic from `--seed`.

```bash
bun run fixtures
```

That writes `fixtures/downloads/` with a profile archive, a multi-author list archive, an empty
archive, a directory of unrelated files, and a TikTok data export. Archive-level state — the card
and picture, the counts, `.source`, the loudness sidecar — goes into each archive's `.ttdl/`,
where ttdl keeps it and where the indexer reads it.

The profile archive deliberately contains every edge case the format can produce:

- `NA` dates, and posts with no metadata at all
- a post with no cover, and a `.jpeg` carousel cover
- `expected: 8` with only five images on disk
- a state file with no count
- a zero-byte image, and an orphan `.info.json`
- a caption containing a 15-digit number
- a carousel whose audio and images carry different dates
- 4:3 and 1:1 videos
- both `.m4a` and `.mp3` carousels

Every generated file's mtime is set to its post's publish time, replicating ttdl's `set_times`.
Without that, anything that reasons about mtimes would be tested under conditions that never occur.

```bash
bun run fixtures --big
```

Adds 4,000 posts via APFS copy-on-write clones — about 174 MB of real disk, though `du` reports
16 GB because it cannot see shared blocks.

## Checks

```bash
bun test           # filename parsing, ttdl parity, Range matrix
bun run typecheck
bun run lint
bun run build      # vite build, then the offline guard over dist/
```

`scripts/check-offline.ts` fails the build on any remote reference in the bundle. Its allow-list is
kept narrow — specific paths, never whole hosts — because a whole-host entry would also wave through
whatever that host serves next.

## Documentation

The site you are reading is a separate Astro project under `docs/`, with its own dependencies:

```bash
cd docs
bun install
bun run dev        # http://localhost:4321
bun run build      # docs/dist
```

It is a Cloudflare Worker serving static assets — no Worker script, just the directory `astro build`
emits, described by `docs/wrangler.jsonc`. Cloudflare builds and deploys it on every push to `main`
that touches `docs/`, through the repository connection in Workers Builds.

To deploy by hand from `docs/`, which is the same two steps that CI runs:

```bash
bun run deploy
```

The custom domain is in `wrangler.jsonc` as a route rather than in the dashboard, so the DNS record
and the certificate follow from the deploy instead of being a step someone has to remember.

One setting could not be moved into the repository the same way. Cloudflare's build image ships Bun
1.2.15, which cannot read the `lockfileVersion: 2` that Bun 1.4 writes — it ignores `bun.lock` and
then fails on `--frozen-lockfile`, which is the correct thing for it to do. Bun takes its version
only from a `BUN_VERSION` build variable; unlike Node, Python and Ruby, it has no version file to
commit. So the build settings carry `BUN_VERSION = 1.4.0`, written down here because nothing in the
repository records it.

Build watch paths are `docs/*`, evaluated from the repository root rather than from the root
directory — so a commit that only touches the viewer does not rebuild the site.

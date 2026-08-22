---
title: Running it locally
description: Install with Bun, generate a synthetic archive, and serve the built app from one process.
---

Needs [Bun](https://bun.sh) 1.4+.

```bash
bun install
bun run dev
```

The UI is on <http://127.0.0.1:4173>, the API on `:4174`.

## With no archives on disk yet

Generate a synthetic one to look around — it needs `ffmpeg` (`brew install ffmpeg`):

```bash
bun run fixtures
```

That writes `fixtures/downloads/` with a profile archive, a multi-author list archive, an empty
archive, a directory of unrelated files, and a TikTok data export. See
[Fixtures and checks](/reference/fixtures-and-checks/) for what is deliberately broken inside it,
and why.

## As one process, the way production runs

```bash
bun run build
bun run start        # everything on :4174
```

`bun run build` runs the Vite build and then the offline guard over `dist/`; the build fails on any
remote reference in the bundle.

## Pointing it at your archives

`--root` is the one thing this cannot work out on its own, and it is asked for once:

```bash
bun run start --root ~/code/ttdl/downloads   # remembered for next time
bun run start                                # and never needed again
```

Everything else about that — where it is remembered, what is tried when you give nothing, and why a
guessed root is deliberately not kept — is in [Configuration](/start/configuration/).

## Next

- [Liked and favorited dates](/guides/liked-dates/) if you want **Recently saved** ordering.
- [Evening out the volume](/guides/loudness/) if the archive rides the volume knob.
- [Running it in Docker](/guides/docker/) for anything long-lived.

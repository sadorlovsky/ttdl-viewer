---
title: What this is
description: A read-only, fully offline viewer for ttdl archives, and the two promises it keeps.
---

A read-only, fully offline viewer for archives downloaded by
[ttdl](https://github.com/sadorlovsky/ttdl) — a short-video-app-shaped UI over the files already on
your disk.

Nothing leaves the machine it runs on. Nothing is fetched from a CDN — not a thumbnail, not a font,
and not the author's picture, which is shown only because ttdl already put it on disk. That is
enforced in two places rather than merely intended: a build step that fails on any remote reference
in the bundle, and a strict CSP on the page itself.

It only ever reads. Nothing here writes to an archive, renames a file, or calls ttdl — so it cannot
damage a download that took hours to fetch.

## What you get

Two screens. A **library** of the archives found under one root, each with its author card and
counts; and a **feed** — full-screen, scroll-snapped, one post at a time, with the action rail
showing the numbers ttdl captured.

Between them sits a filter bar: search, author and hashtag pickers, date range, duration, kind, and
eight orderings including two that only exist if you gave ttdl your
[TikTok export](/guides/liked-dates/).

## What it is not

- Not a downloader. It never calls TikTok, and it never calls ttdl either.
- Not a library manager. It will not rename, tag, delete, or re-encode anything.
- Not multi-user. There is no login in front of it — see
  [Known limits](/explanation/known-limits/).

## Where to go next

- [Running it locally](/start/running-it-locally/) — Bun, one command, and a synthetic archive to
  look around in if you have no real one yet.
- [Configuration](/start/configuration/) — every flag, every environment variable, and the one
  setting that is remembered.
- [HTTP API](/reference/http-api/) — the JSON the app runs on, which is also the whole surface
  for anything else you want to point at an archive.

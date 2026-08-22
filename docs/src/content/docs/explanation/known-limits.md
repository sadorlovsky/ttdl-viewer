---
title: Known limits
description: What this does not do yet, what is untested, and where the security boundary actually is.
---

## The index is in memory and built at startup

New posts fetched by ttdl are not picked up until the server restarts or
[`POST /api/archives/<id>/rescan`](/reference/http-api/#post-apiarchivesarchiveidrescan) is called.
There is no filesystem watcher yet.

## Search is substring, not full-text

It scans descriptions, authors and track names in memory. Fine at a few thousand posts; an FTS
index is what would replace it if that stops being true.

Fuzzy matching is applied only to the author and hashtag pickers, where the candidate list is small
and handles are genuinely hard to remember.

## Liked/favorited dates come from ttdl, or from an export

With neither, every post has `liked: null` and `sort=liked` puts them all last. A profile archive
has none by design: it holds posts an account published, not posts anybody saved. A post sitting in
both lists keeps its like date, since that is the list it primarily belongs to. The export is also a snapshot — it stops at the day you requested it. See
[Liked and favorited dates](/guides/liked-dates/).

## AirPlay against an amplified post is untested

A boosted element plays through a WebAudio graph, and what an AirPlay target receives from one — the
element's own audio, or the graph's — was never checked. `?boost=0` turns the graph off if it turns
out to matter.

## No authentication

Anything that can reach the port can read every archive. Keep it on loopback, a VPN, or a trusted
LAN. `--host` defaults to `127.0.0.1` for exactly this reason; see
[Configuration](/start/configuration/).

## The Docker and Synology instructions have not been run

CI builds the image for `linux/amd64` and `linux/arm64` on every push to `main`, so it compiles and
the offline guard passes inside it. No container has been started from it, and nobody has followed
the DSM steps; those are written from the Dockerfile and DSM's documented behaviour.

One assumption behind the image was verified: the server runs from `dist` plus `src/server` and
`src/shared` with no `node_modules` present at all.

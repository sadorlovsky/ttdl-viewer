---
title: Known limits
description: What this does not do yet, what is untested, and where the security boundary actually is.
---

## The index is in memory and built at startup

New posts fetched by ttdl are not picked up until the server restarts or
[`POST /api/archives/<id>/rescan`](/reference/http-api/#post-apiarchivesarchiveidrescan) is called.
There is no filesystem watcher yet.

## Search is substring, not full-text

It scans descriptions, authors and track names in memory. Fine at a few thousand posts; an FTS index
is the answer if that stops being true.

Fuzzy matching is applied only to the author and hashtag pickers, where the candidate list is small
and handles are genuinely hard to remember.

## Liked/favorited dates come from ttdl, or from an export

With neither, every post has `liked: null` and `sort=liked` puts them all last. Profile archives
have it by design. A post sitting in both lists keeps its like date, since that is the list it
primarily belongs to. The export is also a snapshot — it stops at the day you requested it. See
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

They are written from the Dockerfile and DSM's documented behaviour; the image has never been built,
because no Docker daemon was available on the machine this was developed on.

The one assumption behind the image that *was* verified is the important one — the server runs from
`dist` plus `src/server` and `src/shared` with no `node_modules` present at all.

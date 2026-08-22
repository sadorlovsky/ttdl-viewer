---
title: Notable decisions
description: Eight things that are not the obvious choice, and the measurement or bug behind each.
---

## No SQLite index cache

The plan called for one with a two-tier invalidation scheme. It was measured first instead: 4,091
posts index in **176–526 ms** with no cache at all, against a target of under two seconds. The cache was
premature, so it is not there. Revisit if an archive reaches tens of thousands of posts.

## The feed is hand-rolled, not virtualized

Every post gets a fixed-height slot; only the ±2 window gets content. An empty slot costs one DOM
node and no paint, and keeping all of them means native `scroll-snap` (including
`scroll-snap-stop: always`), the native scrollbar, `PageDown`, and scroll restoration all work
without being reinvented. The ±2 window is set by the browser's concurrent-video-decoder cap, not by
DOM cost.

## Carousels run on the audio element's clock

`index = floor((audio.currentTime % cycle) / perImage)`, read in a rAF loop. A timer would drift,
would keep firing in a hidden tab while the browser throttles the audio, and could not drive a
smooth segment fill. Deriving the index from `currentTime` also means clicking a segment to seek
needs no extra code — moving the audio moves the images.

When the browser refuses to run the audio at all (or stops it after `play()` already resolved, which
happens), a wall clock takes over, or the slideshow would freeze on image one and read as a broken
post.

## Hover previews stream the original file

No preview clips are generated, no ffmpeg is in the image, and nothing is cached to disk — a tile
that has been hovered for 300 ms mounts a muted `<video>` pointed at the same
`/media/:archive/:post/media` the feed uses, loops its first six seconds, and is destroyed on the
way out.

Generated 240p clips make sense when the media is remote and large. Here it is local and averages a
few megabytes, so they would buy a smaller read at the cost of ffmpeg in the runtime image, a
writable cache beside a deliberately read-only archive mount, and an invalidation problem.

First-frame latency is what this cannot fix: on localhost the preview appears in well under a
second, over Wi-Fi to a sleeping NAS disk it is noticeably slower, and no amount of client code
changes that.

## Media sources are assigned imperatively, not as props

Every element that plays something — both feed slides and the grid's previews — sets `element.src`
inside the same effect whose cleanup clears it, and none of them carry a `src` prop.

They have to be symmetrical: the cleanup exists to hand the decoder back (`pause`,
`removeAttribute`, `load`), React does not know the attribute it owns was removed, and StrictMode
runs every effect twice in development. With `src` as a prop the teardown ran against a healthy
element and the remount put nothing back, so in `bun run dev` every video in the feed was an empty
element that never loaded, while production, where StrictMode does not double-invoke, was fine.

## Loudness is read, never derived

`loudness.json` holds the measurements *and* the gain ttdl derived from them, and only the gain is
taken. Recomputing it here from `i` and `tp` would mean holding an opinion about the target — but
the target is a property of the archive, set by `ttdl.py loudness --target`, which rewrites every
gain in place without re-running ffmpeg. Deriving the same number in both programs would give it two
places to change.

See [Evening out the volume](/guides/loudness/) for what the viewer does with the number once it
has it.

## Pagination is keyset, not offset

ttdl and this viewer routinely run at the same time; a rescan landing mid-scroll shifts every offset
after the insertion point, which shows up as duplicated and skipped posts in an infinite feed. The
[cursor semantics](/reference/http-api/#the-cursor-is-a-key-not-an-offset) follow from that.

## Counts are a readout, not controls

This is an archive: the numbers are real captured data and worth showing, but nothing in the action
rail highlights, focuses, or presses. `null` renders as `—` rather than `0` — an archive with no
metadata must not claim a post had no likes. The only interactive things are hashtags (local
filtering) and copy-link (clipboard).

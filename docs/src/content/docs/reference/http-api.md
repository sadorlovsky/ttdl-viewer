---
title: HTTP API
description: The JSON the app runs on — archives, keyset-paginated posts, and Range-correct media.
---

Everything the UI knows, it knows from these routes. They are unauthenticated and read-only, with
one exception (`rescan`) that re-reads a directory and writes nothing.

Base URL is the server's own — `http://127.0.0.1:4174` by default. In `bun run dev` the Vite server
on `:4173` proxies `/api` and `/media` to it, so the same paths work from either port.

`:archiveId` is `encodeURIComponent(<directory name>)`. `:postId` is the post id ttdl captured — a
decimal string of at least 15 digits.

## Errors

Every JSON route fails in the same shape, and some failures carry the command that fixes them:

```json
{
  "error": {
    "code": "POST_NOT_FOUND",
    "message": "This post has no .info.json",
    "hint": "Backfill it with: ttdl.py meta lowtide"
  }
}
```

| Code | Status | When |
|---|---|---|
| `ARCHIVE_NOT_FOUND` | 404 | No archive by that id, or its directory is no longer readable |
| `POST_NOT_FOUND` | 404 | No such post in that archive, or its metadata is gone |
| `MEDIA_NOT_FOUND` | 404 | The post has no file of that kind, or it is no longer on disk |
| `NOT_FOUND` | 404 | No route, or a missing asset |
| `INTERNAL` | 500 | Anything unhandled |

All JSON responses are `Cache-Control: no-store`. The index is a snapshot of a directory another
program is still writing to, so caching it is how you serve a post that was deleted ten minutes ago.

## Archives

### `GET /api/stats`

The root in use, the export directory if one was found, and the totals across every archive.

```json
{
  "root": "/Users/you/code/ttdl/downloads",
  "likesDir": null,
  "archives": 4,
  "posts": 4091,
  "bytes": 214748364800,
  "builtAt": 1755000000,
  "version": "0.1.0"
}
```

### `GET /api/archives`

Every archive found under the root.

`authors` comes back **empty** here on purpose: a list archive can carry thousands of them and the
library grid only ever reads `authorCount`. The full array is worth its bytes on one archive's own
page, not on a listing of all of them.

### `GET /api/archives/:archiveId`

One archive, with `authors` populated — sorted by post count, descending.

Notable fields:

| Field | Meaning |
|---|---|
| `kind` | `profile` or `list`. A `.source` file makes it a list |
| `counts` | `posts`, `videos`, `carousels`, `incomplete`, `ghosts`, `withoutInfo`, plus ttdl's own `archived` / `known` / `missing` |
| `card` | ttdl's `profile.json`, with the `fetchedAt` it was taken on. Never present on a list archive |
| `primaryAuthor` | The one author of a profile archive; the largest of a list |
| `dateRange` | `{ first, last }` in Unix seconds, or null |
| `downloadInProgress` | ttdl holds a `.lock` while it runs — the UI shows a banner |
| `scannedAt` | When this index entry was built |

`counts.ghosts` are posts with metadata or a cover but no media file — something that was deleted
from disk. `counts.incomplete` are carousels whose audio is present but whose images are not all
there; see [Reading ttdl's format](/reference/archive-format/).

### `POST /api/archives/:archiveId/rescan`

Re-reads the directory and rebuilds that archive's index. This is how new posts appear without
restarting the server.

```json
{ "changed": true, "counts": { "posts": 4093, "…": 0 }, "tookMs": 214 }
```

`changed` compares the scanner's listing hash from before and after, so a rescan that found nothing
new says so rather than reporting a vague success. An archive whose directory has become unreadable
returns `ARCHIVE_NOT_FOUND` rather than a successful rescan that changed nothing.

## Posts

### `GET /api/archives/:archiveId/posts`

The filtered, ordered, keyset-paginated view. This is the one route with a real query string, and
it is [parsed by code shared with the app](/explanation/layout/) — the API contract and the
"share this view" URL cannot drift apart.

| Parameter | Values | Default |
|---|---|---|
| `q` | Substring over description, title, author handle and name, track and artists | — |
| `author` | Handle, repeatable. `-` means "no author recorded" | — |
| `hashtag` | Repeatable; `#` stripped, lowercased. **All** must match | — |
| `kind` | `video` \| `carousel` | both |
| `status` | `complete` \| `incomplete` \| `all` | `complete` |
| `from` / `to` | `YYYY-MM-DD`, inclusive, UTC | — |
| `minDuration` / `maxDuration` | Seconds | — |
| `sort` | `date` `likes` `views` `comments` `saves` `duration` `liked` `random` | `date` |
| `order` | `asc` \| `desc` | `desc` |
| `seed` | Any string; only with `sort=random` | `0` |
| `limit` | 1–200 | 30 |
| `cursor` | Opaque, from the previous page | — |

Anything unrecognised is ignored rather than rejected — an unknown `sort` falls back to `date`, a
malformed `from` is dropped. `limit` is clamped, not refused.

```json
{ "items": [ /* Post */ ], "total": 3307, "cursor": "NzY3MzQ1…" }
```

`total` is the size of the filtered view, not of the page. `cursor` is null at the end.

#### The cursor is a key, not an offset

It is the base64url of the last post's id, and the next page resumes *after* that post. ttdl and
this viewer routinely run at the same time, and a rescan landing mid-scroll shifts every offset
after the insertion point — which shows up as duplicated and skipped posts in an infinite feed.
Resuming from an id is immune to that.

If the cursor's post is gone by the time you ask — ttdl deleted or renamed it between pages — the
sequence **ends**: `{ items: [], cursor: null }`. Restarting from the top would append page one to
an infinite feed, duplicating keys and handing back the very same cursor, so the client would fetch
it forever.

#### Ordering is total, and nulls sort last

Posts with no value for the chosen key sort last in **either** direction — an archive with no
metadata must not float to the top of a "most liked" list. Ties break on `createdAt`, then on the
post id compared numerically (by length first: a 15-digit id starting with 9 is smaller than a
19-digit one starting with 1). That totality is not cosmetic — the keyset cursor needs the order to
be stable, not merely consistent-looking.

`sort=random` is a seeded shuffle (xmur3 + mulberry32), so the order survives a page reload.

### `GET /api/archives/:archiveId/posts/:postId`

One `Post` object, the same shape as an item in the page above. Key fields:

| Field | Meaning |
|---|---|
| `kind` / `status` | `video` \| `carousel`; `complete` \| `incomplete` |
| `createdAt` / `createdAtSource` | Unix seconds, always present. Source is `info`, `filename` or `postid` — so the UI can mark an inferred date as inferred |
| `media` | `{ url, kind, ext, bytes, width, height, fps, aspectRatio }` |
| `photos` | Carousel only: `count` on disk, `expected` from `_photo.json` (null on a legacy carousel), and `urls` |
| `stats` | `views`, `likes`, `comments`, `shares`, `saves` — any of them null |
| `loudnessGain` | Decibels, from ttdl's `loudness.json`. Null means *nothing measured this post*, which is a different fact from a measured `0.0` |
| `liked` | `{ at, kind: "like" \| "favorite" }` or null — see [Liked and favorited dates](/guides/liked-dates/) |
| `webpageUrl` | Displayed and copyable; never rendered as a live href |
| `hasInfo` | Whether `.info.json` exists, which is what the route below needs |

Every `null` stat means "not recorded", never "zero". The UI renders those as `—`.

### `GET /api/archives/:archiveId/posts/:postId/info`

Streams ttdl's `.info.json` back **verbatim**, straight off disk — this is the escape hatch for
everything the `Post` shape drops. 404s with a `ttdl.py meta <archive>` hint when the post has no
metadata file.

Note that the indexer itself discards `formats[]` and `thumbnails[]` after reading geometry from
them; they are full of live signed CDN URLs. This route hands you the raw file, so what you do with
those is yours.

### `GET /api/archives/:archiveId/posts/:postId/neighbors`

Position of one post within a filtered view, plus its neighbours — the query string is the same as
`/posts`. This is what makes a feed deep link work without paginating up to it.

```json
{ "prev": "7673…", "next": "7674…", "position": 41, "total": 3307 }
```

`position` is `-1` when the post is not in that view at all.

## Pickers

### `GET /api/archives/:archiveId/authors`

`?q=` fuzzy-ranked, `?limit=` up to 200 (default 50). Without `q`, the archive's authors in post
count order.

Fuzzy matching lives here rather than over descriptions because there are at most a few hundred
authors and nobody remembers a TikTok handle exactly.

### `GET /api/archives/:archiveId/hashtags`

`[{ tag, count }]`, ranked by count then alphabetically. `?q=` fuzzy-ranked, `?limit=` up to 500
(default 50).

## Media

| Route | Serves |
|---|---|
| `GET /media/:archiveId/avatar` | The archive's `avatar.jpg`, when ttdl recorded one |
| `GET /media/:archiveId/:postId/media` | The video, or a carousel's audio track |
| `GET /media/:archiveId/:postId/cover` | The cover image |
| `GET /media/:archiveId/:postId/photo/:index` | One carousel image |

`HEAD` works on all four.

### No request string ever becomes a path

This is the only place a request turns into a file, and it does so without concatenating: the
archive id indexes a closed map built by the scanner, the post id indexes that archive's group map,
and the filename is read out of the group. A traversal attempt lands on a missing map key, not on a
parent directory.

### Range and caching

`Accept-Ranges: bytes` on everything. All three legal forms are handled, because each comes from a
real client:

| Header | Meaning |
|---|---|
| `bytes=0-499` | An ordinary chunk |
| `bytes=500-` | Open-ended — what Safari sends after its opening probe |
| `bytes=-500` | Suffix; some seek implementations ask this way |

Multi-range (`bytes=0-99,200-299`) is answered with a `200` and the whole file. That is spec-legal
and far simpler than assembling `multipart/byteranges`, and no media element needs it. An
unsatisfiable range gets a `416` with `Content-Range: bytes */<size>`.

**Open-ended ranges are clamped to 8 MiB**, but only for time-based media. Chrome simply asks again
for the next chunk and memory stays flat, instead of one `bytes=0-` on a large video pinning a whole
response. An image is always cheaper to send whole than to make the browser ask twice, so it is not
clamped.

`ETag` is `"<size in hex>-<mtime in hex>"`, and `If-None-Match` gets a `304`. Media is served
`public, max-age=31536000, immutable` — safe because the URL carries `?v=<mtime>`, so a changed file
is a changed URL.

## Everything else

In production the same process serves the built app. Any path that is not a real file under `dist/`
comes back as `index.html`, since the client routes on paths like `/a/liked/feed/7673…` that exist
only in the browser. A path that *looks* like a file (`/assets/foo.js`) stays a genuine 404 rather
than quietly returning HTML — which otherwise shows up as a baffling `unexpected token <` in the
console.

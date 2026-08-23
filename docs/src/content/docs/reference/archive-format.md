---
title: Reading ttdl's format
description: Three details that break a naive indexer, two deliberate divergences, and the author's card.
---

An archive is a directory of media with one subdirectory in it. The media and the per-post
sidecars — `.info.json`, covers, `*_photo.json`, `*_photo.complete` — sit at the top; everything
ttdl records *about* the archive lives in `.ttdl/`, and that is the only place this viewer looks
for it. ttdl's own [state files reference](https://ttdl.orlovsky.dev/reference/state-files/) is the
contract for those files, and this is written against it.

```
downloads/username/
  20260814_7673909736131038495_Caption.mp4          read as a post
  20260814_7673909736131038495_Caption.info.json    its metadata
  20260814_7673909736131038495_Caption.jpg          its cover
  .ttdl/
    archive.txt  .all_ids.txt  missing.txt          the counts under the header
    .source                                         what makes it a list archive
    .liked.json                                     saving dates, when ttdl has them
    loudness.json                                   the R128 gains
    profile.json  avatar.jpg                        the author's card
    .lock                                           a run in progress, right now
```

ttdl kept all of that flat, beside the videos, until it introduced `.ttdl/`; it moves an archive
over on the first mutating command it runs against one. **The flat layout is not read here.** This
viewer never writes to an archive and so can never migrate one, which would make reading the old
spot a fallback nothing could ever retire — so an archive ttdl has not touched since the move shows
its posts and nothing else: no card, no counts, no list marker, until one ttdl command moves it.

The format is only specified by `ttdl.py` itself, and three details of it will break a naive
indexer. They are ported deliberately, and locked down by
[`tests/complete.test.ts`](https://github.com/sadorlovsky/ttdl-viewer/blob/main/tests/complete.test.ts),
which is ttdl's own `complete_ids` test table transcribed one-for-one — if ttdl's rule ever
changes, that suite is what says so.

## Three details

1. **A post's files do not share one prefix.** The media, `.info.json` and cover carry the caption
   in their names; the carousel sidecars do not (ttdl's carousel code cuts the prefix at the id).
   Everything here groups by the captured **post id** and classifies by suffix.
2. **`NAME_RE` is anchored.** Captions routinely contain long numbers, and an unanchored search
   pulls the "id" straight out of the caption.
3. **Carousel covers may be `.jpeg`**, while carousel *images* are always `.jpg` — `.JPG` counts,
   `.jpeg` does not (ttdl's `PHOTO_INDEX_RE`).

## Two deliberate divergences

**Incomplete carousels are kept.** ttdl drops them, because for ttdl "incomplete" means "fetch it
again". A viewer has the opposite obligation, so they are surfaced with `status: incomplete`, play
the images that exist, and show the missing ones as hatched segments. The default API filter is
`status=complete`, so they stay opt-in — the opt-in being an amber Incomplete chip in the filter
bar, which appears only on an archive that actually holds one.

**A date is always resolvable.** `info.timestamp` when present, otherwise the post id itself — its
upper 32 bits are Unix seconds (`post_day`). `createdAtSource` is exposed so the UI can
mark an inferred date as inferred.

## What is read and thrown away

`formats[]` and `thumbnails[]` are read for geometry and then **discarded**. They are most of the
file's bytes, and they are full of live signed CDN URLs — keeping them would put a remote URL one
careless `<img src>` away from the render path.

The raw file is still available verbatim from
[`/posts/:postId/info`](/reference/http-api/#get-apiarchivesarchiveidpostspostidinfo) for anything
that wants it.

## The author's card

`.ttdl/profile.json` and `.ttdl/avatar.jpg`, which ttdl's `get` writes for a profile archive, are
read as the archive's own files rather than as any post's — they describe the account, not a post,
and `parseName` never sees them. The picture is also the one file served from `.ttdl/` rather than
from the archive itself.

The card is the one thing in an archive describing something that moves — a nickname, a bio, a
follower count — so it travels with the date ttdl took it, and the header prints that date beside
the numbers.

`readCard` validates field by field instead of casting: the file is written by another program and
can arrive from storage half-copied, and a truncated card has to degrade to "no card" rather than
put `undefined` where the UI calls `toLocaleString()`.

The picture is matched to an author by the handle the card names, not by position, so a renamed
directory cannot put one person's face on another's posts. It also joins the listing hash, because a
replaced picture keeps its filename and a cached index would otherwise go on serving the old one.

The seeded letter-and-hue avatar renders *underneath* the picture, so a file moved to storage falls
back to it without a hole in the layout. It is also all there is for every author in a list archive:
those have no card, because those posts come from many accounts and there is no one profile to ask.

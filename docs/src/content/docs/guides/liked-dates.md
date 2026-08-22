---
title: Liked and favorited dates
description: Where TikTok's saving dates live, why ttdl owns them, and how the viewer reads them.
---

TikTok orders your likes and favorites by when you *saved* a post, and that date exists nowhere on
disk — ttdl names files after the publication date and stamps the same date on them. It exists only
in the TikTok data export (Settings → Account → Download your data).

## Normally there is nothing to do at all

ttdl takes `--likes` itself, and caches what it finds as `.liked.json` in the archive's `.ttdl/`. That file
is read first, because it needs no searching, it stays correct after the export folder is deleted,
and it travels with the archive to storage and back:

```bash
ttdl.py get "TikTok Saved" --likes tiktok-export   # once, in ttdl
bun run start                                      # the dates are simply there
```

Two orderings — **Recently saved** and **First saved** — then appear in the filter bar, and each
post carries the date it was saved under its caption.

## Only list archives get them

Only archives built from a list get these dates, which is ttdl's rule and now this viewer's. A
profile archive holds posts an account published, not posts anybody saved.

Applying one export to every archive — which this used to do — puts a saving date on the handful of
posts you happen to have liked from an account you also archive in full: seven posts out of 3,307
in one archive here, which is no ordering at all.

## If ttdl was never given the export

Unpack it anywhere inside the archive root and the viewer reads it directly, for list archives that
have no dates recorded:

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

That search never opens an archive: a directory holding the export carries none of ttdl's
bookkeeping, so it is not an archive and stays out of the library. See
[Where it reads from](/start/configuration/#where-it-reads-from).

## The export is a snapshot

Posts saved after you requested it are not in it until you request a new one. A post sitting in both
lists keeps its **like** date, since that is the list it primarily belongs to.

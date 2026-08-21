---
title: Layout
description: What lives where, and the one separation the server keeps on purpose.
---

```
src/shared/     types, query parse/serialize, avatar seed — imported by both sides
src/server/     Bun: scan → classify → build → query, plus Range-correct media serving
src/web/        React: library, profile grid, full-screen feed
scripts/        dev runner, fixture generator, offline guard
tests/          filename parsing, ttdl completeness parity, Range matrix
docs/           this site
```

## The shared middle

`src/shared/filters.ts` holds one implementation of the query string, used by both the server route
and the app's URL state. Keeping it shared is what stops the [API contract](/reference/http-api/)
and the "share this view" URL from drifting apart — and it means `serializeQuery(q)` doubles as the
React Query cache key, which is why opening the feed from a grid tile reuses the pages already
fetched instead of refetching.

That serializer drops the cursor deliberately: the string identifies a *view*, and the cursor
identifies a position within it. Including it would give every page of an infinite scroll a
different cache key for the same filter.

## The separation on the server

The server keeps two things apart on purpose. The **post objects** are what the JSON API serves; the
**scanner's file-group map** is what turns a URL into a filename, and it is the only thing that ever
does.

No string from a request is joined into a path anywhere. The archive id indexes a closed map built
by the scanner, the post id indexes that archive's group map, and the filename is read out of the
group — so a traversal attempt lands on a missing map key rather than on a parent directory.

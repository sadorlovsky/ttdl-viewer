# Features

Every behaviour the viewer has, with the shared surfaces each one leans on. `PRODUCT.md` says what
the product is and why; this file is the regression inventory: before changing code, find the
surfaces the change touches below, then walk every feature that shares them. The speed-up hold was
broken by a loudness change because the two met on a surface no module named.

A feature that changes must change here in the same commit, or the file starts lying — and a lying
inventory is worse than none.

**How each entry is verified.** `unit: <file>` means a bun test pins it. `device` means only a
by-hand pass shows it — the fixtures archive (`bun run fixtures`) is the surface to walk, on a
desktop browser and on an iPhone, because several behaviours below exist only on one of them.
`nothing` means no mechanism catches a regression today; treat those as the most fragile.

## Shared surfaces

What couples features together is not imports but these. A change that touches one touches every
feature listed against it, on every platform, whether or not any module names the connection.

| surface | what lives on it | features coupled through it |
| --- | --- | --- |
| the media element | `src`/`load()`, `playbackRate` and its default, `muted`/`volume`, `currentTime`, `play()`/`pause()`, routing into the graph | playback, speed menu, speed-up hold, scrubber, keyboard seeking, loudness, priming, the speaker button, resource release |
| the audio graph | one-way `createMediaElementSource` routing, per-element gains, the limiter, the iOS ban | loudness, neighbour silence, the pitch/rate invariant |
| the pointer stream | one surface deciding tap, hold and swipe; the feed's capture-phase press handler; `data-interactive` opt-outs | tap-to-pause, both holds, carousel swipe, the scrubber, segments, priming, waking the graph |
| the scroll position | it *is* the active index; snap; `goTo`; the arrival jump; the grid breadcrumb | active tracking, keyboard navigation, auto scroll, deep links, scroll restoration |
| the URL | route carries archive and post id, query carries the whole filter state; rewritten with `replace` on every snap | deep links, filters, hashtag jumps, back to the grid, shareable positions |
| the player store (persisted) | `muted`, `volume`, `rate`, `autoAdvance`, `pan`, the hint flag | every slide at once — a rate chosen on one post is every post's rate |
| the autoplay and audio-session policy | rights are granted per gesture and per element | autoplay fallback, priming, the speaker button's iOS restart, graph creation |

The decoder budget is a surface too: five mounted media elements (window ±2) plus whatever a tile
preview holds. iOS caps concurrent decoders low, and an element not released on unmount starves a
later one silently.

## Library

Verified: `unit: tests/registry.test.ts, tests/scan.test.ts` for what is indexed; the rest `device`.

- One card per archive: name, post count, a kind badge (profile or list, decided by
  `.ttdl/.source`), and a "downloading" dot while `.ttdl/.lock` exists.
- The root path is shown; a dead indexer, an empty root, and a root with nothing indexable are
  three distinct states with their own copy.

## Profile grid

Verified: `unit: tests/profile.test.ts, tests/filters.test.ts, tests/query.test.ts,
tests/likes.test.ts`; presentation and restoration `device`.

- The card: avatar from the archive's own `avatar.jpg` with a generated mark underneath (never a
  broken frame), handle, verified badge, bio link, and stats counted from disk now — never the
  platform's own counts.
- Tabs All / Videos / Carousels — one axis, a sliding underline, each absence stated on its own.
- Tiles: cover, kind chip, duration, counts; `incomplete` badge; a ghost has no preview because it
  has no frames.
- Hover previews only where a fine pointer hovers and motion is not reduced; armed after the
  pointer rests, a six-second sample, images cycled for carousels.
- Coming back from the feed scrolls to and outlines the post that was left, via a breadcrumb the
  feed drops on every slide (`sessionStorage`, the browser's own back included).
- The filter bar: substring search over captions, authors and sounds; sorts (date, saved, likes,
  views, comments, saves, duration, and Shuffle — the saved sorts offered only when the export is
  loaded); filters for kind, status (complete / incomplete / ghost), author and hashtag pickers
  with fuzzy matching, a date range, duration presets. All of it lives in the URL query and
  survives into the feed and back.

## Feed — arrival and motion

Verified: `unit: tests/api.test.ts` for paging; everything visible `device`.

- One post per viewport on native scroll-snap. Every post gets a slot; media mounts only in the
  ±2 window. The active index is read off the scroll position (rAF plus `scrollend`), and a
  gesture forces the read before acting, so the first press after a fling hits the post on screen.
- Deep links page toward the target's known position; a stale bookmark or a filtered-out id
  settles on what is actually showing instead of freezing. The URL follows the active post with
  `replace`.
- Buffering is staged: the active slide first, neighbours once it can play, the outer ring
  metadata only. Every feed press primes unplayed neighbours inside the gesture, muted and
  synchronously, so later slides hold the right to start themselves.
- The next page is fetched five posts before the end; the position readout claims a total only
  once no more pages can arrive.
- Accessibility: `role="feed"`, a label and announcement only for the post settled on, off-screen
  slides and the feed under the sheet are `inert`.

## Feed — video posts

Verified: `device`, on both scenes.

- Autoplay muted by default. A refusal leaves the play badge; `NotAllowedError` on an unmuted
  start falls back to muted playback, and the next real gesture restores the sound it took.
- Tap toggles pause (decided from pointer events, never `click`); with the display cleared, the
  tap restores the interface instead. The play badge appears only on the active, paused,
  ready-or-refused slide.
- A file that cannot be decoded or is missing gets an explanation and the ttdl command that would
  fix it; transient faults keep the badge and retry on tap.
- A pause nobody asked for is taken back, three times at most; the viewer's own pause, the
  sheet's, and the feed's are all flagged and never fought.
- A pause arriving inside a rate change is the pipeline being rebuilt rather than a stop. For the
  settle window nothing on screen reacts to it and nothing resumes into it; what is still stopped
  when the window closes is treated as stopped. WebKit rebuilds whenever the rate moves away from
  1×, and the `play()` that used to answer that pause landed as a seek backwards on iOS.
- Buffering shows a shimmer, then "still reading from disk" after four seconds.
- Posts loop; with Auto scroll on, the ended post hands the feed to the next one, and the archive
  ends on the final frame of the final post.
- A slide leaving the ±1 neighbourhood rewinds; coming back starts over. On unmount the element's
  source is detached and reloaded so the decoder is handed back, and its loudness record dropped.
- A post appreciably off 9:16 gets the blurred backdrop; a post with no cover shows the author
  initial instead of a black frame.

## Feed — carousel posts

Verified: `unit: tests/carousel.test.ts, tests/clock.test.ts, tests/gaps.test.ts`; the rest
`device`.

- The images run on the audio element's clock; a soundless carousel runs on a wall clock at the
  same rate. A stall holds the images; a wrap is told from a seek by the half-cycle rule.
- Story-style segments, not a scrubber: a tap goes to that image, a sideways swipe moves exactly
  one, and neither restarts the music mid-bar. Missing images are hatched segments that say so.
- Photo zoom (off by default) drifts alternate images in and out, scaled with the playback rate.

## Feed — the gesture surface

Verified: `device`, on touch and on a mouse — nothing else reaches it today.

- One surface decides everything: a press that stays put 400ms is a hold, drift past 10px ends
  the tap, 6px of travel commits an axis (sideways biased 0.75), one flick is one image.
- A hold in the left third runs the post at twice the chosen rate, capped at 4×, video and
  carousel alike, with a readout on screen; release restores the chosen rate exactly. A hold
  anywhere else opens the sheet. Right-click and the touch callout always mean the sheet.
- A press interrupted by scrolling away cancels cleanly; the play badge, segments and scrubber
  own their own gestures and are left alone.

## Feed — keyboard

Verified: `device` (desktop scene).

- `j`/`k`, the vertical arrows and `PageUp`/`PageDown` move between posts; Space toggles; the
  horizontal arrows step — five seconds on a video, one image on a carousel; `0`–`9` seek to that
  tenth.
- `m` mutes the way the speaker button does; `i` toggles the metadata panel; `?` the key list;
  `f` fullscreen; Escape unwinds innermost-first — cleared display, then panels, then the grid.
- Typing into any field is never hijacked, and the open sheet keeps its own keys.

## Feed — chrome and overlays

Verified: `device`.

- Back, the speaker, and the metadata toggle. Unmuting on iOS restarts the element inside the
  gesture because the audio session admits it once; everywhere else it is a plain unmute.
- Caption with the author's handle and tappable hashtags that jump to the filtered grid; the
  action rail is the avatar link plus like/comment/save/share readouts — readouts, never buttons.
- The metadata panel shows the post's raw `info.json` and follows the feed while it scrolls; it
  takes focus on open, returns it on close, and is deliberately not modal.
- A one-time hint names the gestures (touch and keyboard variants); any interaction dismisses it.
- Clear display removes all chrome as one thing until the next tap; it is never persisted.
- Fullscreen wraps the whole stage, and its label follows `fullscreenchange`, not what was asked.

## The sheet

Verified: `device`.

- Opening pauses the post only if it was playing, and closing resumes only what the sheet itself
  paused, only if that slide is still the active one. The feed underneath is inert.
- Rows: Copy link · Open at the source (*leaves the archive* — the product's one outward action) ·
  Keys and gestures · Raw metadata ("none on disk" when so) · Speed 0.5/1/1.5/2 · Clear display ·
  Auto scroll · Photo zoom (carousels) · Picture-in-Picture (videos, where the browser has it) ·
  Fullscreen · Debug readout. Rows that cannot act on this post do not appear.

## Loudness and the pitch invariant

Verified: `unit: tests/loudness.test.ts` for every decision; the graph itself `device`.

- Corrections come from `.ttdl/loudness.json`, applied through `element.volume` where that is
  honoured and expressive enough, through a WebAudio gain otherwise; amplification stops at
  +12 dB; unmeasured posts play untouched.
- The graph is created only inside a gesture, never routed suspended, disconnected on unmount,
  silences the neighbours, and puts one limiter before the speakers.
- The iOS family gets no graph at all: its pipeline cannot change a routed element's playback
  rate, and the rate is a feature. `?boost=0` forbids the graph anywhere; `?boost=1` forces it
  where the rule bans it.
- **Changing the playback rate never changes pitch.** `preservesPitch` is the default everywhere
  and nothing unsets it; iOS holds it by staying unrouted; Chromium holds it through the graph
  (measured — 441 Hz at 1× and at 2×); Firefox holds it since 91. A change that touches the
  graph, the rate, or routing must re-check this line on a device.

## Debug

Verified: `device`.

- `?debug=1` (or the sheet's toggle) shows a live line for the slide on screen: index, ready and
  network state, buffered seconds, the slide's flags, the gain readout (a number, `wait`, `off`,
  or `deaf`), and how many media elements exist — the last one is the decoder-budget check.

## Server and index

Verified: `unit: tests/range.test.ts` (the Range matrix), `tests/api.test.ts`,
`tests/registry.test.ts`, `tests/scan.test.ts`, `tests/parse-name.test.ts`,
`tests/complete.test.ts` (ttdl parity, one for one), `tests/likes.test.ts`,
`tests/gaps.test.ts`, `tests/config.test.ts`, `tests/settings.test.ts`.

- Media is served with correct Range semantics, so seeking works. Pagination is keyset, so a
  rescan mid-scroll cannot shift the pages under the feed.
- The index is built at startup and on `POST /api/archives/<id>/rescan`; the loudness sidecar is
  in the change probe, so a measuring run is picked up without a restart.
- Only `.ttdl/` layouts are read; the remembered root in `~/.config/ttdl-viewer/config.json` is
  the one file ever written, and it is outside every archive.

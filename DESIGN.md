---
name: ttdl-viewer
description: A darkroom for an archive that never leaves the disk.
colors:
  bg: "#000000"
  surface: "#121212"
  surface-2: "#1c1c1c"
  surface-3: "#262626"
  text: "#ffffff"
  text-2: "rgb(255 255 255 / 0.72)"
  text-3: "rgb(255 255 255 / 0.5)"
  text-4: "rgb(255 255 255 / 0.32)"
  line: "rgb(255 255 255 / 0.12)"
  line-strong: "rgb(255 255 255 / 0.24)"
  accent: "#fe2c55"
  accent-2: "#25f4ee"
  warn: "#ffb400"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "26px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.02em"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "normal"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
  caption:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.35
    letterSpacing: "normal"
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.06em"
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
rounded:
  hairline: "2px"
  radius: "8px"
  radius-lg: "12px"
  radius-sheet: "16px"
  radius-pill: "999px"
  circle: "50%"
spacing:
  tile-gap: "2px"
  xs: "4px"
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  rail-gap: "20px"
  section: "24px"
  page-top: "40px"
  page-bottom: "80px"
components:
  search-input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.radius-pill}"
    padding: "8px 12px 8px 34px"
  pill-button:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-2}"
    rounded: "{rounded.radius-pill}"
    padding: "8px 12px"
  pill-button-hover:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text-2}"
    rounded: "{rounded.radius-pill}"
    padding: "8px 12px"
  pill-button-active:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text}"
    rounded: "{rounded.radius-pill}"
    padding: "8px 12px"
  chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.radius-pill}"
    padding: "5px 12px 5px 6px"
  chip-selected:
    backgroundColor: "rgb(254 44 85 / 0.12)"
    textColor: "{colors.text}"
    rounded: "{rounded.radius-pill}"
    padding: "5px 12px 5px 6px"
  hashtag:
    backgroundColor: "transparent"
    textColor: "{colors.text-2}"
    rounded: "{rounded.radius-pill}"
    padding: "4px 10px"
  hashtag-selected:
    backgroundColor: "rgb(254 44 85 / 0.12)"
    textColor: "{colors.text}"
    rounded: "{rounded.radius-pill}"
    padding: "4px 10px"
  archive-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.radius-lg}"
    padding: "12px"
  archive-card-hover:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text}"
    rounded: "{rounded.radius-lg}"
    padding: "12px"
  tab:
    backgroundColor: "transparent"
    textColor: "{colors.text-3}"
    rounded: "0"
    padding: "10px 16px"
  tab-active:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    rounded: "0"
    padding: "10px 16px"
  badge:
    backgroundColor: "{colors.surface-3}"
    textColor: "{colors.text-3}"
    rounded: "{rounded.radius-pill}"
    padding: "1px 7px"
  badge-list:
    backgroundColor: "rgb(37 244 238 / 0.1)"
    textColor: "{colors.accent-2}"
    rounded: "{rounded.radius-pill}"
    padding: "1px 7px"
  chrome-button:
    backgroundColor: "rgb(0 0 0 / 0.35)"
    textColor: "{colors.text}"
    rounded: "{rounded.circle}"
    size: "36px"
  chrome-button-active:
    backgroundColor: "rgb(255 255 255 / 0.9)"
    textColor: "{colors.bg}"
    rounded: "{rounded.circle}"
    size: "36px"
  command-block:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-2}"
    typography: "{typography.mono}"
    rounded: "{rounded.radius}"
    padding: "10px 14px"
---

# Design System: ttdl-viewer

## Overview

**Creative North Star: "The Darkroom"**

The room is dark because the work is the only thing worth lighting. Every surface starts at true
black and steps up in four tonal increments, never past `#262626`; the archived media is the sole
light source on the screen, and the interface is the equipment arranged around it in the dark.
Chrome sits on top of unpredictable video, so it earns its legibility with blur and scrim rather
than by turning up the room lights.

The accent is a safelight. It is a hot red that appears on state and nothing else — never on a
surface, never on a heading, never as decoration — and its authority comes entirely from how
seldom it is allowed on. The secondary cyan is rarer still: two uses in the entire system, both
marking a different *category* of thing rather than a different state.

Everything about the equipment is soft-touch and media-first. Controls are pills and circles with
finger-sized targets, they recede to a hairline border at rest, and they transition in 120ms — fast
enough to feel handled rather than clicked. Nothing borrowed from the source platform appears
anywhere: avatars are generated from the handle's hue, every glyph is drawn from scratch, and there
is no wordmark, because a single remote reference would break the offline guarantee this product
is built on.

**Key Characteristics:**

- True-black ground with a four-step tonal surface ladder; no color in the neutrals at all.
- One accent, admitted only on state, plus one secondary admitted only on category.
- Depth by `backdrop-filter` blur and scrim, not by shadow.
- Pills and circles for anything interactive; 8px and 12px radii for anything that contains.
- System font stack only — there is no webfont, and there cannot be one.
- Every changing number is tabular; every absent number is an em dash.

## Colors

A near-monochrome system: eleven of the fourteen tokens are black, white, or white at a stated
opacity, and the three chromatic values are rationed.

### Primary

- **Signal Rose** (`#fe2c55`): The system's only state color. It marks the active profile tab
  (a 2px underline), the border and 12% tint of a selected author chip or hashtag, the 14% tint of
  an active filter tag, the 2px inset ring on the highlighted post tile, the "downloading now"
  dot and label, and the focus ring on every focusable element. It never fills a surface, never
  colors body text, and never appears on the feed itself.

### Secondary

- **Developer Cyan** (`#25f4ee`): Category, not state. Exactly two uses: the LIST badge that
  distinguishes a multi-author list archive from a profile archive, and inline hashtags in a
  caption — at rest, not on hover, because half of this product is a touch screen and a hover
  state there is a signal that never arrives. Both say "this is a different kind of thing," never
  "this is on."

### Tertiary

- **Missing-Frame Amber** (`#ffb400`): Absence, never error. It carries the incomplete-carousel
  count, the hatched diagonal fill on segments whose images the archive never got, the caption's
  missing-image warning, and the library card's gap notice. Nothing has gone wrong when it appears —
  the archive is simply not whole, which is a fact about the download, not a fault in the app.

### Neutral

- **Lights-Out Black** (`#000000`): The page ground and the feed slide background. True black, not
  a softened near-black, so that letterboxed media has nothing to bleed into.
- **Surface** (`#121212`): Cards, inputs, pill controls, popovers, command blocks — the resting
  state of anything you can touch.
- **Surface 2** (`#1c1c1c`): The hover and active step for every surface above, and the empty-tile
  ground.
- **Surface 3** (`#262626`): The top of the ladder — badges, the pressed empty-state action, and
  the lighter stop of the two "no cover" gradients.
- **Text** (`#ffffff`) → **Text 2** (72%) → **Text 3** (50%) → **Text 4** (32%): A pure opacity
  ramp, not four grays. Primary content, supporting facts, de-emphasized labels, and metadata
  whispers respectively.
- **Line** (12% white) and **Line Strong** (24% white): Hairline borders at rest and on focus or
  emphasis. There are no solid-color borders in the system.

### Named Rules

**The Safelight Rule.** Signal Rose is admitted only where the interface reports *state* — active,
selected, focused, live. If a proposed use is decorative, structural, or merely emphatic, the
answer is a tonal step or a text-opacity step instead. The color's authority is a function of its
scarcity; each new admission spends it.

**The Opacity-Ramp Rule.** Neutral text is white at four stated opacities, never a mixed gray.
A new text tone must be one of the four existing steps; introducing `rgb(255 255 255 / 0.6)`
because it "looked right" fractures the ramp and is a defect, not a refinement.

**The Amber-Is-Absence Rule.** Missing-Frame Amber may only describe something the archive does
not have. It is never a validation error, never a destructive-action warning, and never a general
caution — those states do not exist in a read-only viewer.

## Typography

**Display / Body Font:** System stack (`-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, `Roboto`,
`Helvetica Neue`, `Arial`, sans-serif)
**Label/Mono Font:** System mono stack (`ui-monospace`, `SFMono-Regular`, `SF Mono`, `Menlo`,
`Consolas`, monospace)

**Character:** The system stack is not a compromise here, it is the only honest option — the
product cannot fetch a webfont without breaking its own guarantee, so it wears the host OS's voice
and makes a virtue of feeling native on the machine it runs on. The scale is tight and small: the
largest type in the entire product is 26px, and the interface leans on weight (600 against 400) and
opacity far more than on size.

### Hierarchy

- **Display** (600, 26px, -0.02em): The library title. The single largest element in the product.
- **Headline** (600, 24px, -0.02em): The profile handle. Negative tracking on both of the large
  sizes keeps them from feeling loose against the tight interface.
- **Title** (600, 15px): Archive card names and the caption's author handle — the "this is the
  thing" line inside a component.
- **Body** (400, 15px, 1.4): The document default, set on `body`.
- **Caption** (400, 14px, 1.35): Post description text over media, clamped to 2 lines and expanding
  to 12. Tighter leading than body because it sits on video and wants to read as one block.
- **Label** (500, 11px, 0.06em, uppercase): Section eyebrows and the empty-tile notice. Uppercase
  appears *only* at this size with this tracking.
- **Mono** (400, 11.5–12.5px): Filesystem paths, shell commands, archive directory names, and the
  debug drawer. Monospace is a signal that the string is a literal you could type or paste.

Below the named roles the system also runs a deliberate set of half-step sizes — 13.5px inputs,
12.5px counts, 11.5px overlay metadata — tuned per component rather than snapped to a scale.

**13px is a step, not drift.** It carries secondary lines that sit under a title without becoming
metadata: the caption's track name and its "more" affordance, the overlay pill on media, the drawer
empty state, and the equivalents on the library, profile and filter surfaces — twelve uses across
six files, every screen in the product. It was established in the code before this document existed
and is recorded here rather than edited out of twelve call sites.

### Named Rules

**The Tabular Rule.** Any number that can change in place is `font-variant-numeric: tabular-nums`.
View counts, durations, tag counts, the feed position readout, the scrub bubble — all of them sit
in fixed columns and must not jitter as digits change. A `.tabular` utility exists in the reset for
exactly this.

**The Monospace-Means-Literal Rule.** The mono stack marks strings the user could copy and act on:
a path, a command, an archive directory name, a raw metadata dump. It is never used for emphasis or
texture.

## Layout

Two spatial models, chosen by what the surface is for.

**Documents (library, profile).** A centered column capped at `1120px`, with `24px` horizontal
padding in the library and `16px` in the profile, `40px` of top padding, and `80px` of bottom
padding so the last row never sits against the viewport edge. The library grid is
`repeat(auto-fill, minmax(260px, 1fr))` with a `16px` gutter — it reflows by available width with
no breakpoint. Archive cards are a fixed `92px` art column beside a fluid body.

**The feed (full-bleed).** `100dvh` slots with `scroll-snap-type: y mandatory` and
`scroll-snap-stop: always`, so one post moves per fling. `dvh` throughout, because mobile browser
chrome collapses and `vh` would leave the snap points misaligned. `overscroll-behavior-y: contain`
on both scrollers stops a fling from chaining into the page behind it.

**The stage.** Post chrome — caption, action rail, position readout, scrubber, carousel segments
and counter — is positioned against the *media box*, not the viewport. `--stage-w` is
`min(100dvw, calc(100dvh * var(--stage-ar)))`, which reproduces exactly how `.media` sizes itself
(`height: 100%; width: auto; max-width: 100%`), so the stage is always the rendered width of the
media. `--stage-ar` carries the active post's aspect ratio, falling back to `9 / 16` for carousels,
whose media is an audio track. At phone size the viewport cap wins and the stage *is* the viewport,
so nothing moves; in a desktop window the chrome tracks the centered media column instead of
stranding itself against the window edges. The stage tracks width only: chrome stays pinned to the
bottom of the viewport, as it is in the app this imitates.

**Post tiles** are a hard `9 / 16` aspect ratio, gapped by `2px` (`--tile-gap`) — nearly touching,
so the grid reads as contact sheet rather than as cards.

**Rhythm.** Spacing runs on a 2px base with a strong preference for 4 / 6 / 8 / 12 / 16 / 20 / 24.
Only two of these are CSS variables (`--tile-gap: 2px`, `--rail-gap: 20px`); the rest is observed
convention held consistently across components, not a tokenized scale.

**Responsive.** One breakpoint exists in the entire system: `max-width: 520px`, which tightens the
action rail (`20px` → `10px` right offset, `18px` → `15px` gap) and the caption (`16px` → `12px`
left, `84px` → `68px` right). Everything else adapts fluidly. The library needs no breakpoint
because `auto-fill` handles it; the feed needs none because the stage is content-driven — it is
derived from the media's own aspect ratio rather than from a device size.

### Named Rules

**The Viewport-Unit Rule.** Full-height surfaces use `dvh`, never `vh`. The phone-on-the-LAN scene
is a first-class target and collapsing browser chrome would otherwise break scroll-snap alignment.

**The Stage Rule.** Anything that annotates a post positions against `--stage-w`, never against the
viewport. If a control describes the media, it belongs on the media; only window chrome (the
metadata drawer) is allowed to hang off the window edge.

## Elevation & Depth

Flat by default; blur is the depth signal.

Surfaces do not cast shadows. Depth in the document surfaces comes entirely from the tonal ladder
(`#000` → `#121212` → `#1c1c1c` → `#262626`) plus 12%-white hairlines — an archive card at rest is
a flat rectangle, and its hover state raises it by exactly `1px` of translate and one tonal step,
not by a shadow.

Where the interface sits on top of media, `backdrop-filter: blur()` does the work a shadow would do
elsewhere. The blur radius scales with the weight of the layer: `4px` for tile corner chips and the
carousel counter, `6px` for feed chrome buttons and the scrub bubble, `12px` for the metadata
drawer. The blurred layer is what separates chrome from content; it also keeps overlay controls
legible over an unpredictable frame without dimming the frame itself.

Shadows exist in only three roles, all of them legibility over media rather than elevation:
a text shadow on anything sitting on video, a drop-shadow on the action rail and play badge, and a
small cast shadow on the scrubber knob so it stays visible against a bright frame. One inset ring
(`inset 0 0 0 1px rgb(255 255 255 / 0.08)`) gives the generated avatar an edge.

### Shadow Vocabulary

- **Text shadow** (`0 1px 3px rgb(0 0 0 / 0.6)`, `--shadow-text`): Any text rendered over media.
- **Rail drop-shadow** (`drop-shadow(0 1px 3px rgb(0 0 0 / 0.5))`): The action rail's glyphs and
  counts, which have no background of their own.
- **Play badge** (`drop-shadow(0 2px 8px rgb(0 0 0 / 0.5))`): The transient paused indicator.
- **Knob** (`0 1px 4px rgb(0 0 0 / 0.4)`): The scrubber handle, visible only while dragging.
- **Scrim** (`linear-gradient(transparent, rgb(0 0 0 / 0.55))`, `--scrim`): Not a shadow but the
  same job — a gradient under the caption and a top gradient under the feed chrome, because a
  bright video would otherwise swallow both.

### Named Rules

**The Blur-Not-Shadow Rule.** A layer over media separates itself with `backdrop-filter` and a
scrim. A layer in a document surface separates itself with one tonal step and a hairline. Neither
gets a drop shadow to imply elevation; shadows are only ever spent on legibility.

**The Gradient-Not-Flat Rule.** Scrims are gradients, never flat translucent fills. A flat scrim
strong enough to protect the caption would also visibly veil the media it sits on.

## Shapes

Form language splits cleanly by function: **anything interactive is a pill or a circle; anything
that contains is gently rounded.**

- **Pills** (`999px`): search input, filter selects, author chips, hashtag tags, badges, the
  carousel counter, tile corner chips, the empty-state action, the inferred-date marker. Every
  control the user can operate in the document surfaces is fully rounded.
- **Circles** (`50%`): the back button (34px), feed chrome buttons (36px), the drawer close (28px),
  generated avatars, the spinning music disc (44px), the scrubber knob (12px), and the live dot
  (6px).
- **Containers** (`8px` / `12px`): popovers, command blocks, and the scrub bubble at `8px`
  (`--radius`); archive cards at `12px` (`--radius-lg`), the only element in the *document* surfaces
  that gets the larger radius.
- **The sheet** (`16px`, top corners only): the long-press menu, and nothing else. It is the one
  surface that arrives from the bottom edge and has to read as a sheet lifted over the post rather
  than a card sitting on it, which is what the extra four pixels buy. Anything else reaching for
  `16px` is drift.
- **Square, deliberately**: post tiles are hard-cornered `9 / 16` rectangles. Rounding them would
  break the contact-sheet density that the `2px` gutter exists to create.
- **Borders** are always a single hairline of white at 12% or 24%. There are no solid or colored
  borders except the selected-state Signal Rose border on a chip or tag.

### Named Rules

**The Pill-or-Square Rule.** A control is a pill or a circle. Content is square or gently rounded.
There is no `4px`-radius middle ground in this system, and introducing one reads immediately as
foreign.

## Components

### Buttons

- **Shape:** Fully rounded pill (`999px`) in documents; perfect circle (`50%`) for icon-only
  controls.
- **Pill control:** `--surface` ground, `--text-2` label, 12% hairline, `8px 12px` padding.
  Hover steps the ground to `--surface-2`; the active/on state additionally strengthens the border
  to 24% and lifts the label to full white.
- **Circular chrome button:** `36px`, `rgb(0 0 0 / 0.35)` with a `6px` backdrop blur over media,
  deepening to `0.6` on hover. Its "on" state inverts completely — a 90%-white ground with black
  glyph — because over arbitrary video, inversion is the only reliably visible state change.
- **Transitions:** `120ms` (`--dur-fast`) on background and border-color, `--ease`
  (`cubic-bezier(0.22, 0.61, 0.36, 1)`). Never transition layout properties.
- **Focus:** Inherited from the global rule — `2px solid` Signal Rose at `2px` offset. Never
  removed, never restyled per component.

### Chips

- **Style:** Pill with a 12% hairline on `--surface`, avatar or count inline, asymmetric padding
  (`5px 12px 5px 6px`) so the leading avatar sits tight while the label breathes.
- **Selected:** Border becomes Signal Rose, ground becomes a 12% Signal Rose tint. Text goes full
  white. The hashtag variant behaves identically at a smaller size; the active-filter tag uses a
  14% tint with a `×` affordance in `--text-3`.
- **Overflow:** The author chip row scrolls horizontally with the scrollbar hidden — it is a
  browsable strip, not a wrapping field.

### Cards / Containers

- **Corner style:** `12px` (`--radius-lg`) — archive cards only.
- **Background:** `--surface`, stepping to `--surface-2` on hover.
- **Border:** 12% hairline, strengthening to 24% on hover.
- **Shadow strategy:** None. See Elevation — a `translateY(-1px)` and a tonal step carry the lift.
- **Internal padding:** `12px`, with a `92px 1fr` grid and a `14px` gutter.
- **Cover art:** `9 / 16` at `8px` radius; when absent, a `150deg` gradient from `--surface-3` to
  `--surface` with a single letter glyph in `--text-4`.

### Inputs / Fields

- **Style:** Pill, `--surface` ground, 12% hairline, `13.5px` type, leading search glyph in
  `--text-4` at `11px` from the left with `34px` of compensating padding.
- **Focus:** Border strengthens to 24% and the native outline is suppressed *on the input only* —
  it is a text field with a visible border already carrying the state. Every other focusable
  element keeps the global Signal Rose ring.
- **Placeholder:** `--text-4`.

### Navigation

- **Tabs:** Text-only, `14px`/500, `--text-3` at rest, `--text-2` on hover, full white when active,
  sitting on a 12% bottom hairline. The active tab draws a `2px` Signal Rose underline inset
  `16px` from each edge, overlapping the hairline by `1px` so the two read as one line.
- **Back:** A `34px` circle with a `-8px` left margin so the glyph optically aligns with the
  content edge rather than the box edge.

### Post Tile (signature)

Hard-cornered `9 / 16` cell on `--surface-2`, gapped `2px` from its neighbors. The cover scales to
`1.03` over `320ms` on hover. A 44%-tall bottom gradient protects the view count and duration; a
blurred pill in the top-left carries the author and one in the top-right the post kind, both
`rgb(0 0 0 / 0.45)` with a `4px` blur. Amber corner chips drop to the second row so they never
collide with the kind chip. Highlighted state is a `2px` inset Signal Rose ring drawn on a
pseudo-element, so it never affects layout.

**The Hover Preview.** A pointer that rests on a tile for `300ms` starts the post playing inside
it — silently, looping the first six seconds, scaling with the cover — and moving away ends it. It
is the most expressive motion in the product, and everything about how it is armed exists to keep
it from becoming the loudest: nothing loads while a pointer is merely crossing the grid, one post
plays at a time, and the element is destroyed rather than hidden on the way out, so no archive is
ever being read by a tile nobody is looking at. A carousel has no video to play, so it steps
through its images at `1100ms` instead.

Two things it is not. It is never a source of information: the cover, the counts, the duration and
the kind chip all stay exactly where they were underneath it, because this arrives only for
`(hover: hover) and (pointer: fine)` — half of this product is a touch screen, and a tile that only
makes sense once it moves would be a tile that never makes sense there. And it is never audible: a
grid that makes noise because a pointer crossed it is not a setting anybody chose, so the element
is muted independently of the player's own mute state. Under `prefers-reduced-motion: reduce` there
is no preview at all, which is the honest answer — there is no shorter version of a video to offer.

### Action Rail (signature)

A vertical stack at `--rail-gap` from the right edge, `0.88` opacity, white, with a drop-shadow
standing in for a background. Avatar, then counts, then the spinning `44px` music disc (`6s` linear,
paused with playback, disabled under reduced motion).

**The Readout Rule.** The rail is a readout, not a control strip. Its items have `cursor: default`,
no hover state, no focus state, and no press state, because nothing in an archive can be liked or
commented on — and they sit one step down the text ramp, at `72%`, so the column reads as captured
data rather than as buttons nobody can press. The one exception is the author's avatar, which is
genuinely interactive: it opens everything that author left in this archive. Anything a viewer can
*do* with a post — copy its address, open it at the source — is a labelled row in the long-press
sheet, where an action can be read before it is chosen, instead of a lone glyph in a column of
things that only report.

### First-Run Hint

One line, once, in a blurred pill at the top centre of the stage: the gestures the feed cannot
otherwise reveal. It is `pointer-events: none`, so the first tap both pauses the post and retires
the hint — using a gesture is better proof of having read it than dismissing a box would be. Which
half of the copy shows is chosen by `(hover: hover) and (pointer: fine)`, not by width: what is
true depends on what the visitor is holding.

### Shortcut Sheet

The `?` key opens the drawer chrome with a two-column `<dl>` of keys and gestures, grouped under
label-role eyebrows. Keys are `<kbd>` chips: mono at `12px`, `--surface-2` ground, 12% hairline,
`8px` radius — content, so gently rounded rather than pill-shaped.

### Scrubber (signature)

A `26px` finger-sized hit area containing a bar that is always `6px` tall and scaled to `0.5` at
rest, expanding to `1` on hover or drag. The knob is a *sibling* of the bar, not a child, so the
bar's vertical scale cannot squash it. Nothing here animates `height` — the bar sits directly
beneath playing video, and a layout-triggering transition in that position is the worst possible
place for one.

### Carousel Segments (signature)

Story-style segments at `2.5px` tall with a `3px` gap, filled left-to-right by a transform on a
`will-change: transform` element driven from the audio element's clock. Segments whose images the
archive never got are filled with `135deg` amber hatching at 50% — hatching reads as *absent*,
where an empty segment would read as merely *unplayed*.

### Empty States

Left-aligned (`justify-items: start`), never centered, in a `640px` column: a `22px`/600 title,
`--text-3` body at `1.55` leading, and a monospace command block on `--surface` with a 12% hairline
at `8px` radius. Every empty state ends in a command the user can actually run.

## Do's and Don'ts

### Do:

- **Do** spend Signal Rose only on state — active, selected, focused, live. If the use is
  decorative or structural, use a tonal step or a text-opacity step instead.
- **Do** reach for `backdrop-filter` blur and a gradient scrim when a layer sits over media, and
  for one tonal step plus a 12% hairline when it sits in a document surface.
- **Do** make every interactive control a pill or a circle, and give it a hit target that works
  under a thumb — `26px` for the scrubber, `34–36px` for icon buttons.
- **Do** set `font-variant-numeric: tabular-nums` on any number that changes in place.
- **Do** use `dvh` for any full-height surface, and `overscroll-behavior-y: contain` on any
  scroller that shouldn't chain to the page behind it.
- **Do** render missing data as an em dash (`—`) and mark inferred data with the small translucent
  pill, at the same visual weight as any other metadata. Absence is information here.
- **Do** transition only compositor-friendly properties (`transform`, `opacity`, `background`,
  `border-color`, `color`) at `120ms`/`180ms`/`320ms` with `--ease`.
- **Do** draw new glyphs from scratch as inline SVG on a `0 0 24 24` grid with `fill="currentColor"`
  and `aria-hidden`, as generic shapes rather than any company's mark.

### Don't:

- **Don't** introduce a webfont, a remote image, an icon font, or a sprite sheet. The build fails
  on it, and correctly so.
- **Don't** soften the ground from `#000` to a near-black. Letterboxed media needs true black to
  sit in, and the whole tonal ladder is calibrated from it.
- **Don't** invent a fifth text opacity or a mixed gray. The ramp is 100 / 72 / 50 / 32, and that
  is the whole vocabulary.
- **Don't** hard-code accent tints as raw `rgb(254 44 85 / …)` or `rgb(37 244 238 / …)` literals in
  new code. Four such literals already exist and are the system's only token drift; add a tint
  token rather than a fifth.
- **Don't** give a surface a drop shadow to imply elevation. Shadows are spent on legibility over
  media, never on depth.
- **Don't** round a post tile or widen the `2px` tile gutter. The contact-sheet density is the
  point of that grid.
- **Don't** add a hover, focus, cursor, or press state to a count in the action rail. It is a
  readout; making it look pressable is a lie about a read-only archive.
- **Don't** let a hover reveal something that is only ever said on hover. Everything a tile has to
  say is on it at rest; the preview adds motion to what is already there and nothing else.
- **Don't** use Missing-Frame Amber for an error, a destructive warning, or a validation state.
  It means the archive is incomplete and nothing else.
- **Don't** animate `height`, `width`, `top`, or `left`, particularly anywhere near a playing
  video. Use `transform` and `scale`.
- **Don't** uppercase text outside the 11px/`0.06em` label role.

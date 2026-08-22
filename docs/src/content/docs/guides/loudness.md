---
title: Evening out the volume
description: EBU R128 gains from ttdl, applied through element volume or a WebAudio graph depending on what the browser honours.
---

TikTok mixes wildly — a whispered voiceover sits next to something compressed into a wall — so
watching an archive in order means riding the volume knob. ttdl measures every post to
[EBU R128](https://tech.ebu.ch/publications/r128) and writes the numbers into the archive's
`.ttdl/loudness.json`, without re-encoding anything. The viewer reads that file and plays each post at
the level it asks for.

## There is nothing to configure

The sidecar is inside an archive that is being scanned anyway:

```bash
ttdl.py loudness @username   # once, in ttdl — offline, no rate limit, minutes for a few thousand
bun run start                # the levels are simply even
```

Running it against an archive the viewer already has open needs no restart: `loudness.json` is in
the change probe, and `ttdl.py loudness` on a finished archive rewrites nothing else at all.

## Two ways to apply it, and the browser picks

`element.volume` costs nothing and expresses attenuation exactly. It cannot amplify — the property
stops at 1 — and **on iOS it does not work at all**: WebKit treats playback volume as the user's
hardware business, ignores what it is told, and reports 1 whatever was written.

That is not a footnote. This shipped applying attenuation through `volume` and amplification
through a WebAudio gain node, which on a desktop is exactly right and on an iPhone does half the
job: every quiet post lifted, not one loud post lowered. The archive came out louder than it
started and just as uneven — which is the opposite of the point.

So the graph carries whatever `volume` cannot: always amplification, and attenuation too wherever
`volume` is ignored. Which kind of browser this is gets asked of a real element rather than guessed
from a user agent — set `volume` to 0.5, read it back, believe the answer.

### What the measurements say

The graph is worth its cost only because of what the measurements say. Over four archives here —
98 posts measured whole, 30 sampled from each of the others:

| archive | integrated | true peak | gain | asks to be quieter | asks to be louder |
|---|---|---|---|---|---|
| lowtide (98 posts) | −22.2 LUFS | −6.9 dBTP | **+5.6** | 19 | 73 |
| quietharbor (30 sampled) | −18.7 | −5.9 | **+4.4** | 4 | 26 |
| mossbank (30 sampled) | −14.3 | −3.8 | +0.3 | 13 | 16 |
| TikTok Saved (30 sampled) | −15.7 | −1.1 | +0.2 | 10 | 15 |

Medians, against a −14 LUFS target. The median post asks to be made *louder*, the true-peak cap
ttdl applies barely bites because these files are mastered with headroom, and every archive holds
posts asking for more than +18 dB.

### The rules the graph runs under

Routing an element is a one-way door — it accepts a `MediaElementAudioSourceNode` once, never gives
it back, and from then on its sound reaches the speakers only through the graph — so it is done
under rules that keep it from costing anything:

- **Nothing is routed until a gesture.** The context is created by the first touch on the feed (or
  the speaker button, for a keyboard), because a context created inside a gesture may start running
  and one created at any other moment starts suspended. Until then a post is corrected as far as
  `volume` allows, and the rest arrives when the context wakes.
- **Nothing is routed into a suspended context**, since an element routed into one is not
  corrected, it is silent.
- **The nodes are disconnected when the slide goes**, because a connected node is reachable from the
  context and would hold every `<video>` the feed had swiped past.
- **Only the post being watched is audible, and it is the node that says so** rather than
  `element.muted`. `muted` and `volume` are properties of a playing element, and a routed element is
  not one — whether either still applies on the way into the graph is a question engines answer
  differently. The feed meanwhile starts its neighbours deliberately, muted, to win them the right
  to play later; a mute that does not reach the graph makes the whole ±2 window audible at once.
- **One limiter sits between every element and the speakers.** The graph sums its sources into a
  buffer that hard-clips at ±1, where before each element reached the platform mixer on its own. Two
  posts an inch below the ceiling add up to well above it, which is audible as clipping on a swipe —
  and was. With the gating above it should rarely engage; it stays for what gating cannot cover,
  such as a file mastered above full scale in the first place, of which this archive holds a few
  (true peaks up to +4.8 dBTP).

### Where the target lives

The target belongs to ttdl, not here: `ttdl.py loudness @user --target -16` recomputes every gain
from the stored measurements without running ffmpeg again, and the viewer picks the new numbers up
on its next scan. A whole archive that plays too loud is that knob, not this one.

**Amplification stops at +12 dB.** ttdl caps its gain by the true peak and deliberately goes no
further: a maximum boost, it says, is the consumer's policy rather than an archive's. This is the
consumer. A post measured at −41 LUFS asks for +26 dB, and 26 dB below target on a phone recording
is mostly the noise floor. Attenuation is not capped — it cannot clip, and it cannot amplify a noise
floor.

## Reading what happened

`?debug=1` prints the element's own volume and the correction beside it, which have to be read
together: a routed element plays flat and its whole level lives in the node, while an unrouted one
carries what it can in `volume`.

| `gain=` | meaning |
|---|---|
| `-5.1` / `12.0` | the correction is on the post, through the node or through `volume` |
| `wait` | it needs the graph, and no gesture has created the context yet |
| `off` | it needs the graph, and `?boost=0` forbade one |
| `deaf` | `volume` is ignored here and the graph is forbidden — nothing is applied |
| `0.0` | the post asked for nothing |

`?boost=0` turns the graph off on a device that turns out to need it off, without a deploy;
`?boost=1` turns it back on. It shipped as the way to answer whether iOS could have the graph at
all — the received wisdom being that a routed element obeys the ringer switch. It does not: on an
iPhone, at a post reading `gain=12.0`, flipping the switch to silent changed nothing. That wisdom
describes a context playing on its own, and this one is fed by a `<video>` that is already playing,
so the session is the element's.

A post ttdl has not measured — an archive the command was never run over, a post with no
soundtrack, a download that was cut short — plays exactly as it did before any of this existed.

---
title: Evening out the volume
description: EBU R128 gains from ttdl, applied through element volume or a WebAudio graph depending on what the browser honours.
---

TikTok mixes wildly — a whispered voiceover sits next to something mastered ten decibels louder —
so watching an archive in order means riding the volume knob. ttdl measures every post to
[EBU R128](https://tech.ebu.ch/publications/r128) and writes the numbers into the archive's
`.ttdl/loudness.json`, without re-encoding anything. The viewer reads that file and plays each post at
the level it asks for.

## Recording the gains

The sidecar is inside an archive that is being scanned anyway:

```bash
ttdl.py loudness @username   # once, in ttdl — offline, no rate limit, minutes for a few thousand
bun run start                # the levels are simply even
```

Running it against an archive the viewer already has open needs no restart: `loudness.json` is in
the change probe, and `ttdl.py loudness` on a finished archive rewrites nothing else at all.

## Turning it off

*Normalize* is a switch in the long-press sheet, on by default and remembered per device. Off means
every post plays at whatever it was mastered at: the correction becomes 0, a correction of 0 needs no
gain node, so no element is routed and no `AudioContext` is created at all.

Turned off partway through a session, the corrections already in the graph ramp to unity rather than
being torn out. A node at unity and an element that was never routed play the same post at the same
level, and routing cannot be undone in any case.

`?normalize=0` turns the correction off for one page load and `?normalize=1` turns it on. Neither is
written back, so a link changes what somebody hears while they are on it and not what they have set;
touching the switch clears the override.

The row appears only where a correction can reach the speakers by one route or the other. The iOS
family has neither — the graph is banned there and `volume` is ignored — so the switch would have no
position that changes a post, and the sheet leaves it out. The flags are still read there, and still
move the `gain=` readout below.

## Two ways to apply it, and the browser picks

`element.volume` costs nothing and expresses attenuation exactly. It cannot amplify — the property
stops at 1 — and **on iOS it does not work at all**: WebKit treats playback volume as the user's
hardware business, ignores what it is told, and reports 1 whatever was written.

This shipped applying attenuation through `volume` and amplification through a WebAudio gain node,
which on a desktop is exactly right and on an iPhone does half the job: every quiet post lifted, not
one loud post lowered. The archive came out louder than it started and just as uneven.

So the graph carries whatever `volume` cannot: always amplification, and attenuation too wherever
`volume` is ignored. Which kind of browser this is gets asked of a real element rather than guessed
from a user agent — set `volume` to 0.5, read it back, believe the answer.

Except on the iOS family, which gets no graph at all, and where no flag brings one back. WebKit's
media pipeline does not change the playback rate of a routed element: with the graph on, the
press-and-hold speed-up and the rate menu both stopped working on an iPhone — the video held its
pace and jumped as it re-synced, while the pitch crept up by less than the chosen rate. Routing
cannot be undone for the length of a hold, so the graph and a working rate cannot coexist there,
and the graph is the one given up. Posts on iOS play uncorrected, exactly as they did before the
correction existed.

The ban is by user agent, after a probe-based version of it leaked: recognising iOS by whether
`volume` reads back what was written assumes a getter that reports 1, and a getter that stores the
value while the sound ignores it lifts the ban on exactly the platform it exists for. Every post
asking to be made louder was then routed — in a measured archive, the median post.

### What the measurements say

The graph earns its cost on these numbers. Over four archives here — 98 posts measured whole, 30
sampled from each of the others:

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

Routing an element cannot be undone — it accepts a `MediaElementAudioSourceNode` once, never gives
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
  posts just below the ceiling add up to well above it, which is audible as clipping on a swipe,
  and was. With the gating above it should rarely engage; it stays for what gating cannot cover,
  such as a file mastered above full scale in the first place, of which this archive holds a few
  (true peaks up to +4.8 dBTP).

### Where the target lives

The target belongs to ttdl, not here: `ttdl.py loudness @user --target -16` recomputes every gain
from the stored measurements without running ffmpeg again, and the viewer picks the new numbers up
on its next scan. An archive that plays too loud as a whole is corrected there, not here.

**Amplification stops at +12 dB.** ttdl caps its gain by the true peak and goes no further, treating
a maximum boost as the consumer's policy rather than the archive's; the viewer is the consumer. A
post measured at −41 LUFS asks for +26 dB, and 26 dB below target on a phone recording is mostly the
noise floor. Attenuation is not capped — it cannot clip, and it cannot amplify a noise
floor.

## Reading what happened

`?debug=1` prints the element's own volume and the correction beside it, which have to be read
together: a routed element plays flat and its whole level lives in the node, while an unrouted one
carries what it can in `volume`.

| `gain=` | meaning |
|---|---|
| `-5.1` / `12.0` | the correction is on the post, through the node or through `volume` |
| `flat` | *Normalize* is off — the post plays as it was mastered |
| `wait` | it needs the graph, and no gesture has created the context yet |
| `off` | it needs the graph, and `?boost=0` forbade one |
| `deaf` | `volume` is ignored here and there is no graph — nothing is applied |
| `0.0` | the post asked for nothing |

`flat` is decided before any of the others, because a switched-off post has a correction of 0 and
needs no graph for it: asked in any other order it would print `0.0`, which is the reading for a post
ttdl found nothing to fix.

`?boost=0` turns the graph off anywhere, without a deploy. It is not an alias of `?normalize=0`: it
forbids the graph and leaves `volume` correcting whatever it still can, which on a browser that
honours the property is every loud post still pulled down. On the iOS family, where there is no
graph to forbid and `volume` is ignored, it changes nothing. `?boost=1` forces it on only past the
volume-probe rule on other platforms — on the iOS family it does nothing, because an address bar
remembers old URLs and a remembered flag kept resurrecting the graph there. Re-testing a future
WebKit means editing `graphPermitted`, not finding a flag. The flag has answered one question
already: whether a routed element obeys the ringer switch, as the received wisdom said it would.
It does not — on an iPhone, at a post reading `gain=12.0`, flipping the switch to silent changed
nothing, because the session belongs to the `<video>` that is already playing rather than to the
context.

A post ttdl has not measured — an archive the command was never run over, a post with no
soundtrack, a download that was cut short — plays exactly as it did before any of this existed.

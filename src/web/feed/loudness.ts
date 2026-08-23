/**
 * Even out the volume between posts, from what ttdl measured.
 *
 * TikTok mixes wildly, so an archive played back in order is a volume knob you keep reaching for.
 * `ttdl.py loudness` measures every post to EBU R128 and records the decibels it would take to
 * bring each one to a common target; nothing is re-encoded, so applying it is the player's job or
 * nobody's.
 *
 * There are two ways to apply it, and which one is available is a property of the browser rather
 * than of the correction.
 *
 * **`element.volume`** costs nothing and expresses attenuation exactly. It cannot amplify —
 * the property stops at 1 — and on iOS it does not work at all: WebKit treats playback volume as
 * the user's hardware business, ignores what it is told, and reports 1 whatever was written.
 * That is not a footnote. It is the difference between a correction that works and one that
 * quietly does half its job: with only `volume`, an iPhone gets every quiet post lifted and not
 * one loud post lowered, which leaves the archive louder than it started and just as uneven.
 *
 * **A WebAudio gain node** expresses both directions and works everywhere, but routing an element
 * is a one-way door: it accepts a `MediaElementAudioSourceNode` once, never gives it back, and
 * from that moment its sound reaches the speakers only through the graph — which is silent for as
 * long as the `AudioContext` is suspended.
 *
 * So the graph is used where it is needed and not where it is not: always for amplification,
 * which `volume` cannot do; for attenuation only where `volume` is ignored. Which of those a
 * browser is, is asked of a real element (see `honoursVolume`) rather than guessed from a user
 * agent string. The iOS family is the exception and gets no graph at all — routing there costs
 * the playback rate, which `graphPermitted` explains.
 *
 * All of it can be turned off, and off is genuinely off: `correctionFor` returns 0, which makes
 * `needsGraph` false for every post, which means no element is routed and no `AudioContext` is
 * ever created. Turned off partway through, the corrections already in the graph ramp to unity
 * instead — the routing is a one-way door and does not need opening again, because a node at
 * unity and an element that was never routed play the same post at the same level.
 *
 * The measurements are why any of this is worth the trouble. Over four archives here — 98 posts
 * measured whole, 30 sampled from each of the others — the median post asks to be made *louder*:
 * +5.6 dB on one account, +4.4 on another, around 0 on the two balanced ones, and every archive
 * holds posts asking for more than +18. The true-peak cap ttdl applies barely bites, because
 * these files are mastered with headroom (median true peak −4 to −7 dBTP).
 */

import type { Post } from "../../shared/types.ts";

/**
 * The most this will amplify, whatever ttdl worked out.
 *
 * ttdl caps its gain by the true peak and deliberately stops there — a maximum boost, it says, is
 * the consumer's policy rather than an archive's. This is the consumer. A post measured at −41
 * LUFS asks for +26 dB, and what is 26 dB below the target on a phone recording is mostly the
 * noise floor: amplifying it produces a loud hiss with a voice somewhere inside it, which is not
 * the post played correctly. 12 dB covers every archive's median with room to spare and leaves
 * the tail where it is.
 */
export const MAX_BOOST_DB = 12;

/**
 * Seconds for a gain change to settle. Long enough that no change is a click, short enough that
 * nobody hears the level being reached.
 */
const RAMP = 0.02;

/** Amplitude multiplier for a level in decibels. */
function amplitude(db: number): number {
	return 10 ** (db / 20);
}

/**
 * The decibels this post should be shifted by. 0 for a post nothing measured.
 *
 * Only the amplification is capped. Attenuation cannot clip and cannot amplify a noise floor, so
 * there is nothing to protect against on the way down.
 *
 * `normalize` is the viewer's switch, and it is answered here rather than at the call sites so
 * that everything downstream — whether a graph is needed, whether a context is worth creating —
 * follows from the one number. Off means every post plays at whatever it was mastered at, which
 * is the same answer an unmeasured post gets and is reached by the same route.
 */
export function correctionFor(post: Post, normalize: boolean): number {
	if (!normalize) {
		return 0;
	}
	const gain = post.loudnessGain;
	// Null is an unmeasured post — an archive ttdl has not run `loudness` over, a post with no
	// sound, a download that was cut short. All of them mean the same thing here.
	if (gain === null) {
		return 0;
	}
	return gain > 0 ? Math.min(gain, MAX_BOOST_DB) : gain;
}

/** What an element plays at when it has no graph: the viewer's volume, minus any attenuation. */
export function elementVolume(correction: number, volume: number): number {
	return volume * amplitude(Math.min(correction, 0));
}

/**
 * What the gain node carries when there is one: the whole correction, the viewer's volume, and
 * whether this element should be heard at all.
 *
 * The last of those is not something the element can be trusted with. `muted` and `volume` are
 * properties of a *playing element*, and a routed element is not one — its samples are taken
 * into the graph, and whether the two flags still apply on the way in is a question every engine
 * answers differently and iOS answers unhelpfully. The feed meanwhile starts its neighbours
 * deliberately, muted, to win them the right to play later; if that mute does not reach the graph,
 * the whole ±2 window is audible at once. Silence is therefore expressed where the level is.
 */
export function nodeGain(correction: number, volume: number, audible = true): number {
	return audible ? volume * amplitude(correction) : 0;
}

/**
 * Whether the graph may be built at all.
 *
 * The iOS family never gets one, and nothing overrides that. WebKit's media pipeline does not
 * change the playback rate of a routed element: with the graph on, on an iPhone, the
 * press-and-hold speed-up and the rate menu stop working — the video holds its pace and jumps as
 * it re-syncs, while the pitch drifts up. Routing is a one-way door, so an element cannot be let
 * out of the graph for the length of a hold; the only rate the graph leaves working is 1, and the
 * rate is a feature. Unrouted is how iOS played before the graph existed, so the ban costs it the
 * correction and nothing else.
 *
 * The ban is the platform's, by user agent, after two subtler versions of it leaked in the field.
 * Recognising iOS by the `honoursVolume` probe assumed a getter that reports 1 whatever was
 * written; a getter that stores the value while the sound ignores it answers "volume works" and
 * lifts the ban on exactly the platform it exists for. And `?boost=1` used to force the graph on
 * anywhere — the very flag the first iPhone test was run with, which an address bar remembers and
 * offers back. Either leak routed every post asking to be made louder, which in a measured
 * archive is the median post. Re-testing a future WebKit now means editing this function, not
 * finding a flag.
 *
 * `?boost=0` still forbids the graph on any platform. Elsewhere `?boost=1` still forces it past
 * the volume-probe rule, which is a rule about expressiveness rather than about this bug.
 *
 * Pure, and takes what it reads: the decision has to be checkable without a browser to run it in.
 */
export function graphPermitted(search: string, volumeWorks: boolean, appleTouch: boolean): boolean {
	if (appleTouch) {
		return false;
	}
	const flag = new URLSearchParams(search).get("boost");
	if (flag === "0") {
		return false;
	}
	if (flag === "1") {
		return true;
	}
	return volumeWorks;
}

/**
 * iOS and iPadOS, where every browser is WebKit over the same media pipeline. Detected by user
 * agent because the failure this gates is not observable up front — the only feature test is
 * routing an element and watching the rate break, which is the very thing being avoided. The
 * `maxTouchPoints` clause is for iPadOS, which reports itself as a Mac. Twin of NEEDS_SOUND_SWAP
 * in FeedScreen, kept separate so this module still loads where `navigator` does not exist.
 */
function appleTouch(): boolean {
	return (
		/iP(hone|ad|od)/.test(navigator.platform) ||
		(navigator.userAgent.includes("Mac") && navigator.maxTouchPoints > 1)
	);
}

/**
 * What `?normalize=` says about this page load, or null if it says nothing.
 *
 * Two flags rather than one, because they turn off different things. `?boost=0` forbids the
 * *graph* and leaves `volume` doing whatever it can, which on a browser that honours it is still
 * every loud post pulled down — it is a hatch for a device the graph misbehaves on, and it is
 * documented as one. This forbids the *correction*, which is the thing a viewer means.
 *
 * On the iOS family the difference is moot in the speakers and not on the screen: there is no
 * graph to forbid and `volume` is ignored, so no correction lands either way and what this
 * changes is the reading — `flat`, a post played as mastered, rather than the `deaf`/`off` pair,
 * which is a correction that was asked for and went nowhere. The sheet draws no switch there, for
 * that reason (see `correctionReaches`); the flag is still read, because it costs nothing and the
 * reading is what a bug report carries.
 *
 * An override for one page load and nothing more: it is read into the store and never written
 * back, so a link somebody was sent cannot permanently change a setting on their machine. The
 * switch in the sheet clears it — see `setNormalize`.
 *
 * Pure, and takes what it reads, for the same reason `graphPermitted` is.
 */
export function normalizeOverride(search: string): boolean | null {
	const asked = new URLSearchParams(search).get("normalize");
	if (asked === "0") {
		return false;
	}
	if (asked === "1") {
		return true;
	}
	return null;
}

/**
 * The same answer, asked of this page once and then kept.
 *
 * Not at import: a module that reads the URL merely because it was loaded cannot be loaded
 * anywhere else, and there is nothing to decide until a post actually needs correcting. That
 * first question comes from a slide's effect, which runs before the feed rewrites its own URL
 * from the filter — so the flag is still there to read.
 */
let allowed: boolean | null = null;

export function graphAllowed(element?: HTMLMediaElement): boolean {
	if (allowed === null) {
		allowed = graphPermitted(window.location.search, honoursVolume(element), appleTouch());
	}
	return allowed;
}

/**
 * Whether writing to `element.volume` does anything on this browser, asked rather than assumed.
 *
 * The probe has a limit it cannot see past: it reads the property back, and a getter that stores
 * the value while the sound ignores it answers yes to a volume that does nothing. That is why the
 * iOS ban above stopped relying on it. Here it decides only how a correction is expressed on the
 * platforms that get one, where the answer has held up.
 */
let honoured: boolean | null = null;

function honoursVolume(element?: HTMLMediaElement): boolean {
	if (honoured === null) {
		// Whatever element is at hand, or a detached one when the question arrives before any
		// slide has mounted — the behaviour is the platform's, not the element's.
		const probe = element ?? document.createElement("audio");
		const before = probe.volume;
		probe.volume = 0.5;
		honoured = probe.volume !== 1;
		probe.volume = before;
	}
	return honoured;
}

/**
 * Whether a correction can reach the speakers by either route.
 *
 * The sheet asks, so that the switch is offered only where it does something: a control whose
 * position a platform has already decided is worse than no control. On the iOS family both routes
 * are closed — the graph is banned, `volume` is ignored — so a post plays as it was mastered
 * whichever way the switch is set.
 *
 * iOS is named here rather than left to the two flags, because one of them cannot see it: a
 * `volume` getter that stores what the sound ignores answers "volume works", which is the blind
 * spot `graphPermitted` stopped relying on. Said once more, in the one other place it decides
 * something.
 *
 * Pure, and takes what it reads, for the same reason `graphPermitted` is.
 */
export function correctionReaches(
	graph: boolean,
	volumeWorks: boolean,
	appleTouch: boolean,
): boolean {
	if (appleTouch) {
		return false;
	}
	return graph || volumeWorks;
}

/**
 * The same answer, asked of this browser.
 *
 * `graphAllowed` rather than `graphPermitted` on purpose: the flag it reads is gone from the URL
 * by the time a sheet can be opened, and the memo is what still holds it. Safe to ask from a
 * render for the same reason — a sheet is opened from a slide, and a slide has already asked
 * through `setLevel`.
 */
export function correctionPossible(): boolean {
	return correctionReaches(graphAllowed(), honoursVolume(), appleTouch());
}

/** The one context. Created only by a gesture — see `resumeAudio`. */
let ctx: AudioContext | null = null;

/**
 * One limiter, between every element and the speakers.
 *
 * Not a correction and not a substitute for one — every gain applied here is bounded by the true
 * peak ttdl measured, so no single post can reach full scale. What can is *two* of them: the
 * graph sums its sources into one buffer that hard-clips at ±1, where before each element went
 * to the platform mixer on its own and the mixing happened somewhere with headroom. A feed
 * crossing between two posts plays both for a moment, and two posts an inch below the ceiling
 * add up to well above it — which is audible as clipping on the swipe, and was.
 *
 * The gains are gated per element as well, so this should rarely engage at all. It is here for
 * the moments the gating cannot cover: a file mastered above full scale in the first place — this
 * archive holds them, true peaks up to +4.8 dBTP — clips on decode, and something has to catch it.
 */
let limiter: DynamicsCompressorNode | null = null;

function makeLimiter(live: AudioContext): DynamicsCompressorNode {
	const node = live.createDynamicsCompressor();
	// Just below full scale, with the hardest knee and ratio the node offers. It is a compressor
	// rather than a true limiter — finite ratio, a detector that never sees an inter-sample peak —
	// so it is asked to do nothing except stop a sum from wrapping, and asked as late as possible.
	node.threshold.value = -1;
	node.knee.value = 0;
	node.ratio.value = 20;
	node.attack.value = 0.003;
	node.release.value = 0.1;
	node.connect(live.destination);
	return node;
}

/**
 * The nodes an element was given, if it was given any.
 *
 * Keyed on the element and never removed while it lives: a second `createMediaElementSource` for
 * the same element throws, so this is the only record that one was already made. Weak, so a slide
 * that has swiped away takes its entry with it. The source is kept alongside the gain because it
 * has to be disconnected by name — see `releaseLevel`.
 */
const graphs = new WeakMap<
	HTMLMediaElement,
	{ source: MediaElementAudioSourceNode; gain: GainNode }
>();

/**
 * What every mounted element should be playing at.
 *
 * Strong, and emptied by `releaseLevel` on the way out. It is what lets a correction be applied
 * late: before the first gesture there is no context to route into, and without somewhere to
 * wait, a post on screen at that moment would never be corrected — its effect has already run
 * and has nothing to re-run for.
 */
const levels = new Map<
	HTMLMediaElement,
	{ correction: number; volume: number; audible: boolean; normalize: boolean }
>();

/**
 * Whether a correction needs the graph, or `volume` can carry it.
 *
 * Amplification always, since `volume` stops at 1. Attenuation only where `volume` is ignored —
 * on a browser that honours it, routing an element to do what one assignment already does would
 * be buying the graph's failure modes for nothing.
 */
export function needsGraph(correction: number, volumeWorks: boolean): boolean {
	if (correction === 0) {
		return false;
	}
	return correction > 0 || !volumeWorks;
}

function connect(element: HTMLMediaElement): void {
	const live = ctx;
	const level = levels.get(element);
	// Never route into a context that is not running: the routing cannot be undone, and an element
	// routed into a suspended graph is not corrected, it is silent. It stays in `levels` and is
	// picked up by the flush below when the context wakes.
	if (!level || live?.state !== "running" || graphs.has(element)) {
		return;
	}
	try {
		const source = live.createMediaElementSource(element);
		const gain = live.createGain();
		// Set before anything is connected, not ramped to afterwards: a node that starts at unity
		// puts the post through at full level for the length of the ramp, which on a post being
		// pulled down is exactly the moment this exists to prevent.
		gain.gain.value = nodeGain(level.correction, level.volume, level.audible);
		limiter ??= makeLimiter(live);
		source.connect(gain).connect(limiter);
		graphs.set(element, { source, gain });
	} catch {
		// Already routed, or refused outright. The element still plays — through whatever it was
		// routed into the first time — and `volume` carries whatever it can.
	}
}

/** Put the element at the level `levels` says it should be at, however that can be expressed. */
function render(element: HTMLMediaElement): void {
	const level = levels.get(element);
	if (!level) {
		return;
	}
	const nodes = graphs.get(element);
	if (nodes && ctx) {
		// The graph carries everything, so the element itself plays flat. Both must not apply the
		// same correction — that would be a post pulled down twice. With the switch off the
		// correction is 0 and this ramps to unity, which is a routed element playing the post at
		// exactly the level an unrouted one would.
		element.volume = 1;
		nodes.gain.gain.setTargetAtTime(
			nodeGain(level.correction, level.volume, level.audible),
			ctx.currentTime,
			RAMP,
		);
		element.dataset.gain = level.normalize ? level.correction.toFixed(1) : "flat";
		return;
	}
	element.volume = elementVolume(level.correction, level.volume);
	/*
	 * What the debug panel prints, and the only way to tell these apart from outside. A number
	 * means the correction is on the post — through the node above, or through `volume` here,
	 * which for a post being pulled down on a browser that honours it is the whole job. The words
	 * are the ways it is not: `flat` where the viewer turned the correction off, which is the one
	 * that is not a limitation; `wait` for a graph that has not been built yet; `off` where the
	 * flag forbade one; and `deaf` for the case that started all this — a correction written to
	 * `volume` on a browser which ignores `volume`, and therefore not applied at all.
	 *
	 * `flat` is asked first and separately, because every one of the others would otherwise answer
	 * for it: a switched-off post has a correction of 0, so it needs no graph and would print
	 * `0.0` — indistinguishable from a post that asked for nothing.
	 */
	if (!level.normalize) {
		element.dataset.gain = "flat";
	} else if (!needsGraph(level.correction, honoursVolume(element))) {
		element.dataset.gain = level.correction.toFixed(1);
	} else if (!graphAllowed(element)) {
		element.dataset.gain = honoursVolume(element) ? "off" : "deaf";
	} else {
		element.dataset.gain = "wait";
	}
}

function flush(): void {
	if (ctx?.state !== "running") {
		return;
	}
	for (const [element, level] of levels) {
		if (graphAllowed(element) && needsGraph(level.correction, honoursVolume(element))) {
			connect(element);
		}
		render(element);
	}
}

/**
 * Play this post at the level ttdl measured, scaled by the volume the viewer chose.
 *
 * Called from the slide's own volume effect, so it runs again whenever any of them changes. The
 * first call for an element may only be able to do half the job — the graph does not exist until
 * a gesture creates it — and the rest arrives at `flush`.
 *
 * `audible` is the slide saying whether this post is the one being watched, unmuted. Only that
 * one makes a sound; see `nodeGain` for why the element's own `muted` is not enough.
 *
 * `normalize` is the viewer's switch, passed in rather than read from the store here: this module
 * is the one part of the feature that can be tested without a browser, and it keeps that by
 * taking every input it acts on. It is kept on the record as well as folded into the correction,
 * because the two are the same number to the speakers and different answers to `?debug=1`.
 */
export function setLevel(
	element: HTMLMediaElement,
	post: Post,
	volume: number,
	audible: boolean,
	normalize: boolean,
): void {
	const correction = correctionFor(post, normalize);
	levels.set(element, { correction, volume, audible, normalize });
	if (graphAllowed(element) && needsGraph(correction, honoursVolume(element))) {
		connect(element);
	}
	render(element);
}

/**
 * Forget an element on its way out, and take its nodes out of the graph.
 *
 * The routing itself cannot be undone — the element keeps its source node for as long as it
 * exists — but the nodes must be disconnected, because a connected node is reachable from the
 * context and keeps everything upstream of it alive. Left in, a feed swiped through for a minute
 * would hold every `<video>` it had passed, which is the exact resource these slides go out of
 * their way to hand back. Disconnecting is safe here and nowhere else: this runs on unmount, and
 * the element is on its way to being destroyed rather than being played silently.
 */
export function releaseLevel(element: HTMLMediaElement): void {
	levels.delete(element);
	delete element.dataset.gain;
	const nodes = graphs.get(element);
	if (nodes) {
		nodes.source.disconnect();
		nodes.gain.disconnect();
	}
}

/**
 * Give the context its chance, from inside a gesture.
 *
 * This is the whole reason the graph is affordable. A context created during a real gesture is
 * allowed to start running; one created at any other moment starts suspended, and every post
 * waiting to be corrected would sit in `levels` until something else woke it.
 *
 * With the switch off there is nothing to wake, and no context is created at all — a viewer who
 * turned the correction off is not paying for an audio graph on every tap. Turning it back on is
 * itself a click, and the switch spends it here; see the sheet.
 */
export function resumeAudio(normalize: boolean): void {
	if (!normalize || !graphAllowed()) {
		return;
	}
	if (!ctx) {
		const Ctor = window.AudioContext;
		if (!Ctor) {
			return;
		}
		ctx = new Ctor();
		// The state can change without us asking — a resume that resolves late, a browser that
		// suspends a backgrounded page and lets it go again — and each of those is a chance to
		// give a waiting element the correction it is owed.
		ctx.addEventListener("statechange", flush);
	}
	if (ctx.state !== "running") {
		void ctx.resume().catch(() => undefined);
	}
	flush();
}

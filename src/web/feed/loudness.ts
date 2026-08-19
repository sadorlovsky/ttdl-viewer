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
 * agent string.
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
 */
export function correctionFor(post: Post): number {
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
 * This shipped banning iOS, on the received wisdom that a media element routed through WebAudio
 * has its sound silenced by the ringer switch where an unrouted one does not — a feed that goes
 * mute because a hardware switch was flipped being worse than a few quiet posts staying quiet.
 * The ban was written to be tested rather than believed, and the test says it is wrong: on an
 * iPhone, at a post asking for +26 dB, with the panel reading `gain=12.0`, flipping the switch to
 * silent changed nothing. The wisdom describes a context playing on its own; this one is fed by a
 * `<video>` that is already playing, so the session is the element's, and that is not the session
 * the switch silences.
 *
 * So there is no platform rule left, and the flag stays anyway: `?boost=0` turns the graph off on
 * a device that turns out to need it off, without a deploy.
 *
 * Pure, and takes what it reads: the decision has to be checkable without a browser to run it in.
 */
export function graphPermitted(search: string): boolean {
	return new URLSearchParams(search).get("boost") !== "0";
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

export function graphAllowed(): boolean {
	if (allowed === null) {
		allowed = graphPermitted(window.location.search);
	}
	return allowed;
}

/**
 * Whether writing to `element.volume` does anything on this browser, asked rather than assumed.
 *
 * iOS answers no — it reports 1 however it is set — and that is the whole reason this exists: a
 * platform sniff would have to be kept in step with whichever browsers inherit the behaviour,
 * while the property either works or does not and can simply be tried. Half a millisecond, once
 * per page, on an element that has not started playing.
 */
let honoured: boolean | null = null;

function honoursVolume(element: HTMLMediaElement): boolean {
	if (honoured === null) {
		const before = element.volume;
		element.volume = 0.5;
		honoured = element.volume !== 1;
		element.volume = before;
	}
	return honoured;
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
	{ correction: number; volume: number; audible: boolean }
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
		// same correction — that would be a post pulled down twice.
		element.volume = 1;
		nodes.gain.gain.setTargetAtTime(
			nodeGain(level.correction, level.volume, level.audible),
			ctx.currentTime,
			RAMP,
		);
		element.dataset.gain = level.correction.toFixed(1);
		return;
	}
	element.volume = elementVolume(level.correction, level.volume);
	/*
	 * What the debug panel prints, and the only way to tell these apart from outside. A number
	 * means the correction is on the post — through the node above, or through `volume` here,
	 * which for a post being pulled down on a browser that honours it is the whole job. The words
	 * are the ways it is not: `wait` for a graph that has not been built yet, `off` where the flag
	 * forbade one, and `deaf` for the case that started all this — a correction written to
	 * `volume` on a browser which ignores `volume`, and therefore not applied at all.
	 */
	if (!needsGraph(level.correction, honoursVolume(element))) {
		element.dataset.gain = level.correction.toFixed(1);
	} else if (!graphAllowed()) {
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
		if (graphAllowed() && needsGraph(level.correction, honoursVolume(element))) {
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
 */
export function setLevel(
	element: HTMLMediaElement,
	post: Post,
	volume: number,
	audible: boolean,
): void {
	const correction = correctionFor(post);
	levels.set(element, { correction, volume, audible });
	if (graphAllowed() && needsGraph(correction, honoursVolume(element))) {
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
 */
export function resumeAudio(): void {
	if (!graphAllowed()) {
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

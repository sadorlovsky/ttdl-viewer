/**
 * Even out the volume between posts, from what ttdl measured.
 *
 * TikTok mixes wildly, so an archive played back in order is a volume knob you keep reaching for.
 * `ttdl.py loudness` measures every post to EBU R128 and records the decibels it would take to
 * bring each one to a common target; nothing is re-encoded, so applying it is the player's job or
 * nobody's.
 *
 * It is applied in two quite different ways, because the two directions cost differently.
 *
 * **Down is a multiplication.** `element.volume` scales what the viewer chose, nothing else is
 * touched, and attenuation cannot clip — so there is nothing to limit, no `DynamicsCompressor`
 * smearing transients to pay for a rescue that was never needed.
 *
 * **Up is a graph.** `volume` is capped at 1, so the only way to make a post louder is to route
 * the element through WebAudio, and that is a real cost: routing an element is a one-way door (it
 * accepts a `MediaElementAudioSourceNode` once and never gives it back, and the moment it has
 * one, its sound reaches the speakers only through the graph) and a graph is silent for as long
 * as its `AudioContext` is suspended.
 *
 * That cost was worth refusing right up until the archives were measured, and then it was not.
 * Over four of them — 98 posts measured whole, 30 sampled from each of the others — the median
 * post asks to be made *louder*: +5.6 dB on one account, +4.4 on another, around 0 on the two
 * balanced ones, and every single archive holds posts asking for more than +18. The true-peak cap
 * ttdl applies barely bites, because these files are mastered with headroom (median true peak
 * −4 to −7 dBTP). Attenuation alone would have addressed a fifth of the problem on the archive
 * that needed it most.
 *
 * So the graph is built — but only where it cannot cost anything: never before a gesture has
 * given the context a chance to run, and never while the context is suspended, which would
 * silence the post outright rather than amplify it. See `boostAllowed`.
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

/** Seconds for a gain change to settle. Long enough that no change is a click, short enough
 * that no post starts at the wrong level. */
const RAMP = 0.02;

/** Amplitude multiplier for a level in decibels. */
function amplitude(db: number): number {
	return 10 ** (db / 20);
}

/**
 * The volume to play this post at, given the one the viewer chose.
 *
 * The viewer's setting stays the outer term: this scales what they asked for rather than
 * replacing it, so the slider still means what it says and the result is still within [0, 1].
 * A post that wants to be louder is left at the chosen volume and handled by the graph below.
 */
export function playbackVolume(post: Post, volume: number): number {
	const gain = post.loudnessGain;
	// Null is an unmeasured post — an archive ttdl has not run `loudness` over, a post with no
	// sound, a download that was cut short. All of them mean the same thing here.
	if (gain === null || gain >= 0) {
		return volume;
	}
	return volume * amplitude(gain);
}

/** The decibels of amplification this post asks for, after the ceiling. 0 means "nothing to do". */
export function boostFor(post: Post): number {
	const gain = post.loudnessGain;
	return gain === null || gain <= 0 ? 0 : Math.min(gain, MAX_BOOST_DB);
}

/**
 * Whether the graph may be built at all.
 *
 * This shipped banning iOS, on the received wisdom that a routed element's sound obeys the ringer
 * switch where an unrouted one does not — a feed that goes mute because a hardware switch was
 * flipped being worse than a few quiet posts staying quiet. It was then tried on an iPhone, with
 * `?boost=1&debug=1`: sound on, `boost=12.0` in the panel, switch to silent, nothing changed.
 * The wisdom does not apply here, and the likely reason is that it describes a context playing on
 * its own — this one is fed by a `<video>` that is already playing, so the audio session is the
 * element's, and that session is not the one the switch silences.
 *
 * So there is no platform rule left, and the flag stays anyway: `?boost=0` turns the graph off on
 * a device that turns out to need it off, without a deploy. `?boost=1` is the same switch the
 * other way, and is what the iPhone above was asked with.
 *
 * Pure, and takes what it reads: the decision has to be checkable without a browser to run it in.
 */
export function boostPermitted(search: string): boolean {
	return new URLSearchParams(search).get("boost") !== "0";
}

/**
 * The same answer, asked of this page once and then kept.
 *
 * Not at import: a module that reads the URL merely because it was loaded cannot be loaded
 * anywhere else, and there is nothing to decide until a post actually asks to be amplified. That
 * first question comes from a slide's effect, which runs before the feed rewrites its own URL
 * from the filter — so the flag is still there to read.
 */
let allowed: boolean | null = null;

export function boostAllowed(): boolean {
	if (allowed === null) {
		allowed = boostPermitted(window.location.search);
	}
	return allowed;
}

/**
 * The one context. Created lazily, because creating one before it is wanted is how a page ends up
 * holding an audio session it never uses — and because the first chance it has of starting in the
 * running state is inside the gesture that turns the sound on.
 */
let ctx: AudioContext | null = null;

/**
 * The gain node an element was given, if it was given one.
 *
 * Keyed on the element and never removed while the element lives: a second
 * `createMediaElementSource` for the same element throws, so this is the only record that one was
 * already made. Weak, so a slide that has swiped away takes its entry with it.
 */
const graphs = new WeakMap<HTMLMediaElement, GainNode>();

/**
 * Elements that want a boost the context could not give them yet.
 *
 * Strong on purpose, and emptied by the teardown every caller is handed: a suspended context is
 * the normal state before the first gesture, and without somewhere to wait, a post visible at
 * that moment would never be boosted at all — its effect has already run and has nothing to
 * re-run for.
 */
const waiting = new Map<HTMLMediaElement, number>();

function flush(): void {
	if (ctx?.state !== "running") {
		return;
	}
	for (const [element, db] of waiting) {
		waiting.delete(element);
		connect(element, db);
	}
}

function context(): AudioContext | null {
	if (ctx) {
		return ctx;
	}
	const Ctor = window.AudioContext;
	if (!Ctor) {
		return null;
	}
	ctx = new Ctor();
	// The state can change without us asking — a resume that resolves late, a browser that
	// suspends a backgrounded page and lets it go again — and each of those is a chance to give
	// a waiting element the graph it asked for.
	ctx.addEventListener("statechange", flush);
	return ctx;
}

function connect(element: HTMLMediaElement, db: number): void {
	// Deliberately does not create the context: the only place that does is the gesture below.
	// Before the sound has ever been turned on there is nothing here to hear, and a page that
	// opens an audio session it may never use is a page holding a resource for nothing.
	const live = ctx;
	if (live?.state !== "running") {
		// Never route an element into a context that is not running: the routing cannot be undone,
		// and an element routed into a suspended graph is not quieter, it is silent.
		waiting.set(element, db);
		element.dataset.boost = "wait";
		void live?.resume().catch(() => undefined);
		return;
	}

	let gain = graphs.get(element);
	if (!gain) {
		try {
			const source = live.createMediaElementSource(element);
			gain = live.createGain();
			gain.gain.value = 1;
			source.connect(gain).connect(live.destination);
			graphs.set(element, gain);
		} catch {
			// Already routed, or refused outright. Either way the element still plays — through
			// whatever it was routed into the first time — and the boost is simply not applied.
			return;
		}
	}
	gain.gain.setTargetAtTime(amplitude(db), live.currentTime, RAMP);
	element.dataset.boost = db.toFixed(1);
}

/**
 * Amplify one element by `db`, once the browser allows it.
 *
 * Returns the teardown for the caller's effect. It does not take the routing back — nothing can —
 * it takes the element out of the queue and returns the gain to unity, so an element that is
 * still alive is left playing at the level it would have played at anyway.
 */
export function boost(element: HTMLMediaElement, db: number): () => void {
	if (db > 0) {
		/*
		 * Every state this can be in is written onto the element, and the debug panel prints it:
		 * a number once the gain is applied, `wait` while the context is not running yet, `off`
		 * where the graph is not allowed at all. Which one it is cannot be worked out from the
		 * outside — all three sound identical — and the platform question this exists to answer
		 * is one that has to be answered on a phone, where there is no console to ask.
		 */
		if (boostAllowed()) {
			connect(element, db);
		} else {
			element.dataset.boost = "off";
		}
	}
	return () => {
		waiting.delete(element);
		const gain = graphs.get(element);
		if (gain && ctx) {
			gain.gain.setTargetAtTime(1, ctx.currentTime, RAMP);
		}
		delete element.dataset.boost;
	};
}

/**
 * Give the context its chance, from inside the gesture that turns the sound on.
 *
 * This is the whole reason the graph is affordable. A context created during a real gesture is
 * allowed to start running immediately; one created at any other moment starts suspended, and
 * every element that wanted a boost would sit in `waiting` until something else woke it.
 */
export function resumeAudio(): void {
	const live = context();
	if (live && live.state !== "running") {
		void live.resume().catch(() => undefined);
	}
	flush();
}

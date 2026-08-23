import { create } from "zustand";
import { persist } from "zustand/middleware";
import { normalizeOverride } from "../feed/loudness.ts";

interface PlayerState {
	muted: boolean;
	/**
	 * Whether the sound went off because the browser refused it, rather than because it was asked.
	 *
	 * Worth a flag of its own: the fallback that mutes also succeeds, so nothing else distinguishes
	 * "policy took the sound away" from "the sound is simply off", and those want different answers.
	 */
	mutedByPolicy: boolean;
	volume: number;
	/**
	 * Playback rate, shared by every slide.
	 *
	 * Per-post would be the wrong grain: the rate is a way of watching, not a property of a post,
	 * and having it snap back to 1× on every swipe is precisely what makes the control useless.
	 */
	rate: number;
	/** Autoplay policy only lets us unmute after a real gesture; until then, do not offer it. */
	hasInteracted: boolean;
	autoAdvance: boolean;
	/**
	 * The slow zoom across a carousel's photos.
	 *
	 * Off by default. It is an effect applied to someone else's picture — it crops the edges, and on
	 * a still photograph it invents movement the post never had. Worth offering, not worth imposing
	 * on an archive whose whole point is showing what is actually on disk.
	 */
	pan: boolean;
	/**
	 * Whether every post is played at one loudness, or at whatever it was mastered at.
	 *
	 * On by default, which is what shipped: an archive read in order is a volume knob you keep
	 * reaching for, and the median post in every archive measured here asks to be made louder. It
	 * is a setting rather than a decision because the correction is still an opinion applied to
	 * someone else's mix — the same ground `pan` stands on — and because a boost is the one part
	 * of it that can make a post *worse*, by lifting a noise floor along with a voice.
	 */
	normalize: boolean;
	/**
	 * What `?normalize=` said on this page load, if it said anything.
	 *
	 * Not persisted, exactly like `mutedByPolicy`: a link sent to somebody is allowed to change
	 * what they hear for as long as they are on it, and is not allowed to change a setting on
	 * their machine. Kept beside the setting rather than folded into it so that the setting
	 * survives the visit intact — `normalizeOn` decides which of the two is in force.
	 */
	normalizeOverride: boolean | null;
	/** Whether the feed's one-time gesture hint has been dismissed. Persisted; it is shown once. */
	seenFeedHint: boolean;
	toggleMuted: () => void;
	/** Forced off because the browser refused to start an unmuted element. */
	mute: () => void;
	/**
	 * Undo a mute the policy forced, on the strength of a gesture.
	 *
	 * Without this the fallback is a one-way door: the first refusal silences the feed and every
	 * later slide is started already muted, so it never asks for sound again and the viewer has to
	 * turn it back on by hand. A touch is the very thing the policy was holding out for, so the
	 * next slide can be asked with sound — and if it is refused again, the fallback still catches it.
	 */
	restoreSound: () => void;
	setVolume: (volume: number) => void;
	setRate: (rate: number) => void;
	markInteracted: () => void;
	setAutoAdvance: (on: boolean) => void;
	setPan: (on: boolean) => void;
	/** Turn the loudness correction on or off, and drop any override the URL asked for. */
	setNormalize: (on: boolean) => void;
	dismissFeedHint: () => void;
}

/**
 * Whether the correction is in force, which is the only form of this anything should read.
 *
 * A URL asking for one page load beats the stored setting, and nothing else does. Written to be
 * usable both as a selector — `usePlayer(normalizeOn)` — and against `getState()`, because the
 * places that need it are split evenly between the two.
 */
export function normalizeOn(state: Pick<PlayerState, "normalize" | "normalizeOverride">): boolean {
	return state.normalizeOverride ?? state.normalize;
}

/** The rates the menu offers, and the only ones anything else should assume. */
export const RATES = [0.5, 1, 1.5, 2] as const;

/**
 * Player preferences, shared by every mounted slide.
 *
 * A store rather than context on purpose: with a selector subscription, toggling mute re-renders
 * only the elements that read `muted`, while context would re-render the whole feed window on
 * every toggle.
 */
export const usePlayer = create<PlayerState>()(
	persist(
		(set) => ({
			// Muted by default because the browser gives us no choice: an unmuted autoplay is
			// simply refused, and a feed that opens on a frozen first frame looks broken.
			muted: true,
			mutedByPolicy: false,
			volume: 1,
			rate: 1,
			hasInteracted: false,
			autoAdvance: false,
			pan: false,
			normalize: true,
			// Read here rather than in the module that acts on it: this store is already a
			// browser's, having a `localStorage` under it, and it is created once at boot — long
			// before the feed starts rewriting its own URL from the filter.
			normalizeOverride: normalizeOverride(window.location.search),
			seenFeedHint: false,
			// Turning the sound on by hand is a gesture, which is the very thing the policy wanted —
			// so it clears the flag as well as the mute.
			toggleMuted: () => set((state) => ({ muted: !state.muted, mutedByPolicy: false })),
			// Store-wide, not per slide: the refusal is the page's autoplay standing, so every other
			// slide is about to be refused too. Flipping it once means the speaker icon reflects what
			// is actually happening, and the next slide starts muted instead of stalling first.
			mute: () => set({ muted: true, mutedByPolicy: true }),
			// Only ever undoes the policy's own mute: a viewer who turned the sound off meant it,
			// and must not have it turned back on by the act of swiping.
			restoreSound: () =>
				set((state) => (state.mutedByPolicy ? { muted: false, mutedByPolicy: false } : {})),
			setVolume: (volume) => set({ volume: Math.min(1, Math.max(0, volume)) }),
			// Clamped rather than trusted: this is persisted, so a hand-edited or stale value from
			// an older build would otherwise reach playbackRate, which throws outside its range.
			setRate: (rate) => set({ rate: Math.min(4, Math.max(0.25, rate)) }),
			markInteracted: () => set({ hasInteracted: true }),
			setAutoAdvance: (autoAdvance) => set({ autoAdvance }),
			setPan: (pan) => set({ pan }),
			// Clearing the override is the point of going through here: from the moment a viewer
			// touches the switch, the switch is what is in force, including when they set it back
			// to what the URL had asked for.
			setNormalize: (normalize) => set({ normalize, normalizeOverride: null }),
			// Any interaction at all counts as having read it: the hint names the gestures, and using
			// one is better proof of having understood it than dismissing a box would be.
			dismissFeedHint: () => set((state) => (state.seenFeedHint ? {} : { seenFeedHint: true })),
		}),
		{
			name: "ttdl-viewer:player",
			partialize: (state) => ({
				muted: state.muted,
				volume: state.volume,
				rate: state.rate,
				autoAdvance: state.autoAdvance,
				pan: state.pan,
				normalize: state.normalize,
				seenFeedHint: state.seenFeedHint,
			}),
		},
	),
);

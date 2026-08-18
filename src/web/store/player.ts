import { create } from "zustand";
import { persist } from "zustand/middleware";

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
		}),
		{
			name: "ttdl-viewer:player",
			partialize: (state) => ({
				muted: state.muted,
				volume: state.volume,
				rate: state.rate,
				autoAdvance: state.autoAdvance,
			}),
		},
	),
);

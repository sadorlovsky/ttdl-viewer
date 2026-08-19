/**
 * Even out the volume between posts, from what ttdl measured.
 *
 * TikTok mixes wildly, so an archive played back in order is a volume knob you keep reaching for.
 * `ttdl.py loudness` measures every post to EBU R128 and records the decibels it would take to
 * bring each one to a common target; nothing is re-encoded, so applying it is the player's job or
 * nobody's. Here it is one multiplication on the element's `volume`.
 *
 * **Only downwards.** A post that asks to be made louder is left exactly as it is, for a reason
 * that is not really a policy: `HTMLMediaElement.volume` is capped at 1, so a boost cannot be
 * expressed at all without routing the element through a WebAudio graph — and that is a bargain
 * worth refusing here. The routing is a one-way door (an element can be given a
 * `MediaElementAudioSourceNode` once, and never taken back), the graph is silent for as long as
 * its `AudioContext` is suspended, which is precisely the state a feed that opens muted by
 * autoplay policy is in, and on iOS it moves the sound onto a path that obeys the ringer switch
 * when `<video playsinline>` does not. Trading a feed that can go silent on a phone for a few
 * quiet posts made louder is not a trade this screen should make.
 *
 * What is left is the half that was actually the complaint. The loud posts are the ones that make
 * you flinch, they are the overwhelming majority of what TikTok serves — and pulling them down is
 * also the half that cannot go wrong: attenuation cannot clip, so there is nothing to limit, no
 * compressor smearing transients to pay for a rescue that was never needed.
 */

import type { Post } from "../../shared/types.ts";

/**
 * The volume to play this post at, given the one the viewer chose.
 *
 * The viewer's setting stays the outer term: this scales what they asked for rather than
 * replacing it, so the slider still means what it says and the result is still within [0, 1].
 */
export function playbackVolume(post: Post, volume: number): number {
	const gain = post.loudnessGain;
	// Null is an unmeasured post — an archive ttdl has not run `loudness` over, a post with no
	// sound, a download that was cut short. All of them mean the same thing here.
	if (gain === null || gain >= 0) {
		return volume;
	}
	return volume * 10 ** (gain / 20);
}

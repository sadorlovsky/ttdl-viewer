/**
 * What the feed can ask of the slide on screen.
 *
 * The feed owns the keyboard, but not what a key means: a step is one image on a carousel and five
 * seconds on a video, and only the slide knows which it is. Pausing has to come through here too —
 * a video slide takes back any pause it did not see coming, on the assumption that the browser
 * stopped the element on its own, so reaching past it to `pause()` produces a post that stops for a
 * frame and starts again.
 */
export interface SlideControls {
	toggle: () => void;
	/** One image on a carousel, five seconds on a video. Negative goes back. */
	step: (delta: number) => void;
}

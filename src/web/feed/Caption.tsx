import { useLayoutEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import type { Post } from "../../shared/types.ts";
import { MusicIcon, WarnIcon } from "../components/Icons.tsx";
import { PressButton } from "../components/PressButton.tsx";
import { date, dateTime, splitHashtags } from "../lib/format.ts";
import { authorHref, authorLabel } from "./author.ts";
import styles from "./Caption.module.css";

interface CaptionProps {
	post: Post;
	onHashtag: (tag: string) => void;
}

/** The track line only scrolls when it actually overflows — a marquee that never needed to move
 *  is pure noise. */
function Marquee({ text }: { text: string }) {
	const outer = useRef<HTMLSpanElement>(null);
	const inner = useRef<HTMLSpanElement>(null);
	const [overflows, setOverflows] = useState(false);

	useLayoutEffect(() => {
		const outerEl = outer.current;
		const innerEl = inner.current;
		if (!outerEl || !innerEl) {
			return;
		}
		const check = () => setOverflows(innerEl.scrollWidth > outerEl.clientWidth + 2);
		check();
		const observer = new ResizeObserver(check);
		observer.observe(outerEl);
		observer.observe(innerEl);
		return () => observer.disconnect();
	}, []);

	return (
		<span className={styles.marquee} ref={outer} data-scrolling={overflows || undefined}>
			<span className={styles.marqueeInner} ref={inner}>
				{text}
			</span>
			{overflows && (
				<span className={styles.marqueeInner} aria-hidden>
					{text}
				</span>
			)}
		</span>
	);
}

export function Caption({ post, onHashtag }: CaptionProps) {
	/*
	 * The handle navigates by itself, where a hashtag asks the feed to do it.
	 *
	 * A hashtag narrows whatever is already on screen, so only the feed — which holds the current
	 * query — can build that address. An author replaces it outright, which takes nothing from this
	 * screen but the post, so it goes straight to the same address the rail's avatar uses.
	 */
	const [, navigate] = useLocation();
	const [expanded, setExpanded] = useState(false);
	const text = post.description ?? post.title;

	/*
	 * Whether the clamp is actually cutting anything off.
	 *
	 * This used to be `text.length > 90`, which was close enough while the caption was always two
	 * lines across the bottom of a phone. It stopped being close enough the moment the column could
	 * be a different width and the clamp a different number of lines: on a desktop window the same
	 * caption fits six lines of a narrow card, and the heuristic went on offering "more" for text
	 * that was already entirely on screen. The element knows; ask it.
	 */
	const textRef = useRef<HTMLParagraphElement>(null);
	const [clipped, setClipped] = useState(false);

	/*
	 * `text` is in the deps and unused in the body on purpose. The feed reuses this element from
	 * post to post, and a clamped box is the same height whatever is in it — so the observer alone
	 * would never fire and the answer would go on being the previous caption's.
	 */
	// biome-ignore lint/correctness/useExhaustiveDependencies: see above
	useLayoutEffect(() => {
		const el = textRef.current;
		if (!el || expanded) {
			return;
		}
		/*
		 * Measured by lifting the clamp for one reflow rather than by reading `scrollHeight`.
		 *
		 * `scrollHeight` answers "does anything overflow this box", and something always does: each
		 * hashtag's hit target is an absolutely positioned pseudo-element standing six pixels proud
		 * of the line, which counts as overflow whether or not a single word is cut off. The
		 * question here is about the words, so the honest measurement is the box's own height with
		 * the clamp on against its height with the clamp off. Both reads happen inside a layout
		 * effect, before the browser paints either of them.
		 */
		const check = () => {
			const clamped = el.offsetHeight;
			el.style.setProperty("-webkit-line-clamp", "unset");
			const whole = el.offsetHeight;
			el.style.removeProperty("-webkit-line-clamp");
			// A rounding allowance: the two heights differ by a fraction of a pixel at some zoom
			// levels even when every line is already showing.
			setClipped(whole > clamped + 1);
		};
		check();
		// The caption around it rather than the paragraph itself: the check resizes the paragraph
		// twice and puts it back, and an observer watching that would be watching its own work.
		const observer = new ResizeObserver(check);
		const box = el.parentElement;
		if (box) {
			observer.observe(box);
		}
		return () => observer.disconnect();
	}, [expanded, text]);

	const music = post.music;
	const trackLine = music?.track
		? [music.track, music.artists.length > 0 ? music.artists.join(", ") : null]
				.filter(Boolean)
				.join(" — ")
		: null;

	return (
		<div className={styles.caption}>
			<p className={styles.handle}>
				{/*
				 * Pressable, like the avatar opposite it. The handle is the post's other statement of
				 * whose this is, and on a screen where the same author's other posts are one filter
				 * away, a name that cannot be followed is a dead end sitting on top of a route.
				 */}
				<PressButton
					className={styles.author}
					aria-label={authorLabel(post)}
					onPress={() => navigate(authorHref(post))}
				>
					@{post.author.handle || "unknown"}
				</PressButton>
				{/*
				 * The day is on screen; the clock is one hover away.
				 *
				 * Every post carries a real publish second — from `createTime` when there is metadata,
				 * and from the post id when there is not — so this is captured data rather than a
				 * precision the archive does not have. A native tooltip because it is a footnote to a
				 * line that already reads correctly without it.
				 */}
				<span className={styles.date} title={dateTime(post.createdAt)}>
					{date(post.createdAt)}
				</span>
				{post.createdAtSource !== "info" && (
					<span className={styles.inferred} title="Date derived from the post id, not metadata">
						inferred
					</span>
				)}
			</p>

			{/*
			 * When you saved this, on the line under when it was published.
			 *
			 * The two dates are different facts and the caption already carries the second, so this
			 * gets its own line rather than a third chip on a line about the post's own date. The
			 * verb does the work of a label: "liked" and "favorited" name the list it came from,
			 * which is the only place either date exists — see the export note in `likes.ts`.
			 */}
			{post.liked && (
				<p className={styles.saved} title="From your TikTok data export">
					<span className={styles.savedKind}>
						{post.liked.kind === "like" ? "liked" : "favorited"}
					</span>{" "}
					{date(post.liked.at)}
				</p>
			)}

			{text && (
				<>
					<p className={styles.text} ref={textRef} data-expanded={expanded || undefined}>
						{splitHashtags(text).map((part) =>
							part.tag ? (
								<PressButton
									// Hashtags stay interactive because filtering is entirely local.
									key={part.at}
									className={styles.tag}
									onPress={() => onHashtag(part.tag as string)}
								>
									{part.text}
								</PressButton>
							) : (
								<span key={part.at}>{part.text}</span>
							),
						)}
					</p>
					{/*
					 * A sibling of the clamped paragraph, not a child of it.
					 *
					 * Nested inside `.text`, this button lived or died by luck: `-webkit-line-clamp`
					 * only paints trailing inline content that still fits on the visible line, and a
					 * caption whose own words already reach the box edge — which is most captions
					 * long enough to need this at all — left no room for it. The button rendered,
					 * and was clipped away with everything past it, so the archive's longer captions
					 * had no way back to their own text.
					 */}
					{!expanded && clipped && (
						<PressButton className={styles.more} onPress={() => setExpanded(true)}>
							more
						</PressButton>
					)}
				</>
			)}

			{trackLine && (
				<p className={styles.music}>
					<MusicIcon size={14} />
					<Marquee text={trackLine} />
				</p>
			)}

			{!post.hasInfo && (
				<p className={styles.warn}>
					<WarnIcon size={13} />
					{/*
					 * One line at every width the product supports, which is a fact about the length of
					 * the sentence rather than about the layout. Two things had it wrapping in the
					 * desktop card: the loose text around the `code` became three anonymous flex items
					 * laid out side by side, each wrapping inside its own column; and once that was one
					 * element, the sentence was still four characters too long for the narrowest card
					 * and left "it in" orphaned on a second line. "run ttdl.py meta" is what filling it
					 * in *is*, so the clause saying so was the part to give up.
					 */}
					<span>
						no metadata — run <code>ttdl.py meta</code>
					</span>
				</p>
			)}
		</div>
	);
}

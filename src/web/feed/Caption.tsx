import { useLayoutEffect, useRef, useState } from "react";
import type { Post } from "../../shared/types.ts";
import { MusicIcon, WarnIcon } from "../components/Icons.tsx";
import { PressButton } from "../components/PressButton.tsx";
import { date, splitHashtags } from "../lib/format.ts";
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
	const [expanded, setExpanded] = useState(false);
	const text = post.description ?? post.title;

	const music = post.music;
	const trackLine = music?.track
		? [music.track, music.artists.length > 0 ? music.artists.join(", ") : null]
				.filter(Boolean)
				.join(" — ")
		: null;

	return (
		<div className={styles.caption}>
			<p className={styles.handle}>
				@{post.author.handle || "unknown"}
				<span className={styles.date}>{date(post.createdAt)}</span>
				{post.createdAtSource !== "info" && (
					<span className={styles.inferred} title="Date derived from the post id, not metadata">
						inferred
					</span>
				)}
			</p>

			{text && (
				<>
					<p className={styles.text} data-expanded={expanded || undefined}>
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
					{!expanded && text.length > 90 && (
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
					no metadata — run <code>ttdl.py meta</code> to fill it in
				</p>
			)}
		</div>
	);
}

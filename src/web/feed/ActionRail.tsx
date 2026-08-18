import { useMemo, useRef } from "react";
import { useLocation } from "wouter";
import { serializeQuery } from "../../shared/filters.ts";
import type { Post } from "../../shared/types.ts";
import { Avatar } from "../components/Avatar.tsx";
import { BookmarkIcon, CommentIcon, HeartIcon, ShareIcon } from "../components/Icons.tsx";
import { count } from "../lib/format.ts";
import styles from "./ActionRail.module.css";

interface ActionRailProps {
	post: Post;
	paused: boolean;
}

/** How far a finger may wander and still have meant to press this, rather than to swipe the feed. */
const PRESS_SLOP = 10;

/**
 * Press handling for the two live controls in the column.
 *
 * `click` is not used, for the reason the slide's own gesture code gives: in a snap-scrolling feed
 * the browser withholds it after a `pointercancel`, and after a press it fires against the nearest
 * common ancestor of where the finger went down and came up — so a control here fired sometimes and
 * not others, which reads as a broken button rather than as a missed gesture.
 *
 * Doing the work on `pointerup` also fixes opening the post: a `window.open` from a timer is not
 * inside a user gesture and browsers refuse it as a popup. Measuring how long the press lasted and
 * acting when the finger lifts keeps the whole thing inside the gesture that asked for it.
 */
function usePress(onTap: () => void) {
	/**
	 * The press in flight, held in a ref rather than a closure.
	 *
	 * A closure looked equivalent and was not: it is rebuilt on every render, so a render landing
	 * between the finger going down and coming up handed `pointerup` a fresh, empty one and the
	 * press was dropped on the floor. The feed re-renders constantly — the scrubber alone does it
	 * per frame — which is why the avatar worked intermittently and the link, whose own label
	 * changes on use, never worked at all.
	 */
	const at = useRef<{ x: number; y: number } | null>(null);
	// Read through a ref for the same reason the slide's gesture code does: the handlers stay
	// stable, so the button keeps one set of listeners instead of swapping them mid-press.
	const latest = useRef(onTap);
	latest.current = onTap;

	return useMemo(
		() => ({
			onPointerDown: (event: React.PointerEvent) => {
				// The slide beneath is listening too; this press belongs to the control.
				event.stopPropagation();
				at.current = { x: event.clientX, y: event.clientY };
			},
			onPointerUp: (event: React.PointerEvent) => {
				const start = at.current;
				at.current = null;
				if (!start) {
					return;
				}
				event.stopPropagation();
				if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > PRESS_SLOP) {
					return;
				}
				latest.current();
			},
			onPointerCancel: () => {
				at.current = null;
			},
			// Enter and Space arrive as a click with no pointer behind it; that is the only click used.
			onClick: (event: React.MouseEvent) => {
				if (event.detail === 0) {
					latest.current();
				}
			},
		}),
		[],
	);
}

/**
 * The right-hand column.
 *
 * This is a read-only archive, so the question is what replaces buttons that cannot do anything.
 * The answer taken here: keep the counts, because they are real captured data and they are most
 * of what this column communicates — but make the column read as a *readout*. Nothing here
 * highlights on hover, nothing takes focus, nothing has a pressed state.
 *
 * The one exception is the avatar, which is the only item here that names something the archive can
 * still show you — everything this author left in it. Copying the post's address lives in the
 * long-press sheet, where it is one labelled row among the other things you can do with a post,
 * rather than a lone button wearing the shape of one you cannot press.
 */
export function ActionRail({ post, paused }: ActionRailProps) {
	const [, navigate] = useLocation();

	const readouts: Array<{
		key: string;
		icon: React.ReactNode;
		value: number | null;
		noun: string;
	}> = [
		{ key: "likes", icon: <HeartIcon size={29} />, value: post.stats.likes, noun: "likes" },
		{
			key: "comments",
			icon: <CommentIcon size={28} />,
			value: post.stats.comments,
			noun: "comments",
		},
		{ key: "saves", icon: <BookmarkIcon size={27} />, value: post.stats.saves, noun: "saves" },
		{ key: "shares", icon: <ShareIcon size={29} />, value: post.stats.shares, noun: "shares" },
	];

	// The one identity in the column, and the one thing in it that names something the archive can
	// still show you: everything this author left in it. An author with no metadata has an empty
	// handle, which the query model carries as a hyphen — so that chip works here too.
	const authorPress = usePress(() =>
		navigate(`/a/${post.archiveId}?${serializeQuery({ author: [post.author.handle] })}`),
	);
	const authorLabel = post.author.handle
		? `Show everything by @${post.author.handle} in this archive`
		: "Show everything with no author in this archive";

	return (
		<div className={styles.rail}>
			<button type="button" className={styles.avatarSlot} aria-label={authorLabel} {...authorPress}>
				<Avatar seed={post.author.avatar} src={post.author.avatarUrl} size={46} />
			</button>

			{readouts.map((item) => (
				<div
					key={item.key}
					className={styles.item}
					// A glyph and a number that together convey one fact, and nothing here is
					// operable — that is an image with a label, not a control.
					role="img"
					aria-label={
						item.value === null
							? `${item.noun} unknown — this post has no metadata`
							: `${item.value.toLocaleString()} ${item.noun}`
					}
				>
					<span className={styles.glyph} aria-hidden>
						{item.icon}
					</span>
					<span className={`${styles.count} tabular`} aria-hidden>
						{count(item.value)}
					</span>
				</div>
			))}

			{/* The spinning record: the cover, circular-masked. Stops with the post. */}
			<div className={styles.disc} data-paused={paused || undefined} aria-hidden>
				{post.cover ? (
					<img src={post.cover.url} alt="" className={styles.discImage} />
				) : (
					<span className={styles.discBlank} />
				)}
			</div>
		</div>
	);
}

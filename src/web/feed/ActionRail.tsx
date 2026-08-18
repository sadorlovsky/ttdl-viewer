import { useLocation } from "wouter";
import { serializeQuery } from "../../shared/filters.ts";
import type { Post } from "../../shared/types.ts";
import { Avatar } from "../components/Avatar.tsx";
import { BookmarkIcon, CommentIcon, HeartIcon, ShareIcon } from "../components/Icons.tsx";
import { PressButton } from "../components/PressButton.tsx";
import { count } from "../lib/format.ts";
import styles from "./ActionRail.module.css";

interface ActionRailProps {
	post: Post;
	paused: boolean;
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
	const authorLabel = post.author.handle
		? `Show everything by @${post.author.handle} in this archive`
		: "Show everything with no author in this archive";

	return (
		<div className={styles.rail}>
			<PressButton
				className={styles.avatarSlot}
				aria-label={authorLabel}
				onPress={() =>
					navigate(`/a/${post.archiveId}?${serializeQuery({ author: [post.author.handle] })}`)
				}
			>
				<Avatar seed={post.author.avatar} src={post.author.avatarUrl} size={46} />
			</PressButton>

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

import { useState } from "react";
import type { Post } from "../../shared/types.ts";
import { Avatar } from "../components/Avatar.tsx";
import { BookmarkIcon, CommentIcon, CopyIcon, HeartIcon, ShareIcon } from "../components/Icons.tsx";
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
 * The one exception is "copy link", which sits where a share button would and is genuinely
 * local: it writes to the clipboard and makes no request.
 */
export function ActionRail({ post, paused }: ActionRailProps) {
	const [copied, setCopied] = useState(false);

	const copy = async () => {
		if (!post.webpageUrl) {
			return;
		}
		try {
			await navigator.clipboard.writeText(post.webpageUrl);
			setCopied(true);
			setTimeout(() => setCopied(false), 1400);
		} catch {
			// Clipboard access can be refused; silently leaving the label unchanged is honest.
		}
	};

	const readouts: Array<{
		key: string;
		icon: React.ReactNode;
		value: number | null;
		noun: string;
	}> = [
		{ key: "likes", icon: <HeartIcon size={30} />, value: post.stats.likes, noun: "likes" },
		{
			key: "comments",
			icon: <CommentIcon size={30} />,
			value: post.stats.comments,
			noun: "comments",
		},
		{ key: "saves", icon: <BookmarkIcon size={28} />, value: post.stats.saves, noun: "saves" },
		{ key: "shares", icon: <ShareIcon size={30} />, value: post.stats.shares, noun: "shares" },
	];

	return (
		<div className={styles.rail}>
			<div className={styles.avatarSlot}>
				<Avatar seed={post.author.avatar} src={post.author.avatarUrl} size={46} />
			</div>

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

			{post.webpageUrl && (
				<button className={styles.copy} onClick={copy} aria-label="Copy the original link">
					<CopyIcon size={19} />
					<span className={styles.count}>{copied ? "copied" : "link"}</span>
				</button>
			)}

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

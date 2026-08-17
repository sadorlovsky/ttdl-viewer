import type { Post } from "../../shared/types.ts";
import { count, duration } from "../lib/format.ts";
import { PlayIcon, StackIcon, WarnIcon } from "./Icons.tsx";
import styles from "./PostTile.module.css";

interface PostTileProps {
	post: Post;
	onOpen: (post: Post) => void;
	/** Marks the post the user just came back from, so the grid says where they were. */
	highlighted?: boolean;
	showAuthor?: boolean;
}

export function PostTile({ post, onOpen, highlighted, showAuthor }: PostTileProps) {
	const label = post.description ?? post.title;

	return (
		<button
			className={styles.tile}
			data-highlighted={highlighted || undefined}
			onClick={() => onOpen(post)}
			aria-label={label}
		>
			{post.cover ? (
				<img src={post.cover.url} alt="" className={styles.cover} loading="lazy" decoding="async" />
			) : (
				<span className={styles.noCover}>{post.kind === "carousel" ? "photos" : "video"}</span>
			)}

			<span className={styles.shade} />

			{post.kind === "carousel" && (
				<span className={styles.corner}>
					<StackIcon size={13} />
					{post.photos ? post.photos.count : ""}
				</span>
			)}
			{post.status === "incomplete" && (
				<span className={styles.corner} data-warn>
					<WarnIcon size={13} />
				</span>
			)}

			<span className={styles.footer}>
				<span className={styles.views}>
					<PlayIcon size={12} />
					<span className="tabular">{count(post.stats.views)}</span>
				</span>
				{post.kind === "video" && post.duration !== null && (
					<span className={`${styles.duration} tabular`}>{duration(post.duration)}</span>
				)}
			</span>

			{showAuthor && post.author.handle && (
				<span className={styles.author}>@{post.author.handle}</span>
			)}
		</button>
	);
}

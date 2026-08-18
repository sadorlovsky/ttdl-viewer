import type { Post } from "../../shared/types.ts";
import { count, duration } from "../lib/format.ts";
import { PlayIcon, StackIcon, WarnIcon } from "./Icons.tsx";
import styles from "./PostTile.module.css";
import { TilePreview } from "./TilePreview.tsx";
import { usePreviewIntent, usePreviewsAllowed } from "./usePreviewIntent.ts";

interface PostTileProps {
	post: Post;
	onOpen: (post: Post) => void;
	/** Marks the post the user just came back from, so the grid says where they were. */
	highlighted?: boolean;
	showAuthor?: boolean;
}

export function PostTile({ post, onOpen, highlighted, showAuthor }: PostTileProps) {
	const label = post.description ?? post.title;
	/*
	 * The preview is an enrichment and never the only place something is said: the cover, the
	 * counts, the duration and the kind chip all stay exactly as they were underneath it. Half of
	 * this product is a touch screen, where no hover ever arrives, and a tile that only makes sense
	 * once it moves would be a tile that never makes sense there.
	 */
	const previews = usePreviewsAllowed();
	const preview = usePreviewIntent(previews);

	return (
		<button
			className={styles.tile}
			data-highlighted={highlighted || undefined}
			onClick={() => onOpen(post)}
			aria-label={label}
			{...preview.handlers}
		>
			{post.cover ? (
				<img src={post.cover.url} alt="" className={styles.cover} loading="lazy" decoding="async" />
			) : (
				<span className={styles.noCover}>{post.kind === "carousel" ? "photos" : "video"}</span>
			)}

			{preview.armed && <TilePreview post={post} />}

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

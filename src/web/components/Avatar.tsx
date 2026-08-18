import type { AvatarSeed } from "../../shared/types.ts";
import styles from "./Avatar.module.css";

interface AvatarProps {
	seed: AvatarSeed;
	/** A local URL for ttdl's `avatar.jpg`. Never a remote address — see the note below. */
	src?: string | null;
	size?: number;
	className?: string;
}

/**
 * The author's picture, or a stand-in derived from their handle.
 *
 * `get` records `avatar.jpg` for a profile archive, so a real picture is usually there — but only
 * for the account the archive belongs to. Every other author, and every author in a list archive,
 * has nothing but a handle, so the seeded circle stays: the same person gets the same colour and
 * letter on every screen and across sessions, which is most of what an avatar does when you are
 * scanning a list.
 *
 * The letter is rendered underneath rather than instead of the picture, so a file that has been
 * moved to storage or fails to decode falls back to it without a broken frame or a layout shift.
 * The picture is served by this app from disk; nothing here ever points at a CDN.
 */
export function Avatar({ seed, src, size = 48, className }: AvatarProps) {
	return (
		<span
			className={className ? `${styles.avatar} ${className}` : styles.avatar}
			style={{
				width: size,
				height: size,
				fontSize: Math.round(size * 0.42),
				["--h" as string]: seed.hue,
			}}
			aria-hidden
		>
			{seed.letter}
			{src && <img className={styles.picture} src={src} alt="" decoding="async" />}
		</span>
	);
}

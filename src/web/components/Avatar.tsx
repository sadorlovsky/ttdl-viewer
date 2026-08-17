import type { AvatarSeed } from "../../shared/types.ts";
import styles from "./Avatar.module.css";

interface AvatarProps {
	seed: AvatarSeed;
	size?: number;
	className?: string;
}

/**
 * ttdl never downloads profile pictures, so there is no image to show. Rather than a grey circle
 * for everyone, the handle seeds a hue — the same person then looks the same on every screen and
 * across sessions, which is most of what an avatar is actually for when scanning a list.
 */
export function Avatar({ seed, size = 48, className }: AvatarProps) {
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
		</span>
	);
}

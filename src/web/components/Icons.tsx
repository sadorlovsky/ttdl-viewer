/**
 * Inline SVG glyphs.
 *
 * Everything here is drawn from scratch — no icon font, no sprite sheet, no remote asset, because
 * a single external reference would break the offline promise. They are generic shapes (a heart,
 * a bubble, a bookmark), not any company's mark.
 */
interface IconProps {
	size?: number;
	className?: string;
}

const base = (size: number) => ({
	width: size,
	height: size,
	viewBox: "0 0 24 24",
	fill: "none" as const,
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": true,
	focusable: false,
});

export const HeartIcon = ({ size = 32, className }: IconProps) => (
	<svg {...base(size)} className={className}>
		<path
			d="M12 20.5s-7.5-4.7-7.5-9.6A4.4 4.4 0 0 1 12 8.2a4.4 4.4 0 0 1 7.5 2.7c0 4.9-7.5 9.6-7.5 9.6Z"
			fill="currentColor"
		/>
	</svg>
);

export const CommentIcon = ({ size = 32, className }: IconProps) => (
	<svg {...base(size)} className={className}>
		<path
			d="M4 5.5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8.6L7 20.3v-3.8H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1Z"
			fill="currentColor"
		/>
	</svg>
);

export const BookmarkIcon = ({ size = 32, className }: IconProps) => (
	<svg {...base(size)} className={className}>
		<path
			d="M6.5 3.5h11a1 1 0 0 1 1 1v16l-6.5-4.2L5.5 20.5v-16a1 1 0 0 1 1-1Z"
			fill="currentColor"
		/>
	</svg>
);

export const ShareIcon = ({ size = 32, className }: IconProps) => (
	<svg {...base(size)} className={className}>
		<path
			d="M21 12 9.5 5.2v3.9C5 9.6 2.8 12.9 3 19c1.7-3.6 4-4.8 6.5-4.8v3.9L21 12Z"
			fill="currentColor"
		/>
	</svg>
);

export const MusicIcon = ({ size = 16, className }: IconProps) => (
	<svg {...base(size)} className={className}>
		<path
			d="M9 17.5a2.5 2.5 0 1 1-2-2.45V6.2l10-2.2v9.05a2.5 2.5 0 1 1-2-2.45V6.6L9 8.05v9.45Z"
			fill="currentColor"
		/>
	</svg>
);

export const PlayIcon = ({ size = 16, className }: IconProps) => (
	<svg {...base(size)} className={className}>
		<path d="M7 4.5 19.5 12 7 19.5v-15Z" fill="currentColor" />
	</svg>
);

export const PauseIcon = ({ size = 16, className }: IconProps) => (
	<svg {...base(size)} className={className}>
		<path d="M7 4.5h3.5v15H7v-15Zm6.5 0H17v15h-3.5v-15Z" fill="currentColor" />
	</svg>
);

export const StackIcon = ({ size = 16, className }: IconProps) => (
	<svg {...base(size)} className={className}>
		<rect x="7" y="3.5" width="14" height="14" rx="2" fill="currentColor" opacity=".55" />
		<rect x="3" y="6.5" width="14" height="14" rx="2" fill="currentColor" />
	</svg>
);

export const SearchIcon = ({ size = 18, className }: IconProps) => (
	<svg {...base(size)} className={className}>
		<circle cx="10.5" cy="10.5" r="6" stroke="currentColor" strokeWidth="2" />
		<path d="m15.2 15.2 4.3 4.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
	</svg>
);

export const MuteIcon = ({ size = 20, className }: IconProps) => (
	<svg {...base(size)} className={className}>
		<path d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4v-5Z" fill="currentColor" />
		<path d="m15.5 9.5 5 5m0-5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
	</svg>
);

export const SoundIcon = ({ size = 20, className }: IconProps) => (
	<svg {...base(size)} className={className}>
		<path d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4v-5Z" fill="currentColor" />
		<path
			d="M15.5 9a4 4 0 0 1 0 6m2.5-8.5a7.5 7.5 0 0 1 0 11"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
		/>
	</svg>
);

export const BackIcon = ({ size = 20, className }: IconProps) => (
	<svg {...base(size)} className={className}>
		<path
			d="M14.5 5.5 8 12l6.5 6.5"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
		/>
	</svg>
);

export const CopyIcon = ({ size = 18, className }: IconProps) => (
	<svg {...base(size)} className={className}>
		<rect x="8.5" y="3.5" width="12" height="14" rx="2" stroke="currentColor" strokeWidth="1.8" />
		<path
			d="M15.5 20.5h-11a1 1 0 0 1-1-1v-12"
			stroke="currentColor"
			strokeWidth="1.8"
			strokeLinecap="round"
		/>
	</svg>
);

export const InfoIcon = ({ size = 18, className }: IconProps) => (
	<svg {...base(size)} className={className}>
		<circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.8" />
		<path d="M12 11v5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
		<circle cx="12" cy="7.9" r="1.1" fill="currentColor" />
	</svg>
);

export const SpeedIcon = ({ size = 20, className }: IconProps) => (
	<svg {...base(size)} className={className}>
		<path
			d="M3.8 17.5a9 9 0 1 1 16.4 0"
			stroke="currentColor"
			strokeWidth="1.8"
			strokeLinecap="round"
		/>
		<path d="M12 12.5 16.5 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
		<circle cx="12" cy="13.5" r="1.4" fill="currentColor" />
	</svg>
);

/** Clear display: an eye, struck through. The full outline, because a half-drawn one reads as a
 *  bow tie at this size rather than as anything to do with looking. */
export const EyeOffIcon = ({ size = 20, className }: IconProps) => (
	<svg {...base(size)} className={className}>
		<path
			d="M3 12s3.6-6 9-6 9 6 9 6-3.6 6-9 6-9-6-9-6Z"
			stroke="currentColor"
			strokeWidth="1.8"
			strokeLinejoin="round"
		/>
		<circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.8" />
		<path d="M4 20 20 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
	</svg>
);

/**
 * Auto scroll: the feed carrying on downwards by itself.
 *
 * Two chevrons and no baseline, deliberately. An arrow that lands on a line is the universal
 * download glyph, and this menu is a near-copy of one whose first row is exactly that — the two
 * must not be confusable at a glance.
 */
export const AutoScrollIcon = ({ size = 20, className }: IconProps) => (
	<svg {...base(size)} className={className}>
		<path
			d="m6 6 6 5 6-5m-12 7 6 5 6-5"
			stroke="currentColor"
			strokeWidth="1.8"
			strokeLinecap="round"
			strokeLinejoin="round"
		/>
	</svg>
);

export const PipIcon = ({ size = 20, className }: IconProps) => (
	<svg {...base(size)} className={className}>
		<rect x="3.5" y="5.5" width="17" height="13" rx="2" stroke="currentColor" strokeWidth="1.8" />
		<rect x="11.5" y="11" width="7" height="6" rx="1" fill="currentColor" />
	</svg>
);

export const FullscreenIcon = ({ size = 20, className }: IconProps) => (
	<svg {...base(size)} className={className}>
		<path
			d="M9 4.5H4.5V9M15 4.5h4.5V9M9 19.5H4.5V15M15 19.5h4.5V15"
			stroke="currentColor"
			strokeWidth="1.8"
			strokeLinecap="round"
			strokeLinejoin="round"
		/>
	</svg>
);

/** Leaving fullscreen: the same corners, pointing inwards. */
export const FullscreenExitIcon = ({ size = 20, className }: IconProps) => (
	<svg {...base(size)} className={className}>
		<path
			d="M4.5 9H9V4.5M19.5 9H15V4.5M4.5 15H9v4.5M19.5 15H15v4.5"
			stroke="currentColor"
			strokeWidth="1.8"
			strokeLinecap="round"
			strokeLinejoin="round"
		/>
	</svg>
);

/** The debug readout: angle brackets, since what it shows is a machine's own view. */
export const CodeIcon = ({ size = 20, className }: IconProps) => (
	<svg {...base(size)} className={className}>
		<path
			d="m8.5 8.5-4 3.5 4 3.5m7-7 4 3.5-4 3.5M13.5 5.5l-3 13"
			stroke="currentColor"
			strokeWidth="1.8"
			strokeLinecap="round"
			strokeLinejoin="round"
		/>
	</svg>
);

export const WarnIcon = ({ size = 16, className }: IconProps) => (
	<svg {...base(size)} className={className}>
		<path
			d="M12 3.5 21.5 20h-19L12 3.5Z"
			stroke="currentColor"
			strokeWidth="1.8"
			strokeLinejoin="round"
		/>
		<path d="M12 9.5v4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
		<circle cx="12" cy="16.8" r="1" fill="currentColor" />
	</svg>
);

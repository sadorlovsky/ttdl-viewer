import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { duration as formatDuration } from "../lib/format.ts";
import styles from "./Scrubber.module.css";

interface ScrubberProps {
	mediaRef: RefObject<HTMLMediaElement | null>;
	active: boolean;
}

/**
 * A progress bar you can drag.
 *
 * Two details are load-bearing:
 *
 *  - Progress is read in a rAF loop rather than from `timeupdate`, which only fires ~4 times a
 *    second and makes the bar visibly step. `requestVideoFrameCallback` is used where it exists
 *    because it is frame-accurate and, unlike a timer, stops on its own when the video pauses.
 *  - Dragging uses pointer capture. Mouse events lose the pointer the moment it leaves the 3px
 *    bar, which is exactly what happens when you drag along a video.
 */
export function Scrubber({ mediaRef, active }: ScrubberProps) {
	const barRef = useRef<HTMLDivElement>(null);
	const [progress, setProgress] = useState(0);
	const [time, setTime] = useState(0);
	const [total, setTotal] = useState(0);
	const [dragging, setDragging] = useState(false);
	const draggingRef = useRef(false);

	useEffect(() => {
		const media = mediaRef.current;
		if (!media || !active) {
			return;
		}

		let raf = 0;
		let vfc = 0;
		const read = () => {
			const length = media.duration;
			if (Number.isFinite(length) && length > 0) {
				setTotal(length);
				if (!draggingRef.current) {
					setProgress(media.currentTime / length);
					setTime(media.currentTime);
				}
			}
		};

		const video = media as HTMLVideoElement;
		if (typeof video.requestVideoFrameCallback === "function") {
			const step = () => {
				read();
				vfc = video.requestVideoFrameCallback(step);
			};
			vfc = video.requestVideoFrameCallback(step);
			// A paused video fires no frame callbacks, so seek/metadata still need an event.
			media.addEventListener("timeupdate", read);
			media.addEventListener("loadedmetadata", read);
			return () => {
				video.cancelVideoFrameCallback(vfc);
				media.removeEventListener("timeupdate", read);
				media.removeEventListener("loadedmetadata", read);
			};
		}

		const loop = () => {
			read();
			raf = requestAnimationFrame(loop);
		};
		raf = requestAnimationFrame(loop);
		return () => cancelAnimationFrame(raf);
	}, [mediaRef, active]);

	const seekTo = useCallback(
		(clientX: number) => {
			const bar = barRef.current;
			const media = mediaRef.current;
			if (!bar || !media || !Number.isFinite(media.duration)) {
				return;
			}
			const rect = bar.getBoundingClientRect();
			const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
			setProgress(ratio);
			setTime(ratio * media.duration);
			media.currentTime = ratio * media.duration;
		},
		[mediaRef],
	);

	return (
		<div
			className={styles.hit}
			// The slide listens for taps and holds across its whole area now, so anything with a
			// gesture of its own has to say so; this one is not a button and would not be spotted.
			data-interactive
			data-dragging={dragging || undefined}
			onPointerDown={(event) => {
				event.stopPropagation();
				event.currentTarget.setPointerCapture(event.pointerId);
				draggingRef.current = true;
				setDragging(true);
				seekTo(event.clientX);
			}}
			onPointerMove={(event) => {
				if (draggingRef.current) {
					seekTo(event.clientX);
				}
			}}
			onPointerUp={(event) => {
				event.currentTarget.releasePointerCapture(event.pointerId);
				draggingRef.current = false;
				setDragging(false);
			}}
			onPointerCancel={() => {
				draggingRef.current = false;
				setDragging(false);
			}}
		>
			<div className={styles.bar} ref={barRef}>
				<div className={styles.fill} style={{ transform: `scaleX(${progress})` }} />
			</div>
			<div className={styles.knob} style={{ left: `${progress * 100}%` }} />
			{dragging && (
				<div className={styles.bubble} style={{ left: `${progress * 100}%` }}>
					{formatDuration(time)} / {formatDuration(total)}
				</div>
			)}
		</div>
	);
}

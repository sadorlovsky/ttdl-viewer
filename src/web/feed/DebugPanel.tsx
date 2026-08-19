import { type RefObject, useEffect, useState } from "react";
import { usePlayer } from "../store/player.ts";

/**
 * What the active slide is actually doing, on screen.
 *
 * A stall in the feed is invisible from the outside: a paused element and a stalled one both show
 * a still frame, and the difference between them — `readyState`, whether a play() was refused,
 * whether a hold is stuck — lives in places you cannot reach on a phone. Reading the element and
 * the slide's own flags puts that difference somewhere it can simply be photographed.
 *
 * Opt-in through `?debug=1`, so it never appears unless it was asked for.
 */
// Takes the ref rather than its value: the element does not exist on the render that mounts this,
// and filling a ref does not re-render, so a value read here would have been null forever.
export function DebugPanel({ scroller }: { scroller: RefObject<HTMLElement | null> }) {
	const [line, setLine] = useState("…");
	const byPolicy = usePlayer((state) => state.mutedByPolicy);

	useEffect(() => {
		const read = () => {
			const container = scroller.current;
			if (!container) {
				setLine("waiting for the feed…");
				return;
			}
			const height = container.clientHeight || 1;
			const index = Math.round(container.scrollTop / height);
			const slot = container.querySelector(`[data-index="${index}"]`);
			const slide = slot?.firstElementChild as HTMLElement | undefined;
			const media = slot?.querySelector("video, audio") as HTMLMediaElement | null;

			if (!media) {
				setLine(`#${index} · no media element (carousel, or outside the window)`);
				return;
			}
			const buffered = media.buffered.length ? media.buffered.end(0).toFixed(1) : "0";
			const data = slide?.dataset ?? {};
			const flags = ["active", "ready", "held", "paused", "failed"]
				.filter((flag) => data[flag] !== undefined)
				.join(" ");
			// The count is the tell for a resource leak: it should sit at the window size and stay
			// there. Climbing with every swipe means unmounted elements are not letting go.
			const elements = document.querySelectorAll("video, audio").length;
			setLine(
				`#${index} rs=${media.readyState} net=${media.networkState} ` +
					`t=${media.currentTime.toFixed(1)} buf=${buffered} ` +
					`${media.paused ? "PAUSED" : "playing"} ${media.muted ? "muted" : "SOUND"} ` +
					// The applied volume, not the chosen one: it is the loudness correction made
					// visible, and the only place the two can be told apart on a phone. `boost` is
					// its other half — set only once an element is actually routed through the
					// gain node, so a dash there means the graph was refused, not that the post
					// asked for nothing.
					`vol=${media.volume.toFixed(2)} boost=${media.dataset.boost ?? "-"} ` +
					`${byPolicy ? "BY-POLICY " : ""}els=${elements} ` +
					`err=${media.error?.code ?? "-"} refused=${data.refused ?? "-"} | ${flags || "-"}`,
			);
		};
		read();
		const timer = setInterval(read, 250);
		return () => clearInterval(timer);
	}, [scroller, byPolicy]);

	return (
		<div
			style={{
				position: "fixed",
				left: 0,
				right: 0,
				bottom: 0,
				zIndex: 99,
				padding: "6px 8px",
				font: "11px/1.4 ui-monospace, monospace",
				color: "#0f0",
				background: "rgba(0,0,0,.85)",
				pointerEvents: "none",
				wordBreak: "break-all",
			}}
		>
			{line}
		</div>
	);
}

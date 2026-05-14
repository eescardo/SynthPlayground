import { BEAT_WIDTH, HEADER_WIDTH } from "@/components/tracks/trackCanvasConstants";

export const PLAYHEAD_FOLLOW_VIEWPORT_RATIO = 0.8;
export const PLAYHEAD_VISIBLE_MARGIN_PX = 48;

export type PlayheadScrollStrategy = "follow" | "reveal";

interface TrackCanvasPlayheadScrollArgs {
  playheadBeat: number;
  scrollLeft: number;
  clientWidth: number;
  scrollWidth: number;
  strategy: PlayheadScrollStrategy;
}

export const getPlayheadScrollLeft = ({
  playheadBeat,
  scrollLeft,
  clientWidth,
  scrollWidth,
  strategy
}: TrackCanvasPlayheadScrollArgs): number => {
  const maxScrollLeft = Math.max(0, scrollWidth - clientWidth);
  const playheadX = HEADER_WIDTH + playheadBeat * BEAT_WIDTH;

  // Follow mode pins playback near 80% of the viewport after it reaches that point.
  // Reveal mode uses the minimum scroll needed to make navigation jumps visible.
  if (strategy === "follow") {
    const followAnchorX = clientWidth * PLAYHEAD_FOLLOW_VIEWPORT_RATIO;
    const visiblePlayheadX = playheadX - scrollLeft;

    if (visiblePlayheadX > followAnchorX) {
      return Math.min(maxScrollLeft, Math.max(0, playheadX - followAnchorX));
    }

    if (visiblePlayheadX < HEADER_WIDTH) {
      return Math.min(maxScrollLeft, Math.max(0, playheadX - HEADER_WIDTH));
    }

    return scrollLeft;
  }

  const leftEdge = scrollLeft + HEADER_WIDTH + PLAYHEAD_VISIBLE_MARGIN_PX;
  const rightEdge = scrollLeft + clientWidth - PLAYHEAD_VISIBLE_MARGIN_PX;

  if (playheadX < leftEdge) {
    return Math.min(maxScrollLeft, Math.max(0, playheadX - HEADER_WIDTH - PLAYHEAD_VISIBLE_MARGIN_PX));
  }

  if (playheadX > rightEdge) {
    return Math.min(maxScrollLeft, Math.max(0, playheadX - clientWidth + PLAYHEAD_VISIBLE_MARGIN_PX));
  }

  return scrollLeft;
};

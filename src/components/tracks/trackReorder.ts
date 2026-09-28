import type { TrackLayout } from "@/components/tracks/trackCanvasTypes";

export interface TrackDropTarget {
  targetTrackId: string;
  position: "before" | "after";
}

export const resolveTrackDropTarget = (args: {
  clientY: number;
  shellTop: number;
  scrollTop: number;
  trackLayouts: TrackLayout[];
}): TrackDropTarget | null => {
  const pointerCanvasY = args.clientY - args.shellTop + args.scrollTop;
  const first = args.trackLayouts[0];
  const last = args.trackLayouts.at(-1);
  if (first && pointerCanvasY < first.y) {
    return { targetTrackId: first.trackId, position: "before" };
  }
  if (last && pointerCanvasY > last.y + last.height) {
    return { targetTrackId: last.trackId, position: "after" };
  }
  const layout = args.trackLayouts.find(
    (candidate) => pointerCanvasY >= candidate.y && pointerCanvasY <= candidate.y + candidate.height
  );
  if (!layout) {
    return null;
  }

  return {
    targetTrackId: layout.trackId,
    position: pointerCanvasY < layout.y + layout.height / 2 ? "before" : "after"
  };
};

/** Pixels per second; accelerate toward either edge of the visible track viewport. */
export const trackReorderScrollSpeed = (clientY: number, top: number, bottom: number): number => {
  const edge = Math.min(64, (bottom - top) / 2);
  if (edge <= 0) return 0;
  if (clientY < top + edge) return -600 * Math.min(1, (top + edge - clientY) / edge);
  if (clientY > bottom - edge) return 600 * Math.min(1, (clientY - bottom + edge) / edge);
  return 0;
};

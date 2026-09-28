import type { TrackLayout } from "@/components/tracks/trackCanvasTypes";

export interface TrackDropTarget {
  targetTrackId: string;
  position: "before" | "after";
}

export const resolveTrackReorderKeyDirection = (event: {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}): -1 | 0 | 1 => {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    return 0;
  }
  return event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
};

export const resolveTrackDropTarget = (args: {
  clientY: number;
  shellTop: number;
  shellBottom: number;
  scrollTop: number;
  trackLayouts: TrackLayout[];
}): TrackDropTarget | null => {
  const first = args.trackLayouts[0];
  const last = args.trackLayouts.at(-1);
  // Page-wide drop zones use viewport coordinates, independent of canvas scroll.
  if (first && args.clientY < args.shellTop) {
    return { targetTrackId: first.trackId, position: "before" };
  }
  if (last && args.clientY > args.shellBottom) {
    return { targetTrackId: last.trackId, position: "after" };
  }
  const pointerCanvasY = args.clientY - args.shellTop + args.scrollTop;
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

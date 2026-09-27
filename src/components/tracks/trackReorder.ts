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

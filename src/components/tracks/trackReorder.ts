import type { TrackLayout } from "@/components/tracks/trackCanvasTypes";
import { normalizePhysicalPitchKey } from "@/lib/pitch";

export interface TrackDropTarget {
  targetTrackId: string;
  position: "before" | "after";
}

interface TrackReorderKeyboardEvent {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

export interface FocusedHandleScrollGeometry {
  currentScrollTop: number;
  maxScrollTop: number;
  handleTop: number;
  handleBottom: number;
  visibleTop: number;
  visibleBottom: number;
}

export const resolveTrackReorderKeyDirection = (event: TrackReorderKeyboardEvent): -1 | 0 | 1 => {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    return 0;
  }
  return event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
};

export const shouldPropagateTrackReorderKeyDown = (event: TrackReorderKeyboardEvent): boolean => {
  if (event.key === "Escape" || event.ctrlKey || event.metaKey) {
    return true;
  }
  // Let recording own pitch input. The composer chrome guard already prevents
  // idle note placement, so the grip must not swallow recording's keydown.
  if (!event.altKey && normalizePhysicalPitchKey(event.key) !== undefined) {
    return true;
  }
  return (
    (event.key === "ArrowUp" || event.key === "ArrowRight" || event.key === "ArrowDown" || event.key === "ArrowLeft") &&
    (event.altKey || event.shiftKey)
  );
};

export const resolveFocusedHandleScrollTop = ({
  currentScrollTop,
  maxScrollTop,
  handleTop,
  handleBottom,
  visibleTop,
  visibleBottom
}: FocusedHandleScrollGeometry): number => {
  const availableHeight = Math.max(0, visibleBottom - visibleTop);
  const handleHeight = Math.max(0, handleBottom - handleTop);
  let targetScrollTop = currentScrollTop;

  if (availableHeight === 0) {
    return Math.min(Math.max(0, currentScrollTop), maxScrollTop);
  }
  if (handleHeight > availableHeight) {
    // An oversized grip cannot satisfy both edges. Aligning its top is stable and
    // keeps the focus ring plus the beginning of the track discoverable.
    targetScrollTop += handleTop - visibleTop;
  } else if (handleTop < visibleTop) {
    targetScrollTop -= visibleTop - handleTop;
  } else if (handleBottom > visibleBottom) {
    targetScrollTop += handleBottom - visibleBottom;
  }

  return Math.min(Math.max(0, targetScrollTop), Math.max(0, maxScrollTop));
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

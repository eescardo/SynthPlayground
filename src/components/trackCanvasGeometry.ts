export const PLAYHEAD_HIT_HALF_WIDTH = 3;
export const LOOP_MARKER_BAR_WIDTH = 8;
export const LOOP_MARKER_DOT_RADIUS = 3;
export const LOOP_MARKER_DOT_OFFSET_Y = 6;
export const LOOP_MARKER_HOVER_RING_RADIUS = 4.5;

export type CanvasCursor = "default" | "pointer" | "move" | "move-active" | "resize";
export type TrackCanvasHoverTarget = "mute" | "pitch" | "note" | "loop-marker" | "playhead" | "empty";

export interface LoopMarkerRect {
  markerId: string;
  kind: "start" | "end";
  beat: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MuteRect {
  trackId: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PitchRect {
  trackId: string;
  noteId: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export const findPitchRect = (rects: PitchRect[], x: number, y: number): PitchRect | null => {
  for (const rect of rects) {
    if (x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h) {
      return rect;
    }
  }
  return null;
};

export const findMuteRect = (rects: MuteRect[], x: number, y: number): MuteRect | null => {
  for (const rect of rects) {
    if (x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h) {
      return rect;
    }
  }
  return null;
};

export const findLoopMarkerRect = (rects: LoopMarkerRect[], x: number, y: number): LoopMarkerRect | null => {
  for (const rect of rects) {
    if (x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h) {
      return rect;
    }
  }
  return null;
};

export const isOverPlayhead = (
  x: number,
  playheadBeat: number,
  headerWidth: number,
  beatWidth: number,
  hitHalfWidth = PLAYHEAD_HIT_HALF_WIDTH
): boolean => {
  const playheadX = headerWidth + playheadBeat * beatWidth;
  return x >= playheadX - hitHalfWidth && x <= playheadX + hitHalfWidth;
};

export const getCursorForPosition = ({
  hasMuteHit,
  hasPitchHit,
  hasLoopMarkerHit,
  hasPlayheadHit,
  noteRect,
  x,
  noteResizeHandleWidth
}: {
  hasMuteHit: boolean;
  hasPitchHit: boolean;
  hasLoopMarkerHit: boolean;
  hasPlayheadHit: boolean;
  noteRect: { x: number; w: number } | null;
  x: number;
  noteResizeHandleWidth: number;
}): CanvasCursor => {
  const hoverTarget = getHoverTarget({
    hasMuteHit,
    hasPitchHit,
    hasLoopMarkerHit,
    hasPlayheadHit,
    noteRect
  });
  if (hoverTarget === "mute" || hoverTarget === "pitch" || hoverTarget === "loop-marker" || hoverTarget === "playhead") {
    return "pointer";
  }
  if (hoverTarget !== "note" || !noteRect) {
    return "default";
  }
  return x > noteRect.x + noteRect.w - noteResizeHandleWidth ? "resize" : "move";
};

export const getHoverTarget = ({
  hasMuteHit,
  hasPitchHit,
  hasLoopMarkerHit,
  hasPlayheadHit,
  noteRect
}: {
  hasMuteHit: boolean;
  hasPitchHit: boolean;
  hasLoopMarkerHit: boolean;
  hasPlayheadHit: boolean;
  noteRect: { x: number; w: number } | null;
}): TrackCanvasHoverTarget => {
  if (hasMuteHit) {
    return "mute";
  }
  if (hasPitchHit) {
    return "pitch";
  }
  if (noteRect) {
    return "note";
  }
  if (hasLoopMarkerHit) {
    return "loop-marker";
  }
  if (hasPlayheadHit) {
    return "playhead";
  }
  return "empty";
};

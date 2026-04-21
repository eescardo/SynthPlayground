import { TRACK_CANVAS_COLORS } from "@/components/tracks/trackCanvasConstants";
import {
  fillRoundedRect,
  NOTE_CORNER_RADIUS,
  strokeRoundedRect
} from "@/components/tracks/trackCanvasNoteGeometry";

interface NoteRenderRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface DrawTrackCanvasNoteStateArgs {
  hovered: boolean;
  selected: boolean;
  focused: boolean;
  beingPlaced: boolean;
}

export function drawTrackCanvasNoteState(
  ctx: CanvasRenderingContext2D,
  noteRect: NoteRenderRect,
  state: DrawTrackCanvasNoteStateArgs
) {
  const { x, y, w, h } = noteRect;

  if (state.hovered) {
    strokeRoundedRect(
      ctx,
      x + 1,
      y + 1,
      Math.max(0, w - 2),
      Math.max(0, h - 2),
      Math.max(0, NOTE_CORNER_RADIUS - 1),
      TRACK_CANVAS_COLORS.noteHoverBorder,
      2
    );
  }

  if (state.selected) {
    if (state.focused) {
      fillRoundedRect(
        ctx,
        x,
        y,
        w,
        h,
        NOTE_CORNER_RADIUS,
        TRACK_CANVAS_COLORS.noteSelectedFocusOverlay
      );
      ctx.setLineDash([5, 3]);
    }
    strokeRoundedRect(
      ctx,
      x + 1,
      y + 1,
      Math.max(0, w - 2),
      Math.max(0, h - 2),
      Math.max(0, NOTE_CORNER_RADIUS - 1),
      state.focused
        ? TRACK_CANVAS_COLORS.noteSelectedFocusBorder
        : TRACK_CANVAS_COLORS.noteSelectedBorder,
      2
    );
    if (state.focused) {
      ctx.setLineDash([]);
    }
  }

  if (state.beingPlaced) {
    fillRoundedRect(
      ctx,
      x,
      y,
      w,
      h,
      NOTE_CORNER_RADIUS,
      TRACK_CANVAS_COLORS.notePlacementOverlay
    );
    strokeRoundedRect(
      ctx,
      x + 1,
      y + 1,
      Math.max(0, w - 2),
      Math.max(0, h - 2),
      Math.max(0, NOTE_CORNER_RADIUS - 1),
      TRACK_CANVAS_COLORS.notePlacementBorder,
      2
    );
  }
}

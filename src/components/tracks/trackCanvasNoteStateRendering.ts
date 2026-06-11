import { TRACK_CANVAS_COLORS } from "@/components/tracks/trackCanvasConstants";
import {
  fillRoundedRect,
  NOTE_BORDER_INSET,
  NOTE_BORDER_WIDTH,
  NOTE_CORNER_RADIUS,
  NOTE_INNER_RADIUS,
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
      x + NOTE_BORDER_INSET,
      y + NOTE_BORDER_INSET,
      Math.max(0, w - NOTE_BORDER_WIDTH),
      Math.max(0, h - NOTE_BORDER_WIDTH),
      NOTE_INNER_RADIUS,
      TRACK_CANVAS_COLORS.noteHoverBorder,
      NOTE_BORDER_WIDTH
    );
  }

  if (state.selected) {
    if (state.focused) {
      fillRoundedRect(ctx, x, y, w, h, NOTE_CORNER_RADIUS, TRACK_CANVAS_COLORS.noteSelectedFocusOverlay);
      ctx.setLineDash([5, 3]);
    }
    strokeRoundedRect(
      ctx,
      x + NOTE_BORDER_INSET,
      y + NOTE_BORDER_INSET,
      Math.max(0, w - NOTE_BORDER_WIDTH),
      Math.max(0, h - NOTE_BORDER_WIDTH),
      NOTE_INNER_RADIUS,
      state.focused ? TRACK_CANVAS_COLORS.noteSelectedFocusBorder : TRACK_CANVAS_COLORS.noteSelectedBorder,
      NOTE_BORDER_WIDTH
    );
    if (state.focused) {
      ctx.setLineDash([]);
    }
  }

  if (state.beingPlaced) {
    fillRoundedRect(ctx, x, y, w, h, NOTE_CORNER_RADIUS, TRACK_CANVAS_COLORS.notePlacementOverlay);
    strokeRoundedRect(
      ctx,
      x + NOTE_BORDER_INSET,
      y + NOTE_BORDER_INSET,
      Math.max(0, w - NOTE_BORDER_WIDTH),
      Math.max(0, h - NOTE_BORDER_WIDTH),
      NOTE_INNER_RADIUS,
      TRACK_CANVAS_COLORS.notePlacementBorder,
      NOTE_BORDER_WIDTH
    );
  }
}

import { BEAT_WIDTH, HEADER_WIDTH, TRACK_CANVAS_COLORS, TRACK_HEIGHT } from "@/components/tracks/trackCanvasConstants";
import {
  drawNoteBody,
  fillRoundedRect,
  NOTE_BORDER_INSET,
  NOTE_BORDER_WIDTH,
  NOTE_INNER_RADIUS,
  NOTE_LABEL_X_OFFSET,
  NOTE_LABEL_Y_OFFSET,
  NOTE_MIN_WIDTH,
  NOTE_VERTICAL_INSET,
  strokeRoundedRect
} from "@/components/tracks/trackCanvasNoteGeometry";

const PREVIEW_NOTE_ALPHA = 0.3;
const GHOST_NOTE_BADGE_WIDTH = 28;
const TAB_PREVIEW_BADGE_WIDTH = 26;
const NOTE_BADGE_HEIGHT = 18;
const NOTE_BADGE_BOTTOM_OFFSET = 4;
const NOTE_BADGE_RADIUS = 6;
const GHOST_BADGE_LINE_WIDTH = 1.8;
const GHOST_BADGE_STEM_X_OFFSET = 18;
const GHOST_BADGE_LEFT_X_OFFSET = 8;
const GHOST_BADGE_TOP_Y_OFFSET = 4.5;
const GHOST_BADGE_MID_Y_OFFSET = 10.5;
const GHOST_BADGE_ARROW_X_OFFSET = 4;
const GHOST_BADGE_ARROW_HALF_HEIGHT = 3.5;
const TAB_BADGE_TEXT_X_OFFSET = 5;
const TAB_BADGE_TEXT_Y_OFFSET = 12;

export interface TrackCanvasPreviewNoteRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function drawGhostPreviewNote(
  ctx: CanvasRenderingContext2D,
  note: { startBeat: number; durationBeats: number; pitchStr: string },
  trackY: number,
  beatWidth = BEAT_WIDTH
) {
  const noteX = HEADER_WIDTH + note.startBeat * beatWidth;
  const noteW = Math.max(NOTE_MIN_WIDTH, note.durationBeats * beatWidth);
  const noteY = trackY + NOTE_VERTICAL_INSET;
  const noteH = TRACK_HEIGHT - NOTE_VERTICAL_INSET * 2;

  ctx.save();
  ctx.globalAlpha = PREVIEW_NOTE_ALPHA;
  drawNoteBody(ctx, noteX, noteY, noteW, noteH, TRACK_CANVAS_COLORS.ghostPlacementFill);
  ctx.restore();

  strokeRoundedRect(
    ctx,
    noteX + NOTE_BORDER_INSET,
    noteY + NOTE_BORDER_INSET,
    Math.max(0, noteW - NOTE_BORDER_WIDTH),
    Math.max(0, noteH - NOTE_BORDER_WIDTH),
    NOTE_INNER_RADIUS,
    TRACK_CANVAS_COLORS.ghostPlacementBorder,
    NOTE_BORDER_WIDTH
  );

  ctx.fillStyle = TRACK_CANVAS_COLORS.ghostPlacementLabel;
  ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText(note.pitchStr, noteX + NOTE_LABEL_X_OFFSET, noteY + NOTE_LABEL_Y_OFFSET);

  const badgeX = noteX + NOTE_BORDER_INSET;
  const badgeY = noteY + noteH - NOTE_BADGE_HEIGHT - NOTE_BADGE_BOTTOM_OFFSET;
  fillRoundedRect(
    ctx,
    badgeX,
    badgeY,
    GHOST_NOTE_BADGE_WIDTH,
    NOTE_BADGE_HEIGHT,
    NOTE_BADGE_RADIUS,
    TRACK_CANVAS_COLORS.ghostPlacementBadge
  );

  ctx.save();
  ctx.strokeStyle = TRACK_CANVAS_COLORS.ghostPlacementBadgeText;
  ctx.lineWidth = GHOST_BADGE_LINE_WIDTH;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const stemX = badgeX + GHOST_BADGE_STEM_X_OFFSET;
  const topY = badgeY + GHOST_BADGE_TOP_Y_OFFSET;
  const midY = badgeY + GHOST_BADGE_MID_Y_OFFSET;
  const leftX = badgeX + GHOST_BADGE_LEFT_X_OFFSET;
  ctx.beginPath();
  ctx.moveTo(stemX, topY);
  ctx.lineTo(stemX, midY);
  ctx.lineTo(leftX, midY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(leftX + GHOST_BADGE_ARROW_X_OFFSET, midY - GHOST_BADGE_ARROW_HALF_HEIGHT);
  ctx.lineTo(leftX, midY);
  ctx.lineTo(leftX + GHOST_BADGE_ARROW_X_OFFSET, midY + GHOST_BADGE_ARROW_HALF_HEIGHT);
  ctx.stroke();
  ctx.restore();
}

export function drawTabSelectionPreview(ctx: CanvasRenderingContext2D, noteRect: TrackCanvasPreviewNoteRect) {
  strokeRoundedRect(
    ctx,
    noteRect.x + NOTE_BORDER_INSET,
    noteRect.y + NOTE_BORDER_INSET,
    Math.max(0, noteRect.w - NOTE_BORDER_WIDTH),
    Math.max(0, noteRect.h - NOTE_BORDER_WIDTH),
    NOTE_INNER_RADIUS,
    TRACK_CANVAS_COLORS.tabSelectionPreviewBorder,
    NOTE_BORDER_WIDTH
  );

  const badgeX = noteRect.x + NOTE_BORDER_INSET;
  const badgeY = noteRect.y + noteRect.h - NOTE_BADGE_HEIGHT - NOTE_BADGE_BOTTOM_OFFSET;
  fillRoundedRect(
    ctx,
    badgeX,
    badgeY,
    TAB_PREVIEW_BADGE_WIDTH,
    NOTE_BADGE_HEIGHT,
    NOTE_BADGE_RADIUS,
    TRACK_CANVAS_COLORS.tabSelectionPreviewBadge
  );
  ctx.fillStyle = TRACK_CANVAS_COLORS.tabSelectionPreviewBadgeText;
  ctx.font = "bold 10px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText("Tab", badgeX + TAB_BADGE_TEXT_X_OFFSET, badgeY + TAB_BADGE_TEXT_Y_OFFSET);
}

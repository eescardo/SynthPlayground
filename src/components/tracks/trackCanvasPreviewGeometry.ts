import {
  BEAT_WIDTH,
  HEADER_WIDTH,
  TRACK_CANVAS_COLORS,
  TRACK_HEIGHT
} from "@/components/tracks/trackCanvasConstants";
import {
  drawNoteBody,
  fillRoundedRect,
  NOTE_CORNER_RADIUS,
  strokeRoundedRect
} from "@/components/tracks/trackCanvasNoteGeometry";

export interface TrackCanvasPreviewNoteRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function drawGhostPreviewNote(
  ctx: CanvasRenderingContext2D,
  note: { startBeat: number; durationBeats: number; pitchStr: string },
  trackY: number
) {
  const noteX = HEADER_WIDTH + note.startBeat * BEAT_WIDTH;
  const noteW = Math.max(8, note.durationBeats * BEAT_WIDTH);
  const noteY = trackY + 14;
  const noteH = TRACK_HEIGHT - 28;

  ctx.save();
  ctx.globalAlpha = 0.3;
  drawNoteBody(ctx, noteX, noteY, noteW, noteH, TRACK_CANVAS_COLORS.ghostPlacementFill);
  ctx.restore();

  strokeRoundedRect(
    ctx,
    noteX + 1,
    noteY + 1,
    Math.max(0, noteW - 2),
    Math.max(0, noteH - 2),
    Math.max(0, NOTE_CORNER_RADIUS - 1),
    TRACK_CANVAS_COLORS.ghostPlacementBorder,
    2
  );

  ctx.fillStyle = TRACK_CANVAS_COLORS.ghostPlacementLabel;
  ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText(note.pitchStr, noteX + 6, noteY + 16);

  const badgeWidth = 28;
  const badgeHeight = 18;
  const badgeX = noteX + 1;
  const badgeY = noteY + noteH - badgeHeight - 4;
  fillRoundedRect(ctx, badgeX, badgeY, badgeWidth, badgeHeight, 6, TRACK_CANVAS_COLORS.ghostPlacementBadge);

  ctx.save();
  ctx.strokeStyle = TRACK_CANVAS_COLORS.ghostPlacementBadgeText;
  ctx.lineWidth = 1.8;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const stemX = badgeX + 18;
  const topY = badgeY + 4.5;
  const midY = badgeY + 10.5;
  const leftX = badgeX + 8;
  ctx.beginPath();
  ctx.moveTo(stemX, topY);
  ctx.lineTo(stemX, midY);
  ctx.lineTo(leftX, midY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(leftX + 4, midY - 3.5);
  ctx.lineTo(leftX, midY);
  ctx.lineTo(leftX + 4, midY + 3.5);
  ctx.stroke();
  ctx.restore();
}

export function drawTabSelectionPreview(
  ctx: CanvasRenderingContext2D,
  noteRect: TrackCanvasPreviewNoteRect
) {
  strokeRoundedRect(
    ctx,
    noteRect.x + 1,
    noteRect.y + 1,
    Math.max(0, noteRect.w - 2),
    Math.max(0, noteRect.h - 2),
    Math.max(0, NOTE_CORNER_RADIUS - 1),
    TRACK_CANVAS_COLORS.tabSelectionPreviewBorder,
    2
  );

  const badgeWidth = 26;
  const badgeHeight = 18;
  const badgeX = noteRect.x + 1;
  const badgeY = noteRect.y + noteRect.h - badgeHeight - 4;
  fillRoundedRect(ctx, badgeX, badgeY, badgeWidth, badgeHeight, 6, TRACK_CANVAS_COLORS.tabSelectionPreviewBadge);
  ctx.fillStyle = TRACK_CANVAS_COLORS.tabSelectionPreviewBadgeText;
  ctx.font = "bold 10px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText("Tab", badgeX + 5, badgeY + 12);
}

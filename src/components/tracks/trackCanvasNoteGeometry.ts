import { clamp } from "@/lib/numeric";

export const NOTE_CORNER_RADIUS = 5;
export const NOTE_BORDER_INSET = 1;
export const NOTE_BORDER_WIDTH = 2;
export const NOTE_INNER_RADIUS = Math.max(0, NOTE_CORNER_RADIUS - NOTE_BORDER_INSET);
export const NOTE_MIN_WIDTH = 8;
export const NOTE_VERTICAL_INSET = 14;
export const NOTE_LABEL_X_OFFSET = 6;
export const NOTE_LABEL_Y_OFFSET = 16;

const RECT_MAX_RADIUS_RATIO = 0.5;
const NOTE_EDGE_SHADE_DARKEN_FACTOR = 0.24;
const NOTE_HIGHLIGHT_MAX_HEIGHT = 2;
const NOTE_HIGHLIGHT_HEIGHT_RATIO = 0.16;
const NOTE_HIGHLIGHT_ALPHA = 0.18;
const NOTE_EDGE_STROKE_ALPHA = 0.28;
const NOTE_EDGE_STROKE_INSET = 0.5;
const NOTE_EDGE_STROKE_WIDTH = 1;
const HEX_COLOR_CHANNEL_MAX = 255;

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const clampedRadius = clamp(radius, 0, Math.min(width * RECT_MAX_RADIUS_RATIO, height * RECT_MAX_RADIUS_RATIO));
  ctx.beginPath();
  ctx.moveTo(x + clampedRadius, y);
  ctx.lineTo(x + width - clampedRadius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + clampedRadius);
  ctx.lineTo(x + width, y + height - clampedRadius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - clampedRadius, y + height);
  ctx.lineTo(x + clampedRadius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - clampedRadius);
  ctx.lineTo(x, y + clampedRadius);
  ctx.quadraticCurveTo(x, y, x + clampedRadius, y);
  ctx.closePath();
}

function darkenHexColor(color: string, factor: number) {
  const normalized = color.trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(normalized)) {
    return color;
  }

  const channel = (offset: number) => {
    const value = Number.parseInt(normalized.slice(offset, offset + 2), 16);
    const darkened = clamp(Math.round(value * (1 - factor)), 0, HEX_COLOR_CHANNEL_MAX);
    return darkened.toString(16).padStart(2, "0");
  };

  return `#${channel(1)}${channel(3)}${channel(5)}`;
}

export function fillRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fillStyle: string | CanvasGradient
) {
  roundedRectPath(ctx, x, y, width, height, radius);
  ctx.fillStyle = fillStyle;
  ctx.fill();
}

export function strokeRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  strokeStyle: string | CanvasGradient,
  lineWidth: number
) {
  roundedRectPath(ctx, x, y, width, height, radius);
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

export function drawNoteBody(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  fillColor: string
) {
  const radius = Math.min(NOTE_CORNER_RADIUS, width * RECT_MAX_RADIUS_RATIO, height * RECT_MAX_RADIUS_RATIO);
  const edgeShade = darkenHexColor(fillColor, NOTE_EDGE_SHADE_DARKEN_FACTOR);
  const highlightHeight = Math.min(NOTE_HIGHLIGHT_MAX_HEIGHT, height * NOTE_HIGHLIGHT_HEIGHT_RATIO);

  fillRoundedRect(ctx, x, y, width, height, radius, fillColor);

  ctx.save();
  roundedRectPath(ctx, x, y, width, height, radius);
  ctx.clip();

  ctx.globalAlpha = NOTE_HIGHLIGHT_ALPHA;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x, y, width, highlightHeight);
  ctx.globalAlpha = NOTE_EDGE_STROKE_ALPHA;
  ctx.strokeStyle = edgeShade;
  ctx.lineWidth = NOTE_EDGE_STROKE_WIDTH;
  roundedRectPath(
    ctx,
    x + NOTE_EDGE_STROKE_INSET,
    y + NOTE_EDGE_STROKE_INSET,
    Math.max(0, width - NOTE_EDGE_STROKE_WIDTH),
    Math.max(0, height - NOTE_EDGE_STROKE_WIDTH),
    Math.max(0, radius - NOTE_EDGE_STROKE_INSET)
  );
  ctx.stroke();

  ctx.restore();
}

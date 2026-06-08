import { clamp } from "@/lib/numeric";

export const NOTE_CORNER_RADIUS = 8;

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const clampedRadius = clamp(radius, 0, Math.min(width * 0.5, height * 0.5));
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
    const darkened = clamp(Math.round(value * (1 - factor)), 0, 255);
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
  const radius = Math.min(NOTE_CORNER_RADIUS, width * 0.5, height * 0.5);
  const edgeShade = darkenHexColor(fillColor, 0.24);
  const highlightHeight = Math.min(2, height * 0.16);

  fillRoundedRect(ctx, x, y, width, height, radius, fillColor);

  ctx.save();
  roundedRectPath(ctx, x, y, width, height, radius);
  ctx.clip();

  ctx.globalAlpha = 0.18;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x, y, width, highlightHeight);
  ctx.globalAlpha = 0.28;
  ctx.strokeStyle = edgeShade;
  ctx.lineWidth = 1;
  roundedRectPath(ctx, x + 0.5, y + 0.5, Math.max(0, width - 1), Math.max(0, height - 1), Math.max(0, radius - 0.5));
  ctx.stroke();

  ctx.restore();
}

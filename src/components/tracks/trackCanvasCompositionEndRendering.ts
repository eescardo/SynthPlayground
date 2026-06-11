import { HEADER_WIDTH, RULER_HEIGHT, TRACK_CANVAS_COLORS } from "@/components/tracks/trackCanvasConstants";
import { getCompositionEndX } from "@/components/tracks/trackCanvasGeometry";

const COMPOSITION_END_THIN_BAR_WIDTH = 2;
const COMPOSITION_END_THICK_BAR_WIDTH = 4;
const COMPOSITION_END_BAR_GAP_RATIO = 0.5;
const COMPOSITION_END_HOVER_DIFFUSION = 9;
const COMPOSITION_END_GLOW_TRANSPARENT = "rgba(47, 79, 127, 0)";
const COMPOSITION_END_GLOW_COLOR = "rgba(93, 139, 201, 0.2)";
const COMPOSITION_END_GLOW_START_STOP = 0.42;
const COMPOSITION_END_GLOW_END_STOP = 0.6;
const POST_COMPOSITION_FADE = "rgba(4, 11, 16, 0.52)";

export function drawCompositionEndMarker(
  ctx: CanvasRenderingContext2D,
  projectEndBeat: number,
  beatWidth: number,
  height: number,
  active = false
) {
  const projectEndX = getCompositionEndX(projectEndBeat, HEADER_WIDTH, beatWidth);
  const thinWidth = COMPOSITION_END_THIN_BAR_WIDTH;
  const thickWidth = COMPOSITION_END_THICK_BAR_WIDTH;
  const markerGap = thickWidth * COMPOSITION_END_BAR_GAP_RATIO;
  const markerWidth = thinWidth + markerGap + thickWidth;
  ctx.save();
  if (active) {
    const diffusion = COMPOSITION_END_HOVER_DIFFUSION;
    const gradient = ctx.createLinearGradient(projectEndX - diffusion, 0, projectEndX + markerWidth + diffusion, 0);
    gradient.addColorStop(0, COMPOSITION_END_GLOW_TRANSPARENT);
    gradient.addColorStop(COMPOSITION_END_GLOW_START_STOP, COMPOSITION_END_GLOW_COLOR);
    gradient.addColorStop(COMPOSITION_END_GLOW_END_STOP, COMPOSITION_END_GLOW_COLOR);
    gradient.addColorStop(1, COMPOSITION_END_GLOW_TRANSPARENT);
    ctx.fillStyle = gradient;
    ctx.fillRect(projectEndX - diffusion, 0, markerWidth + diffusion * 2, height);
  }
  ctx.fillStyle = TRACK_CANVAS_COLORS.barGrid;
  ctx.fillRect(projectEndX, 0, thinWidth, height);
  ctx.fillRect(projectEndX + thinWidth + markerGap, 0, thickWidth, height);
  ctx.restore();
}

export function drawPostCompositionFade(
  ctx: CanvasRenderingContext2D,
  projectEndBeat: number,
  beatWidth: number,
  height: number,
  width: number
) {
  const projectEndX = getCompositionEndX(projectEndBeat, HEADER_WIDTH, beatWidth);
  if (projectEndX >= width) {
    return;
  }
  ctx.save();
  ctx.fillStyle = POST_COMPOSITION_FADE;
  ctx.fillRect(projectEndX, RULER_HEIGHT, width - projectEndX, height - RULER_HEIGHT);
  ctx.restore();
}

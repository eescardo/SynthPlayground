import { HEADER_WIDTH, RULER_HEIGHT, TRACK_CANVAS_COLORS } from "@/components/tracks/trackCanvasConstants";
import { getCompositionEndX } from "@/components/tracks/trackCanvasGeometry";

export function drawCompositionEndMarker(
  ctx: CanvasRenderingContext2D,
  projectEndBeat: number,
  beatWidth: number,
  height: number,
  active = false
) {
  const projectEndX = getCompositionEndX(projectEndBeat, HEADER_WIDTH, beatWidth);
  const thinWidth = 2;
  const thickWidth = 4;
  const markerGap = thickWidth * 0.5;
  const markerWidth = thinWidth + markerGap + thickWidth;
  ctx.save();
  if (active) {
    const diffusion = 9;
    const gradient = ctx.createLinearGradient(projectEndX - diffusion, 0, projectEndX + markerWidth + diffusion, 0);
    gradient.addColorStop(0, "rgba(47, 79, 127, 0)");
    gradient.addColorStop(0.42, "rgba(93, 139, 201, 0.2)");
    gradient.addColorStop(0.6, "rgba(93, 139, 201, 0.2)");
    gradient.addColorStop(1, "rgba(47, 79, 127, 0)");
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
  ctx.fillStyle = "rgba(4, 11, 16, 0.52)";
  ctx.fillRect(projectEndX, RULER_HEIGHT, width - projectEndX, height - RULER_HEIGHT);
  ctx.restore();
}

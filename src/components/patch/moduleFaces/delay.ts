import {
  clamp,
  clamp01,
  getNumericParam,
  ModuleFaceRenderer,
  PATCH_COLOR_ADSR_GRAPH_BORDER,
  PATCH_COLOR_NODE_SUBTITLE,
  PATCH_MODULE_FACE_BOTTOM_INSET,
  PATCH_MODULE_FACE_INSET_X,
  PATCH_MODULE_FACE_TOP,
  PATCH_NODE_HEIGHT,
  PATCH_NODE_WIDTH,
  setFaceLineWidth
} from "@/components/patch/moduleFaces/shared";

export const drawDelayModuleFace: ModuleFaceRenderer = (ctx, _patch, node, schema, x, y, accentColor) => {
  const graph = {
    x: x + PATCH_MODULE_FACE_INSET_X,
    y: y + PATCH_MODULE_FACE_TOP + 4,
    width: PATCH_NODE_WIDTH - PATCH_MODULE_FACE_INSET_X * 2,
    height: PATCH_NODE_HEIGHT - PATCH_MODULE_FACE_TOP - PATCH_MODULE_FACE_BOTTOM_INSET - 10
  };
  const timeMs = Math.max(1, getNumericParam(node, schema, "timeMs"));
  const feedback = clamp(getNumericParam(node, schema, "feedback"), 0, 0.95);
  const mix = clamp01(getNumericParam(node, schema, "mix"));
  const timeMaxMs = 2000;
  const dryX = graph.x + 10;
  const timelineStartX = dryX;
  const timelineEndX = graph.x + graph.width - 8;
  const echoGap = (timeMs / timeMaxMs) * (timelineEndX - timelineStartX);
  const baseY = graph.y + graph.height - 8;
  const topY = graph.y + 13;
  const barMaxHeight = baseY - topY;
  const barWidth = 3;
  const delayedColor = "rgba(231, 243, 255, 0.64)";
  const visibleEchoThreshold = 0.01;

  ctx.strokeStyle = PATCH_COLOR_ADSR_GRAPH_BORDER;
  setFaceLineWidth(ctx, 1);
  ctx.strokeRect(graph.x, graph.y, graph.width, graph.height);

  ctx.strokeStyle = "rgba(158, 192, 223, 0.28)";
  setFaceLineWidth(ctx, 1);
  ctx.beginPath();
  ctx.moveTo(graph.x + 7, baseY);
  ctx.lineTo(graph.x + graph.width - 7, baseY);
  ctx.stroke();

  if (echoGap >= 6) {
    const measureY = graph.y + 6;
    const firstEchoX = dryX + echoGap;
    ctx.strokeStyle = "rgba(231, 243, 255, 0.26)";
    setFaceLineWidth(ctx, 1);
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(dryX + barWidth / 2, measureY);
    ctx.lineTo(firstEchoX + barWidth / 2, measureY);
    ctx.moveTo(dryX + barWidth / 2, measureY);
    ctx.lineTo(dryX + barWidth / 2, baseY);
    ctx.moveTo(firstEchoX + barWidth / 2, measureY);
    ctx.lineTo(firstEchoX + barWidth / 2, baseY);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  const drawDelayBar = (px: number, amplitude: number, fillStyle: string, alpha: number) => {
    if (amplitude <= 0.001) {
      return;
    }
    const barH = amplitude * barMaxHeight;
    ctx.fillStyle = fillStyle;
    ctx.globalAlpha = alpha;
    ctx.fillRect(px, baseY - barH, barWidth, barH);
    ctx.globalAlpha = 1;
  };

  drawDelayBar(dryX, 1 - mix, accentColor, 0.8);
  const maxEchoesInView = echoGap > 0 ? Math.floor((timelineEndX - dryX) / echoGap) : 0;
  const maxDrawableEchoes = Math.min(maxEchoesInView, 64);
  for (let echo = 1; echo <= maxDrawableEchoes; echo += 1) {
    const px = dryX + echo * echoGap;
    if (px > timelineEndX) {
      break;
    }
    const amp = mix * feedback ** (echo - 1);
    if (amp < visibleEchoThreshold) {
      break;
    }
    drawDelayBar(px, amp, delayedColor, clamp(0.2 + amp * 0.8, 0.2, 0.9));
  }

  ctx.fillStyle = PATCH_COLOR_NODE_SUBTITLE;
  ctx.font = "8px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textAlign = "center";
  ctx.fillText(
    `${Math.round(timeMs)}ms`,
    clamp(dryX + echoGap / 2, graph.x + 18, graph.x + graph.width - 18),
    graph.y - 3
  );
  ctx.textAlign = "left";
};

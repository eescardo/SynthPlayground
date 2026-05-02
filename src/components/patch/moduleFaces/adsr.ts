import {
  clamp,
  clamp01,
  FaceGraph,
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
import { PatchNode, ParamSchema } from "@/types/patch";

function getAdsrParamValues(node: PatchNode, schema: ParamSchema[]) {
  return {
    attack: getNumericParam(node, schema, "attack"),
    decay: getNumericParam(node, schema, "decay"),
    sustain: getNumericParam(node, schema, "sustain"),
    release: getNumericParam(node, schema, "release"),
    curve: getNumericParam(node, schema, "curve")
  };
}

function formatDurationFaceLabel(ms: number): string {
  return `${Math.round(ms)}ms`;
}

function formatAdsrCurveLabel(curve: number): string {
  if (curve < -0.08) {
    return "exp";
  }
  if (curve > 0.08) {
    return "log";
  }
  return "linear";
}

function distributeSegmentWidths(durations: number[], totalWidth: number, minVisibleWidth: number) {
  const visible = durations.map((duration) => duration > 1);
  const visibleCount = visible.filter(Boolean).length;
  if (visibleCount === 0) {
    return durations.map(() => 0);
  }
  const minTotal = Math.min(totalWidth * 0.72, visibleCount * minVisibleWidth);
  const flexibleWidth = Math.max(0, totalWidth - minTotal);
  const totalDuration = durations.reduce((sum, duration) => sum + Math.max(0, duration), 0) || 1;
  return durations.map((duration, index) => {
    if (!visible[index]) {
      return 0;
    }
    return minTotal / visibleCount + flexibleWidth * (duration / totalDuration);
  });
}

function drawAdsrEnvelopePath(
  ctx: CanvasRenderingContext2D,
  values: { attack: number; decay: number; sustain: number; release: number; curve: number },
  graph: FaceGraph
) {
  const attack = Math.max(0, values.attack);
  const decay = Math.max(0, values.decay);
  const sustain = clamp01(values.sustain);
  const release = sustain > 0.025 ? Math.max(0, values.release) : 0;
  const sustainHoldWidth = sustain > 0.025 ? clamp(graph.width * 0.13, 10, 16) : 0;
  const timedWidth = graph.width - sustainHoldWidth;
  const [attackW, decayW, releaseW] = distributeSegmentWidths([attack, decay, release], timedWidth, 11);
  const ax = graph.x + attackW;
  const dx = ax + decayW;
  const sx = dx + sustainHoldWidth;
  const rx = graph.x + graph.width;
  const highY = graph.y + 6;
  const sustainY = graph.y + graph.height - 6 - sustain * (graph.height - 12);
  const baseY = graph.y + graph.height - 4;
  const shape = (t: number) => envelopeCurveProgress(t, values.curve);

  ctx.beginPath();
  ctx.moveTo(graph.x, baseY);
  const drawSegment = (fromX: number, fromY: number, toX: number, toY: number) => {
    const width = Math.max(0, toX - fromX);
    const samples = Math.max(2, Math.ceil(width / 5));
    for (let index = 1; index <= samples; index += 1) {
      const t = index / samples;
      ctx.lineTo(fromX + width * t, fromY + (toY - fromY) * shape(t));
    }
  };
  drawSegment(graph.x, baseY, ax, highY);
  drawSegment(ax, highY, dx, sustainY);
  if (sustainHoldWidth > 0) {
    ctx.lineTo(sx, sustainY);
  }
  drawSegment(sx, sustainY, rx, baseY);
  ctx.stroke();

  return { startX: graph.x, attackX: ax, decayX: dx, sustainX: sx, releaseX: rx, highY, sustainY, baseY, releaseW };
}

export function envelopeCurveProgress(t: number, curve: number) {
  const clampedT = clamp01(t);
  const clampedCurve = clamp(curve, -1, 1);
  if (Math.abs(clampedCurve) < 0.0001) {
    return clampedT;
  }
  const exponent = clampedCurve < 0 ? 1 + clampedCurve * 0.65 : 1 + clampedCurve * 1.8;
  return clampedT ** Math.max(0.35, exponent);
}

export const drawAdsrModuleFace: ModuleFaceRenderer = (ctx, _patch, node, schema, x, y, accentColor) => {
  const graphX = x + PATCH_MODULE_FACE_INSET_X;
  const graphY = y + PATCH_MODULE_FACE_TOP;
  const graphW = PATCH_NODE_WIDTH - PATCH_MODULE_FACE_INSET_X * 2;
  const graphH = PATCH_NODE_HEIGHT - PATCH_MODULE_FACE_TOP - PATCH_MODULE_FACE_BOTTOM_INSET;
  const graph = { x: graphX, y: graphY, width: graphW, height: graphH };
  const currentValues = getAdsrParamValues(node, schema);

  ctx.strokeStyle = PATCH_COLOR_ADSR_GRAPH_BORDER;
  setFaceLineWidth(ctx, 1);
  ctx.strokeRect(graphX, graphY, graphW, graphH);

  const sustain = clamp01(currentValues.sustain);
  const sustainY = graph.y + graph.height - 6 - sustain * (graph.height - 12);
  ctx.strokeStyle = "rgba(158, 192, 223, 0.16)";
  setFaceLineWidth(ctx, 1);
  ctx.beginPath();
  ctx.moveTo(graph.x + 5, sustainY);
  ctx.lineTo(graph.x + graph.width - 5, sustainY);
  ctx.stroke();

  ctx.strokeStyle = accentColor;
  setFaceLineWidth(ctx, 2);
  const points = drawAdsrEnvelopePath(ctx, currentValues, graph);

  ctx.strokeStyle = "rgba(231, 243, 255, 0.22)";
  setFaceLineWidth(ctx, 1);
  ctx.setLineDash([2, 3]);
  const guideBottomY = graph.y + graph.height + 3;
  const guides = [
    { x: points.startX, y: points.baseY },
    { x: points.attackX, y: points.highY },
    { x: points.decayX, y: points.sustainY },
    ...(points.releaseW > 0 ? [{ x: points.sustainX, y: points.sustainY }] : []),
    { x: points.releaseX, y: points.baseY }
  ];
  for (const guide of guides) {
    ctx.beginPath();
    ctx.moveTo(guide.x, Math.max(graph.y + 4, guide.y - 3));
    ctx.lineTo(guide.x, guideBottomY);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  ctx.fillStyle = PATCH_COLOR_NODE_SUBTITLE;
  ctx.font = "8px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textAlign = "center";
  const labelY = graph.y + graph.height + 10;
  const attackLabelX = Math.min(
    clamp((graph.x + points.attackX) / 2, graph.x - 12, graph.x + graph.width - 14),
    points.decayX - 24
  );
  const decayLabelX = clamp((points.attackX + points.decayX) / 2, attackLabelX + 24, graph.x + graph.width - 14);
  ctx.fillText(formatDurationFaceLabel(currentValues.attack), attackLabelX, labelY);
  ctx.fillText(formatDurationFaceLabel(currentValues.decay), decayLabelX, labelY);
  if (points.releaseW > 0 && currentValues.release >= 2) {
    const releaseLabelX = clamp((points.sustainX + points.releaseX) / 2, decayLabelX + 24, graph.x + graph.width - 16);
    ctx.fillText(formatDurationFaceLabel(currentValues.release), releaseLabelX, labelY);
  }
  ctx.fillStyle = accentColor;
  ctx.textAlign = "right";
  ctx.fillText(
    `S ${sustain.toFixed(2)}`,
    graph.x + graph.width - 5,
    clamp(points.sustainY - 4, graph.y + 8, graph.y + graph.height - 3)
  );
  ctx.textAlign = "left";
  ctx.fillText(formatAdsrCurveLabel(currentValues.curve), graph.x, graph.y - 3);
  ctx.textAlign = "left";
};

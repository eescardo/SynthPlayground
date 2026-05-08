import {
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

export const drawKarplusStrongModuleFace: ModuleFaceRenderer = (ctx, _patch, node, schema, x, y, accentColor) => {
  const graph = {
    x: x + PATCH_MODULE_FACE_INSET_X,
    y: y + PATCH_MODULE_FACE_TOP + 4,
    width: PATCH_NODE_WIDTH - PATCH_MODULE_FACE_INSET_X * 2,
    height: PATCH_NODE_HEIGHT - PATCH_MODULE_FACE_TOP - PATCH_MODULE_FACE_BOTTOM_INSET - 10
  };
  const decay = clamp01(getNumericParam(node, schema, "decay"));
  const damping = clamp01(getNumericParam(node, schema, "damping"));
  const brightness = clamp01(getNumericParam(node, schema, "brightness"));
  const excitation = String(node.params.excitation ?? "noise");
  const floorY = graph.y + graph.height - 5;

  ctx.strokeStyle = PATCH_COLOR_ADSR_GRAPH_BORDER;
  setFaceLineWidth(ctx, 1);
  ctx.strokeRect(graph.x, graph.y, graph.width, graph.height);

  ctx.fillStyle = `rgba(255, 214, 145, ${0.06 + brightness * 0.16})`;
  ctx.fillRect(graph.x + 1, graph.y + 1, graph.width - 2, graph.height - 2);

  ctx.strokeStyle = "rgba(158, 192, 223, 0.24)";
  setFaceLineWidth(ctx, 1);
  ctx.beginPath();
  ctx.moveTo(graph.x + 5, floorY);
  ctx.lineTo(graph.x + graph.width - 5, floorY);
  ctx.stroke();

  ctx.strokeStyle = accentColor;
  setFaceLineWidth(ctx, 2);
  ctx.beginPath();
  ctx.moveTo(graph.x + 4, floorY);
  for (let harmonic = 1; harmonic <= 9; harmonic += 1) {
    const t = harmonic / 10;
    const peakX = graph.x + t * graph.width;
    const harmonicDamping = Math.exp(-damping * harmonic * 0.38);
    const peak = clamp01((0.28 + decay * 0.72) * (0.3 + brightness * 0.7) * harmonicDamping);
    const peakY = graph.y + 5 + (1 - peak) * (graph.height - 10);
    const leftX = peakX - graph.width * 0.032;
    const rightX = peakX + graph.width * 0.032;
    ctx.lineTo(leftX, floorY);
    ctx.lineTo(peakX, peakY);
    ctx.lineTo(rightX, floorY);
  }
  ctx.lineTo(graph.x + graph.width - 4, floorY);
  ctx.stroke();

  ctx.fillStyle = PATCH_COLOR_NODE_SUBTITLE;
  ctx.font = "8px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textAlign = "left";
  ctx.fillText(excitation, graph.x, graph.y - 3);
  ctx.textAlign = "right";
  ctx.fillText(`damp ${damping.toFixed(2)}`, graph.x + graph.width, graph.y + graph.height + 10);
  ctx.textAlign = "left";
};

import {
  clamp,
  clamp01,
  getNumericParam,
  ModuleFaceRenderer,
  PATCH_COLOR_ADSR_GRAPH_BORDER,
  PATCH_COLOR_MODULE_FACE_ROW_BG,
  PATCH_COLOR_NODE_SUBTITLE,
  PATCH_MODULE_FACE_BOTTOM_INSET,
  PATCH_MODULE_FACE_INSET_X,
  PATCH_MODULE_FACE_TOP,
  PATCH_NODE_HEIGHT,
  PATCH_NODE_WIDTH,
  setFaceLineWidth
} from "@/components/patch/moduleFaces/shared";

export const drawVcaModuleFace: ModuleFaceRenderer = (ctx, _patch, node, schema, x, y, accentColor) => {
  const graphLeftInset = PATCH_MODULE_FACE_INSET_X + 12;
  const graph = {
    x: x + graphLeftInset,
    y: y + PATCH_MODULE_FACE_TOP + 4,
    width: PATCH_NODE_WIDTH - graphLeftInset - PATCH_MODULE_FACE_INSET_X,
    height: PATCH_NODE_HEIGHT - PATCH_MODULE_FACE_TOP - PATCH_MODULE_FACE_BOTTOM_INSET - 10
  };
  const bias = clamp01(getNumericParam(node, schema, "bias"));
  const gain = clamp01(getNumericParam(node, schema, "gain"));
  const top = clamp01(bias + gain);
  const effectiveGain = top - bias;
  const baseY = graph.y + graph.height;
  const biasY = graph.y + graph.height * (1 - bias);
  const topY = graph.y + graph.height * (1 - top);
  const startX = graph.x + 8;
  const biasX = graph.x + graph.width * 0.25;
  const topX = graph.x + graph.width * 0.75;
  const endX = graph.x + graph.width - 8;

  ctx.strokeStyle = PATCH_COLOR_ADSR_GRAPH_BORDER;
  setFaceLineWidth(ctx, 1);
  ctx.strokeRect(graph.x, graph.y, graph.width, graph.height);

  ctx.fillStyle = "rgba(158, 192, 223, 0.14)";
  ctx.fillRect(graph.x + 1, biasY, graph.width - 2, graph.y + graph.height - biasY - 1);
  ctx.fillStyle = "rgba(158, 192, 223, 0.24)";
  ctx.fillRect(graph.x + 1, topY, graph.width - 2, Math.max(0, biasY - topY));

  ctx.strokeStyle = PATCH_COLOR_MODULE_FACE_ROW_BG;
  setFaceLineWidth(ctx, 1);
  ctx.beginPath();
  ctx.moveTo(graph.x + 5, biasY);
  ctx.lineTo(graph.x + graph.width - 5, biasY);
  ctx.stroke();

  ctx.strokeStyle = accentColor;
  setFaceLineWidth(ctx, 2);
  ctx.beginPath();
  ctx.moveTo(startX, baseY);
  ctx.lineTo(biasX, baseY);
  ctx.lineTo(biasX, biasY);
  ctx.lineTo(topX, biasY);
  ctx.lineTo(topX, topY);
  ctx.lineTo(endX, topY);
  ctx.stroke();

  if (bias + gain > 1) {
    ctx.strokeStyle = "rgba(255, 214, 145, 0.82)";
    setFaceLineWidth(ctx, 1);
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(graph.x + 4, graph.y);
    ctx.lineTo(graph.x + graph.width - 4, graph.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.fillStyle = PATCH_COLOR_NODE_SUBTITLE;
  ctx.font = "8px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textAlign = "right";
  ctx.fillText("1.0", graph.x - 2, graph.y + 7);
  ctx.fillText("0", graph.x - 2, graph.y + graph.height);
  if (effectiveGain >= 0.1) {
    ctx.textAlign = "right";
    ctx.fillText("cv", topX - 4, biasY - (biasY - topY) / 2 + 3);
    ctx.textAlign = "left";
    ctx.fillText("0", topX + 4, biasY + 3);
    ctx.fillText("1", topX + 4, topY + 8);
  }
  ctx.fillStyle = accentColor;
  ctx.textAlign = "right";
  ctx.fillText(bias.toFixed(2), biasX - 4, clamp(biasY - 3, graph.y + 8, graph.y + graph.height - 2));
  ctx.fillText(gain.toFixed(2), topX - 4, clamp(topY - 3, graph.y + 8, graph.y + graph.height - 2));
  ctx.textAlign = "left";
};

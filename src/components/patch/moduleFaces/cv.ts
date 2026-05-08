import {
  clamp,
  clamp01,
  formatSignedValue,
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

function drawCvAxisModuleFace(
  ctx: CanvasRenderingContext2D,
  value: number,
  range: { min: number; max: number },
  label: string,
  x: number,
  y: number,
  accentColor: string
) {
  const faceX = x + PATCH_MODULE_FACE_INSET_X;
  const faceWidth = PATCH_NODE_WIDTH - PATCH_MODULE_FACE_INSET_X * 2;
  const graphWidth = Math.floor(faceWidth * 0.48);
  const graph = {
    x: faceX + 18,
    y: y + PATCH_MODULE_FACE_TOP + 4,
    width: graphWidth - 18,
    height: PATCH_NODE_HEIGHT - PATCH_MODULE_FACE_TOP - PATCH_MODULE_FACE_BOTTOM_INSET - 10
  };
  const labelArea = {
    x: faceX + graphWidth + 10,
    y: graph.y,
    width: faceWidth - graphWidth - 10,
    height: graph.height
  };
  const t = clamp01((clamp(value, range.min, range.max) - range.min) / (range.max - range.min));
  const markerY = graph.y + graph.height * (1 - t);
  const zeroT = clamp01((0 - range.min) / (range.max - range.min));
  const zeroY = graph.y + graph.height * (1 - zeroT);
  const axisX = graph.x + graph.width / 2;

  ctx.strokeStyle = PATCH_COLOR_ADSR_GRAPH_BORDER;
  setFaceLineWidth(ctx, 1);
  ctx.strokeRect(graph.x, graph.y, graph.width, graph.height);
  ctx.strokeStyle = PATCH_COLOR_MODULE_FACE_ROW_BG;
  ctx.beginPath();
  ctx.moveTo(axisX, graph.y + 4);
  ctx.lineTo(axisX, graph.y + graph.height - 4);
  ctx.moveTo(graph.x + 6, zeroY);
  ctx.lineTo(graph.x + graph.width - 6, zeroY);
  ctx.stroke();

  ctx.strokeStyle = accentColor;
  setFaceLineWidth(ctx, 2);
  ctx.beginPath();
  ctx.moveTo(graph.x + 8, markerY);
  ctx.lineTo(graph.x + graph.width - 8, markerY);
  ctx.stroke();

  ctx.fillStyle = PATCH_COLOR_NODE_SUBTITLE;
  ctx.font = "8px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textAlign = "right";
  ctx.fillText(String(range.max), graph.x - 4, graph.y + 6);
  ctx.fillText("0", graph.x - 4, zeroY + 3);
  ctx.fillText(String(range.min), graph.x - 4, graph.y + graph.height);
  ctx.fillStyle = accentColor;
  ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textAlign = "left";
  ctx.fillText(label, labelArea.x, clamp(markerY + 3, labelArea.y + 10, labelArea.y + labelArea.height - 4));
  ctx.textAlign = "left";
}

export const drawCvTransposeModuleFace: ModuleFaceRenderer = (ctx, _patch, node, schema, x, y, accentColor) => {
  const octaves = getNumericParam(node, schema, "octaves");
  const semitones = getNumericParam(node, schema, "semitones");
  const cents = getNumericParam(node, schema, "cents");
  const transposeOctaves = octaves + semitones / 12 + cents / 1200;
  drawCvAxisModuleFace(ctx, transposeOctaves, { min: -4, max: 4 }, `${formatSignedValue(transposeOctaves)} oct`, x, y, accentColor);
};

export const drawCvScalerModuleFace: ModuleFaceRenderer = (ctx, _patch, node, schema, x, y, accentColor) => {
  const scale = getNumericParam(node, schema, "scale");
  drawCvAxisModuleFace(ctx, scale, { min: -2, max: 2 }, `${formatSignedValue(scale)}x`, x, y, accentColor);
};

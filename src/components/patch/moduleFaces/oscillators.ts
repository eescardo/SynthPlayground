import {
  clamp,
  drawWavePath,
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

function resolveWaveValue(wave: string, phase: number, pulseWidth = 0.5) {
  const wrapped = ((phase % 1) + 1) % 1;
  switch (wave) {
    case "sine":
      return Math.sin(wrapped * Math.PI * 2);
    case "triangle":
      return 1 - Math.abs(wrapped * 4 - 2);
    case "square":
      return wrapped < pulseWidth ? 1 : -1;
    default:
      return 1 - wrapped * 2;
  }
}

export const drawVcoModuleFace: ModuleFaceRenderer = (ctx, _patch, node, _schema, x, y, accentColor) => {
  const graph = {
    x: x + PATCH_MODULE_FACE_INSET_X,
    y: y + PATCH_MODULE_FACE_TOP + 4,
    width: PATCH_NODE_WIDTH - PATCH_MODULE_FACE_INSET_X * 2,
    height: PATCH_NODE_HEIGHT - PATCH_MODULE_FACE_TOP - PATCH_MODULE_FACE_BOTTOM_INSET - 8
  };
  const wave = String(node.params.wave ?? "saw");
  const pulseWidth = clamp(typeof node.params.pulseWidth === "number" ? node.params.pulseWidth : 0.5, 0.05, 0.95);
  const points = Array.from({ length: 48 }, (_, index) => {
    const phase = (index / 47 + 0.25) % 1;
    return resolveWaveValue(wave, phase, pulseWidth);
  });
  ctx.strokeStyle = PATCH_COLOR_ADSR_GRAPH_BORDER;
  setFaceLineWidth(ctx, 1);
  ctx.strokeRect(graph.x, graph.y, graph.width, graph.height);
  ctx.strokeStyle = accentColor;
  setFaceLineWidth(ctx, 2);
  drawWavePath(ctx, points, graph);
};

export const drawLfoModuleFace: ModuleFaceRenderer = (ctx, _patch, node, schema, x, y, accentColor) => {
  const graph = {
    x: x + PATCH_MODULE_FACE_INSET_X,
    y: y + PATCH_MODULE_FACE_TOP + 4,
    width: PATCH_NODE_WIDTH - PATCH_MODULE_FACE_INSET_X * 2,
    height: PATCH_NODE_HEIGHT - PATCH_MODULE_FACE_TOP - PATCH_MODULE_FACE_BOTTOM_INSET - 10
  };
  const wave = String(node.params.wave ?? "sine");
  const frequency = Math.max(0.01, getNumericParam(node, schema, "freqHz"));
  const pulseWidth = clamp(typeof node.params.pulseWidth === "number" ? node.params.pulseWidth : 0.5, 0.05, 0.95);
  const bipolar = node.params.bipolar !== false;
  const literalCycles = frequency <= 10;
  const cycles = literalCycles ? clamp(frequency, 0.2, 10) : 12;
  const points = Array.from({ length: 144 }, (_, index) => {
    const phase = (index / 143) * cycles + 0.25;
    const value = resolveWaveValue(wave, phase, pulseWidth);
    return bipolar ? value : value * 0.5 + 0.5;
  });

  ctx.strokeStyle = PATCH_COLOR_ADSR_GRAPH_BORDER;
  setFaceLineWidth(ctx, 1);
  ctx.strokeRect(graph.x, graph.y, graph.width, graph.height);

  const zeroY = bipolar ? graph.y + graph.height / 2 : graph.y + graph.height - 5;
  ctx.strokeStyle = PATCH_COLOR_MODULE_FACE_ROW_BG;
  setFaceLineWidth(ctx, 1);
  ctx.beginPath();
  ctx.moveTo(graph.x + 5, zeroY);
  ctx.lineTo(graph.x + graph.width - 5, zeroY);
  ctx.stroke();

  if (!literalCycles) {
    ctx.fillStyle = "rgba(158, 192, 223, 0.12)";
    for (let index = 0; index < 12; index += 1) {
      const stripeX = graph.x + 5 + (index / 12) * (graph.width - 10);
      ctx.fillRect(stripeX, graph.y + 5, 1, graph.height - 10);
    }
  }

  ctx.strokeStyle = accentColor;
  setFaceLineWidth(ctx, 1.4);
  drawWavePath(ctx, points, graph);

  ctx.fillStyle = PATCH_COLOR_NODE_SUBTITLE;
  ctx.font = "8px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textAlign = "left";
  ctx.fillText(wave, graph.x, graph.y - 3);
  ctx.textAlign = "right";
  const frequencyLabel =
    frequency <= 10 ? `${frequency.toFixed(frequency < 1 ? 2 : 1)}Hz` : `${Math.round(frequency)}Hz fast`;
  ctx.fillText(frequencyLabel, graph.x + graph.width, graph.y + graph.height + 10);
  ctx.textAlign = "left";
};

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

export const drawNoiseModuleFace: ModuleFaceRenderer = (ctx, _patch, node, schema, x, y, accentColor) => {
  const graph = {
    x: x + PATCH_MODULE_FACE_INSET_X,
    y: y + PATCH_MODULE_FACE_TOP + 4,
    width: PATCH_NODE_WIDTH - PATCH_MODULE_FACE_INSET_X * 2,
    height: PATCH_NODE_HEIGHT - PATCH_MODULE_FACE_TOP - PATCH_MODULE_FACE_BOTTOM_INSET - 10
  };
  const color = String(node.params.color ?? "white");
  const gain = clamp01(getNumericParam(node, schema, "gain"));
  const slope = color === "brown" ? 1 : color === "pink" ? 0.55 : 0;
  const levelToY = (level: number) => graph.y + graph.height * (1 - clamp01(level));

  ctx.strokeStyle = PATCH_COLOR_ADSR_GRAPH_BORDER;
  setFaceLineWidth(ctx, 1);
  ctx.strokeRect(graph.x, graph.y, graph.width, graph.height);

  ctx.strokeStyle = "rgba(158, 192, 223, 0.14)";
  setFaceLineWidth(ctx, 1);
  ctx.beginPath();
  ctx.moveTo(graph.x + 5, graph.y + graph.height - 5);
  ctx.lineTo(graph.x + graph.width - 5, graph.y + graph.height - 5);
  ctx.moveTo(graph.x + 5, graph.y + 5);
  ctx.lineTo(graph.x + 5, graph.y + graph.height - 5);
  ctx.stroke();

  ctx.fillStyle = "rgba(158, 192, 223, 0.10)";
  ctx.fillRect(graph.x + 1, levelToY(gain), graph.width - 2, graph.y + graph.height - levelToY(gain) - 1);

  ctx.strokeStyle = accentColor;
  setFaceLineWidth(ctx, 2);
  ctx.beginPath();
  for (let index = 0; index <= 80; index += 1) {
    const t = index / 80;
    const spectrumLevel = gain * (1 - slope * t);
    const px = graph.x + t * graph.width;
    const py = levelToY(spectrumLevel);
    if (index === 0) {
      ctx.moveTo(px, py);
    } else {
      ctx.lineTo(px, py);
    }
  }
  ctx.stroke();

  ctx.strokeStyle = "rgba(231, 243, 255, 0.20)";
  setFaceLineWidth(ctx, 1);
  ctx.beginPath();
  for (let index = 0; index < 42; index += 1) {
    const t = index / 41;
    const hash = Math.sin((index + 1) * 12.9898) * 43758.5453;
    const random = hash - Math.floor(hash);
    const amp = gain * (1 - slope * t);
    const px = graph.x + t * graph.width;
    const py = graph.y + graph.height / 2 - (random * 2 - 1) * amp * graph.height * 0.24;
    if (index === 0) {
      ctx.moveTo(px, py);
    } else {
      ctx.lineTo(px, py);
    }
  }
  ctx.stroke();

  ctx.fillStyle = PATCH_COLOR_NODE_SUBTITLE;
  ctx.font = "8px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textAlign = "left";
  ctx.fillText(color, graph.x, graph.y - 3);
  ctx.fillText("low", graph.x, graph.y + graph.height + 10);
  ctx.textAlign = "right";
  ctx.fillText("high freq", graph.x + graph.width, graph.y + graph.height + 10);
  ctx.fillText(`gain ${gain.toFixed(2)}`, graph.x + graph.width - 6, graph.y + graph.height - 5);
  ctx.textAlign = "left";
};

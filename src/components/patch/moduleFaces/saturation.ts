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

function softclipTransfer(value: number) {
  const clipped = clamp(value, -1.5, 1.5);
  return clipped - (clipped * clipped * clipped) / 3;
}

export const drawSaturationModuleFace: ModuleFaceRenderer = (ctx, _patch, node, schema, x, y, accentColor) => {
  const graph = {
    x: x + PATCH_MODULE_FACE_INSET_X,
    y: y + PATCH_MODULE_FACE_TOP + 4,
    width: PATCH_NODE_WIDTH - PATCH_MODULE_FACE_INSET_X * 2,
    height: PATCH_NODE_HEIGHT - PATCH_MODULE_FACE_TOP - PATCH_MODULE_FACE_BOTTOM_INSET - 10
  };
  const driveDb = getNumericParam(node, schema, "driveDb");
  const drive = 10 ** (driveDb / 20);
  const mix = clamp01(getNumericParam(node, schema, "mix"));
  const type = String(node.params.type ?? "tanh");
  const resolveOutput = (input: number) => {
    const driven = input * drive;
    const wet = type === "softclip" ? softclipTransfer(driven) : Math.tanh(driven);
    return clamp(input * (1 - mix) + wet * mix, -1, 1);
  };

  ctx.strokeStyle = PATCH_COLOR_ADSR_GRAPH_BORDER;
  setFaceLineWidth(ctx, 1);
  ctx.strokeRect(graph.x, graph.y, graph.width, graph.height);

  const centerX = graph.x + graph.width / 2;
  const centerY = graph.y + graph.height / 2;
  ctx.strokeStyle = PATCH_COLOR_MODULE_FACE_ROW_BG;
  setFaceLineWidth(ctx, 1);
  ctx.beginPath();
  ctx.moveTo(centerX, graph.y + 4);
  ctx.lineTo(centerX, graph.y + graph.height - 4);
  ctx.moveTo(graph.x + 4, centerY);
  ctx.lineTo(graph.x + graph.width - 4, centerY);
  ctx.stroke();

  ctx.strokeStyle = "rgba(158, 192, 223, 0.38)";
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(graph.x + 5, graph.y + graph.height - 5);
  ctx.lineTo(graph.x + graph.width - 5, graph.y + 5);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.strokeStyle = accentColor;
  setFaceLineWidth(ctx, 2);
  ctx.beginPath();
  for (let index = 0; index <= 48; index += 1) {
    const t = index / 48;
    const input = t * 2 - 1;
    const output = resolveOutput(input);
    const px = graph.x + t * graph.width;
    const py = graph.y + graph.height * (1 - (output + 1) / 2);
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
  ctx.fillText("-in", graph.x, graph.y + graph.height + 10);
  ctx.textAlign = "right";
  ctx.fillText("+in", graph.x + graph.width, graph.y + graph.height + 10);
  ctx.fillStyle = accentColor;
  ctx.textAlign = "left";
  ctx.fillText(`${type}`, graph.x + 6, graph.y + 11);
  ctx.textAlign = "right";
  ctx.fillText(`${driveDb.toFixed(0)}dB ${Math.round(mix * 100)}%`, graph.x + graph.width - 6, graph.y + graph.height - 5);
  ctx.textAlign = "left";
};

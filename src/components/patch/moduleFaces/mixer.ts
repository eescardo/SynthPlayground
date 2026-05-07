import {
  clamp01,
  getNumericParam,
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
import { PatchNode, ParamSchema } from "@/types/patch";

export function drawMixerModuleFace(
  ctx: CanvasRenderingContext2D,
  node: PatchNode,
  schema: ParamSchema[],
  x: number,
  y: number,
  accentColor: string,
  inputCount: number,
  connectedInputPortIds: Set<string>
) {
  const graphX = x + PATCH_MODULE_FACE_INSET_X;
  const graphY = y + PATCH_MODULE_FACE_TOP + 4;
  const graphW = PATCH_NODE_WIDTH - PATCH_MODULE_FACE_INSET_X * 2;
  const graphH = PATCH_NODE_HEIGHT - PATCH_MODULE_FACE_TOP - PATCH_MODULE_FACE_BOTTOM_INSET - 10;
  const barTopInset = 6;
  const barBottomInset = 6;
  const barGap = 3;
  const sideInset = 8;
  const barWidth = (graphW - sideInset * 2 - barGap * (inputCount - 1)) / inputCount;
  ctx.strokeStyle = PATCH_COLOR_ADSR_GRAPH_BORDER;
  setFaceLineWidth(ctx, 1);
  ctx.strokeRect(graphX, graphY, graphW, graphH);
  ctx.font = "9px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textAlign = "center";
  for (let index = 0; index < inputCount; index += 1) {
    const inputPortId = `in${index + 1}`;
    const connected = connectedInputPortIds.has(inputPortId);
    const value = clamp01(getNumericParam(node, schema, `gain${index + 1}`));
    const barX = graphX + sideInset + index * (barWidth + barGap);
    const barAvailableH = graphH - barTopInset - barBottomInset;
    const barH = Math.max(4, value * barAvailableH);
    ctx.fillStyle = connected ? PATCH_COLOR_MODULE_FACE_ROW_BG : "rgba(158, 192, 223, 0.12)";
    ctx.fillRect(barX, graphY + barTopInset, barWidth, barAvailableH);
    ctx.fillStyle = connected ? accentColor : "rgba(158, 192, 223, 0.22)";
    ctx.fillRect(barX, graphY + graphH - barBottomInset - barH, barWidth, barH);
    if (!connected) {
      ctx.strokeStyle = "rgba(231, 243, 255, 0.16)";
      setFaceLineWidth(ctx, 1);
      ctx.beginPath();
      ctx.moveTo(barX + 2, graphY + graphH - barBottomInset - 2);
      ctx.lineTo(barX + barWidth - 2, graphY + barTopInset + 2);
      ctx.stroke();
    }
    ctx.fillStyle = connected ? PATCH_COLOR_NODE_SUBTITLE : "rgba(140, 179, 213, 0.42)";
    ctx.fillText(String(index + 1), barX + barWidth / 2, graphY + graphH + 10);
  }
  ctx.textAlign = "left";
}

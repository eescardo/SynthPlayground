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
import { VCF_FACE_NYQUIST_HZ, VCF_FACE_SAMPLE_RATE_HZ } from "@/components/patch/moduleFaces/vcf";

export function overdriveDriveAmount(driveDb: number) {
  return clamp(driveDb / 50, 0, 1);
}

export function overdriveToneAlpha(tone: number) {
  const t = clamp01(tone);
  return clamp(0.012 + t * t * 0.9, 0.012, 0.92);
}

function overdriveToneMakeup(tone: number) {
  return 1 + (1 - clamp01(tone)) ** 1.35 * 2.1;
}

export function applyOverdriveTone(input: number, lowpassed: number, tone: number) {
  const t = clamp01(tone);
  const darker = Math.tanh(lowpassed * overdriveToneMakeup(t));
  return input * t + darker * (1 - t);
}

function overdriveToneLowpassMagnitude(tone: number, frequencyHz: number) {
  const alpha = overdriveToneAlpha(tone);
  const omega = (2 * Math.PI * clamp(frequencyHz, 0, VCF_FACE_NYQUIST_HZ)) / VCF_FACE_SAMPLE_RATE_HZ;
  const feedback = 1 - alpha;
  const denominator = Math.sqrt(1 + feedback * feedback - 2 * feedback * Math.cos(omega));
  return denominator > 0 ? alpha / denominator : 1;
}

const OVERDRIVE_TONE_RESPONSE_MAX = 1.45;

function overdriveToneResponseToY(graph: { y: number; height: number }, response: number) {
  return graph.y + graph.height * (1 - clamp(response, 0, OVERDRIVE_TONE_RESPONSE_MAX) / OVERDRIVE_TONE_RESPONSE_MAX);
}

export function overdriveToneResponse(tone: number, driveDb: number, frequencyHz: number) {
  const t = clamp01(tone);
  const driveAmount = overdriveDriveAmount(driveDb);
  const wetResponse = t + (1 - t) * overdriveToneLowpassMagnitude(t, frequencyHz) * overdriveToneMakeup(t);
  return 1 - driveAmount + driveAmount * wetResponse;
}

export function overdriveWetShape(input: number, driveDb: number, mode: string) {
  const gain = 10 ** (driveDb / 20);
  const driven = input * gain;
  if (mode !== "fuzz") {
    return Math.tanh(driven);
  }
  const pushed = driven * 3.2;
  const clipped = pushed >= 0 ? clamp(pushed, 0, 0.45) / 0.45 : clamp(pushed, -0.28, 0) / 0.28;
  const squared = Math.sign(clipped) * Math.abs(clipped) ** 0.42;
  const asymmetric = squared >= 0 ? squared * 0.88 : squared * 1.08;
  return clamp(asymmetric + asymmetric ** 3 * 0.12, -1, 1);
}

export function overdriveTransfer(input: number, driveDb: number, tone: number, mode: string) {
  const driveAmount = overdriveDriveAmount(driveDb);
  const wet = overdriveWetShape(input, driveDb, mode);
  const toned = applyOverdriveTone(wet, wet, tone);
  return clamp(input * (1 - driveAmount) + toned * driveAmount, -1, 1);
}

export const drawOverdriveModuleFace: ModuleFaceRenderer = (ctx, _patch, node, schema, x, y, accentColor) => {
  const graph = {
    x: x + PATCH_MODULE_FACE_INSET_X,
    y: y + PATCH_MODULE_FACE_TOP + 4,
    width: PATCH_NODE_WIDTH - PATCH_MODULE_FACE_INSET_X * 2,
    height: PATCH_NODE_HEIGHT - PATCH_MODULE_FACE_TOP - PATCH_MODULE_FACE_BOTTOM_INSET - 10
  };
  const transferGraph = {
    x: graph.x,
    y: graph.y,
    width: (graph.width - 8) / 2,
    height: graph.height
  };
  const toneGraph = {
    x: transferGraph.x + transferGraph.width + 8,
    y: graph.y,
    width: (graph.width - 8) / 2,
    height: graph.height
  };
  const driveDb = getNumericParam(node, schema, "driveDb");
  const tone = clamp01(getNumericParam(node, schema, "tone"));
  const mode = String(node.params.mode ?? "overdrive");

  ctx.strokeStyle = PATCH_COLOR_ADSR_GRAPH_BORDER;
  setFaceLineWidth(ctx, 1);
  ctx.strokeRect(transferGraph.x, transferGraph.y, transferGraph.width, transferGraph.height);
  ctx.strokeRect(toneGraph.x, toneGraph.y, toneGraph.width, toneGraph.height);

  ctx.strokeStyle = PATCH_COLOR_MODULE_FACE_ROW_BG;
  setFaceLineWidth(ctx, 1);
  ctx.beginPath();
  ctx.moveTo(transferGraph.x + 4, transferGraph.y + transferGraph.height - 5);
  ctx.lineTo(transferGraph.x + transferGraph.width - 4, transferGraph.y + transferGraph.height - 5);
  ctx.moveTo(transferGraph.x + 5, transferGraph.y + 4);
  ctx.lineTo(transferGraph.x + 5, transferGraph.y + transferGraph.height - 4);
  ctx.stroke();

  ctx.strokeStyle = "rgba(158, 192, 223, 0.34)";
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(transferGraph.x + 5, transferGraph.y + transferGraph.height - 5);
  ctx.lineTo(transferGraph.x + transferGraph.width - 5, transferGraph.y + 5);
  const toneUnityY = overdriveToneResponseToY(toneGraph, 1);
  ctx.moveTo(toneGraph.x + 5, toneUnityY);
  ctx.lineTo(toneGraph.x + toneGraph.width - 5, toneUnityY);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.strokeStyle = "rgba(255, 214, 145, 0.82)";
  setFaceLineWidth(ctx, 1.5);
  ctx.beginPath();
  for (let index = 0; index <= 48; index += 1) {
    const ratio = index / 48;
    const frequency = 60 * (12000 / 60) ** ratio;
    const response = overdriveToneResponse(tone, driveDb, frequency);
    const px = toneGraph.x + ratio * toneGraph.width;
    const py = overdriveToneResponseToY(toneGraph, response);
    if (index === 0) {
      ctx.moveTo(px, py);
    } else {
      ctx.lineTo(px, py);
    }
  }
  ctx.stroke();

  ctx.strokeStyle = accentColor;
  setFaceLineWidth(ctx, 2);
  ctx.beginPath();
  for (let index = 0; index <= 64; index += 1) {
    const t = index / 64;
    const input = t;
    const output = overdriveTransfer(input, driveDb, 1, mode);
    const px = transferGraph.x + t * transferGraph.width;
    const py = transferGraph.y + transferGraph.height * (1 - clamp01(output));
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
  ctx.fillText(mode, graph.x, graph.y - 3);
  ctx.fillText("drive", transferGraph.x, graph.y + graph.height + 10);
  ctx.fillText("tone", toneGraph.x, graph.y + graph.height + 10);
  ctx.textAlign = "right";
  ctx.fillText("+in", transferGraph.x + transferGraph.width, graph.y + graph.height + 10);
  ctx.fillText("high", toneGraph.x + toneGraph.width, graph.y + graph.height + 10);
  ctx.textAlign = "left";
};

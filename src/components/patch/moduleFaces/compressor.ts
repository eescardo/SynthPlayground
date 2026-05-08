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
import { compressorDerivedParamsForSquash, compressorGainReductionDb } from "@/lib/patch/compressor";
import { PatchNode, ParamSchema } from "@/types/patch";

export function compressorOutputDb(inputDb: number, thresholdDb: number, ratio: number, makeupDb: number, mix: number) {
  const reductionDb = compressorGainReductionDb(inputDb, thresholdDb, ratio);
  const dynamicMakeupDb = Math.min(makeupDb, reductionDb);
  const wet = inputDb - reductionDb + dynamicMakeupDb;
  return compressorMixOutputDb(inputDb, wet, mix);
}

export function compressorCompressedOutputDb(inputDb: number, thresholdDb: number, ratio: number) {
  return inputDb - compressorGainReductionDb(inputDb, thresholdDb, ratio);
}

function compressorMixOutputDb(inputDb: number, wetDb: number, mix: number) {
  const wetMix = clamp01(mix);
  const dryGain = 10 ** (inputDb / 20);
  const wetGain = 10 ** (wetDb / 20);
  return 20 * Math.log10(Math.max(0.00001, dryGain * (1 - wetMix) + wetGain * wetMix));
}

function drawCompressorCompactModuleFace(
  ctx: CanvasRenderingContext2D,
  node: PatchNode,
  schema: ParamSchema[],
  x: number,
  y: number,
  accentColor: string
) {
  const graphLeftInset = PATCH_MODULE_FACE_INSET_X + 18;
  const graph = {
    x: x + graphLeftInset,
    y: y + PATCH_MODULE_FACE_TOP + 4,
    width: PATCH_NODE_WIDTH - graphLeftInset - PATCH_MODULE_FACE_INSET_X,
    height: PATCH_NODE_HEIGHT - PATCH_MODULE_FACE_TOP - PATCH_MODULE_FACE_BOTTOM_INSET - 10
  };
  const derived = compressorDerivedParamsForSquash(
    getNumericParam(node, schema, "squash"),
    getNumericParam(node, schema, "attackMs")
  );
  const thresholdDb = derived.thresholdDb;
  const ratio = derived.ratio;
  const makeupDb = derived.autoGainDb;
  const mix = clamp01(getNumericParam(node, schema, "mix"));
  const minDb = -60;
  const maxDb = 6;
  const dbToX = (db: number) => graph.x + ((clamp(db, minDb, maxDb) - minDb) / (maxDb - minDb)) * graph.width;
  const dbToY = (db: number) => graph.y + graph.height * (1 - (clamp(db, minDb, maxDb) - minDb) / (maxDb - minDb));

  ctx.strokeStyle = PATCH_COLOR_ADSR_GRAPH_BORDER;
  setFaceLineWidth(ctx, 1);
  ctx.strokeRect(graph.x, graph.y, graph.width, graph.height);

  ctx.strokeStyle = "rgba(158, 192, 223, 0.34)";
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(dbToX(minDb), dbToY(minDb));
  ctx.lineTo(dbToX(maxDb), dbToY(maxDb));
  ctx.stroke();
  ctx.setLineDash([]);

  const thresholdX = dbToX(thresholdDb);
  ctx.strokeStyle = "rgba(255, 214, 145, 0.52)";
  setFaceLineWidth(ctx, 1);
  ctx.beginPath();
  ctx.moveTo(thresholdX, graph.y + 4);
  ctx.lineTo(thresholdX, graph.y + graph.height - 4);
  ctx.stroke();

  ctx.strokeStyle = accentColor;
  setFaceLineWidth(ctx, 2);
  ctx.globalAlpha = 0.36;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  for (let index = 0; index <= 80; index += 1) {
    const t = index / 80;
    const inputDb = minDb + t * (maxDb - minDb);
    const outputDb = compressorMixOutputDb(inputDb, compressorCompressedOutputDb(inputDb, thresholdDb, ratio), mix);
    const px = dbToX(inputDb);
    const py = dbToY(outputDb);
    if (index === 0) {
      ctx.moveTo(px, py);
    } else {
      ctx.lineTo(px, py);
    }
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  ctx.beginPath();
  for (let index = 0; index <= 80; index += 1) {
    const t = index / 80;
    const inputDb = minDb + t * (maxDb - minDb);
    const outputDb = compressorOutputDb(inputDb, thresholdDb, ratio, makeupDb, mix);
    const px = dbToX(inputDb);
    const py = dbToY(outputDb);
    if (index === 0) {
      ctx.moveTo(px, py);
    } else {
      ctx.lineTo(px, py);
    }
  }
  ctx.stroke();

  ctx.fillStyle = PATCH_COLOR_NODE_SUBTITLE;
  ctx.font = "8px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textAlign = "right";
  ctx.fillText("0", graph.x - 3, dbToY(0) + 3);
  ctx.fillText("-60", graph.x - 3, graph.y + graph.height);
  const thresholdRatio = (clamp(thresholdDb, minDb, maxDb) - minDb) / (maxDb - minDb);
  const thresholdLabelRight = thresholdRatio <= 0.25;
  ctx.textAlign = thresholdLabelRight ? "left" : "right";
  ctx.fillText(`${Math.round(thresholdDb)}dB`, thresholdX + (thresholdLabelRight ? 4 : -4), graph.y + 11);
  ctx.textAlign = "right";
  ctx.fillText(`${ratio.toFixed(ratio >= 10 ? 0 : 1)}:1 max +${makeupDb.toFixed(0)}`, graph.x + graph.width - 6, graph.y + graph.height - 5);
  ctx.textAlign = "left";
  ctx.fillText("raw", graph.x + 4, graph.y + graph.height - 5);
}

function drawCompressorExpandedModuleFace(
  ctx: CanvasRenderingContext2D,
  node: PatchNode,
  schema: ParamSchema[],
  x: number,
  y: number,
  accentColor: string
) {
  const graphMargin = 5;
  const graphLabelGutter = 23;
  const graphX = x + graphMargin + graphLabelGutter;
  const graphW = PATCH_NODE_WIDTH - graphMargin * 2 - graphLabelGutter;
  const transferGraph = {
    x: graphX,
    y: y + PATCH_MODULE_FACE_TOP - 11,
    width: graphW,
    height: 37
  };
  const attackGraph = {
    x: graphX,
    y: y + PATCH_MODULE_FACE_TOP + 40,
    width: graphW,
    height: 32
  };
  const attackMs = getNumericParam(node, schema, "attackMs");
  const derived = compressorDerivedParamsForSquash(getNumericParam(node, schema, "squash"), attackMs);
  const thresholdDb = derived.thresholdDb;
  const ratio = derived.ratio;
  const makeupDb = derived.autoGainDb;
  const mix = clamp01(getNumericParam(node, schema, "mix"));
  const minDb = -60;
  const maxDb = 6;
  const dbToX = (db: number) => transferGraph.x + ((clamp(db, minDb, maxDb) - minDb) / (maxDb - minDb)) * transferGraph.width;
  const dbToY = (db: number) => transferGraph.y + transferGraph.height * (1 - (clamp(db, minDb, maxDb) - minDb) / (maxDb - minDb));

  ctx.strokeStyle = PATCH_COLOR_ADSR_GRAPH_BORDER;
  setFaceLineWidth(ctx, 1);
  ctx.strokeRect(transferGraph.x, transferGraph.y, transferGraph.width, transferGraph.height);

  ctx.strokeStyle = "rgba(158, 192, 223, 0.34)";
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(dbToX(minDb), dbToY(minDb));
  ctx.lineTo(dbToX(maxDb), dbToY(maxDb));
  ctx.stroke();

  const thresholdX = dbToX(thresholdDb);
  ctx.strokeStyle = "rgba(255, 214, 145, 0.58)";
  ctx.beginPath();
  ctx.moveTo(thresholdX, transferGraph.y + 3);
  ctx.lineTo(thresholdX, transferGraph.y + transferGraph.height - 3);
  ctx.stroke();

  ctx.strokeStyle = accentColor;
  ctx.globalAlpha = 0.4;
  ctx.beginPath();
  for (let index = 0; index <= 90; index += 1) {
    const t = index / 90;
    const inputDb = minDb + t * (maxDb - minDb);
    const outputDb = compressorMixOutputDb(inputDb, compressorCompressedOutputDb(inputDb, thresholdDb, ratio), mix);
    const px = dbToX(inputDb);
    const py = dbToY(outputDb);
    if (index === 0) {
      ctx.moveTo(px, py);
    } else {
      ctx.lineTo(px, py);
    }
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  ctx.strokeStyle = accentColor;
  setFaceLineWidth(ctx, 2);
  ctx.beginPath();
  for (let index = 0; index <= 90; index += 1) {
    const t = index / 90;
    const inputDb = minDb + t * (maxDb - minDb);
    const outputDb = compressorOutputDb(inputDb, thresholdDb, ratio, makeupDb, mix);
    const px = dbToX(inputDb);
    const py = dbToY(outputDb);
    if (index === 0) {
      ctx.moveTo(px, py);
    } else {
      ctx.lineTo(px, py);
    }
  }
  ctx.stroke();

  ctx.fillStyle = PATCH_COLOR_NODE_SUBTITLE;
  ctx.font = "7px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textAlign = "right";
  ctx.fillText("0", transferGraph.x - 3, dbToY(0) + 2);
  ctx.fillText("-60", transferGraph.x - 3, transferGraph.y + transferGraph.height);
  ctx.fillText(`TRANSFER: ${ratio.toFixed(1)} ratio`, transferGraph.x + transferGraph.width, transferGraph.y - 2);
  const thresholdRatio = (clamp(thresholdDb, minDb, maxDb) - minDb) / (maxDb - minDb);
  const thresholdLabelRight = thresholdRatio <= 0.25;
  ctx.textAlign = thresholdLabelRight ? "left" : "right";
  ctx.fillText(`${Math.round(thresholdDb)}dB`, thresholdX + (thresholdLabelRight ? 3 : -3), transferGraph.y + 9);

  ctx.strokeStyle = PATCH_COLOR_ADSR_GRAPH_BORDER;
  setFaceLineWidth(ctx, 1);
  ctx.strokeRect(attackGraph.x, attackGraph.y, attackGraph.width, attackGraph.height);
  const envToX = (index: number, count: number) => attackGraph.x + (index / count) * attackGraph.width;
  const envToY = (value: number) => attackGraph.y + attackGraph.height * (1 - clamp01(value));
  const totalMs = 700;
  const steps = 96;
  const dtMs = totalMs / steps;
  let detector = 0.28;
  const inputEnvelopeAt = (timeMs: number) => {
    const base = timeMs < 25 ? 0.26 + 0.3 * (timeMs / 25) : 0.56;
    const firstTransient = 0.54 * Math.exp(-0.5 * Math.pow((timeMs - 34) / 7, 2));
    const secondPeak = 0.29 * Math.exp(-0.5 * Math.pow((timeMs - 190) / 55, 2));
    const settleLift = 0.05 * (1 - Math.exp(-timeMs / 280));
    return clamp01(base + firstTransient + secondPeak + settleLift);
  };

  ctx.strokeStyle = "rgba(158, 192, 223, 0.52)";
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  for (let index = 0; index <= steps; index += 1) {
    const input = inputEnvelopeAt(index * dtMs);
    const px = envToX(index, steps);
    const py = envToY(input);
    if (index === 0) {
      ctx.moveTo(px, py);
    } else {
      ctx.lineTo(px, py);
    }
  }
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.strokeStyle = accentColor;
  setFaceLineWidth(ctx, 2);
  ctx.beginPath();
  const envelopeMinDb = -52;
  const envelopeMaxDb = -5;
  const envelopeToDb = (value: number) => envelopeMinDb + clamp01(value) * (envelopeMaxDb - envelopeMinDb);
  const dbToEnvelope = (db: number) => (clamp(db, envelopeMinDb, envelopeMaxDb) - envelopeMinDb) / (envelopeMaxDb - envelopeMinDb);
  const onePole = (current: number, target: number, timeMs: number) => current + (target - current) * (1 - Math.exp(-dtMs / Math.max(1, timeMs)));
  const dbToGain = (db: number) => 10 ** (db / 20);
  const gainToDb = (gain: number) => 20 * Math.log10(Math.max(0.00001, gain));
  let gainReductionDb = 0;
  let makeupGainDb = 0;
  const rawOutputPoints: Array<{ x: number; y: number }> = [];
  const compensatedOutputPoints: Array<{ x: number; y: number }> = [];
  for (let index = 0; index <= steps; index += 1) {
    const input = inputEnvelopeAt(index * dtMs);
    const tauMs = input > detector ? Math.max(1, attackMs) : Math.max(1, derived.releaseMs);
    const alpha = Math.exp(-dtMs / tauMs);
    detector = detector + (input - detector) * (1 - alpha);
    const inputDb = envelopeToDb(input);
    const detectorDb = envelopeToDb(detector);
    const targetReductionDb = compressorGainReductionDb(detectorDb, thresholdDb, ratio);
    const reductionTimeMs = targetReductionDb > gainReductionDb ? Math.max(8, attackMs) * 0.35 : 35;
    gainReductionDb = onePole(gainReductionDb, targetReductionDb, reductionTimeMs);
    const targetMakeupDb = Math.min(makeupDb, gainReductionDb);
    makeupGainDb = onePole(makeupGainDb, targetMakeupDb, targetMakeupDb > makeupGainDb ? 90 : 45);
    const wetDb = inputDb + makeupGainDb - gainReductionDb;
    const outputDb = gainToDb(dbToGain(inputDb) * (1 - mix) + dbToGain(wetDb) * mix);
    const rawDb = gainToDb(dbToGain(inputDb) * (1 - mix) + dbToGain(inputDb - gainReductionDb) * mix);
    const px = envToX(index, steps);
    rawOutputPoints.push({ x: px, y: envToY(dbToEnvelope(rawDb)) });
    compensatedOutputPoints.push({ x: px, y: envToY(dbToEnvelope(outputDb)) });
  }
  ctx.strokeStyle = "rgba(255, 214, 145, 0.42)";
  setFaceLineWidth(ctx, 1);
  ctx.beginPath();
  rawOutputPoints.forEach((point, index) => {
    if (index === 0) {
      ctx.moveTo(point.x, point.y);
    } else {
      ctx.lineTo(point.x, point.y);
    }
  });
  ctx.stroke();

  ctx.strokeStyle = accentColor;
  setFaceLineWidth(ctx, 2);
  ctx.beginPath();
  compensatedOutputPoints.forEach((point, index) => {
    if (index === 0) {
      ctx.moveTo(point.x, point.y);
    } else {
      ctx.lineTo(point.x, point.y);
    }
  });
  ctx.stroke();

  ctx.fillStyle = PATCH_COLOR_NODE_SUBTITLE;
  ctx.font = "7px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textAlign = "right";
  ctx.fillText(`ATTACK: ${Math.round(attackMs)}ms`, attackGraph.x + attackGraph.width, attackGraph.y - 2);
  ctx.fillStyle = "rgba(158, 192, 223, 0.78)";
  ctx.fillText("in", attackGraph.x - 3, attackGraph.y + 8);
  ctx.fillStyle = accentColor;
  ctx.fillText("out", attackGraph.x - 3, attackGraph.y + attackGraph.height / 2 + 3);
  ctx.fillStyle = "rgba(255, 214, 145, 0.72)";
  ctx.fillText("raw", attackGraph.x - 3, attackGraph.y + attackGraph.height - 4);
}

export const drawCompressorModuleFace: ModuleFaceRenderer = (ctx, _patch, node, schema, x, y, accentColor, options) => {
  if (options.expanded === true) {
    drawCompressorExpandedModuleFace(ctx, node, schema, x, y, accentColor);
    return;
  }
  drawCompressorCompactModuleFace(ctx, node, schema, x, y, accentColor);
};

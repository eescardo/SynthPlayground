import {
  clamp,
  clamp01,
  getNumericParam,
  ModuleFaceRenderer,
  PATCH_COLOR_ADSR_GRAPH_BORDER,
  PATCH_COLOR_ADSR_MACRO_HIGH,
  PATCH_COLOR_NODE_SUBTITLE,
  PATCH_MODULE_FACE_BOTTOM_INSET,
  PATCH_MODULE_FACE_INSET_X,
  PATCH_MODULE_FACE_TOP,
  PATCH_NODE_HEIGHT,
  PATCH_NODE_WIDTH,
  setFaceLineWidth
} from "@/components/patch/moduleFaces/shared";
import { addComplex, divComplex, mulComplex, subComplex } from "@/lib/numeric";

export const VCF_FACE_SAMPLE_RATE_HZ = 48000;
export const VCF_FACE_NYQUIST_HZ = VCF_FACE_SAMPLE_RATE_HZ / 2;

function formatFrequencyFaceLabel(frequency: number): string {
  if (frequency >= 1000) {
    return `${(frequency / 1000).toFixed(frequency >= 10000 ? 0 : 1)}k`;
  }
  return `${Math.round(frequency)}`;
}

function magnitudeToDb(magnitude: number): number {
  return 20 * Math.log10(Math.max(magnitude, 0.000001));
}

function formatDbFaceLabel(db: number): string {
  return `${db > 0 ? "+" : ""}${Math.round(db)}dB`;
}

export function vcfMagnitudeAtFrequency(type: string, cutoff: number, resonance: number, frequency: number): number {
  const f = clamp((2 * Math.PI * cutoff) / VCF_FACE_SAMPLE_RATE_HZ, 0.001, 0.99);
  const damping = clamp(1 - resonance, 0.001, 1);
  const omega = (2 * Math.PI * frequency) / VCF_FACE_SAMPLE_RATE_HZ;
  const zInv = { re: Math.cos(omega), im: -Math.sin(omega) };
  const one = { re: 1, im: 0 };
  const zero = { re: 0, im: 0 };
  const fValue = { re: f, im: 0 };

  const a11 = addComplex(one, mulComplex(zInv, { re: -1 + f * damping, im: 0 }));
  const a12 = mulComplex(zInv, fValue);
  const a21 = { re: -f, im: 0 };
  const a22 = subComplex(one, zInv);
  const determinant = subComplex(mulComplex(a11, a22), mulComplex(a12, a21));
  const bp = divComplex(subComplex(mulComplex(fValue, a22), mulComplex(a12, zero)), determinant);
  const lp = divComplex(subComplex(mulComplex(a11, zero), mulComplex(fValue, a21)), determinant);
  const hp = subComplex(subComplex(one, mulComplex(zInv, lp)), mulComplex({ re: damping, im: 0 }, mulComplex(zInv, bp)));
  const response = type === "highpass" ? hp : type === "bandpass" ? bp : lp;
  return Math.hypot(response.re, response.im);
}

export const drawVcfModuleFace: ModuleFaceRenderer = (ctx, patch, node, schema, x, y, accentColor) => {
  const graphLeftInset = PATCH_MODULE_FACE_INSET_X + 24;
  const graph = {
    x: x + graphLeftInset,
    y: y + PATCH_MODULE_FACE_TOP + 10,
    width: PATCH_NODE_WIDTH - graphLeftInset - PATCH_MODULE_FACE_INSET_X,
    height: PATCH_NODE_HEIGHT - PATCH_MODULE_FACE_TOP - PATCH_MODULE_FACE_BOTTOM_INSET - 10
  };
  const cutoffParam = schema.find((param) => param.id === "cutoffHz" && param.type === "float");
  const cutoff = getNumericParam(node, schema, "cutoffHz");
  const resonance = clamp(getNumericParam(node, schema, "resonance"), 0, 1);
  const cutoffModAmountOct = Math.max(0, getNumericParam(node, schema, "cutoffModAmountOct"));
  const min = cutoffParam?.type === "float" ? cutoffParam.range.min : 20;
  const max = cutoffParam?.type === "float" ? cutoffParam.range.max : 20000;
  const graphDisplayMax = Math.min(Math.max(max, 40000), VCF_FACE_NYQUIST_HZ);
  const cutoffClamped = clamp(cutoff, min, max);
  const graphMin = clamp(cutoffClamped / 10, 2, graphDisplayMax);
  const graphMax = clamp(cutoffClamped * 10, min, graphDisplayMax);
  const graphLogMin = Math.log10(graphMin);
  const graphLogMax = Math.log10(graphMax);
  const frequencyToX = (frequency: number) => {
    const logT = (Math.log10(clamp(frequency, graphMin, graphMax)) - graphLogMin) / (graphLogMax - graphLogMin || 1);
    return graph.x + clamp01(logT) * graph.width;
  };
  const cutoffX = frequencyToX(cutoffClamped);
  const type = String(node.params.type ?? "lowpass");
  const responseSampleCount = 160;
  const responsePoints = Array.from({ length: responseSampleCount }, (_, index) => {
    const t = index / (responseSampleCount - 1);
    const frequency = 10 ** (graphLogMin + t * (graphLogMax - graphLogMin));
    return {
      x: graph.x + t * graph.width,
      db: magnitudeToDb(vcfMagnitudeAtFrequency(type, cutoffClamped, resonance, frequency))
    };
  });
  const dbMin = -48;
  const peakDb = Math.max(0, ...responsePoints.map((point) => point.db));
  const peakPoint = responsePoints.reduce((best, point) => (point.db > best.db ? point : best));
  const dbMax = clamp(Math.max(6, Math.ceil(peakDb / 6) * 6), 6, 36);
  const dbToY = (db: number) => graph.y + ((dbMax - clamp(db, dbMin, dbMax)) / (dbMax - dbMin)) * graph.height;
  ctx.strokeStyle = PATCH_COLOR_ADSR_GRAPH_BORDER;
  setFaceLineWidth(ctx, 1);
  ctx.strokeRect(graph.x, graph.y, graph.width, graph.height);

  const cutoffCvConnected = patch.connections.some((connection) => connection.to.nodeId === node.id && connection.to.portId === "cutoffCV");
  if (cutoffCvConnected && cutoffModAmountOct > 0.001) {
    const modLow = clamp(cutoffClamped * 2 ** -cutoffModAmountOct, min, max);
    const modHigh = clamp(cutoffClamped * 2 ** cutoffModAmountOct, min, max);
    const modLowX = frequencyToX(modLow);
    const modHighX = frequencyToX(modHigh);
    const bandX = Math.min(modLowX, modHighX);
    const bandWidth = Math.max(2, Math.abs(modHighX - modLowX));
    ctx.fillStyle = "rgba(112, 211, 150, 0.10)";
    ctx.fillRect(bandX, graph.y + 2, bandWidth, graph.height - 4);
    ctx.strokeStyle = "rgba(112, 211, 150, 0.28)";
    setFaceLineWidth(ctx, 1);
    ctx.beginPath();
    ctx.moveTo(modLowX, graph.y + 5);
    ctx.lineTo(modLowX, graph.y + graph.height - 5);
    ctx.moveTo(modHighX, graph.y + 5);
    ctx.lineTo(modHighX, graph.y + graph.height - 5);
    ctx.stroke();
  }

  setFaceLineWidth(ctx, 1);
  for (const ratio of [0.25, 0.5, 1, 2, 4]) {
    const guideFrequency = cutoffClamped * ratio;
    if (guideFrequency < graphMin || guideFrequency > graphMax) {
      continue;
    }
    const guideX = frequencyToX(guideFrequency);
    ctx.strokeStyle = ratio === 1 ? "rgba(158, 192, 223, 0.22)" : "rgba(158, 192, 223, 0.13)";
    ctx.beginPath();
    ctx.moveTo(guideX, graph.y + 4);
    ctx.lineTo(guideX, graph.y + graph.height - 4);
    ctx.stroke();
  }

  const zeroDbY = dbToY(0);
  ctx.strokeStyle = "rgba(158, 192, 223, 0.18)";
  ctx.beginPath();
  ctx.moveTo(graph.x + 4, zeroDbY);
  ctx.lineTo(graph.x + graph.width - 4, zeroDbY);
  ctx.stroke();

  ctx.strokeStyle = accentColor;
  setFaceLineWidth(ctx, 2);
  ctx.beginPath();
  responsePoints.forEach((point, index) => {
    const py = dbToY(point.db);
    if (index === 0) {
      ctx.moveTo(point.x, py);
    } else {
      ctx.lineTo(point.x, py);
    }
  });
  ctx.stroke();
  if (peakPoint && peakPoint.db > 0.5) {
    const peakY = dbToY(peakPoint.db);
    ctx.strokeStyle = PATCH_COLOR_ADSR_MACRO_HIGH;
    ctx.fillStyle = PATCH_COLOR_ADSR_MACRO_HIGH;
    ctx.font = "8px ui-monospace, SFMono-Regular, Menlo, monospace";
    setFaceLineWidth(ctx, 1.2);
    ctx.beginPath();
    ctx.arc(peakPoint.x, peakY, 2.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.textAlign = peakPoint.x > graph.x + graph.width * 0.76 ? "right" : "left";
    ctx.fillText("pk", peakPoint.x + (ctx.textAlign === "right" ? -5 : 5), clamp(peakY - 3, graph.y + 7, graph.y + graph.height - 2));
  }
  ctx.fillStyle = PATCH_COLOR_NODE_SUBTITLE;
  ctx.fillRect(cutoffX - 1, graph.y + 4, 2, graph.height - 8);
  ctx.font = "8px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "right";
  ctx.fillText(formatDbFaceLabel(dbMax), graph.x - 2, graph.y + 7);
  ctx.fillText(formatDbFaceLabel(dbMin), graph.x - 2, graph.y + graph.height);
  ctx.textAlign = "left";
  ctx.fillText(formatFrequencyFaceLabel(graphMin), graph.x, graph.y + graph.height + 10);
  ctx.textAlign = "right";
  ctx.fillText(formatFrequencyFaceLabel(graphMax), graph.x + graph.width, graph.y + graph.height + 10);
  ctx.textAlign = cutoffX > graph.x + graph.width * 0.72 ? "right" : cutoffX < graph.x + graph.width * 0.28 ? "left" : "center";
  const cutoffLabel = formatFrequencyFaceLabel(cutoffClamped);
  const cutoffLabelX = clamp(cutoffX, graph.x + 10, graph.x + graph.width - 10);
  ctx.fillText(cutoffLabel, cutoffLabelX, graph.y - 3);
  ctx.textAlign = "left";
};

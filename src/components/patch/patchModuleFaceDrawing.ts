import {
  PATCH_COLOR_ADSR_GRAPH_BORDER,
  PATCH_COLOR_ADSR_MACRO_HIGH,
  PATCH_COLOR_MODULE_FACE_ROW_BG,
  PATCH_COLOR_NODE_SUBTITLE,
  PATCH_MODULE_FACE_BOTTOM_INSET,
  PATCH_MODULE_FACE_INSET_X,
  PATCH_MODULE_FACE_TOP,
  PATCH_NODE_HEIGHT,
  PATCH_NODE_WIDTH
} from "@/components/patch/patchCanvasConstants";
import { addComplex, clamp, clamp01, divComplex, mulComplex, subComplex } from "@/lib/numeric";
import { Patch, PatchNode, ParamSchema, ParamValue, ModuleTypeSchema } from "@/types/patch";

export const VCF_FACE_SAMPLE_RATE_HZ = 48000;
export const VCF_FACE_NYQUIST_HZ = VCF_FACE_SAMPLE_RATE_HZ / 2;

function formatParamFaceValue(param: ParamSchema, value: ParamValue | undefined): string {
  const resolved = value ?? param.default;
  if (param.type === "bool") {
    return resolved ? "on" : "off";
  }
  if (param.type === "enum") {
    return String(resolved);
  }
  const numeric = typeof resolved === "number" ? resolved : param.default;
  const formatted = Math.abs(numeric) >= 10 ? numeric.toFixed(1) : numeric.toFixed(2);
  return param.unit === "linear" ? formatted : `${formatted}${param.unit}`;
}

function getNumericParam(node: PatchNode, schema: ParamSchema[], paramId: string): number {
  const param = schema.find((entry) => entry.id === paramId);
  const value = node.params[paramId] ?? param?.default;
  return typeof value === "number" ? value : 0;
}

function getAdsrParamValues(node: PatchNode, schema: ParamSchema[]) {
  return {
    attack: getNumericParam(node, schema, "attack"),
    decay: getNumericParam(node, schema, "decay"),
    sustain: getNumericParam(node, schema, "sustain"),
    release: getNumericParam(node, schema, "release"),
    curve: getNumericParam(node, schema, "curve")
  };
}

function formatDurationFaceLabel(ms: number): string {
  return `${Math.round(ms)}ms`;
}

function formatAdsrCurveLabel(curve: number): string {
  if (curve < -0.08) {
    return "exp";
  }
  if (curve > 0.08) {
    return "log";
  }
  return "linear";
}

function distributeSegmentWidths(durations: number[], totalWidth: number, minVisibleWidth: number) {
  const visible = durations.map((duration) => duration > 1);
  const visibleCount = visible.filter(Boolean).length;
  if (visibleCount === 0) {
    return durations.map(() => 0);
  }
  const minTotal = Math.min(totalWidth * 0.72, visibleCount * minVisibleWidth);
  const flexibleWidth = Math.max(0, totalWidth - minTotal);
  const totalDuration = durations.reduce((sum, duration) => sum + Math.max(0, duration), 0) || 1;
  return durations.map((duration, index) => {
    if (!visible[index]) {
      return 0;
    }
    return minTotal / visibleCount + flexibleWidth * (duration / totalDuration);
  });
}

function drawAdsrEnvelopePath(
  ctx: CanvasRenderingContext2D,
  values: { attack: number; decay: number; sustain: number; release: number; curve: number },
  graph: { x: number; y: number; width: number; height: number }
) {
  const attack = Math.max(0, values.attack);
  const decay = Math.max(0, values.decay);
  const sustain = clamp01(values.sustain);
  const release = sustain > 0.025 ? Math.max(0, values.release) : 0;
  const sustainHoldWidth = sustain > 0.025 ? clamp(graph.width * 0.13, 10, 16) : 0;
  const timedWidth = graph.width - sustainHoldWidth;
  const [attackW, decayW, releaseW] = distributeSegmentWidths([attack, decay, release], timedWidth, 11);
  const ax = graph.x + attackW;
  const dx = ax + decayW;
  const sx = dx + sustainHoldWidth;
  const rx = graph.x + graph.width;
  const highY = graph.y + 6;
  const sustainY = graph.y + graph.height - 6 - sustain * (graph.height - 12);
  const baseY = graph.y + graph.height - 4;
  const shape = (t: number) => envelopeCurveProgress(t, values.curve);

  ctx.beginPath();
  ctx.moveTo(graph.x, baseY);
  const drawSegment = (fromX: number, fromY: number, toX: number, toY: number) => {
    const width = Math.max(0, toX - fromX);
    const samples = Math.max(2, Math.ceil(width / 5));
    for (let index = 1; index <= samples; index += 1) {
      const t = index / samples;
      ctx.lineTo(fromX + width * t, fromY + (toY - fromY) * shape(t));
    }
  };
  drawSegment(graph.x, baseY, ax, highY);
  drawSegment(ax, highY, dx, sustainY);
  if (sustainHoldWidth > 0) {
    ctx.lineTo(sx, sustainY);
  }
  drawSegment(sx, sustainY, rx, baseY);
  ctx.stroke();

  return { startX: graph.x, attackX: ax, decayX: dx, sustainX: sx, releaseX: rx, highY, sustainY, baseY, releaseW };
}

export function envelopeCurveProgress(t: number, curve: number) {
  const clampedT = clamp01(t);
  const clampedCurve = clamp(curve, -1, 1);
  const exponent = clampedCurve < 0 ? 1 + clampedCurve * 0.65 : 1 + clampedCurve * 1.8;
  return clampedT ** Math.max(0.35, exponent);
}

function drawAdsrModuleFace(
  ctx: CanvasRenderingContext2D,
  node: PatchNode,
  schema: ParamSchema[],
  x: number,
  y: number,
  accentColor: string
) {
  const graphX = x + PATCH_MODULE_FACE_INSET_X;
  const graphY = y + PATCH_MODULE_FACE_TOP;
  const graphW = PATCH_NODE_WIDTH - PATCH_MODULE_FACE_INSET_X * 2;
  const graphH = PATCH_NODE_HEIGHT - PATCH_MODULE_FACE_TOP - PATCH_MODULE_FACE_BOTTOM_INSET;
  const graph = { x: graphX, y: graphY, width: graphW, height: graphH };
  const currentValues = getAdsrParamValues(node, schema);

  ctx.strokeStyle = PATCH_COLOR_ADSR_GRAPH_BORDER;
  ctx.lineWidth = 1;
  ctx.strokeRect(graphX, graphY, graphW, graphH);

  const sustain = clamp01(currentValues.sustain);
  const sustainY = graph.y + graph.height - 6 - sustain * (graph.height - 12);
  ctx.strokeStyle = "rgba(158, 192, 223, 0.16)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(graph.x + 5, sustainY);
  ctx.lineTo(graph.x + graph.width - 5, sustainY);
  ctx.stroke();

  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 2;
  const points = drawAdsrEnvelopePath(ctx, currentValues, graph);

  ctx.strokeStyle = "rgba(231, 243, 255, 0.22)";
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 3]);
  const guideBottomY = graph.y + graph.height + 3;
  const guides = [
    { x: points.startX, y: points.baseY },
    { x: points.attackX, y: points.highY },
    { x: points.decayX, y: points.sustainY },
    ...(points.releaseW > 0 ? [{ x: points.sustainX, y: points.sustainY }] : []),
    { x: points.releaseX, y: points.baseY }
  ];
  for (const guide of guides) {
    ctx.beginPath();
    ctx.moveTo(guide.x, Math.max(graph.y + 4, guide.y - 3));
    ctx.lineTo(guide.x, guideBottomY);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  ctx.fillStyle = PATCH_COLOR_NODE_SUBTITLE;
  ctx.font = "8px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textAlign = "center";
  const labelY = graph.y + graph.height + 10;
  const attackLabelX = Math.min(
    clamp((graph.x + points.attackX) / 2, graph.x - 12, graph.x + graph.width - 14),
    points.decayX - 24
  );
  const decayLabelX = clamp((points.attackX + points.decayX) / 2, attackLabelX + 24, graph.x + graph.width - 14);
  ctx.fillText(formatDurationFaceLabel(currentValues.attack), attackLabelX, labelY);
  ctx.fillText(formatDurationFaceLabel(currentValues.decay), decayLabelX, labelY);
  if (points.releaseW > 0 && currentValues.release >= 2) {
    const releaseLabelX = clamp((points.sustainX + points.releaseX) / 2, decayLabelX + 24, graph.x + graph.width - 16);
    ctx.fillText(formatDurationFaceLabel(currentValues.release), releaseLabelX, labelY);
  }
  ctx.fillStyle = accentColor;
  ctx.textAlign = "right";
  ctx.fillText(`S ${sustain.toFixed(2)}`, graph.x + graph.width - 5, clamp(points.sustainY - 4, graph.y + 8, graph.y + graph.height - 3));
  ctx.textAlign = "left";
  ctx.fillText(formatAdsrCurveLabel(currentValues.curve), graph.x, graph.y - 3);
  ctx.textAlign = "left";
}

function drawWavePath(
  ctx: CanvasRenderingContext2D,
  points: number[],
  graph: { x: number; y: number; width: number; height: number }
) {
  const midY = graph.y + graph.height / 2;
  const amp = graph.height * 0.34;
  ctx.beginPath();
  points.forEach((point, index) => {
    const px = graph.x + (index / Math.max(points.length - 1, 1)) * graph.width;
    const py = midY - clamp(point, -1, 1) * amp;
    if (index === 0) {
      ctx.moveTo(px, py);
    } else {
      ctx.lineTo(px, py);
    }
  });
  ctx.stroke();
}

function drawVcoModuleFace(
  ctx: CanvasRenderingContext2D,
  node: PatchNode,
  x: number,
  y: number,
  accentColor: string
) {
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
    switch (wave) {
      case "sine":
        return Math.sin(phase * Math.PI * 2);
      case "triangle":
        return 1 - Math.abs(phase * 4 - 2);
      case "square":
        return phase < pulseWidth ? 1 : -1;
      default:
        return 1 - phase * 2;
    }
  });
  ctx.strokeStyle = PATCH_COLOR_ADSR_GRAPH_BORDER;
  ctx.lineWidth = 1;
  ctx.strokeRect(graph.x, graph.y, graph.width, graph.height);
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 2;
  drawWavePath(ctx, points, graph);
}

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

function drawLfoModuleFace(
  ctx: CanvasRenderingContext2D,
  node: PatchNode,
  schema: ParamSchema[],
  x: number,
  y: number,
  accentColor: string
) {
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
  ctx.lineWidth = 1;
  ctx.strokeRect(graph.x, graph.y, graph.width, graph.height);

  const zeroY = bipolar ? graph.y + graph.height / 2 : graph.y + graph.height - 5;
  ctx.strokeStyle = PATCH_COLOR_MODULE_FACE_ROW_BG;
  ctx.lineWidth = 1;
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
  ctx.lineWidth = 1.4;
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
}

function formatFrequencyFaceLabel(frequency: number): string {
  if (frequency >= 1000) {
    return `${(frequency / 1000).toFixed(frequency >= 10000 ? 0 : 1)}k`;
  }
  return `${Math.round(frequency)}`;
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

function magnitudeToDb(magnitude: number): number {
  return 20 * Math.log10(Math.max(magnitude, 0.000001));
}

function formatDbFaceLabel(db: number): string {
  return `${db > 0 ? "+" : ""}${Math.round(db)}dB`;
}

function drawVcfModuleFace(
  ctx: CanvasRenderingContext2D,
  patch: Patch,
  node: PatchNode,
  schema: ParamSchema[],
  x: number,
  y: number,
  accentColor: string
) {
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
  ctx.lineWidth = 1;
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
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(modLowX, graph.y + 5);
    ctx.lineTo(modLowX, graph.y + graph.height - 5);
    ctx.moveTo(modHighX, graph.y + 5);
    ctx.lineTo(modHighX, graph.y + graph.height - 5);
    ctx.stroke();
  }

  ctx.lineWidth = 1;
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
  ctx.lineWidth = 2;
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
    ctx.lineWidth = 1.2;
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
}

function drawVcaModuleFace(
  ctx: CanvasRenderingContext2D,
  node: PatchNode,
  schema: ParamSchema[],
  x: number,
  y: number,
  accentColor: string
) {
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
  ctx.lineWidth = 1;
  ctx.strokeRect(graph.x, graph.y, graph.width, graph.height);

  ctx.fillStyle = "rgba(158, 192, 223, 0.14)";
  ctx.fillRect(graph.x + 1, biasY, graph.width - 2, graph.y + graph.height - biasY - 1);
  ctx.fillStyle = "rgba(158, 192, 223, 0.24)";
  ctx.fillRect(graph.x + 1, topY, graph.width - 2, Math.max(0, biasY - topY));

  ctx.strokeStyle = PATCH_COLOR_MODULE_FACE_ROW_BG;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(graph.x + 5, biasY);
  ctx.lineTo(graph.x + graph.width - 5, biasY);
  ctx.stroke();

  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 2;
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
    ctx.lineWidth = 1;
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
}

function softclipTransfer(value: number) {
  const clipped = clamp(value, -1.5, 1.5);
  return clipped - (clipped * clipped * clipped) / 3;
}

function drawSaturationModuleFace(
  ctx: CanvasRenderingContext2D,
  node: PatchNode,
  schema: ParamSchema[],
  x: number,
  y: number,
  accentColor: string
) {
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
  ctx.lineWidth = 1;
  ctx.strokeRect(graph.x, graph.y, graph.width, graph.height);

  const centerX = graph.x + graph.width / 2;
  const centerY = graph.y + graph.height / 2;
  ctx.strokeStyle = PATCH_COLOR_MODULE_FACE_ROW_BG;
  ctx.lineWidth = 1;
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
  ctx.lineWidth = 2;
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
}

function overdriveTransfer(input: number, gainDb: number, mode: string, mix: number) {
  const gain = 10 ** (gainDb / 20);
  const driven = input * gain;
  const wet = mode === "fuzz" ? Math.sign(driven) * (1 - Math.exp(-Math.abs(driven) * 1.8)) : Math.tanh(driven * 0.85);
  return clamp(input * (1 - mix) + wet * mix, -1, 1);
}

function drawOverdriveModuleFace(
  ctx: CanvasRenderingContext2D,
  node: PatchNode,
  schema: ParamSchema[],
  x: number,
  y: number,
  accentColor: string
) {
  const graph = {
    x: x + PATCH_MODULE_FACE_INSET_X,
    y: y + PATCH_MODULE_FACE_TOP + 4,
    width: PATCH_NODE_WIDTH - PATCH_MODULE_FACE_INSET_X * 2,
    height: PATCH_NODE_HEIGHT - PATCH_MODULE_FACE_TOP - PATCH_MODULE_FACE_BOTTOM_INSET - 10
  };
  const gainDb = getNumericParam(node, schema, "gainDb");
  const tone = clamp01(getNumericParam(node, schema, "tone"));
  const mix = clamp01(getNumericParam(node, schema, "mix"));
  const mode = String(node.params.mode ?? "overdrive");

  ctx.strokeStyle = PATCH_COLOR_ADSR_GRAPH_BORDER;
  ctx.lineWidth = 1;
  ctx.strokeRect(graph.x, graph.y, graph.width, graph.height);

  const centerY = graph.y + graph.height / 2;
  ctx.strokeStyle = PATCH_COLOR_MODULE_FACE_ROW_BG;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(graph.x + 4, centerY);
  ctx.lineTo(graph.x + graph.width - 4, centerY);
  ctx.stroke();

  ctx.strokeStyle = "rgba(158, 192, 223, 0.34)";
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(graph.x + 5, graph.y + graph.height - 5);
  ctx.lineTo(graph.x + graph.width - 5, graph.y + 5);
  ctx.stroke();
  ctx.setLineDash([]);

  const toneLowY = graph.y + graph.height * (0.78 - tone * 0.28);
  const toneHighY = graph.y + graph.height * (0.5 - tone * 0.28);
  ctx.strokeStyle = "rgba(255, 214, 145, 0.56)";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(graph.x + 10, toneLowY);
  ctx.lineTo(graph.x + graph.width - 10, toneHighY);
  ctx.stroke();

  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let index = 0; index <= 64; index += 1) {
    const t = index / 64;
    const input = t * 2 - 1;
    const output = overdriveTransfer(input, gainDb, mode, mix);
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
  ctx.fillText(mode, graph.x + 6, graph.y + 11);
  ctx.textAlign = "right";
  ctx.fillText(`${gainDb.toFixed(0)}dB tone ${tone.toFixed(2)}`, graph.x + graph.width - 6, graph.y + graph.height - 5);
  ctx.textAlign = "left";
}

function drawNoiseModuleFace(
  ctx: CanvasRenderingContext2D,
  node: PatchNode,
  schema: ParamSchema[],
  x: number,
  y: number,
  accentColor: string
) {
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
  ctx.lineWidth = 1;
  ctx.strokeRect(graph.x, graph.y, graph.width, graph.height);

  ctx.strokeStyle = "rgba(158, 192, 223, 0.14)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(graph.x + 5, graph.y + graph.height - 5);
  ctx.lineTo(graph.x + graph.width - 5, graph.y + graph.height - 5);
  ctx.moveTo(graph.x + 5, graph.y + 5);
  ctx.lineTo(graph.x + 5, graph.y + graph.height - 5);
  ctx.stroke();

  ctx.fillStyle = "rgba(158, 192, 223, 0.10)";
  ctx.fillRect(graph.x + 1, levelToY(gain), graph.width - 2, graph.y + graph.height - levelToY(gain) - 1);

  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 2;
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
  ctx.lineWidth = 1;
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
}

function drawKarplusStrongModuleFace(
  ctx: CanvasRenderingContext2D,
  node: PatchNode,
  schema: ParamSchema[],
  x: number,
  y: number,
  accentColor: string
) {
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
  ctx.lineWidth = 1;
  ctx.strokeRect(graph.x, graph.y, graph.width, graph.height);

  ctx.fillStyle = `rgba(255, 214, 145, ${0.06 + brightness * 0.16})`;
  ctx.fillRect(graph.x + 1, graph.y + 1, graph.width - 2, graph.height - 2);

  ctx.strokeStyle = "rgba(158, 192, 223, 0.24)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(graph.x + 5, floorY);
  ctx.lineTo(graph.x + graph.width - 5, floorY);
  ctx.stroke();

  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 2;
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
}

function drawDelayModuleFace(
  ctx: CanvasRenderingContext2D,
  node: PatchNode,
  schema: ParamSchema[],
  x: number,
  y: number,
  accentColor: string
) {
  const graph = {
    x: x + PATCH_MODULE_FACE_INSET_X,
    y: y + PATCH_MODULE_FACE_TOP + 4,
    width: PATCH_NODE_WIDTH - PATCH_MODULE_FACE_INSET_X * 2,
    height: PATCH_NODE_HEIGHT - PATCH_MODULE_FACE_TOP - PATCH_MODULE_FACE_BOTTOM_INSET - 10
  };
  const timeMs = Math.max(1, getNumericParam(node, schema, "timeMs"));
  const feedback = clamp(getNumericParam(node, schema, "feedback"), 0, 0.95);
  const mix = clamp01(getNumericParam(node, schema, "mix"));
  const timeMaxMs = 2000;
  const dryX = graph.x + 10;
  const timelineStartX = dryX;
  const timelineEndX = graph.x + graph.width - 8;
  const echoGap = (timeMs / timeMaxMs) * (timelineEndX - timelineStartX);
  const baseY = graph.y + graph.height - 8;
  const topY = graph.y + 13;
  const barMaxHeight = baseY - topY;
  const barWidth = 3;
  const delayedColor = "rgba(231, 243, 255, 0.64)";

  ctx.strokeStyle = PATCH_COLOR_ADSR_GRAPH_BORDER;
  ctx.lineWidth = 1;
  ctx.strokeRect(graph.x, graph.y, graph.width, graph.height);

  ctx.strokeStyle = "rgba(158, 192, 223, 0.28)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(graph.x + 7, baseY);
  ctx.lineTo(graph.x + graph.width - 7, baseY);
  ctx.stroke();

  if (echoGap >= 6) {
    const measureY = graph.y + 6;
    const firstEchoX = dryX + echoGap;
    ctx.strokeStyle = "rgba(231, 243, 255, 0.26)";
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(dryX + barWidth + 2, measureY);
    ctx.lineTo(firstEchoX - 2, measureY);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  const drawDelayBar = (px: number, amplitude: number, fillStyle: string, alpha: number) => {
    if (amplitude <= 0.001) {
      return;
    }
    const barH = amplitude * barMaxHeight;
    ctx.fillStyle = fillStyle;
    ctx.globalAlpha = alpha;
    ctx.fillRect(px, baseY - barH, barWidth, barH);
    ctx.globalAlpha = 1;
  };

  drawDelayBar(dryX, 1 - mix, accentColor, 0.8);
  for (let echo = 1; echo <= 8; echo += 1) {
    const px = dryX + echo * echoGap;
    if (px > timelineEndX) {
      break;
    }
    const amp = mix * feedback ** (echo - 1);
    drawDelayBar(px, amp, delayedColor, clamp(0.2 + amp * 0.8, 0.2, 0.9));
  }

  ctx.fillStyle = PATCH_COLOR_NODE_SUBTITLE;
  ctx.font = "8px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textAlign = "center";
  ctx.fillText(`${Math.round(timeMs)}ms`, clamp(dryX + echoGap / 2, graph.x + 18, graph.x + graph.width - 18), graph.y - 3);
  ctx.textAlign = "left";
}

function drawReverbModuleFace(
  ctx: CanvasRenderingContext2D,
  node: PatchNode,
  schema: ParamSchema[],
  x: number,
  y: number,
  accentColor: string
) {
  const graph = {
    x: x + PATCH_MODULE_FACE_INSET_X,
    y: y + PATCH_MODULE_FACE_TOP + 4,
    width: PATCH_NODE_WIDTH - PATCH_MODULE_FACE_INSET_X * 2,
    height: PATCH_NODE_HEIGHT - PATCH_MODULE_FACE_TOP - PATCH_MODULE_FACE_BOTTOM_INSET - 10
  };
  const size = clamp01(getNumericParam(node, schema, "size"));
  const decay = Math.max(0.1, getNumericParam(node, schema, "decay"));
  const damping = clamp01(getNumericParam(node, schema, "damping"));
  const mix = clamp01(getNumericParam(node, schema, "mix"));
  const centerY = graph.y + graph.height / 2;

  ctx.strokeStyle = PATCH_COLOR_ADSR_GRAPH_BORDER;
  ctx.lineWidth = 1;
  ctx.strokeRect(graph.x, graph.y, graph.width, graph.height);

  ctx.fillStyle = `rgba(158, 192, 223, ${0.06 + size * 0.1})`;
  ctx.fillRect(graph.x + 1, graph.y + 1, graph.width - 2, graph.height - 2);

  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let index = 0; index <= 80; index += 1) {
    const t = index / 80;
    const envelope = mix * Math.exp(-t * (2.2 / Math.sqrt(decay)));
    const highLoss = 1 - damping * t * 0.65;
    const wave = Math.sin(t * Math.PI * (8 + size * 16)) * envelope * highLoss;
    const px = graph.x + t * graph.width;
    const py = centerY - wave * graph.height * 0.42;
    if (index === 0) {
      ctx.moveTo(px, py);
    } else {
      ctx.lineTo(px, py);
    }
  }
  ctx.stroke();

  ctx.strokeStyle = "rgba(231, 243, 255, 0.22)";
  ctx.lineWidth = 1;
  for (let echo = 0; echo < 10; echo += 1) {
    const t = echo / 9;
    const px = graph.x + 8 + t * (graph.width - 16);
    const amp = mix * Math.exp(-t * (2.4 / Math.sqrt(decay)));
    ctx.globalAlpha = clamp(amp, 0.08, 0.5);
    ctx.beginPath();
    ctx.moveTo(px, centerY - amp * graph.height * 0.36);
    ctx.lineTo(px, centerY + amp * graph.height * 0.36);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  ctx.fillStyle = PATCH_COLOR_NODE_SUBTITLE;
  ctx.font = "8px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textAlign = "left";
  ctx.fillText(`size ${size.toFixed(2)}`, graph.x + 6, graph.y + 11);
  ctx.textAlign = "right";
  ctx.fillText(`${decay.toFixed(decay >= 10 ? 0 : 1)}s damp ${damping.toFixed(2)}`, graph.x + graph.width - 6, graph.y + graph.height - 5);
  ctx.textAlign = "left";
}

export function compressorOutputDb(inputDb: number, thresholdDb: number, ratio: number, makeupDb: number, mix: number) {
  const wet = inputDb <= thresholdDb ? inputDb : thresholdDb + (inputDb - thresholdDb) / Math.max(ratio, 1);
  return inputDb * (1 - clamp01(mix)) + (wet + makeupDb) * clamp01(mix);
}

function drawCompressorModuleFace(
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
  const thresholdDb = getNumericParam(node, schema, "thresholdDb");
  const ratio = Math.max(1, getNumericParam(node, schema, "ratio"));
  const makeupDb = getNumericParam(node, schema, "makeupDb");
  const mix = clamp01(getNumericParam(node, schema, "mix"));
  const minDb = -60;
  const maxDb = 6;
  const dbToX = (db: number) => graph.x + ((clamp(db, minDb, maxDb) - minDb) / (maxDb - minDb)) * graph.width;
  const dbToY = (db: number) => graph.y + graph.height * (1 - (clamp(db, minDb, maxDb) - minDb) / (maxDb - minDb));

  ctx.strokeStyle = PATCH_COLOR_ADSR_GRAPH_BORDER;
  ctx.lineWidth = 1;
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
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(thresholdX, graph.y + 4);
  ctx.lineTo(thresholdX, graph.y + graph.height - 4);
  ctx.stroke();

  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 2;
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
  ctx.textAlign = "left";
  ctx.fillText(`${Math.round(thresholdDb)}dB`, graph.x + 6, graph.y + 11);
  ctx.textAlign = "right";
  ctx.fillText(`${ratio.toFixed(ratio >= 10 ? 0 : 1)}:1 +${makeupDb.toFixed(0)}`, graph.x + graph.width - 6, graph.y + graph.height - 5);
  ctx.textAlign = "left";
}

function drawMixerModuleFace(
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
  ctx.lineWidth = 1;
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
      ctx.lineWidth = 1;
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

function resolveConnectedInputPortIds(patch: Patch, nodeId: string) {
  return new Set(patch.connections.filter((connection) => connection.to.nodeId === nodeId).map((connection) => connection.to.portId));
}

function formatSignedValue(value: number, digits = 2) {
  const rounded = Math.abs(value) >= 10 ? value.toFixed(1) : value.toFixed(digits);
  return value > 0 ? `+${rounded}` : rounded;
}

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
  ctx.lineWidth = 1;
  ctx.strokeRect(graph.x, graph.y, graph.width, graph.height);
  ctx.strokeStyle = PATCH_COLOR_MODULE_FACE_ROW_BG;
  ctx.beginPath();
  ctx.moveTo(axisX, graph.y + 4);
  ctx.lineTo(axisX, graph.y + graph.height - 4);
  ctx.moveTo(graph.x + 6, zeroY);
  ctx.lineTo(graph.x + graph.width - 6, zeroY);
  ctx.stroke();

  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 2;
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

function drawCvTransposeModuleFace(
  ctx: CanvasRenderingContext2D,
  node: PatchNode,
  schema: ParamSchema[],
  x: number,
  y: number,
  accentColor: string
) {
  const octaves = getNumericParam(node, schema, "octaves");
  const semitones = getNumericParam(node, schema, "semitones");
  const cents = getNumericParam(node, schema, "cents");
  const transposeOctaves = octaves + semitones / 12 + cents / 1200;
  drawCvAxisModuleFace(ctx, transposeOctaves, { min: -4, max: 4 }, `${formatSignedValue(transposeOctaves)} oct`, x, y, accentColor);
}

function drawCvScalerModuleFace(
  ctx: CanvasRenderingContext2D,
  node: PatchNode,
  schema: ParamSchema[],
  x: number,
  y: number,
  accentColor: string
) {
  const scale = getNumericParam(node, schema, "scale");
  drawCvAxisModuleFace(ctx, scale, { min: -2, max: 2 }, `${formatSignedValue(scale)}x`, x, y, accentColor);
}

function drawGenericModuleFace(
  ctx: CanvasRenderingContext2D,
  node: PatchNode,
  schema: ParamSchema[],
  x: number,
  y: number
) {
  const faceParams = schema.slice(0, 3);
  const rowX = x + PATCH_MODULE_FACE_INSET_X;
  const rowW = PATCH_NODE_WIDTH - PATCH_MODULE_FACE_INSET_X * 2;
  const rowTop = y + PATCH_MODULE_FACE_TOP + 2;
  ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
  faceParams.forEach((param, index) => {
    const py = rowTop + index * 20;
    ctx.fillStyle = PATCH_COLOR_MODULE_FACE_ROW_BG;
    ctx.fillRect(rowX, py - 11, rowW, 16);
    ctx.fillStyle = PATCH_COLOR_NODE_SUBTITLE;
    ctx.fillText(`${param.label}: ${formatParamFaceValue(param, node.params[param.id])}`, rowX + 6, py);
  });
}

export function drawPatchModuleFaceContent(
  ctx: CanvasRenderingContext2D,
  patch: Patch,
  node: PatchNode,
  schema: ModuleTypeSchema,
  x: number,
  y: number,
  accentColor: string
) {
  if (node.typeId === "ADSR") {
    drawAdsrModuleFace(ctx, node, schema.params, x, y, accentColor);
  } else if (node.typeId === "VCO") {
    drawVcoModuleFace(ctx, node, x, y, accentColor);
  } else if (node.typeId === "LFO") {
    drawLfoModuleFace(ctx, node, schema.params, x, y, accentColor);
  } else if (node.typeId === "KarplusStrong") {
    drawKarplusStrongModuleFace(ctx, node, schema.params, x, y, accentColor);
  } else if (node.typeId === "VCF") {
    drawVcfModuleFace(ctx, patch, node, schema.params, x, y, accentColor);
  } else if (node.typeId === "VCA") {
    drawVcaModuleFace(ctx, node, schema.params, x, y, accentColor);
  } else if (node.typeId === "Noise") {
    drawNoiseModuleFace(ctx, node, schema.params, x, y, accentColor);
  } else if (node.typeId === "Delay") {
    drawDelayModuleFace(ctx, node, schema.params, x, y, accentColor);
  } else if (node.typeId === "Reverb") {
    drawReverbModuleFace(ctx, node, schema.params, x, y, accentColor);
  } else if (node.typeId === "Saturation") {
    drawSaturationModuleFace(ctx, node, schema.params, x, y, accentColor);
  } else if (node.typeId === "Overdrive") {
    drawOverdriveModuleFace(ctx, node, schema.params, x, y, accentColor);
  } else if (node.typeId === "Compressor") {
    drawCompressorModuleFace(ctx, node, schema.params, x, y, accentColor);
  } else if (node.typeId === "Mixer4") {
    drawMixerModuleFace(ctx, node, schema.params, x, y, accentColor, 4, resolveConnectedInputPortIds(patch, node.id));
  } else if (node.typeId === "CVMixer2") {
    drawMixerModuleFace(ctx, node, schema.params, x, y, accentColor, 2, resolveConnectedInputPortIds(patch, node.id));
  } else if (node.typeId === "CVTranspose") {
    drawCvTransposeModuleFace(ctx, node, schema.params, x, y, accentColor);
  } else if (node.typeId === "CVScaler") {
    drawCvScalerModuleFace(ctx, node, schema.params, x, y, accentColor);
  } else {
    drawGenericModuleFace(ctx, node, schema.params, x, y);
  }
}

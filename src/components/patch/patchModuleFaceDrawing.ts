import {
  PATCH_COLOR_ADSR_GRAPH_BORDER,
  PATCH_COLOR_ADSR_MACRO_HIGH,
  PATCH_COLOR_ADSR_MACRO_LOW,
  PATCH_COLOR_MODULE_FACE_ROW_BG,
  PATCH_COLOR_NODE_SUBTITLE,
  PATCH_MODULE_FACE_BOTTOM_INSET,
  PATCH_MODULE_FACE_INSET_X,
  PATCH_MODULE_FACE_TOP,
  PATCH_NODE_HEIGHT,
  PATCH_NODE_WIDTH
} from "@/components/patch/patchCanvasConstants";
import { clamp, clamp01 } from "@/lib/numeric";
import { Patch, PatchNode, ParamSchema, ParamValue, ModuleTypeSchema } from "@/types/patch";

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
    release: getNumericParam(node, schema, "release")
  };
}

function getBindingRangeValues(binding: Patch["ui"]["macros"][number]["bindings"][number]) {
  if (binding.points && binding.points.length > 0) {
    const values = binding.points.map((point) => point.y);
    return { low: Math.min(...values), high: Math.max(...values) };
  }
  const min = binding.min ?? 0;
  const max = binding.max ?? 1;
  return { low: Math.min(min, max), high: Math.max(min, max) };
}

function resolveAdsrMacroRangeValues(patch: Patch, node: PatchNode, schema: ParamSchema[]) {
  const low = getAdsrParamValues(node, schema);
  const high = getAdsrParamValues(node, schema);
  let hasRange = false;

  for (const macro of patch.ui.macros) {
    for (const binding of macro.bindings) {
      if (binding.nodeId !== node.id || !(binding.paramId in low)) {
        continue;
      }
      const range = getBindingRangeValues(binding);
      const paramId = binding.paramId as keyof typeof low;
      low[paramId] = Math.min(low[paramId], range.low);
      high[paramId] = Math.max(high[paramId], range.high);
      hasRange = true;
    }
  }

  return hasRange ? { low, high } : null;
}

function drawAdsrEnvelopePath(
  ctx: CanvasRenderingContext2D,
  values: { attack: number; decay: number; sustain: number; release: number },
  graph: { x: number; y: number; width: number; height: number },
  longestDurationMs: number
) {
  const attackMs = Math.max(1, values.attack * 1000);
  const decayMs = Math.max(1, values.decay * 1000);
  const sustain = clamp01(values.sustain);
  const releaseMs = Math.max(1, values.release * 1000);
  const scaledDurationMs = Math.max(longestDurationMs, attackMs + decayMs + releaseMs, 1);
  const sustainHoldWidth = clamp(graph.width * 0.16, 10, 18);
  const timedWidth = Math.max(graph.width - sustainHoldWidth, graph.width * 0.6);
  const timeScale = timedWidth / scaledDurationMs;
  const ax = graph.x + attackMs * timeScale;
  const dx = ax + decayMs * timeScale;
  const sx = dx + sustainHoldWidth;
  const rx = graph.x + graph.width;
  const highY = graph.y + 6;
  const sustainY = graph.y + graph.height - 6 - sustain * (graph.height - 12);
  const baseY = graph.y + graph.height - 4;

  ctx.beginPath();
  ctx.moveTo(graph.x, baseY);
  ctx.lineTo(ax, highY);
  ctx.lineTo(dx, sustainY);
  ctx.lineTo(sx, sustainY);
  ctx.lineTo(rx, baseY);
  ctx.stroke();
}

function drawAdsrModuleFace(
  ctx: CanvasRenderingContext2D,
  patch: Patch,
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
  const macroRange = resolveAdsrMacroRangeValues(patch, node, schema);
  const longestDurationMs = Math.max(
    1,
    (currentValues.attack + currentValues.decay + currentValues.release) * 1000,
    macroRange ? (macroRange.low.attack + macroRange.low.decay + macroRange.low.release) * 1000 : 0,
    macroRange ? (macroRange.high.attack + macroRange.high.decay + macroRange.high.release) * 1000 : 0
  );

  ctx.strokeStyle = PATCH_COLOR_ADSR_GRAPH_BORDER;
  ctx.lineWidth = 1;
  ctx.strokeRect(graphX, graphY, graphW, graphH);

  if (macroRange) {
    ctx.lineWidth = 1.4;
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = PATCH_COLOR_ADSR_MACRO_LOW;
    drawAdsrEnvelopePath(ctx, macroRange.low, graph, longestDurationMs);
    ctx.strokeStyle = PATCH_COLOR_ADSR_MACRO_HIGH;
    drawAdsrEnvelopePath(ctx, macroRange.high, graph, longestDurationMs);
    ctx.setLineDash([]);
  }

  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 2;
  drawAdsrEnvelopePath(ctx, currentValues, graph, longestDurationMs);
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

function drawVcfModuleFace(
  ctx: CanvasRenderingContext2D,
  node: PatchNode,
  schema: ParamSchema[],
  x: number,
  y: number,
  accentColor: string
) {
  const graph = {
    x: x + PATCH_MODULE_FACE_INSET_X,
    y: y + PATCH_MODULE_FACE_TOP + 10,
    width: PATCH_NODE_WIDTH - PATCH_MODULE_FACE_INSET_X * 2,
    height: PATCH_NODE_HEIGHT - PATCH_MODULE_FACE_TOP - PATCH_MODULE_FACE_BOTTOM_INSET - 10
  };
  const cutoffParam = schema.find((param) => param.id === "cutoffHz" && param.type === "float");
  const cutoff = getNumericParam(node, schema, "cutoffHz");
  const min = cutoffParam?.type === "float" ? cutoffParam.range.min : 20;
  const max = cutoffParam?.type === "float" ? cutoffParam.range.max : 20000;
  const t = clamp01((clamp(cutoff, min, max) - min) / (max - min));
  const cutoffX = graph.x + t * graph.width;
  const type = String(node.params.type ?? "lowpass");
  ctx.strokeStyle = PATCH_COLOR_ADSR_GRAPH_BORDER;
  ctx.lineWidth = 1;
  ctx.strokeRect(graph.x, graph.y, graph.width, graph.height);
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (type === "highpass") {
    ctx.moveTo(graph.x, graph.y + graph.height - 10);
    ctx.quadraticCurveTo(cutoffX, graph.y + graph.height - 8, graph.x + graph.width, graph.y + 8);
  } else if (type === "bandpass") {
    ctx.moveTo(graph.x, graph.y + graph.height - 8);
    ctx.quadraticCurveTo(cutoffX, graph.y - 4, graph.x + graph.width, graph.y + graph.height - 8);
  } else {
    ctx.moveTo(graph.x, graph.y + 8);
    ctx.quadraticCurveTo(cutoffX, graph.y + 8, graph.x + graph.width, graph.y + graph.height - 10);
  }
  ctx.stroke();
  ctx.fillStyle = PATCH_COLOR_NODE_SUBTITLE;
  ctx.fillRect(cutoffX - 1, graph.y + 4, 2, graph.height - 8);
  ctx.font = "8px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillText("20", graph.x, graph.y + graph.height + 10);
  ctx.textAlign = "right";
  ctx.fillText("20k", graph.x + graph.width, graph.y + graph.height + 10);
  ctx.textAlign = cutoffX > graph.x + graph.width * 0.72 ? "right" : cutoffX < graph.x + graph.width * 0.28 ? "left" : "center";
  const cutoffLabel = cutoff >= 1000 ? `${(cutoff / 1000).toFixed(cutoff >= 10000 ? 0 : 1)}k` : `${Math.round(cutoff)}`;
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
  ctx.textAlign = "left";
  ctx.fillText("cv", graph.x + 2, graph.y + graph.height + 10);
  ctx.textAlign = "right";
  ctx.fillText("1", graph.x + graph.width, graph.y + graph.height + 10);
  ctx.fillText("1.0", graph.x - 2, graph.y + 7);
  ctx.fillText("0", graph.x - 2, graph.y + graph.height);
  ctx.fillStyle = accentColor;
  ctx.textAlign = "left";
  ctx.fillText(`bias ${bias.toFixed(2)}`, graph.x + 6, graph.y + 11);
  ctx.textAlign = "right";
  ctx.fillText(`+gain ${gain.toFixed(2)}`, graph.x + graph.width - 6, graph.y + 11);
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
    drawAdsrModuleFace(ctx, patch, node, schema.params, x, y, accentColor);
  } else if (node.typeId === "VCO") {
    drawVcoModuleFace(ctx, node, x, y, accentColor);
  } else if (node.typeId === "VCF") {
    drawVcfModuleFace(ctx, node, schema.params, x, y, accentColor);
  } else if (node.typeId === "VCA") {
    drawVcaModuleFace(ctx, node, schema.params, x, y, accentColor);
  } else if (node.typeId === "Saturation") {
    drawSaturationModuleFace(ctx, node, schema.params, x, y, accentColor);
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

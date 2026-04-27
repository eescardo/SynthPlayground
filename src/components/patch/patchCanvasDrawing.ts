import {
  PATCH_CANVAS_GRID,
  PATCH_COLOR_ADSR_GRAPH_BORDER,
  PATCH_COLOR_ADSR_MACRO_HIGH,
  PATCH_COLOR_ADSR_MACRO_LOW,
  PATCH_COLOR_CANVAS_BG,
  PATCH_COLOR_CONNECTION_FALLBACK,
  PATCH_COLOR_FACE_POPOVER_BACKDROP,
  PATCH_COLOR_FACE_POPOVER_SHADOW,
  PATCH_COLOR_GRID_MAJOR,
  PATCH_COLOR_GRID_MINOR,
  PATCH_COLOR_MODULE_DELETE_PREVIEW_FILL,
  PATCH_COLOR_MODULE_DELETE_PREVIEW_STROKE,
  PATCH_COLOR_MODULE_DIFF_ADDED_ACCENT,
  PATCH_COLOR_MODULE_DIFF_ADDED_FILL,
  PATCH_COLOR_MODULE_DIFF_ADDED_STROKE,
  PATCH_COLOR_MODULE_DIFF_MODIFIED_ACCENT,
  PATCH_COLOR_MODULE_DIFF_MODIFIED_FILL,
  PATCH_COLOR_MODULE_DIFF_MODIFIED_STROKE,
  PATCH_COLOR_MODULE_DIFF_PEDESTAL_FILL,
  PATCH_COLOR_MODULE_DIFF_PEDESTAL_STROKE,
  PATCH_COLOR_MODULE_FACE_ROW_BG,
  PATCH_COLOR_MODULE_MACRO_SELECTED_STROKE,
  PATCH_COLOR_NODE_HOVER_OVERLAY,
  PATCH_COLOR_NODE_SUBTITLE,
  PATCH_COLOR_NODE_TITLE,
  PATCH_COLOR_PENDING_PORT,
  PATCH_COLOR_PENDING_WIRE,
  PATCH_COLOR_PORT_LABEL_BG,
  PATCH_COLOR_PORT_LABEL_INVALID_BG,
  PATCH_COLOR_PORT_LABEL,
  PATCH_COLOR_VALID_TARGET,
  PATCH_COLOR_VALID_TARGET_FILL,
  PATCH_FACE_POPOVER_SCALE,
  PATCH_MODULE_FACE_BOTTOM_INSET,
  PATCH_MODULE_FACE_INSET_X,
  PATCH_MODULE_FACE_TOP,
  PATCH_NODE_BODY_TOP,
  PATCH_NODE_HEIGHT,
  PATCH_NODE_WIDTH,
  PATCH_PORT_LABEL_HEIGHT,
  PATCH_PORT_LABEL_MIN_TEXT,
  PATCH_PORT_LABEL_OVERHANG_RATIO,
  PATCH_PORT_LABEL_X_PADDING,
  PATCH_PORT_ROW_GAP,
  PATCH_PORT_START_Y
} from "@/components/patch/patchCanvasConstants";
import { resolveInvalidPortKeys } from "@/components/patch/patchCanvasValidation";
import {
  CanvasRect,
  HitPort,
  isHostPatchNodeId,
  isManagedOutputNode,
  resolveHostPatchPortRect,
  resolveHostPatchPortTint,
  resolveOutputHostPatchPortRect
} from "@/components/patch/patchCanvasGeometry";
import { clamp, clamp01 } from "@/lib/numeric";
import { SOURCE_HOST_NODE_IDS, SOURCE_HOST_NODE_TYPE_BY_ID } from "@/lib/patch/constants";
import { PatchDiff } from "@/lib/patch/diff";
import { getSignalCapabilityColor, resolveMutedPatchModuleColors } from "@/lib/patch/moduleCategories";
import { getModuleSchema } from "@/lib/patch/moduleRegistry";
import { getPatchOutputPort } from "@/lib/patch/ports";
import { Patch, PatchLayoutNode, PatchNode, ParamSchema, ParamValue, PatchValidationIssue, PortSchema } from "@/types/patch";

const PATCH_DIFF_PEDESTAL_INSET = 8;
const PATCH_DIFF_PEDESTAL_RADIUS = 10;
const PATCH_DIFF_PEDESTAL_STROKE_WIDTH = 8;

interface ResolvedPortPosition {
  x: number;
  y: number;
  width: number;
  height: number;
  anchorX: number;
  anchorY: number;
  schema: PortSchema;
}

function drawRoundedRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
}

function resolvePortLabelWidth(ctx: CanvasRenderingContext2D, port: PortSchema) {
  const minWidth = Math.ceil(ctx.measureText(PATCH_PORT_LABEL_MIN_TEXT).width) + PATCH_PORT_LABEL_X_PADDING * 2;
  return Math.max(minWidth, Math.ceil(ctx.measureText(port.id).width) + PATCH_PORT_LABEL_X_PADDING * 2);
}

function resolvePortLabelInset(ctx: CanvasRenderingContext2D) {
  const minWidth = Math.ceil(ctx.measureText(PATCH_PORT_LABEL_MIN_TEXT).width) + PATCH_PORT_LABEL_X_PADDING * 2;
  return minWidth * (1 - PATCH_PORT_LABEL_OVERHANG_RATIO);
}

function resolvePortLabelRect(
  ctx: CanvasRenderingContext2D,
  port: PortSchema,
  kind: "in" | "out",
  nodeX: number,
  nodeY: number,
  index: number
): ResolvedPortPosition {
  const width = resolvePortLabelWidth(ctx, port);
  const height = PATCH_PORT_LABEL_HEIGHT;
  const moduleInset = resolvePortLabelInset(ctx);
  const y = nodeY + PATCH_PORT_START_Y + index * PATCH_PORT_ROW_GAP;
  const labelX =
    kind === "in"
      ? nodeX + moduleInset - width
      : nodeX + PATCH_NODE_WIDTH - moduleInset;
  return {
    x: labelX,
    y,
    width,
    height,
    anchorX: kind === "in" ? labelX : labelX + width,
    anchorY: y,
    schema: port
  };
}

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
    const phase = index / 47;
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
    y: y + PATCH_MODULE_FACE_TOP + 4,
    width: PATCH_NODE_WIDTH - PATCH_MODULE_FACE_INSET_X * 2,
    height: PATCH_NODE_HEIGHT - PATCH_MODULE_FACE_TOP - PATCH_MODULE_FACE_BOTTOM_INSET - 8
  };
  const cutoffParam = schema.find((param) => param.id === "cutoffHz" && param.type === "float");
  const cutoff = getNumericParam(node, schema, "cutoffHz");
  const min = cutoffParam?.type === "float" ? cutoffParam.range.min : 20;
  const max = cutoffParam?.type === "float" ? cutoffParam.range.max : 20000;
  const t = clamp01((Math.log(Math.max(cutoff, min)) - Math.log(min)) / (Math.log(max) - Math.log(min)));
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
}

function drawMixerModuleFace(
  ctx: CanvasRenderingContext2D,
  node: PatchNode,
  schema: ParamSchema[],
  x: number,
  y: number,
  accentColor: string,
  inputCount: number
) {
  const graphX = x + PATCH_MODULE_FACE_INSET_X;
  const graphY = y + PATCH_MODULE_FACE_TOP + 4;
  const graphW = PATCH_NODE_WIDTH - PATCH_MODULE_FACE_INSET_X * 2;
  const graphH = PATCH_NODE_HEIGHT - PATCH_MODULE_FACE_TOP - PATCH_MODULE_FACE_BOTTOM_INSET - 8;
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
    const value = clamp01(getNumericParam(node, schema, `gain${index + 1}`));
    const barX = graphX + sideInset + index * (barWidth + barGap);
    const barAvailableH = graphH - barTopInset - barBottomInset;
    const barH = Math.max(4, value * barAvailableH);
    ctx.fillStyle = PATCH_COLOR_MODULE_FACE_ROW_BG;
    ctx.fillRect(barX, graphY + barTopInset, barWidth, barAvailableH);
    ctx.fillStyle = accentColor;
    ctx.fillRect(barX, graphY + graphH - barBottomInset - barH, barWidth, barH);
    ctx.fillStyle = PATCH_COLOR_NODE_SUBTITLE;
    ctx.fillText(String(index + 1), barX + barWidth / 2, graphY + graphH - 3);
  }
  ctx.textAlign = "left";
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

export function drawPatchModuleCard(
  ctx: CanvasRenderingContext2D,
  patch: Patch,
  node: PatchNode,
  schema: NonNullable<ReturnType<typeof getModuleSchema>>,
  x: number,
  y: number,
  invalidPortKeys: Set<string>,
  options: {
    diffStatus: "unchanged" | "added" | "modified";
    hovered: boolean;
    macroSelected: boolean;
    selected: boolean;
    deletePreview: boolean;
    clearPreview: boolean;
  }
) {
  ctx.save();
  const baseAlpha = options.clearPreview ? 0.5 : 1;
  ctx.globalAlpha = baseAlpha;
  const moduleColors = resolveMutedPatchModuleColors(schema.categories);
  if (options.diffStatus === "added" || options.diffStatus === "modified") {
    const pedestalX = x - PATCH_DIFF_PEDESTAL_INSET;
    const pedestalY = y - PATCH_DIFF_PEDESTAL_INSET;
    const pedestalWidth = PATCH_NODE_WIDTH + PATCH_DIFF_PEDESTAL_INSET * 2;
    const pedestalHeight = PATCH_NODE_HEIGHT + PATCH_DIFF_PEDESTAL_INSET * 2;
    ctx.fillStyle = PATCH_COLOR_MODULE_DIFF_PEDESTAL_FILL;
    drawRoundedRectPath(ctx, pedestalX, pedestalY, pedestalWidth, pedestalHeight, PATCH_DIFF_PEDESTAL_RADIUS);
    ctx.fill();
    ctx.strokeStyle = PATCH_COLOR_MODULE_DIFF_PEDESTAL_STROKE;
    ctx.lineWidth = PATCH_DIFF_PEDESTAL_STROKE_WIDTH;
    drawRoundedRectPath(ctx, pedestalX, pedestalY, pedestalWidth, pedestalHeight, PATCH_DIFF_PEDESTAL_RADIUS);
    ctx.stroke();
  }
  ctx.fillStyle = moduleColors.fill;
  ctx.fillRect(x, y, PATCH_NODE_WIDTH, PATCH_NODE_HEIGHT);
  if (options.diffStatus === "added" || options.diffStatus === "modified") {
    ctx.fillStyle = options.diffStatus === "added" ? PATCH_COLOR_MODULE_DIFF_ADDED_FILL : PATCH_COLOR_MODULE_DIFF_MODIFIED_FILL;
    ctx.fillRect(x, y, PATCH_NODE_WIDTH, PATCH_NODE_HEIGHT);
  }
  if (options.macroSelected) {
    ctx.strokeStyle = PATCH_COLOR_MODULE_MACRO_SELECTED_STROKE;
    ctx.lineWidth = 3;
    ctx.strokeRect(x - 4, y - 4, PATCH_NODE_WIDTH + 8, PATCH_NODE_HEIGHT + 8);
  }
  if (options.deletePreview) {
    ctx.fillStyle = PATCH_COLOR_MODULE_DELETE_PREVIEW_FILL;
    ctx.fillRect(x, y, PATCH_NODE_WIDTH, PATCH_NODE_HEIGHT);
  }
  if (options.hovered && !options.selected) {
    ctx.fillStyle = PATCH_COLOR_NODE_HOVER_OVERLAY;
    ctx.fillRect(x + 2, y + 2, PATCH_NODE_WIDTH - 4, PATCH_NODE_HEIGHT - 4);
  }
  ctx.fillStyle =
    options.diffStatus === "added"
      ? PATCH_COLOR_MODULE_DIFF_ADDED_ACCENT
      : options.diffStatus === "modified"
        ? PATCH_COLOR_MODULE_DIFF_MODIFIED_ACCENT
        : moduleColors.accent;
  ctx.globalAlpha = baseAlpha * (options.selected ? 0.26 : options.hovered ? 0.2 : options.diffStatus === "unchanged" ? 0.12 : 0.18);
  ctx.fillRect(x, y, PATCH_NODE_WIDTH, PATCH_NODE_BODY_TOP - 8);
  ctx.globalAlpha = baseAlpha;
  ctx.strokeStyle =
    options.deletePreview
      ? PATCH_COLOR_MODULE_DELETE_PREVIEW_STROKE
      : options.diffStatus === "added"
      ? PATCH_COLOR_MODULE_DIFF_ADDED_STROKE
      : options.diffStatus === "modified"
        ? PATCH_COLOR_MODULE_DIFF_MODIFIED_STROKE
        : options.selected
          ? moduleColors.accent
          : options.hovered
            ? PATCH_COLOR_NODE_TITLE
            : moduleColors.stroke;
  ctx.lineWidth = options.deletePreview ? 3.5 : options.hovered ? 3 : 2;
  ctx.strokeRect(x, y, PATCH_NODE_WIDTH, PATCH_NODE_HEIGHT);

  ctx.fillStyle = PATCH_COLOR_NODE_TITLE;
  ctx.font = "13px 'Trebuchet MS', 'Segoe UI', sans-serif";
  ctx.fillText(node.typeId, x + 10, y + 18);
  const titleWidth = ctx.measureText(node.typeId).width;
  ctx.fillStyle = PATCH_COLOR_NODE_SUBTITLE;
  ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText(node.id, x + 18 + titleWidth, y + 18);

  if (node.typeId === "ADSR") {
    drawAdsrModuleFace(ctx, patch, node, schema.params, x, y, moduleColors.accent);
  } else if (node.typeId === "VCO") {
    drawVcoModuleFace(ctx, node, x, y, moduleColors.accent);
  } else if (node.typeId === "VCF") {
    drawVcfModuleFace(ctx, node, schema.params, x, y, moduleColors.accent);
  } else if (node.typeId === "Mixer4") {
    drawMixerModuleFace(ctx, node, schema.params, x, y, moduleColors.accent, 4);
  } else if (node.typeId === "CVMixer2") {
    drawMixerModuleFace(ctx, node, schema.params, x, y, moduleColors.accent, 2);
  } else {
    drawGenericModuleFace(ctx, node, schema.params, x, y);
  }

  ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
  const drawPortLabel = (port: PortSchema, index: number, kind: "in" | "out") => {
    const rect = resolvePortLabelRect(ctx, port, kind, x, y, index);
    ctx.fillStyle = invalidPortKeys.has(`${node.id}:${kind}:${port.id}`) ? PATCH_COLOR_PORT_LABEL_INVALID_BG : PATCH_COLOR_PORT_LABEL_BG;
    ctx.fillRect(rect.x, rect.y - rect.height / 2, rect.width, rect.height);
    ctx.fillStyle = PATCH_COLOR_PORT_LABEL;
    ctx.textAlign = "center";
    ctx.fillText(port.id, rect.x + rect.width / 2, rect.y + 3);
    ctx.textAlign = "left";
  };

  schema.portsIn.forEach((port, index) => drawPortLabel(port, index, "in"));
  schema.portsOut.forEach((port, index) => drawPortLabel(port, index, "out"));
  ctx.restore();
}

function drawPatchGrid(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.fillStyle = PATCH_COLOR_CANVAS_BG;
  ctx.fillRect(0, 0, width, height);

  for (let x = 0; x < width; x += PATCH_CANVAS_GRID) {
    ctx.strokeStyle = x % (PATCH_CANVAS_GRID * 4) === 0 ? PATCH_COLOR_GRID_MAJOR : PATCH_COLOR_GRID_MINOR;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y < height; y += PATCH_CANVAS_GRID) {
    ctx.strokeStyle = y % (PATCH_CANVAS_GRID * 4) === 0 ? PATCH_COLOR_GRID_MAJOR : PATCH_COLOR_GRID_MINOR;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
}

function resolvePortPositions(
  ctx: CanvasRenderingContext2D,
  patch: Patch,
  layoutByNode: Map<string, PatchLayoutNode>,
  outputHostCanvasLeft: number
) {
  const portPositions = new Map<string, ResolvedPortPosition>();
  ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";

  patch.nodes.forEach((node) => {
    const schema = getModuleSchema(node.typeId);
    if (!schema) return;
    if (isManagedOutputNode(patch, node.id)) return;
    const layout = layoutByNode.get(node.id);
    if (!layout) return;

    const x = layout.x * PATCH_CANVAS_GRID;
    const y = layout.y * PATCH_CANVAS_GRID;

    schema.portsIn.forEach((port, index) => {
      portPositions.set(`${node.id}:in:${port.id}`, resolvePortLabelRect(ctx, port, "in", x, y, index));
    });

    schema.portsOut.forEach((port, index) => {
      portPositions.set(`${node.id}:out:${port.id}`, resolvePortLabelRect(ctx, port, "out", x, y, index));
    });
  });

  const outputPatchPort = getPatchOutputPort(patch);
  const outputPort = outputPatchPort ? getModuleSchema(outputPatchPort.typeId)?.portsIn.find((port) => port.id === patch.io.audioOutPortId) : undefined;
  if (outputPatchPort && outputPort) {
    const rect = resolveOutputHostPatchPortRect(outputHostCanvasLeft);
    portPositions.set(`${outputPatchPort.id}:in:${outputPort.id}`, {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      anchorX: rect.x,
      anchorY: rect.y,
      schema: outputPort
    });
  }

  SOURCE_HOST_NODE_IDS.forEach((hostId) => {
    const schema = getModuleSchema(SOURCE_HOST_NODE_TYPE_BY_ID[hostId]);
    const rect = resolveHostPatchPortRect(hostId);
    const port = schema?.portsOut[0];
    if (!rect || !port) {
      return;
    }
    portPositions.set(`${hostId}:out:${port.id}`, {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      anchorX: rect.x + rect.width,
      anchorY: rect.y,
      schema: port
    });
  });

  return portPositions;
}

function drawPatchConnections(
  ctx: CanvasRenderingContext2D,
  patch: Patch,
  portPositions: Map<string, ResolvedPortPosition>
) {
  for (const connection of patch.connections) {
    const from = portPositions.get(`${connection.from.nodeId}:out:${connection.from.portId}`);
    const to = portPositions.get(`${connection.to.nodeId}:in:${connection.to.portId}`);
    if (!from || !to) continue;

    const commonCapability = from.schema.capabilities.find((cap) => to.schema.capabilities.includes(cap)) ?? "AUDIO";
    const isHostConnection =
      isHostPatchNodeId(connection.from.nodeId) ||
      isHostPatchNodeId(connection.to.nodeId) ||
      isManagedOutputNode(patch, connection.to.nodeId);
    ctx.save();
    ctx.strokeStyle = isHostConnection
      ? resolveHostPatchPortTint(
          isManagedOutputNode(patch, connection.to.nodeId)
            ? "$host.output"
            : isHostPatchNodeId(connection.from.nodeId)
              ? connection.from.nodeId
              : connection.to.nodeId
        ).wire
      : getSignalCapabilityColor(commonCapability) ?? PATCH_COLOR_CONNECTION_FALLBACK;
    ctx.lineWidth = 2;
    if (isHostConnection) {
      ctx.globalAlpha = 0.5;
      ctx.setLineDash([2, 6]);
    }
    ctx.beginPath();
    ctx.moveTo(from.anchorX, from.anchorY);
    ctx.lineTo(to.anchorX, to.anchorY);
    ctx.stroke();
    ctx.restore();
  }
}

function drawPatchModules(
  ctx: CanvasRenderingContext2D,
  patch: Patch,
  patchDiff: PatchDiff,
  layoutByNode: Map<string, PatchLayoutNode>,
  invalidPortKeys: Set<string>,
  hoveredNodeId: string | null,
  selectedMacroNodeIds: Set<string>,
  selectedNodeId: string | undefined,
  deletePreviewNodeId: string | null | undefined,
  clearPreviewActive: boolean | undefined
) {
  patch.nodes.forEach((node) => {
    const schema = getModuleSchema(node.typeId);
    if (!schema) return;
    if (isManagedOutputNode(patch, node.id)) return;
    const layout = layoutByNode.get(node.id);
    if (!layout) return;

    const x = layout.x * PATCH_CANVAS_GRID;
    const y = layout.y * PATCH_CANVAS_GRID;

    drawPatchModuleCard(ctx, patch, node, schema, x, y, invalidPortKeys, {
      diffStatus: patchDiff.nodeDiffById.get(node.id)?.status ?? "unchanged",
      hovered: hoveredNodeId === node.id,
      macroSelected: selectedMacroNodeIds.has(node.id),
      selected: selectedNodeId === node.id,
      deletePreview: deletePreviewNodeId === node.id,
      clearPreview: Boolean(clearPreviewActive)
    });
  });
}

function drawPendingPatchPort(
  ctx: CanvasRenderingContext2D,
  pendingPort: HitPort | null,
  portPositions: Map<string, ResolvedPortPosition>
) {
  if (!pendingPort) {
    return;
  }
  const portKey = `${pendingPort.nodeId}:${pendingPort.kind}:${pendingPort.portId}`;
  const p = portPositions.get(portKey);
  if (p) {
    ctx.strokeStyle = PATCH_COLOR_PENDING_PORT;
    ctx.lineWidth = 2;
    ctx.strokeRect(p.x - 2, p.y - p.height / 2 - 2, p.width + 4, p.height + 4);
  }
}

function drawPendingPatchWire(
  ctx: CanvasRenderingContext2D,
  pendingPort: HitPort | null,
  pointer: { x: number; y: number } | null,
  portPositions: Map<string, ResolvedPortPosition>
) {
  if (!pendingPort || !pointer) {
    return;
  }
  const portKey = `${pendingPort.nodeId}:${pendingPort.kind}:${pendingPort.portId}`;
  const anchor = portPositions.get(portKey);
  if (!anchor) {
    return;
  }
  ctx.save();
  ctx.strokeStyle = getSignalCapabilityColor(anchor.schema.capabilities[0]) ?? PATCH_COLOR_PENDING_WIRE;
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.moveTo(anchor.anchorX, anchor.anchorY);
  ctx.lineTo(pointer.x, pointer.y);
  ctx.stroke();
  ctx.restore();
}

function drawHoveredAttachTarget(
  ctx: CanvasRenderingContext2D,
  patch: Patch,
  portPositions: Map<string, ResolvedPortPosition>,
  hoveredAttachTarget:
    | { kind: "port"; nodeId: string; portId: string; portKind: "in" | "out" }
    | { kind: "connection"; connectionId: string }
    | null
) {
  if (!hoveredAttachTarget) {
    return;
  }

  ctx.save();
  ctx.strokeStyle = PATCH_COLOR_VALID_TARGET;
  ctx.fillStyle = PATCH_COLOR_VALID_TARGET_FILL;
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);

  if (hoveredAttachTarget.kind === "port") {
    const port = portPositions.get(`${hoveredAttachTarget.nodeId}:${hoveredAttachTarget.portKind}:${hoveredAttachTarget.portId}`);
    if (port) {
      ctx.fillRect(port.x - 4, port.y - port.height / 2 - 4, port.width + 8, port.height + 8);
      ctx.strokeRect(port.x - 4, port.y - port.height / 2 - 4, port.width + 8, port.height + 8);
    }
    ctx.restore();
    return;
  }

  const connection = patch.connections.find((entry) => entry.id === hoveredAttachTarget.connectionId);
  if (!connection) {
    ctx.restore();
    return;
  }
  const from = portPositions.get(`${connection.from.nodeId}:out:${connection.from.portId}`);
  const to = portPositions.get(`${connection.to.nodeId}:in:${connection.to.portId}`);
  if (!from || !to) {
    ctx.restore();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(from.anchorX, from.anchorY);
  ctx.lineTo(to.anchorX, to.anchorY);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc((from.anchorX + to.anchorX) / 2, (from.anchorY + to.anchorY) / 2, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

export function drawPatchFacePopover(
  ctx: CanvasRenderingContext2D,
  patch: Patch,
  patchDiff: PatchDiff,
  node: PatchNode,
  schema: NonNullable<ReturnType<typeof getModuleSchema>>,
  rect: CanvasRect,
  macroSelected: boolean,
  deletePreview: boolean,
  clearPreview: boolean
) {
  ctx.save();
  ctx.shadowColor = PATCH_COLOR_FACE_POPOVER_SHADOW;
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 12;
  ctx.fillStyle = PATCH_COLOR_FACE_POPOVER_BACKDROP;
  ctx.fillRect(rect.x - 10, rect.y - 10, rect.width + 20, rect.height + 20);
  ctx.restore();

  ctx.save();
  ctx.translate(rect.x, rect.y);
  ctx.scale(PATCH_FACE_POPOVER_SCALE, PATCH_FACE_POPOVER_SCALE);
  drawPatchModuleCard(ctx, patch, node, schema, 0, 0, new Set<string>(), {
    diffStatus: patchDiff.nodeDiffById.get(node.id)?.status ?? "unchanged",
    hovered: false,
    macroSelected,
    selected: true,
    deletePreview,
    clearPreview
  });
  ctx.restore();
}

function buildHitPorts(portPositions: Map<string, ResolvedPortPosition>) {
  const hitPorts: HitPort[] = [];
  for (const [key, value] of portPositions.entries()) {
    const [nodeId, kind, portId] = key.split(":");
    if (isHostPatchNodeId(nodeId)) {
      continue;
    }
    hitPorts.push({
      nodeId,
      kind: kind as "in" | "out",
      portId,
      x: value.x,
      y: value.y,
      width: value.width,
      height: value.height
    });
  }
  return hitPorts;
}

export function drawPatchCanvas(args: {
  canvas: HTMLCanvasElement;
  canvasSize: { width: number; height: number };
  facePopoverNodeId: string | null;
  getFacePopoverRect: (nodeId: string) => CanvasRect | null;
  hoveredNodeId: string | null;
  layoutByNode: Map<string, PatchLayoutNode>;
  nodeById: Map<string, PatchNode>;
  patch: Patch;
  outputHostCanvasLeft: number;
  patchDiff: PatchDiff;
  validationIssues: PatchValidationIssue[];
  pendingFromPort: HitPort | null;
  pendingWirePointer?: { x: number; y: number } | null;
  selectedMacroNodeIds: Set<string>;
  selectedNodeId?: string;
  deletePreviewNodeId?: string | null;
  clearPreviewActive?: boolean;
  hoveredAttachTarget?: { kind: "port"; nodeId: string; portId: string; portKind: "in" | "out" } | { kind: "connection"; connectionId: string } | null;
}): HitPort[] {
  const ctx = args.canvas.getContext("2d");
  if (!ctx) return [];

  const { width, height } = args.canvasSize;
  args.canvas.width = width;
  args.canvas.height = height;

  drawPatchGrid(ctx, width, height);
  const portPositions = resolvePortPositions(ctx, args.patch, args.layoutByNode, args.outputHostCanvasLeft);
  const invalidPortKeys = resolveInvalidPortKeys(args.validationIssues);
  drawPatchConnections(ctx, args.patch, portPositions);
  drawPatchModules(
    ctx,
    args.patch,
    args.patchDiff,
    args.layoutByNode,
    invalidPortKeys,
    args.hoveredNodeId,
    args.selectedMacroNodeIds,
    args.selectedNodeId,
    args.deletePreviewNodeId,
    args.clearPreviewActive
  );
  drawPendingPatchPort(ctx, args.pendingFromPort, portPositions);
  drawPendingPatchWire(ctx, args.pendingFromPort, args.pendingWirePointer ?? null, portPositions);
  drawHoveredAttachTarget(ctx, args.patch, portPositions, args.hoveredAttachTarget ?? null);

  if (args.facePopoverNodeId) {
    const node = args.nodeById.get(args.facePopoverNodeId);
    const schema = node ? getModuleSchema(node.typeId) : undefined;
    const rect = args.getFacePopoverRect(args.facePopoverNodeId);
    if (node && schema && rect) {
      drawPatchFacePopover(
        ctx,
        args.patch,
        args.patchDiff,
        node,
        schema,
        rect,
        args.selectedMacroNodeIds.has(node.id),
        args.deletePreviewNodeId === node.id,
        Boolean(args.clearPreviewActive)
      );
    }
  }

  return buildHitPorts(portPositions);
}

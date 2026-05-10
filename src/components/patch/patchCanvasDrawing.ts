import {
  PATCH_CANVAS_GRID,
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
  PATCH_NODE_BODY_TOP,
  PATCH_NODE_HEIGHT,
  PATCH_NODE_WIDTH
} from "@/components/patch/patchCanvasConstants";
import { resolveInvalidPortKeys } from "@/components/patch/patchCanvasValidation";
import { drawPatchModuleFaceContent } from "@/components/patch/patchModuleFaceDrawing";
import {
  CanvasRect,
  HitPort,
  resolveHostPatchPortRect,
  resolveHostPatchPortTint,
  resolvePatchNodePortLabelRect,
  resolveOutputHostPatchPortRect
} from "@/components/patch/patchCanvasGeometry";
import {
  clampTooltipRect,
  PATCH_WIRE_TOOLTIP_HEIGHT,
  PATCH_WIRE_TOOLTIP_WIDTH,
  PatchWireTooltipBounds,
  resolveArmedWireCancelButtonRect,
  resolveWireReplacePromptRects,
  resolveWireTooltipOrigin
} from "@/components/patch/patchWireGeometry";
import {
  PatchArmedWireModuleHover,
  PatchCanvasRenderState,
  PatchLockedPortTooltip,
  PatchWireCandidateDisplay,
  PatchWireCandidatePulse
} from "@/components/patch/patchCanvasRenderState";
import { HOST_PORT_IDS, SOURCE_HOST_PORT_IDS, SOURCE_HOST_PORT_TYPE_BY_ID } from "@/lib/patch/constants";
import { PatchDiff } from "@/lib/patch/diff";
import { getSignalCapabilityColor, resolveMutedPatchModuleColors } from "@/lib/patch/moduleCategories";
import { getModuleSchema } from "@/lib/patch/moduleRegistry";
import {
  getPatchOutputInputPortId,
  getPatchOutputPort,
  isHostPatchPortId,
  isPatchOutputPortId
} from "@/lib/patch/ports";
import { Patch, PatchLayoutNode, PatchNode, PortSchema } from "@/types/patch";
import { PatchWireCommitFeedback } from "@/components/patch/patchWireFeedback";

const PATCH_DIFF_PEDESTAL_INSET = 8;
const PATCH_DIFF_PEDESTAL_RADIUS = 10;
const PATCH_DIFF_PEDESTAL_STROKE_WIDTH = 8;
const PATCH_EXPANDED_FACE_HEADER_SCALE = 1.69;
const PATCH_WIRE_CANDIDATE_PULSE_MS = 380;
const PATCH_WIRE_COMMIT_FLASH_MS = 880;
const PATCH_WIRE_START_TOOLTIP_WIDTH = 236;
const PATCH_WIRE_START_TOOLTIP_PADDING_X = 10;
const PATCH_WIRE_START_TOOLTIP_PADDING_Y = 8;
const PATCH_WIRE_START_TOOLTIP_LINE_HEIGHT = 13;

interface ResolvedPortPosition {
  x: number;
  y: number;
  width: number;
  height: number;
  anchorX: number;
  anchorY: number;
  schema: PortSchema;
}

function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
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

function resolvePortLabelRect(
  port: PortSchema,
  kind: "in" | "out",
  nodeX: number,
  nodeY: number,
  index: number
): ResolvedPortPosition {
  const rect = resolvePatchNodePortLabelRect(port.id, kind, nodeX, nodeY, index);
  return {
    ...rect,
    schema: port
  };
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
    expandedFace?: boolean;
  }
) {
  ctx.save();
  const baseAlpha = options.clearPreview ? 0.5 : 1;
  const expandedHeaderScale = options.expandedFace ? PATCH_EXPANDED_FACE_HEADER_SCALE / PATCH_FACE_POPOVER_SCALE : 1;
  const expandedStrokeScale = options.expandedFace ? 1 / PATCH_FACE_POPOVER_SCALE : 1;
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
    ctx.fillStyle =
      options.diffStatus === "added" ? PATCH_COLOR_MODULE_DIFF_ADDED_FILL : PATCH_COLOR_MODULE_DIFF_MODIFIED_FILL;
    ctx.fillRect(x, y, PATCH_NODE_WIDTH, PATCH_NODE_HEIGHT);
  }
  if (options.macroSelected) {
    ctx.strokeStyle = PATCH_COLOR_MODULE_MACRO_SELECTED_STROKE;
    ctx.lineWidth = 3 * expandedStrokeScale;
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
  ctx.globalAlpha =
    baseAlpha * (options.selected ? 0.26 : options.hovered ? 0.2 : options.diffStatus === "unchanged" ? 0.12 : 0.18);
  ctx.fillRect(x, y, PATCH_NODE_WIDTH, (PATCH_NODE_BODY_TOP - 8) * expandedHeaderScale);
  ctx.globalAlpha = baseAlpha;
  ctx.strokeStyle = options.deletePreview
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
  ctx.lineWidth = (options.deletePreview ? 3.5 : options.hovered ? 3 : 2) * expandedStrokeScale;
  ctx.strokeRect(x, y, PATCH_NODE_WIDTH, PATCH_NODE_HEIGHT);

  ctx.fillStyle = PATCH_COLOR_NODE_TITLE;
  ctx.font = `${13 * expandedHeaderScale}px 'Trebuchet MS', 'Segoe UI', sans-serif`;
  const titleY = y + 18 * expandedHeaderScale;
  ctx.fillText(node.typeId, x + 10, titleY);
  const titleWidth = ctx.measureText(node.typeId).width;
  ctx.fillStyle = PATCH_COLOR_NODE_SUBTITLE;
  ctx.font = `${10 * expandedHeaderScale}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.fillText(node.id, x + 18 + titleWidth, titleY);

  drawPatchModuleFaceContent(ctx, patch, node, schema, x, y, moduleColors.accent, {
    expanded: options.expandedFace === true
  });

  ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
  const drawPortLabel = (port: PortSchema, index: number, kind: "in" | "out") => {
    const rect = resolvePortLabelRect(port, kind, x, y, index);
    ctx.fillStyle = invalidPortKeys.has(`${node.id}:${kind}:${port.id}`)
      ? PATCH_COLOR_PORT_LABEL_INVALID_BG
      : PATCH_COLOR_PORT_LABEL_BG;
    ctx.fillRect(rect.x, rect.y - rect.height / 2, rect.width, rect.height);
    ctx.fillStyle = PATCH_COLOR_PORT_LABEL;
    ctx.textAlign = "center";
    ctx.fillText(port.id, rect.x + rect.width / 2, rect.y + 3);
    ctx.textAlign = "left";
  };

  if (!options.expandedFace) {
    schema.portsIn.forEach((port, index) => drawPortLabel(port, index, "in"));
    schema.portsOut.forEach((port, index) => drawPortLabel(port, index, "out"));
  }
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
    if (isPatchOutputPortId(patch, node.id)) return;
    const layout = layoutByNode.get(node.id);
    if (!layout) return;

    const x = layout.x * PATCH_CANVAS_GRID;
    const y = layout.y * PATCH_CANVAS_GRID;

    schema.portsIn.forEach((port, index) => {
      portPositions.set(`${node.id}:in:${port.id}`, resolvePortLabelRect(port, "in", x, y, index));
    });

    schema.portsOut.forEach((port, index) => {
      portPositions.set(`${node.id}:out:${port.id}`, resolvePortLabelRect(port, "out", x, y, index));
    });
  });

  const outputPatchPort = getPatchOutputPort(patch);
  const outputInputPortId = getPatchOutputInputPortId(patch);
  const outputPort = outputPatchPort
    ? getModuleSchema(outputPatchPort.typeId)?.portsIn.find((port) => port.id === outputInputPortId)
    : undefined;
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

  SOURCE_HOST_PORT_IDS.forEach((hostId) => {
    const schema = getModuleSchema(SOURCE_HOST_PORT_TYPE_BY_ID[hostId]);
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
  portPositions: Map<string, ResolvedPortPosition>,
  selectedConnectionId?: string | null,
  deletePreviewConnectionId?: string | null
) {
  for (const connection of patch.connections) {
    const from = portPositions.get(`${connection.from.nodeId}:out:${connection.from.portId}`);
    const to = portPositions.get(`${connection.to.nodeId}:in:${connection.to.portId}`);
    if (!from || !to) continue;

    const commonCapability = from.schema.capabilities.find((cap) => to.schema.capabilities.includes(cap)) ?? "AUDIO";
    const isHostConnection =
      isHostPatchPortId(connection.from.nodeId) ||
      isHostPatchPortId(connection.to.nodeId) ||
      isPatchOutputPortId(patch, connection.to.nodeId);
    ctx.save();
    ctx.strokeStyle = isHostConnection
      ? resolveHostPatchPortTint(
          isPatchOutputPortId(patch, connection.to.nodeId)
            ? HOST_PORT_IDS.output
            : isHostPatchPortId(connection.from.nodeId)
              ? connection.from.nodeId
              : connection.to.nodeId
        ).wire
      : (getSignalCapabilityColor(commonCapability) ?? PATCH_COLOR_CONNECTION_FALLBACK);
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

    if (connection.id === selectedConnectionId || connection.id === deletePreviewConnectionId) {
      ctx.save();
      ctx.strokeStyle = connection.id === deletePreviewConnectionId ? "#f97373" : "#f6d365";
      ctx.lineWidth = connection.id === deletePreviewConnectionId ? 5 : 4;
      ctx.globalAlpha = connection.id === deletePreviewConnectionId ? 0.95 : 0.9;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(from.anchorX, from.anchorY);
      ctx.lineTo(to.anchorX, to.anchorY);
      ctx.stroke();
      ctx.restore();
    }
  }
}

function resolveFeedbackProgress(startedAt: number, now: number, durationMs: number) {
  return Math.min(1, Math.max(0, (now - startedAt) / durationMs));
}

function drawPortFeedbackRing(
  ctx: CanvasRenderingContext2D,
  port: ResolvedPortPosition,
  color: string,
  progress: number,
  maxRadius = 8
) {
  const alpha = Math.max(0, 1 - progress);
  if (alpha <= 0) {
    return;
  }
  const cx = port.anchorX;
  const cy = port.anchorY;
  const radius = 4 + maxRadius * progress;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawWireCandidatePulse(
  ctx: CanvasRenderingContext2D,
  portPositions: Map<string, ResolvedPortPosition>,
  pulse: PatchWireCandidatePulse | null | undefined,
  now: number
) {
  if (!pulse) {
    return;
  }
  const progress = resolveFeedbackProgress(pulse.startedAt, now, PATCH_WIRE_CANDIDATE_PULSE_MS);
  if (progress >= 1) {
    return;
  }
  const port = portPositions.get(`${pulse.target.nodeId}:${pulse.target.portKind}:${pulse.target.portId}`);
  if (!port) {
    return;
  }
  const color =
    pulse.status === "invalid"
      ? "rgba(255, 92, 112, 0.95)"
      : pulse.status === "replace"
        ? "rgba(255, 203, 87, 0.95)"
        : "rgba(103, 224, 153, 0.95)";
  const pulseStrength = Math.sin(progress * Math.PI);
  const inset = 1 + pulseStrength * 2;
  ctx.save();
  ctx.globalAlpha = 0.28 + pulseStrength * 0.58;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.4 + pulseStrength * 1.1;
  ctx.strokeRect(port.x - inset, port.y - port.height / 2 - inset, port.width + inset * 2, port.height + inset * 2);
  ctx.restore();
}

function drawWireCommitFeedback(
  ctx: CanvasRenderingContext2D,
  portPositions: Map<string, ResolvedPortPosition>,
  feedback: PatchWireCommitFeedback | null | undefined,
  now: number
) {
  if (!feedback) {
    return;
  }
  const progress = resolveFeedbackProgress(feedback.startedAt, now, PATCH_WIRE_COMMIT_FLASH_MS);
  if (progress >= 1) {
    return;
  }
  const from = portPositions.get(`${feedback.from.nodeId}:out:${feedback.from.portId}`);
  const to = portPositions.get(`${feedback.to.nodeId}:in:${feedback.to.portId}`);
  if (!from || !to) {
    return;
  }
  const alpha = Math.max(0, 1 - progress);
  ctx.save();
  ctx.globalAlpha = 0.88 * alpha;
  ctx.strokeStyle = "rgba(255, 235, 156, 0.98)";
  ctx.lineWidth = 2.8;
  ctx.setLineDash([7, 5]);
  ctx.beginPath();
  ctx.moveTo(from.anchorX, from.anchorY);
  ctx.lineTo(to.anchorX, to.anchorY);
  ctx.stroke();
  ctx.restore();
  drawPortFeedbackRing(ctx, from, "rgba(255, 235, 156, 0.95)", progress, 9);
  drawPortFeedbackRing(ctx, to, "rgba(255, 235, 156, 0.95)", progress, 9);
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
    if (isPatchOutputPortId(patch, node.id)) return;
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

function formatSignalCapabilityLabel(port: ResolvedPortPosition) {
  const capability = port.schema.capabilities[0] ?? "AUDIO";
  return capability === "AUDIO" ? "audio" : capability;
}

function formatArticle(label: string) {
  return /^[aeiou]/i.test(label) ? "an" : "a";
}

function resolveWireStartTooltipLines(pendingPort: HitPort, source: ResolvedPortPosition) {
  const targetKind = pendingPort.kind === "out" ? "input" : "output";
  const signalLabel = formatSignalCapabilityLabel(source);
  return [
    `Wiring from ${pendingPort.nodeId}.${pendingPort.portId}.`,
    `Select ${formatArticle(signalLabel)} ${signalLabel} ${targetKind}, or press Esc to cancel.`
  ];
}

function distanceToSegment(
  point: { x: number; y: number },
  start: { x: number; y: number },
  end: { x: number; y: number }
) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}

function resolveWireStartTooltipRect(
  source: ResolvedPortPosition,
  pointer: { x: number; y: number } | null | undefined,
  lines: string[],
  bounds?: PatchWireTooltipBounds
) {
  const width = PATCH_WIRE_START_TOOLTIP_WIDTH;
  const height = lines.length * PATCH_WIRE_START_TOOLTIP_LINE_HEIGHT + PATCH_WIRE_START_TOOLTIP_PADDING_Y * 2;
  const anchor = { x: source.anchorX, y: source.anchorY };
  const candidates = [
    { x: source.x + source.width + 12, y: source.y - height / 2 },
    { x: source.x - width - 12, y: source.y - height / 2 },
    { x: source.x + source.width / 2 - width / 2, y: source.y - source.height / 2 - height - 12 },
    { x: source.x + source.width / 2 - width / 2, y: source.y + source.height / 2 + 12 }
  ];
  const safePointer = pointer ?? anchor;
  return candidates
    .map((candidate) => clampTooltipRect({ ...candidate, width, height }, bounds))
    .map((candidate) => {
      const center = { x: candidate.x + width / 2, y: candidate.y + height / 2 };
      return {
        rect: candidate,
        score:
          distanceToSegment(center, anchor, safePointer) * 1.25 +
          Math.hypot(center.x - safePointer.x, center.y - safePointer.y)
      };
    })
    .sort((a, b) => b.score - a.score)[0].rect;
}

function drawWireStartTooltip(
  ctx: CanvasRenderingContext2D,
  pendingPort: HitPort | null,
  pointer: { x: number; y: number } | null | undefined,
  portPositions: Map<string, ResolvedPortPosition>,
  bounds?: PatchWireTooltipBounds
) {
  if (!pendingPort || !pointer) {
    return;
  }
  const source = portPositions.get(`${pendingPort.nodeId}:${pendingPort.kind}:${pendingPort.portId}`);
  if (!source) {
    return;
  }
  const lines = resolveWireStartTooltipLines(pendingPort, source);
  const rect = resolveWireStartTooltipRect(source, pointer, lines, bounds);
  ctx.save();
  drawRoundedRectPath(ctx, rect.x, rect.y, rect.width, rect.height, 7);
  ctx.fillStyle = "rgba(7, 13, 19, 0.94)";
  ctx.fill();
  ctx.strokeStyle = "rgba(200, 255, 57, 0.38)";
  ctx.lineWidth = 1.25;
  ctx.stroke();
  ctx.fillStyle = "#e7f3ff";
  ctx.font = "10px 'Trebuchet MS', 'Segoe UI', sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  lines.forEach((line, index) => {
    ctx.fillText(
      line,
      rect.x + PATCH_WIRE_START_TOOLTIP_PADDING_X,
      rect.y + PATCH_WIRE_START_TOOLTIP_PADDING_Y + PATCH_WIRE_START_TOOLTIP_LINE_HEIGHT * (index + 0.5)
    );
  });
  ctx.restore();
}

function drawPill(
  ctx: CanvasRenderingContext2D,
  rect: { x: number; y: number; width: number; height: number },
  label: string,
  options: { fill: string; stroke: string; text: string }
) {
  drawRoundedRectPath(ctx, rect.x, rect.y, rect.width, rect.height, 8);
  ctx.fillStyle = options.fill;
  ctx.fill();
  ctx.strokeStyle = options.stroke;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = options.text;
  ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textAlign = "center";
  ctx.fillText(label, rect.x + rect.width / 2, rect.y + 13);
  ctx.textAlign = "left";
}

function resolveTooltipAbovePortOrigin(
  port: ResolvedPortPosition,
  tooltipSize: { width: number; height: number },
  bounds?: PatchWireTooltipBounds
) {
  return clampTooltipRect(
    {
      x: port.x + port.width / 2 - tooltipSize.width / 2,
      y: port.y - port.height / 2 - tooltipSize.height - 10,
      width: tooltipSize.width,
      height: tooltipSize.height
    },
    bounds
  );
}

function drawWireCandidateTooltip(
  ctx: CanvasRenderingContext2D,
  candidate: PatchWireCandidateDisplay,
  targetPort: ResolvedPortPosition
) {
  if (!candidate.pointer || candidate.status === "valid") {
    return;
  }
  const isReplace = candidate.status === "replace";
  const label = isReplace ? "Replace existing wire?" : (candidate.reason ?? "invalid target");
  ctx.save();
  ctx.font = "11px 'Trebuchet MS', 'Segoe UI', sans-serif";
  const tooltipSize = isReplace
    ? { width: PATCH_WIRE_TOOLTIP_WIDTH, height: PATCH_WIRE_TOOLTIP_HEIGHT }
    : {
        width: Math.ceil(ctx.measureText(label).width) + 18,
        height: 26
      };
  const origin = isReplace
    ? resolveWireTooltipOrigin(candidate.pointer, candidate.tooltipBounds ?? ctx.canvas, tooltipSize)
    : resolveTooltipAbovePortOrigin(targetPort, tooltipSize, candidate.tooltipBounds ?? ctx.canvas);
  if (!origin) {
    ctx.restore();
    return;
  }
  const { x, y } = origin;
  drawRoundedRectPath(ctx, x, y, tooltipSize.width, tooltipSize.height, 8);
  ctx.fillStyle = isReplace ? "rgba(56, 42, 13, 0.96)" : "rgba(56, 18, 25, 0.96)";
  ctx.fill();
  ctx.strokeStyle = isReplace ? "rgba(255, 203, 87, 0.95)" : "rgba(255, 92, 112, 0.95)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = isReplace ? "#ffe3a1" : "#ffd2d8";
  ctx.textAlign = "center";
  ctx.textBaseline = isReplace ? "alphabetic" : "middle";
  ctx.fillText(label, x + tooltipSize.width / 2, isReplace ? y + 17 : y + tooltipSize.height / 2);
  if (isReplace) {
    const rects = resolveWireReplacePromptRects(candidate.pointer, candidate.tooltipBounds ?? ctx.canvas);
    if (rects) {
      const selected = candidate.replaceSelection ?? "no";
      drawPill(ctx, rects.no, "NO", {
        fill: selected === "no" ? "rgba(255, 203, 87, 0.34)" : "rgba(69, 53, 18, 0.98)",
        stroke: selected === "no" ? "rgba(255, 235, 156, 1)" : "rgba(255, 203, 87, 0.9)",
        text: selected === "no" ? "#fff7d8" : "#ffe3a1"
      });
      drawPill(ctx, rects.yes, "YES", {
        fill: selected === "yes" ? "rgba(255, 203, 87, 0.38)" : "rgba(69, 53, 18, 0.98)",
        stroke: selected === "yes" ? "rgba(255, 235, 156, 1)" : "rgba(255, 203, 87, 0.9)",
        text: selected === "yes" ? "#fff7d8" : "#ffe3a1"
      });
    }
  }
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.restore();
}

function drawLockedPortTooltip(
  ctx: CanvasRenderingContext2D,
  tooltip: PatchLockedPortTooltip | null | undefined,
  portPositions: Map<string, ResolvedPortPosition>
) {
  if (!tooltip) {
    return;
  }
  const label = "Preset structure is locked";
  ctx.save();
  ctx.font = "11px 'Trebuchet MS', 'Segoe UI', sans-serif";
  const tooltipSize = {
    width: Math.ceil(ctx.measureText(label).width) + 18,
    height: 26
  };
  const targetPort = portPositions.get(`${tooltip.target.nodeId}:${tooltip.target.portKind}:${tooltip.target.portId}`);
  const origin = targetPort
    ? resolveTooltipAbovePortOrigin(targetPort, tooltipSize, tooltip.tooltipBounds ?? ctx.canvas)
    : resolveWireTooltipOrigin(tooltip.pointer, tooltip.tooltipBounds ?? ctx.canvas, tooltipSize);
  if (!origin) {
    ctx.restore();
    return;
  }
  drawRoundedRectPath(ctx, origin.x, origin.y, tooltipSize.width, tooltipSize.height, 8);
  ctx.fillStyle = "rgba(56, 18, 25, 0.96)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 92, 112, 0.85)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = "#ffd2d8";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, origin.x + tooltipSize.width / 2, origin.y + tooltipSize.height / 2);
  ctx.restore();
}

function drawWireCandidate(
  ctx: CanvasRenderingContext2D,
  portPositions: Map<string, ResolvedPortPosition>,
  candidate: PatchWireCandidateDisplay | null
) {
  if (!candidate) {
    return;
  }
  const port = portPositions.get(`${candidate.target.nodeId}:${candidate.target.portKind}:${candidate.target.portId}`);
  if (!port) {
    return;
  }
  const isInvalid = candidate.status === "invalid";
  const isReplace = candidate.status === "replace";
  const stroke = isInvalid
    ? "rgba(255, 92, 112, 0.98)"
    : isReplace
      ? "rgba(255, 203, 87, 0.98)"
      : PATCH_COLOR_VALID_TARGET;
  const fill = isInvalid
    ? "rgba(255, 92, 112, 0.18)"
    : isReplace
      ? "rgba(255, 203, 87, 0.18)"
      : PATCH_COLOR_VALID_TARGET_FILL;

  ctx.save();
  ctx.strokeStyle = stroke;
  ctx.fillStyle = fill;
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  ctx.fillRect(port.x - 4, port.y - port.height / 2 - 4, port.width + 8, port.height + 8);
  ctx.strokeRect(port.x - 4, port.y - port.height / 2 - 4, port.width + 8, port.height + 8);
  ctx.restore();
  drawWireCandidateTooltip(ctx, candidate, port);
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
    const port = portPositions.get(
      `${hoveredAttachTarget.nodeId}:${hoveredAttachTarget.portKind}:${hoveredAttachTarget.portId}`
    );
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

function drawArmedWireModuleHover(
  ctx: CanvasRenderingContext2D,
  layoutByNode: Map<string, PatchLayoutNode>,
  portPositions: Map<string, ResolvedPortPosition>,
  hover: PatchArmedWireModuleHover | null | undefined
) {
  if (!hover) {
    return;
  }
  const layout = layoutByNode.get(hover.nodeId);
  if (!layout) {
    return;
  }
  const x = layout.x * PATCH_CANVAS_GRID;
  const y = layout.y * PATCH_CANVAS_GRID;
  ctx.save();
  ctx.fillStyle = "rgba(4, 10, 17, 0.7)";
  ctx.fillRect(x, y, PATCH_NODE_WIDTH, PATCH_NODE_HEIGHT);
  const buttonRect = resolveArmedWireCancelButtonRect(x, y);
  drawPill(ctx, buttonRect, "cancel wiring", {
    fill: "rgba(14, 25, 36, 0.98)",
    stroke: "rgba(158, 192, 223, 0.82)",
    text: "#e7f3ff"
  });
  if (hover.nearestPort) {
    const port = portPositions.get(`${hover.nearestPort.nodeId}:${hover.nearestPort.kind}:${hover.nearestPort.portId}`);
    if (port) {
      ctx.strokeStyle = PATCH_COLOR_PENDING_PORT;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(port.x - 4, port.y - port.height / 2 - 4, port.width + 8, port.height + 8);
    }
  }
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
    clearPreview,
    expandedFace: true
  });
  ctx.restore();
}

function buildHitPorts(portPositions: Map<string, ResolvedPortPosition>) {
  const hitPorts: HitPort[] = [];
  for (const [key, value] of portPositions.entries()) {
    const [nodeId, kind, portId] = key.split(":");
    if (isHostPatchPortId(nodeId)) {
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
  facePopoverNodeId: string | null;
  getFacePopoverRect: (nodeId: string) => CanvasRect | null;
  layoutByNode: Map<string, PatchLayoutNode>;
  nodeById: Map<string, PatchNode>;
  patch: Patch;
  renderState: PatchCanvasRenderState;
}): HitPort[] {
  const ctx = args.canvas.getContext("2d");
  if (!ctx) return [];

  const { viewport, selection, wire, diff, hover } = args.renderState;
  const { width, height } = viewport.canvasSize;
  args.canvas.width = width;
  args.canvas.height = height;

  drawPatchGrid(ctx, width, height);
  const portPositions = resolvePortPositions(ctx, args.patch, args.layoutByNode, viewport.outputHostCanvasLeft);
  const feedbackNow = wire.feedbackNow ?? performance.now();
  const invalidPortKeys = resolveInvalidPortKeys(diff.validationIssues);
  drawPatchConnections(
    ctx,
    args.patch,
    portPositions,
    selection.selectedConnectionId,
    selection.deletePreviewConnectionId
  );
  drawPatchModules(
    ctx,
    args.patch,
    diff.patchDiff,
    args.layoutByNode,
    invalidPortKeys,
    hover.nodeId,
    selection.selectedMacroNodeIds,
    selection.selectedNodeId,
    selection.deletePreviewNodeId,
    selection.clearPreviewActive
  );
  drawWireCommitFeedback(ctx, portPositions, wire.commitFeedback ?? null, feedbackNow);
  drawPendingPatchPort(ctx, wire.pendingFromPort, portPositions);
  drawPendingPatchWire(ctx, wire.pendingFromPort, wire.pendingWirePointer ?? null, portPositions);
  drawWireStartTooltip(
    ctx,
    wire.pendingFromPort,
    wire.pendingWirePointer ?? null,
    portPositions,
    wire.candidate?.tooltipBounds
  );
  drawArmedWireModuleHover(ctx, args.layoutByNode, portPositions, wire.armedModuleHover);
  drawWireCandidate(ctx, portPositions, wire.candidate ?? null);
  drawWireCandidatePulse(ctx, portPositions, wire.candidatePulse ?? null, feedbackNow);
  drawLockedPortTooltip(ctx, wire.lockedPortTooltip ?? null, portPositions);
  drawHoveredAttachTarget(ctx, args.patch, portPositions, hover.attachTarget ?? null);

  if (args.facePopoverNodeId) {
    const node = args.nodeById.get(args.facePopoverNodeId);
    const schema = node ? getModuleSchema(node.typeId) : undefined;
    const rect = args.getFacePopoverRect(args.facePopoverNodeId);
    if (node && schema && rect) {
      drawPatchFacePopover(
        ctx,
        args.patch,
        diff.patchDiff,
        node,
        schema,
        rect,
        selection.selectedMacroNodeIds.has(node.id),
        selection.deletePreviewNodeId === node.id,
        Boolean(selection.clearPreviewActive)
      );
    }
  }

  return buildHitPorts(portPositions);
}

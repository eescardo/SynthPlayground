import {
  PATCH_CANVAS_GRID,
  PATCH_COLOR_CONNECTION_DELETE_PREVIEW,
  PATCH_COLOR_CONNECTION_FALLBACK,
  PATCH_COLOR_CONNECTION_SELECTED,
  PATCH_COLOR_PENDING_PORT,
  PATCH_COLOR_PENDING_WIRE,
  PATCH_COLOR_VALID_TARGET,
  PATCH_COLOR_VALID_TARGET_FILL,
  PATCH_COLOR_WIRE_CANCEL_BUTTON_BG,
  PATCH_COLOR_WIRE_CANCEL_BUTTON_STROKE,
  PATCH_COLOR_WIRE_CANDIDATE_VALID_PULSE,
  PATCH_COLOR_WIRE_COMMIT,
  PATCH_COLOR_WIRE_COMMIT_RING,
  PATCH_COLOR_WIRE_INVALID,
  PATCH_COLOR_WIRE_INVALID_FILL,
  PATCH_COLOR_WIRE_INVALID_SOFT,
  PATCH_COLOR_WIRE_INVALID_TOOLTIP_BG,
  PATCH_COLOR_WIRE_INVALID_TOOLTIP_STROKE,
  PATCH_COLOR_WIRE_INVALID_TOOLTIP_TEXT,
  PATCH_COLOR_WIRE_MODULE_HOVER_OVERLAY,
  PATCH_COLOR_WIRE_REPLACE,
  PATCH_COLOR_WIRE_REPLACE_FILL,
  PATCH_COLOR_WIRE_REPLACE_PILL_BG,
  PATCH_COLOR_WIRE_REPLACE_PILL_NO_SELECTED,
  PATCH_COLOR_WIRE_REPLACE_PILL_SELECTED_STROKE,
  PATCH_COLOR_WIRE_REPLACE_PILL_SELECTED_TEXT,
  PATCH_COLOR_WIRE_REPLACE_PILL_YES_SELECTED,
  PATCH_COLOR_WIRE_REPLACE_SOFT,
  PATCH_COLOR_WIRE_REPLACE_TOOLTIP_BG,
  PATCH_COLOR_WIRE_REPLACE_TOOLTIP_TEXT,
  PATCH_COLOR_WIRE_TOOLTIP_BG,
  PATCH_COLOR_WIRE_TOOLTIP_STROKE,
  PATCH_COLOR_WIRE_TOOLTIP_TEXT,
  PATCH_NODE_HEIGHT,
  PATCH_NODE_WIDTH
} from "@/components/patch/patchCanvasConstants";
import { HitPort } from "@/components/patch/patchCanvasGeometry";
import {
  clampTooltipRect,
  PATCH_WIRE_TOOLTIP_HEIGHT,
  PATCH_WIRE_TOOLTIP_WIDTH,
  PatchWireTooltipBounds,
  resolveArmedWireCancelButtonRect,
  resolveWireReplacePromptOrigin,
  resolveWireReplacePromptRects,
  resolveWireTooltipOrigin
} from "@/components/patch/patchWireGeometry";
import {
  PatchArmedWireModuleHover,
  PatchCanvasHoverTarget,
  PatchLockedPortTooltip,
  PatchWireCandidateDisplay,
  PatchWireCandidatePulse
} from "@/components/patch/patchCanvasRenderState";
import { HOST_PORT_IDS } from "@/lib/patch/constants";
import { getSignalCapabilityColor } from "@/lib/patch/moduleCategories";
import { isHostPatchPortId, isPatchOutputPortId } from "@/lib/patch/ports";
import { resolveHostPatchPortTint } from "@/components/patch/patchCanvasGeometry";
import { Patch, PatchLayoutNode, PortSchema } from "@/types/patch";
import { PatchWireCommitFeedback } from "@/components/patch/patchWireFeedback";

const PATCH_WIRE_CANDIDATE_PULSE_MS = 380;
const PATCH_WIRE_COMMIT_FLASH_MS = 880;
const PATCH_WIRE_START_TOOLTIP_WIDTH = 236;
const PATCH_WIRE_START_TOOLTIP_PADDING_X = 10;
const PATCH_WIRE_START_TOOLTIP_PADDING_Y = 8;
const PATCH_WIRE_START_TOOLTIP_LINE_HEIGHT = 13;

export interface ResolvedPortPosition {
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
  ctx.closePath();
}

export function drawPatchConnections(
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
      ctx.strokeStyle =
        connection.id === deletePreviewConnectionId
          ? PATCH_COLOR_CONNECTION_DELETE_PREVIEW
          : PATCH_COLOR_CONNECTION_SELECTED;
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

export function drawWireCandidatePulse(
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
      ? PATCH_COLOR_WIRE_INVALID_SOFT
      : pulse.status === "replace"
        ? PATCH_COLOR_WIRE_REPLACE_SOFT
        : PATCH_COLOR_WIRE_CANDIDATE_VALID_PULSE;
  const pulseStrength = Math.sin(progress * Math.PI);
  const inset = 1 + pulseStrength * 2;
  ctx.save();
  ctx.globalAlpha = 0.28 + pulseStrength * 0.58;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.4 + pulseStrength * 1.1;
  ctx.strokeRect(port.x - inset, port.y - port.height / 2 - inset, port.width + inset * 2, port.height + inset * 2);
  ctx.restore();
}

export function drawWireCommitFeedback(
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
  ctx.strokeStyle = PATCH_COLOR_WIRE_COMMIT;
  ctx.lineWidth = 2.8;
  ctx.setLineDash([7, 5]);
  ctx.beginPath();
  ctx.moveTo(from.anchorX, from.anchorY);
  ctx.lineTo(to.anchorX, to.anchorY);
  ctx.stroke();
  ctx.restore();
  drawPortFeedbackRing(ctx, from, PATCH_COLOR_WIRE_COMMIT_RING, progress, 9);
  drawPortFeedbackRing(ctx, to, PATCH_COLOR_WIRE_COMMIT_RING, progress, 9);
}

export function drawPendingPatchPort(
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

export function drawPendingPatchWire(
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

export function drawWireStartTooltip(
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
  ctx.fillStyle = PATCH_COLOR_WIRE_TOOLTIP_BG;
  ctx.fill();
  ctx.strokeStyle = PATCH_COLOR_WIRE_TOOLTIP_STROKE;
  ctx.lineWidth = 1.25;
  ctx.stroke();
  ctx.fillStyle = PATCH_COLOR_WIRE_TOOLTIP_TEXT;
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
  options: { fill: string; stroke: string; text: string; lineWidth?: number }
) {
  drawRoundedRectPath(ctx, rect.x, rect.y, rect.width, rect.height, 8);
  ctx.fillStyle = options.fill;
  ctx.fill();
  ctx.strokeStyle = options.stroke;
  ctx.lineWidth = options.lineWidth ?? 1.5;
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
    ? resolveWireReplacePromptOrigin(candidate.pointer, candidate.tooltipBounds ?? ctx.canvas, candidate.promptAnchor)
    : resolveTooltipAbovePortOrigin(targetPort, tooltipSize, candidate.tooltipBounds ?? ctx.canvas);
  if (!origin) {
    ctx.restore();
    return;
  }
  const { x, y } = origin;
  drawRoundedRectPath(ctx, x, y, tooltipSize.width, tooltipSize.height, 8);
  ctx.fillStyle = isReplace ? PATCH_COLOR_WIRE_REPLACE_TOOLTIP_BG : PATCH_COLOR_WIRE_INVALID_TOOLTIP_BG;
  ctx.fill();
  ctx.strokeStyle = isReplace ? PATCH_COLOR_WIRE_REPLACE_SOFT : PATCH_COLOR_WIRE_INVALID_SOFT;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = isReplace ? PATCH_COLOR_WIRE_REPLACE_TOOLTIP_TEXT : PATCH_COLOR_WIRE_INVALID_TOOLTIP_TEXT;
  ctx.textAlign = "center";
  ctx.textBaseline = isReplace ? "alphabetic" : "middle";
  ctx.fillText(label, x + tooltipSize.width / 2, isReplace ? y + 17 : y + tooltipSize.height / 2);
  if (isReplace) {
    const rects = resolveWireReplacePromptRects(
      candidate.pointer,
      candidate.tooltipBounds ?? ctx.canvas,
      candidate.promptAnchor
    );
    if (rects) {
      const selected = candidate.replaceSelection ?? "no";
      drawPill(ctx, rects.no, "NO", {
        fill: selected === "no" ? PATCH_COLOR_WIRE_REPLACE_PILL_NO_SELECTED : PATCH_COLOR_WIRE_REPLACE_PILL_BG,
        stroke: selected === "no" ? PATCH_COLOR_WIRE_REPLACE_PILL_SELECTED_STROKE : PATCH_COLOR_WIRE_REPLACE_SOFT,
        text: selected === "no" ? PATCH_COLOR_WIRE_REPLACE_PILL_SELECTED_TEXT : PATCH_COLOR_WIRE_REPLACE_TOOLTIP_TEXT
      });
      drawPill(ctx, rects.yes, "YES", {
        fill: selected === "yes" ? PATCH_COLOR_WIRE_REPLACE_PILL_YES_SELECTED : PATCH_COLOR_WIRE_REPLACE_PILL_BG,
        stroke: selected === "yes" ? PATCH_COLOR_WIRE_REPLACE_PILL_SELECTED_STROKE : PATCH_COLOR_WIRE_REPLACE_SOFT,
        text: selected === "yes" ? PATCH_COLOR_WIRE_REPLACE_PILL_SELECTED_TEXT : PATCH_COLOR_WIRE_REPLACE_TOOLTIP_TEXT
      });
    }
  }
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.restore();
}

export function drawLockedPortTooltip(
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
  ctx.fillStyle = PATCH_COLOR_WIRE_INVALID_TOOLTIP_BG;
  ctx.fill();
  ctx.strokeStyle = PATCH_COLOR_WIRE_INVALID_TOOLTIP_STROKE;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = PATCH_COLOR_WIRE_INVALID_TOOLTIP_TEXT;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, origin.x + tooltipSize.width / 2, origin.y + tooltipSize.height / 2);
  ctx.restore();
}

export function drawWireCandidate(
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
  const stroke = isInvalid ? PATCH_COLOR_WIRE_INVALID : isReplace ? PATCH_COLOR_WIRE_REPLACE : PATCH_COLOR_VALID_TARGET;
  const fill = isInvalid
    ? PATCH_COLOR_WIRE_INVALID_FILL
    : isReplace
      ? PATCH_COLOR_WIRE_REPLACE_FILL
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

export function drawHoveredAttachTarget(
  ctx: CanvasRenderingContext2D,
  patch: Patch,
  portPositions: Map<string, ResolvedPortPosition>,
  hoveredAttachTarget: PatchCanvasHoverTarget
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

export function drawArmedWireModuleHover(
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
  ctx.fillStyle = PATCH_COLOR_WIRE_MODULE_HOVER_OVERLAY;
  ctx.fillRect(x, y, PATCH_NODE_WIDTH, PATCH_NODE_HEIGHT);
  const buttonRect = resolveArmedWireCancelButtonRect(x, y);
  drawPill(ctx, buttonRect, "cancel wiring", {
    fill: hover.cancelActionActive ? "rgba(255, 93, 143, 0.22)" : PATCH_COLOR_WIRE_CANCEL_BUTTON_BG,
    stroke: hover.cancelActionActive ? PATCH_COLOR_PENDING_PORT : PATCH_COLOR_WIRE_CANCEL_BUTTON_STROKE,
    text: PATCH_COLOR_WIRE_TOOLTIP_TEXT,
    lineWidth: hover.cancelActionActive ? 2.5 : undefined
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

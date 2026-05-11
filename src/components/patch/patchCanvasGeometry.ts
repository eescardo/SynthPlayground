import {
  PATCH_CANVAS_MIN_HEIGHT,
  PATCH_CANVAS_MIN_WIDTH,
  PATCH_CANVAS_PADDING,
  PATCH_FACE_POPOVER_SCALE,
  PATCH_CANVAS_GRID,
  PATCH_HOST_STRIP_ROW_GAP,
  PATCH_HOST_STRIP_WIDTH,
  PATCH_HOST_STRIP_X,
  PATCH_HOST_STRIP_Y,
  PATCH_OUTPUT_HOST_STRIP_Y,
  PATCH_NODE_HEIGHT,
  PATCH_NODE_HIT_PADDING,
  PATCH_NODE_WIDTH,
  PATCH_PORT_LABEL_HEIGHT,
  PATCH_PORT_LABEL_MIN_TEXT,
  PATCH_PORT_LABEL_OVERHANG_RATIO,
  PATCH_PORT_LABEL_X_PADDING,
  PATCH_PORT_ROW_GAP,
  PATCH_PORT_START_Y,
  PATCH_HOST_PORT_FALLBACK_TINT,
  PATCH_HOST_PORT_TINTS
} from "@/components/patch/patchCanvasConstants";
import { PointerEvent as ReactPointerEvent } from "react";
import { clamp, clamp01 } from "@/lib/numeric";
import { getModuleSchema } from "@/lib/patch/moduleRegistry";
import { getPatchOutputPort } from "@/lib/patch/ports";
import { HOST_PORT_IDS, SOURCE_HOST_PORT_IDS, SOURCE_HOST_PORT_TYPE_BY_ID } from "@/lib/patch/constants";
import { Patch, PatchLayoutNode } from "@/types/patch";

export interface CanvasPoint {
  x: number;
  y: number;
  rawX: number;
  rawY: number;
}

export interface CanvasRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface HitPort {
  nodeId: string;
  portId: string;
  kind: "in" | "out";
  validTarget?: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PatchOutputHostPlacement {
  canvasLeft: number;
  screenLeft: number;
}

export function resolveOutputHostPlacement(args: {
  canvasWidth: number;
  overhang: number;
  scrollLeft: number;
  viewportWidth: number;
  zoom: number;
}): PatchOutputHostPlacement {
  const portWidth = resolveOutputHostPatchPortWidth();
  if (args.viewportWidth <= 0) {
    return {
      canvasLeft: args.canvasWidth,
      screenLeft: args.canvasWidth * args.zoom - args.scrollLeft - portWidth
    };
  }
  const screenLeft = args.viewportWidth + args.overhang - portWidth;
  return {
    canvasLeft: (args.scrollLeft + screenLeft) / args.zoom,
    screenLeft
  };
}

export function resolveNearestRectEdgePoint(rect: CanvasRect, targetPoint: { x: number; y: number }) {
  const clampedX = clamp(targetPoint.x, rect.x, rect.x + rect.width);
  const clampedY = clamp(targetPoint.y, rect.y, rect.y + rect.height);
  const candidates = [
    { x: clampedX, y: rect.y, distance: Math.hypot(targetPoint.x - clampedX, targetPoint.y - rect.y) },
    {
      x: clampedX,
      y: rect.y + rect.height,
      distance: Math.hypot(targetPoint.x - clampedX, targetPoint.y - (rect.y + rect.height))
    },
    { x: rect.x, y: clampedY, distance: Math.hypot(targetPoint.x - rect.x, targetPoint.y - clampedY) },
    {
      x: rect.x + rect.width,
      y: clampedY,
      distance: Math.hypot(targetPoint.x - (rect.x + rect.width), targetPoint.y - clampedY)
    }
  ];
  const nearest = candidates.reduce((best, candidate) => (candidate.distance < best.distance ? candidate : best));
  return { x: nearest.x, y: nearest.y };
}

function resolvePortLabelTextWidth(label: string) {
  return Math.ceil(label.length * 6);
}

export function resolvePatchPortLabelWidth(portId: string) {
  const minWidth = resolvePortLabelTextWidth(PATCH_PORT_LABEL_MIN_TEXT) + PATCH_PORT_LABEL_X_PADDING * 2;
  return Math.max(minWidth, resolvePortLabelTextWidth(portId) + PATCH_PORT_LABEL_X_PADDING * 2);
}

export function resolvePatchPortLabelInset() {
  return resolvePatchPortLabelWidth(PATCH_PORT_LABEL_MIN_TEXT) * (1 - PATCH_PORT_LABEL_OVERHANG_RATIO);
}

export function resolvePatchNodePortLabelRect(
  portId: string,
  kind: "in" | "out",
  nodeX: number,
  nodeY: number,
  index: number
) {
  const width = resolvePatchPortLabelWidth(portId);
  const height = PATCH_PORT_LABEL_HEIGHT;
  const moduleInset = resolvePatchPortLabelInset();
  const y = nodeY + PATCH_PORT_START_Y + index * PATCH_PORT_ROW_GAP;
  const labelX = kind === "in" ? nodeX + moduleInset - width : nodeX + PATCH_NODE_WIDTH - moduleInset;
  return {
    x: labelX,
    y,
    width,
    height,
    anchorX: kind === "in" ? labelX : labelX + width,
    anchorY: y
  };
}

export function isHostSourcePatchPortId(nodeId: string) {
  return SOURCE_HOST_PORT_IDS.includes(nodeId as (typeof SOURCE_HOST_PORT_IDS)[number]);
}

export function resolveHostPatchPortLabel(nodeId: string) {
  switch (nodeId) {
    case "$host.pitch":
      return "pitch";
    case "$host.gate":
      return "gate";
    case "$host.velocity":
      return "velocity";
    case "$host.modwheel":
      return "modwheel";
    case HOST_PORT_IDS.output:
      return "output";
    default:
      return "host";
  }
}

export function resolveHostPatchPortTint(nodeId: string) {
  return PATCH_HOST_PORT_TINTS[nodeId] ?? PATCH_HOST_PORT_FALLBACK_TINT;
}

export function resolveOutputHostPatchPortRect(canvasWidth: number) {
  const label = resolveHostPatchPortLabel(HOST_PORT_IDS.output);
  const width = Math.max(38, label.length * 6 + 8);
  return {
    x: canvasWidth,
    y: PATCH_OUTPUT_HOST_STRIP_Y,
    width,
    height: 14
  };
}

export function resolveOutputHostPatchPortWidth() {
  return resolveOutputHostPatchPortRect(0).width;
}

export function resolveHostPatchPortRect(nodeId: string) {
  const hostIndex = SOURCE_HOST_PORT_IDS.indexOf(nodeId as (typeof SOURCE_HOST_PORT_IDS)[number]);
  if (hostIndex < 0) {
    return null;
  }
  const label = resolveHostPatchPortLabel(nodeId);
  const width = Math.max(PATCH_HOST_STRIP_WIDTH, label.length * 6 + 4);
  return {
    x: PATCH_HOST_STRIP_X - width,
    y: PATCH_HOST_STRIP_Y + hostIndex * PATCH_HOST_STRIP_ROW_GAP,
    width,
    height: 14
  };
}

export function resolvePatchCanvasSize(layoutNodes: PatchLayoutNode[]) {
  let maxX = PATCH_CANVAS_MIN_WIDTH;
  let maxY = PATCH_CANVAS_MIN_HEIGHT;
  for (const layout of layoutNodes) {
    maxX = Math.max(maxX, layout.x * PATCH_CANVAS_GRID + PATCH_NODE_WIDTH + PATCH_CANVAS_PADDING);
    maxY = Math.max(maxY, layout.y * PATCH_CANVAS_GRID + PATCH_NODE_HEIGHT + PATCH_CANVAS_PADDING);
  }
  return { width: maxX, height: maxY };
}

export function resolvePatchDiagramSize(layoutNodes: PatchLayoutNode[]) {
  if (layoutNodes.length === 0) {
    return resolvePatchCanvasSize(layoutNodes);
  }
  let maxX = 0;
  let maxY = 0;
  for (const layout of layoutNodes) {
    maxX = Math.max(maxX, layout.x * PATCH_CANVAS_GRID + PATCH_NODE_WIDTH + PATCH_CANVAS_PADDING);
    maxY = Math.max(maxY, layout.y * PATCH_CANVAS_GRID + PATCH_NODE_HEIGHT + PATCH_CANVAS_PADDING);
  }
  return { width: maxX, height: maxY };
}

export function resolvePatchFacePopoverRect(
  nodeId: string,
  layoutByNode: Map<string, PatchLayoutNode>,
  canvasSize: { width: number; height: number }
): CanvasRect | null {
  const layout = layoutByNode.get(nodeId);
  if (!layout) {
    return null;
  }
  const width = PATCH_NODE_WIDTH * PATCH_FACE_POPOVER_SCALE;
  const height = PATCH_NODE_HEIGHT * PATCH_FACE_POPOVER_SCALE;
  const centerX = layout.x * PATCH_CANVAS_GRID + PATCH_NODE_WIDTH / 2;
  const centerY = layout.y * PATCH_CANVAS_GRID + PATCH_NODE_HEIGHT / 2;
  return {
    x: clamp(centerX - width / 2, 8, canvasSize.width - width - 8),
    y: clamp(centerY - height / 2, 8, canvasSize.height - height - 8),
    width,
    height
  };
}

export function pointerEventToPatchCanvasPoint(
  canvas: HTMLCanvasElement | null,
  event: ReactPointerEvent<HTMLCanvasElement>
): CanvasPoint {
  if (!canvas) {
    return { x: 0, y: 0, rawX: 0, rawY: 0 };
  }
  const rect = canvas.getBoundingClientRect();
  const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
  const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
  const rawX = (event.clientX - rect.left) * scaleX;
  const rawY = (event.clientY - rect.top) * scaleY;
  return {
    x: Math.round(rawX / PATCH_CANVAS_GRID),
    y: Math.round(rawY / PATCH_CANVAS_GRID),
    rawX,
    rawY
  };
}

export function findPatchNodeAtPoint(
  patch: Pick<Patch, "nodes">,
  layoutByNode: Map<string, PatchLayoutNode>,
  rawX: number,
  rawY: number
): string | null {
  for (let index = patch.nodes.length - 1; index >= 0; index -= 1) {
    const node = patch.nodes[index];
    const layout = layoutByNode.get(node.id);
    if (!layout) {
      continue;
    }
    const x = layout.x * PATCH_CANVAS_GRID;
    const y = layout.y * PATCH_CANVAS_GRID;
    if (
      rawX >= x - PATCH_NODE_HIT_PADDING &&
      rawX <= x + PATCH_NODE_WIDTH + PATCH_NODE_HIT_PADDING &&
      rawY >= y - PATCH_NODE_HIT_PADDING &&
      rawY <= y + PATCH_NODE_HEIGHT + PATCH_NODE_HIT_PADDING
    ) {
      return node.id;
    }
  }
  return null;
}

export function findPatchPortAtPoint(hitPorts: HitPort[], rawX: number, rawY: number): HitPort | null {
  return findPatchPortAtPointWithPadding(hitPorts, rawX, rawY, 3);
}

export function findPatchPortAtPointWithPadding(
  hitPorts: HitPort[],
  rawX: number,
  rawY: number,
  padding: number
): HitPort | null {
  for (const port of hitPorts) {
    if (
      rawX >= port.x - padding &&
      rawX <= port.x + port.width + padding &&
      rawY >= port.y - port.height / 2 - padding &&
      rawY <= port.y + port.height / 2 + padding
    ) {
      return port;
    }
  }
  return null;
}

function closestPointOnSegment(
  from: { x: number; y: number },
  to: { x: number; y: number },
  point: { x: number; y: number }
) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 0) {
    return from;
  }
  const t = clamp01(((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared);
  return {
    x: from.x + dx * t,
    y: from.y + dy * t
  };
}

export function resolvePatchPortAnchorPoint(
  patch: Pick<Patch, "nodes" | "ports">,
  layoutByNode: Map<string, PatchLayoutNode>,
  nodeId: string,
  portId: string,
  portKind: "in" | "out",
  outputHostCanvasLeft?: number
) {
  if (isHostSourcePatchPortId(nodeId)) {
    const rect = resolveHostPatchPortRect(nodeId);
    const schema = getModuleSchema(SOURCE_HOST_PORT_TYPE_BY_ID[nodeId as keyof typeof SOURCE_HOST_PORT_TYPE_BY_ID]);
    const hasPort = portKind === "out" && portId === "out" && schema?.portsOut.some((port) => port.id === portId);
    if (!rect || !hasPort) {
      return null;
    }
    return {
      x: rect.x + rect.width,
      y: rect.y
    };
  }
  const outputPort = getPatchOutputPort(patch);
  if (outputPort?.id === nodeId && portKind === "in") {
    const canvasSize = outputHostCanvasLeft === undefined ? resolvePatchCanvasSize([...layoutByNode.values()]) : null;
    const rect = resolveOutputHostPatchPortRect(outputHostCanvasLeft ?? canvasSize?.width ?? 0);
    return {
      x: rect.x,
      y: rect.y
    };
  }
  const node = patch.nodes.find((entry) => entry.id === nodeId);
  if (node?.typeId === "Output" && portKind === "in") {
    const canvasSize = outputHostCanvasLeft === undefined ? resolvePatchCanvasSize([...layoutByNode.values()]) : null;
    const rect = resolveOutputHostPatchPortRect(outputHostCanvasLeft ?? canvasSize?.width ?? 0);
    return {
      x: rect.x,
      y: rect.y
    };
  }
  const layout = layoutByNode.get(nodeId);
  const schema = node ? getModuleSchema(node.typeId) : undefined;
  const ports = portKind === "in" ? schema?.portsIn : schema?.portsOut;
  const portIndex = ports?.findIndex((port) => port.id === portId) ?? -1;
  if (!layout || !schema || portIndex < 0) {
    return null;
  }
  const rect = resolvePatchNodePortLabelRect(
    portId,
    portKind,
    layout.x * PATCH_CANVAS_GRID,
    layout.y * PATCH_CANVAS_GRID,
    portIndex
  );
  return {
    x: rect.anchorX,
    y: rect.anchorY
  };
}

export function resolvePatchConnectionMidpoint(
  patch: Pick<Patch, "nodes" | "ports" | "connections">,
  layoutByNode: Map<string, PatchLayoutNode>,
  connectionId: string,
  outputHostCanvasLeft?: number
) {
  const connection = patch.connections.find((entry) => entry.id === connectionId);
  if (!connection) {
    return null;
  }
  const from = resolvePatchPortAnchorPoint(
    patch,
    layoutByNode,
    connection.from.nodeId,
    connection.from.portId,
    "out",
    outputHostCanvasLeft
  );
  const to = resolvePatchPortAnchorPoint(
    patch,
    layoutByNode,
    connection.to.nodeId,
    connection.to.portId,
    "in",
    outputHostCanvasLeft
  );
  if (!from || !to) {
    return null;
  }
  return {
    x: (from.x + to.x) / 2,
    y: (from.y + to.y) / 2
  };
}

export function resolvePatchConnectionAnchorPoint(
  patch: Pick<Patch, "nodes" | "ports" | "connections">,
  layoutByNode: Map<string, PatchLayoutNode>,
  connectionId: string,
  sourcePoint: { x: number; y: number },
  outputHostCanvasLeft?: number
) {
  const connection = patch.connections.find((entry) => entry.id === connectionId);
  if (!connection) {
    return null;
  }
  const from = resolvePatchPortAnchorPoint(
    patch,
    layoutByNode,
    connection.from.nodeId,
    connection.from.portId,
    "out",
    outputHostCanvasLeft
  );
  const to = resolvePatchPortAnchorPoint(
    patch,
    layoutByNode,
    connection.to.nodeId,
    connection.to.portId,
    "in",
    outputHostCanvasLeft
  );
  if (!from || !to) {
    return null;
  }
  return closestPointOnSegment(from, to, sourcePoint);
}

export function findPatchConnectionAtPoint(
  patch: Pick<Patch, "nodes" | "ports" | "connections">,
  layoutByNode: Map<string, PatchLayoutNode>,
  rawX: number,
  rawY: number,
  outputHostCanvasLeft?: number,
  threshold = 8
): string | null {
  for (let index = patch.connections.length - 1; index >= 0; index -= 1) {
    const connection = patch.connections[index];
    const from = resolvePatchPortAnchorPoint(
      patch,
      layoutByNode,
      connection.from.nodeId,
      connection.from.portId,
      "out",
      outputHostCanvasLeft
    );
    const to = resolvePatchPortAnchorPoint(
      patch,
      layoutByNode,
      connection.to.nodeId,
      connection.to.portId,
      "in",
      outputHostCanvasLeft
    );
    if (!from || !to) {
      continue;
    }
    const closest = closestPointOnSegment(from, to, { x: rawX, y: rawY });
    const distance = Math.hypot(rawX - closest.x, rawY - closest.y);
    if (distance <= threshold) {
      return connection.id;
    }
  }
  return null;
}

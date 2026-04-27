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
  PATCH_PORT_ROW_GAP,
  PATCH_PORT_START_Y
} from "@/components/patch/patchCanvasConstants";
import { PointerEvent as ReactPointerEvent } from "react";
import { clamp, clamp01 } from "@/lib/numeric";
import { getModuleSchema } from "@/lib/patch/moduleRegistry";
import { isPatchPortId } from "@/lib/patch/ports";
import { SOURCE_HOST_NODE_IDS, SOURCE_HOST_NODE_TYPE_BY_ID } from "@/lib/patch/constants";
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

export function isHostPatchNodeId(nodeId: string) {
  return SOURCE_HOST_NODE_IDS.includes(nodeId as (typeof SOURCE_HOST_NODE_IDS)[number]);
}

export function isManagedOutputNode(patch: Pick<Patch, "io">, nodeId: string) {
  return nodeId === patch.io.audioOutNodeId;
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
    case "$host.output":
      return "output";
    default:
      return "host";
  }
}

export function resolveHostPatchPortTint(nodeId: string) {
  switch (nodeId) {
    case "$host.pitch":
      return {
        fill: "#cfe5f7",
        stroke: "#8fb3d1",
        text: "#163248",
        wire: "#8fc1eb"
      };
    case "$host.gate":
      return {
        fill: "#f1d2ba",
        stroke: "#c89266",
        text: "#4b2a16",
        wire: "#e2a16c"
      };
    case "$host.velocity":
      return {
        fill: "#cfe6c6",
        stroke: "#8eb17c",
        text: "#173321",
        wire: "#8dc97d"
      };
    case "$host.modwheel":
      return {
        fill: "#dfd2aa",
        stroke: "#b69b58",
        text: "#443514",
        wire: "#d2ac4f"
      };
    case "$host.output":
      return {
        fill: "#f0d4df",
        stroke: "#c27d98",
        text: "#441d2f",
        wire: "#e393b2"
      };
    default:
      return {
        fill: "#c9d6de",
        stroke: "#93a8b6",
        text: "#10202c",
        wire: "#c7d8e8"
      };
  }
}

export function resolveOutputHostPatchPortRect(canvasWidth: number) {
  const label = resolveHostPatchPortLabel("$host.output");
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
  const hostIndex = SOURCE_HOST_NODE_IDS.indexOf(nodeId as (typeof SOURCE_HOST_NODE_IDS)[number]);
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

export function pointerEventToPatchCanvasPoint(canvas: HTMLCanvasElement | null, event: ReactPointerEvent<HTMLCanvasElement>): CanvasPoint {
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
  const padding = 3;
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

export function resolvePatchPortAnchorPoint(
  patch: Pick<Patch, "nodes" | "ports" | "io">,
  layoutByNode: Map<string, PatchLayoutNode>,
  nodeId: string,
  portId: string,
  portKind: "in" | "out"
) {
  if (isHostPatchNodeId(nodeId)) {
    const rect = resolveHostPatchPortRect(nodeId);
    const schema = getModuleSchema(SOURCE_HOST_NODE_TYPE_BY_ID[nodeId as keyof typeof SOURCE_HOST_NODE_TYPE_BY_ID]);
    const hasPort = portKind === "out" && portId === "out" && schema?.portsOut.some((port) => port.id === portId);
    if (!rect || !hasPort) {
      return null;
    }
    return {
      x: rect.x + rect.width,
      y: rect.y
    };
  }
  if (isPatchPortId(patch, nodeId) && portKind === "in") {
    const canvasSize = resolvePatchCanvasSize(layoutByNode ? [...layoutByNode.values()] : []);
    const rect = resolveOutputHostPatchPortRect(canvasSize.width);
    return {
      x: rect.x,
      y: rect.y
    };
  }
  const node = patch.nodes.find((entry) => entry.id === nodeId);
  if (node?.typeId === "Output" && portKind === "in") {
    const canvasSize = resolvePatchCanvasSize(layoutByNode ? [...layoutByNode.values()] : []);
    const rect = resolveOutputHostPatchPortRect(canvasSize.width);
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
  return {
    x: layout.x * PATCH_CANVAS_GRID + (portKind === "in" ? 0 : PATCH_NODE_WIDTH),
    y: layout.y * PATCH_CANVAS_GRID + PATCH_PORT_START_Y + portIndex * PATCH_PORT_ROW_GAP
  };
}

export function resolvePatchConnectionMidpoint(
  patch: Pick<Patch, "nodes" | "ports" | "io" | "connections">,
  layoutByNode: Map<string, PatchLayoutNode>,
  connectionId: string
) {
  const connection = patch.connections.find((entry) => entry.id === connectionId);
  if (!connection) {
    return null;
  }
  const from = resolvePatchPortAnchorPoint(patch, layoutByNode, connection.from.nodeId, connection.from.portId, "out");
  const to = resolvePatchPortAnchorPoint(patch, layoutByNode, connection.to.nodeId, connection.to.portId, "in");
  if (!from || !to) {
    return null;
  }
  return {
    x: (from.x + to.x) / 2,
    y: (from.y + to.y) / 2
  };
}

export function findPatchConnectionAtPoint(
  patch: Pick<Patch, "nodes" | "ports" | "io" | "connections">,
  layoutByNode: Map<string, PatchLayoutNode>,
  rawX: number,
  rawY: number
): string | null {
  const threshold = 8;
  for (let index = patch.connections.length - 1; index >= 0; index -= 1) {
    const connection = patch.connections[index];
    const from = resolvePatchPortAnchorPoint(patch, layoutByNode, connection.from.nodeId, connection.from.portId, "out");
    const to = resolvePatchPortAnchorPoint(patch, layoutByNode, connection.to.nodeId, connection.to.portId, "in");
    if (!from || !to) {
      continue;
    }
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared <= 0) {
      continue;
    }
    const t = clamp01(((rawX - from.x) * dx + (rawY - from.y) * dy) / lengthSquared);
    const closestX = from.x + dx * t;
    const closestY = from.y + dy * t;
    const distance = Math.hypot(rawX - closestX, rawY - closestY);
    if (distance <= threshold) {
      return connection.id;
    }
  }
  return null;
}

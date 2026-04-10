import {
  PATCH_CANVAS_MIN_HEIGHT,
  PATCH_CANVAS_MIN_WIDTH,
  PATCH_CANVAS_PADDING,
  PATCH_FACE_POPOVER_SCALE,
  PATCH_CANVAS_GRID,
  PATCH_NODE_HEIGHT,
  PATCH_NODE_HIT_PADDING,
  PATCH_NODE_WIDTH
} from "@/components/patch/patchCanvasConstants";
import { PointerEvent as ReactPointerEvent } from "react";
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
  x: number;
  y: number;
  width: number;
  height: number;
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
    x: Math.max(8, Math.min(canvasSize.width - width - 8, centerX - width / 2)),
    y: Math.max(8, Math.min(canvasSize.height - height - 8, centerY - height / 2)),
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

import {
  findPatchConnectionAtPoint,
  findPatchPortAtPointWithPadding,
  HitPort
} from "@/components/patch/patchCanvasGeometry";
import {
  isPointInCanvasRect,
  PatchWireReplacePromptAnchor,
  resolveWireReplacePromptRects
} from "@/components/patch/patchWireGeometry";
import { Patch } from "@/types/patch";

export type PatchCanvasHitTarget =
  | { kind: "port"; port: HitPort }
  | { kind: "node"; nodeId: string }
  | { kind: "connection"; connectionId: string }
  | { kind: "wireReplaceButton"; value: "yes" | "no" }
  | { kind: "armedWireCancel"; nodeId: string }
  | { kind: "empty" };

interface ResolvePatchCanvasHitTargetArgs {
  point: { x: number; y: number };
  hitPorts: HitPort[];
  zoom: number;
  patch: Patch;
  layoutByNode: Parameters<typeof findPatchConnectionAtPoint>[1];
  outputHostCanvasLeft: number;
  pendingFromPort: HitPort | null;
  pendingProbeId?: string | null;
  replacePrompt?: {
    pointer?: { x: number; y: number } | null;
    bounds?: { x?: number; y?: number; width: number; height: number };
    anchor?: PatchWireReplacePromptAnchor | null;
  } | null;
  getNodeAtPoint: (rawX: number, rawY: number) => string | null;
  getArmedWireCancelRect: (nodeId: string) => { x: number; y: number; width: number; height: number } | null;
}

export function resolvePatchCanvasHitTarget(args: ResolvePatchCanvasHitTargetArgs): PatchCanvasHitTarget {
  const { point, zoom } = args;
  if (args.pendingFromPort && args.replacePrompt) {
    const promptRects = resolveWireReplacePromptRects(
      args.replacePrompt.pointer,
      args.replacePrompt.bounds,
      args.replacePrompt.anchor
    );
    if (promptRects && isPointInCanvasRect(point, promptRects.yes)) {
      return { kind: "wireReplaceButton", value: "yes" };
    }
    if (promptRects && isPointInCanvasRect(point, promptRects.no)) {
      return { kind: "wireReplaceButton", value: "no" };
    }
  }

  const port = findPatchPortAtPointWithPadding(args.hitPorts, point.x, point.y, Math.max(3, 6 / zoom));
  if (port) {
    return { kind: "port", port };
  }

  if (args.pendingProbeId) {
    const connectionId = findPatchConnectionAtPoint(
      args.patch,
      args.layoutByNode,
      point.x,
      point.y,
      args.outputHostCanvasLeft,
      Math.max(8, 10 / zoom)
    );
    return connectionId ? { kind: "connection", connectionId } : { kind: "empty" };
  }

  const nodeId = args.getNodeAtPoint(point.x, point.y);
  if (nodeId) {
    if (args.pendingFromPort) {
      const cancelRect = args.getArmedWireCancelRect(nodeId);
      if (cancelRect && isPointInCanvasRect(point, cancelRect)) {
        return { kind: "armedWireCancel", nodeId };
      }
    }
    return { kind: "node", nodeId };
  }

  if (!args.pendingFromPort) {
    const connectionId = findPatchConnectionAtPoint(
      args.patch,
      args.layoutByNode,
      point.x,
      point.y,
      args.outputHostCanvasLeft,
      Math.max(8, 10 / zoom)
    );
    if (connectionId) {
      return { kind: "connection", connectionId };
    }
  }

  return { kind: "empty" };
}

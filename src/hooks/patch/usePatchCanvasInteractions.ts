"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import { drawPatchCanvas } from "@/components/patch/patchCanvasDrawing";
import {
  findPatchConnectionAtPoint,
  findPatchNodeAtPoint,
  findPatchPortAtPoint,
  HitPort,
  pointerEventToPatchCanvasPoint
} from "@/components/patch/patchCanvasGeometry";
import { PATCH_CANVAS_GRID } from "@/components/patch/patchCanvasConstants";
import { PatchLayoutNode, PatchNode, Patch } from "@/types/patch";
import { PatchOp } from "@/types/ops";
import { validatePatchConnectionCandidate } from "@/lib/patch/validation";

interface UsePatchCanvasInteractionsArgs {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  canvasSize: { width: number; height: number };
  facePopoverNodeId: string | null;
  getFacePopoverRect: (nodeId: string) => { x: number; y: number; width: number; height: number } | null;
  layoutByNode: Map<string, PatchLayoutNode>;
  nodeById: Map<string, PatchNode>;
  patch: Patch;
  selectedMacroNodeIds: Set<string>;
  selectedNodeId?: string;
  pendingProbeId?: string | null;
  structureLocked?: boolean;
  onApplyOp: (op: PatchOp) => void;
  onSelectNode: (nodeId?: string) => void;
  onAttachProbeTarget?: (target: { kind: "port"; nodeId: string; portId: string; portKind: "in" | "out" } | { kind: "connection"; connectionId: string }) => void;
  onCancelProbeAttach?: () => void;
  makeConnectOp: (fromNodeId: string, fromPortId: string, toNodeId: string, toPortId: string) => PatchOp;
  handleFacePopoverPointerDown: (rawX: number, rawY: number) => "none" | "dismissed" | "inside-popover";
  togglePopoverForNode: (nodeId: string) => void;
}

type HoveredAttachTarget =
  | { kind: "port"; nodeId: string; portId: string; portKind: "in" | "out" }
  | { kind: "connection"; connectionId: string }
  | null;

export function usePatchCanvasInteractions(args: UsePatchCanvasInteractionsArgs) {
  const hitPortsRef = useRef<HitPort[]>([]);
  const dragLastLayoutRef = useRef<{ x: number; y: number } | null>(null);
  const dragPointerOffsetRef = useRef<{ x: number; y: number } | null>(null);
  const pointerDownNodeIdRef = useRef<string | null>(null);
  const pointerMovedRef = useRef(false);
  const [pendingFromPort, setPendingFromPort] = useState<HitPort | null>(null);
  const [pendingWirePointer, setPendingWirePointer] = useState<{ x: number; y: number } | null>(null);
  const [dragNodeId, setDragNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [hoveredAttachTarget, setHoveredAttachTarget] = useState<HoveredAttachTarget>(null);

  useEffect(() => {
    const canvas = args.canvasRef.current;
    if (!canvas) {
      return;
    }
    hitPortsRef.current = drawPatchCanvas({
      canvas,
      canvasSize: args.canvasSize,
      facePopoverNodeId: args.facePopoverNodeId,
      getFacePopoverRect: args.getFacePopoverRect,
      hoveredNodeId,
      layoutByNode: args.layoutByNode,
      nodeById: args.nodeById,
      patch: args.patch,
      pendingFromPort,
      pendingWirePointer,
      selectedMacroNodeIds: args.selectedMacroNodeIds,
      selectedNodeId: args.selectedNodeId,
      hoveredAttachTarget
    });
  }, [
    args.canvasRef,
    args.canvasSize,
    args.facePopoverNodeId,
    args.getFacePopoverRect,
    args.layoutByNode,
    args.nodeById,
    args.patch,
    args.selectedMacroNodeIds,
    args.selectedNodeId,
    hoveredAttachTarget,
    hoveredNodeId,
    pendingFromPort,
    pendingWirePointer
  ]);

  const isValidConnectionTarget = useCallback((fromPort: HitPort | null, toPort: HitPort | null) => {
    if (!fromPort || !toPort || toPort.kind !== "in") {
      return false;
    }
    return !validatePatchConnectionCandidate(
      args.patch,
      fromPort.nodeId,
      fromPort.portId,
      toPort.nodeId,
      toPort.portId
    ).some((issue) => issue.level === "error");
  }, [args.patch]);

  const getNodeAtPointer = useCallback((rawX: number, rawY: number) => {
    return findPatchNodeAtPoint(args.patch, args.layoutByNode, rawX, rawY);
  }, [args.layoutByNode, args.patch]);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    const pos = pointerEventToPatchCanvasPoint(args.canvasRef.current, event);
    pointerDownNodeIdRef.current = null;
    pointerMovedRef.current = false;
    if (args.handleFacePopoverPointerDown(pos.rawX, pos.rawY) !== "none") {
      return;
    }

    const hitPort = findPatchPortAtPoint(hitPortsRef.current, pos.rawX, pos.rawY);
    if (hitPort) {
      if (args.pendingProbeId && args.onAttachProbeTarget) {
        args.onAttachProbeTarget({
          kind: "port",
          nodeId: hitPort.nodeId,
          portId: hitPort.portId,
          portKind: hitPort.kind
        });
        return;
      }
      if (args.structureLocked) {
        return;
      }
      if (hitPort.kind === "out") {
        setPendingFromPort(hitPort);
        setPendingWirePointer({ x: pos.rawX, y: pos.rawY });
      } else if (hitPort.kind === "in" && pendingFromPort) {
        if (isValidConnectionTarget(pendingFromPort, hitPort)) {
          args.onApplyOp(args.makeConnectOp(pendingFromPort.nodeId, pendingFromPort.portId, hitPort.nodeId, hitPort.portId));
          setPendingFromPort(null);
          setPendingWirePointer(null);
        }
      }
      return;
    }

    if (args.pendingProbeId && args.onAttachProbeTarget) {
      const hitConnectionId = findPatchConnectionAtPoint(args.patch, args.layoutByNode, pos.rawX, pos.rawY);
      if (hitConnectionId) {
        args.onAttachProbeTarget({
          kind: "connection",
          connectionId: hitConnectionId
        });
        return;
      }
      args.onCancelProbeAttach?.();
      setHoveredAttachTarget(null);
      return;
    }

    const hitNodeId = getNodeAtPointer(pos.rawX, pos.rawY);
    if (hitNodeId) {
      args.onSelectNode(hitNodeId);
      setDragNodeId(hitNodeId);
      pointerDownNodeIdRef.current = hitNodeId;
      pointerMovedRef.current = false;
      const layout = args.layoutByNode.get(hitNodeId);
      dragLastLayoutRef.current = layout ? { x: layout.x, y: layout.y } : null;
      dragPointerOffsetRef.current = layout
        ? {
            x: pos.rawX - layout.x * PATCH_CANVAS_GRID,
            y: pos.rawY - layout.y * PATCH_CANVAS_GRID
          }
        : null;
      event.currentTarget.setPointerCapture(event.pointerId);
    } else {
      args.onSelectNode(undefined);
      setPendingFromPort(null);
      setPendingWirePointer(null);
      pointerDownNodeIdRef.current = null;
      pointerMovedRef.current = false;
    }
  }, [
    args,
    getNodeAtPointer,
    isValidConnectionTarget,
    pendingFromPort
  ]);

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    const pos = pointerEventToPatchCanvasPoint(args.canvasRef.current, event);
    const hoverPort = findPatchPortAtPoint(hitPortsRef.current, pos.rawX, pos.rawY);
    if (pendingFromPort) {
      setPendingWirePointer({ x: pos.rawX, y: pos.rawY });
    }
    if (args.pendingProbeId) {
      if (hoverPort) {
        setHoveredAttachTarget({
          kind: "port",
          nodeId: hoverPort.nodeId,
          portId: hoverPort.portId,
          portKind: hoverPort.kind
        });
      } else {
        const hoverConnectionId = findPatchConnectionAtPoint(args.patch, args.layoutByNode, pos.rawX, pos.rawY);
        setHoveredAttachTarget(hoverConnectionId ? { kind: "connection", connectionId: hoverConnectionId } : null);
      }
    } else if (pendingFromPort) {
      setHoveredAttachTarget(isValidConnectionTarget(pendingFromPort, hoverPort)
        ? {
            kind: "port",
            nodeId: hoverPort!.nodeId,
            portId: hoverPort!.portId,
            portKind: "in"
          }
        : null);
    } else {
      setHoveredAttachTarget(null);
    }
    const hoverNodeId = hoverPort ? null : getNodeAtPointer(pos.rawX, pos.rawY);
    setHoveredNodeId((prev) => (prev === hoverNodeId ? prev : hoverNodeId));

    if (!dragNodeId) {
      return;
    }
    const pointerOffset = dragPointerOffsetRef.current;
    if (!pointerOffset) {
      return;
    }
    const nextLayout = {
      x: Math.max(0, Math.round((pos.rawX - pointerOffset.x) / PATCH_CANVAS_GRID)),
      y: Math.max(0, Math.round((pos.rawY - pointerOffset.y) / PATCH_CANVAS_GRID))
    };
    if (dragLastLayoutRef.current?.x === nextLayout.x && dragLastLayoutRef.current?.y === nextLayout.y) {
      return;
    }
    dragLastLayoutRef.current = nextLayout;
    pointerMovedRef.current = true;
    args.onApplyOp({
      type: "moveNode",
      nodeId: dragNodeId,
      newLayoutPos: nextLayout
    });
  }, [args, dragNodeId, getNodeAtPointer, isValidConnectionTarget, pendingFromPort]);

  const onPointerUp = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    const clickedNodeId = pointerDownNodeIdRef.current;
    const moved = pointerMovedRef.current;
    if (dragNodeId) {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // ignore
      }
    }
    dragLastLayoutRef.current = null;
    dragPointerOffsetRef.current = null;
    pointerDownNodeIdRef.current = null;
    pointerMovedRef.current = false;
    setDragNodeId(null);
    if (clickedNodeId && !moved) {
      args.togglePopoverForNode(clickedNodeId);
    }
  }, [args, dragNodeId]);

  return {
    dragNodeId,
    hoveredNodeId,
    pendingFromPort,
    pendingWirePointer,
    hoveredAttachTarget,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    setHoveredNodeId
  };
}

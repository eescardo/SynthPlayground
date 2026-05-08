"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import { drawPatchCanvas } from "@/components/patch/patchCanvasDrawing";
import {
  findPatchConnectionAtPoint,
  findPatchNodeAtPoint,
  findPatchPortAtPointWithPadding,
  HitPort,
  pointerEventToPatchCanvasPoint
} from "@/components/patch/patchCanvasGeometry";
import { PATCH_CANVAS_GRID } from "@/components/patch/patchCanvasConstants";
import { PatchDiff } from "@/lib/patch/diff";
import { isPatchOutputPortId } from "@/lib/patch/ports";
import { PatchLayoutNode, PatchNode, Patch, PatchValidationIssue } from "@/types/patch";
import { PatchOp } from "@/types/ops";
import { validatePatchConnectionCandidate } from "@/lib/patch/validation";
import type { PatchModuleFacePopoverPointerResult } from "@/hooks/patch/usePatchModuleFacePopover";

interface UsePatchCanvasInteractionsArgs {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  canvasSize: { width: number; height: number };
  facePopoverNodeId: string | null;
  getFacePopoverRect: (nodeId: string) => { x: number; y: number; width: number; height: number } | null;
  layoutByNode: Map<string, PatchLayoutNode>;
  nodeById: Map<string, PatchNode>;
  patch: Patch;
  outputHostCanvasLeft: number;
  zoom: number;
  patchDiff: PatchDiff;
  validationIssues: PatchValidationIssue[];
  selectedMacroNodeIds: Set<string>;
  selectedNodeId?: string;
  deletePreviewNodeId?: string | null;
  clearPreviewActive?: boolean;
  pendingProbeId?: string | null;
  structureLocked?: boolean;
  onApplyOp: (op: PatchOp) => void;
  onSelectNode: (nodeId?: string) => void;
  onAttachProbeTarget?: (
    target:
      | { kind: "port"; nodeId: string; portId: string; portKind: "in" | "out" }
      | { kind: "connection"; connectionId: string }
  ) => void;
  onCancelProbeAttach?: () => void;
  makeConnectOp: (fromNodeId: string, fromPortId: string, toNodeId: string, toPortId: string) => PatchOp;
  handleFacePopoverPointerDown: (rawX: number, rawY: number) => PatchModuleFacePopoverPointerResult;
  togglePopoverForNode: (nodeId: string) => void;
}

type HoveredAttachTarget =
  | { kind: "port"; nodeId: string; portId: string; portKind: "in" | "out" }
  | { kind: "connection"; connectionId: string }
  | null;

export function usePatchCanvasInteractions(args: UsePatchCanvasInteractionsArgs) {
  const {
    canvasRef,
    canvasSize,
    facePopoverNodeId,
    getFacePopoverRect,
    layoutByNode,
    nodeById,
    patch,
    outputHostCanvasLeft,
    zoom,
    patchDiff,
    validationIssues,
    selectedMacroNodeIds,
    selectedNodeId,
    deletePreviewNodeId,
    clearPreviewActive,
    pendingProbeId,
    structureLocked,
    onApplyOp,
    onSelectNode,
    onAttachProbeTarget,
    onCancelProbeAttach,
    makeConnectOp,
    handleFacePopoverPointerDown,
    togglePopoverForNode
  } = args;
  const hitPortsRef = useRef<HitPort[]>([]);
  const dragNodeIdRef = useRef<string | null>(null);
  const dragLastLayoutRef = useRef<{ x: number; y: number } | null>(null);
  const dragPointerOffsetRef = useRef<{ x: number; y: number } | null>(null);
  const pointerDownNodeIdRef = useRef<string | null>(null);
  const pointerMovedRef = useRef(false);
  const [pendingFromPort, setPendingFromPort] = useState<HitPort | null>(null);
  const [pendingWirePointer, setPendingWirePointer] = useState<{ x: number; y: number } | null>(null);
  const [dragNodeId, setDragNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [hoveredAttachTarget, setHoveredAttachTarget] = useState<HoveredAttachTarget>(null);

  const resolveConnectionOp = useCallback(
    (startPort: HitPort | null, endPort: HitPort | null) => {
      if (!startPort || !endPort || startPort.kind === endPort.kind) {
        return null;
      }
      const fromPort = startPort.kind === "out" ? startPort : endPort;
      const toPort = startPort.kind === "in" ? startPort : endPort;
      const issues = validatePatchConnectionCandidate(
        patch,
        fromPort.nodeId,
        fromPort.portId,
        toPort.nodeId,
        toPort.portId
      );
      if (issues.some((issue) => issue.level === "error")) {
        return null;
      }
      return {
        op: makeConnectOp(fromPort.nodeId, fromPort.portId, toPort.nodeId, toPort.portId),
        target: toPort
      };
    },
    [makeConnectOp, patch]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    hitPortsRef.current = drawPatchCanvas({
      canvas,
      canvasSize,
      facePopoverNodeId,
      getFacePopoverRect,
      hoveredNodeId,
      layoutByNode,
      nodeById,
      patch,
      outputHostCanvasLeft,
      patchDiff,
      validationIssues,
      pendingFromPort,
      pendingWirePointer,
      selectedMacroNodeIds,
      selectedNodeId,
      deletePreviewNodeId,
      clearPreviewActive,
      hoveredAttachTarget
    });
  }, [
    canvasRef,
    canvasSize,
    facePopoverNodeId,
    getFacePopoverRect,
    layoutByNode,
    nodeById,
    patch,
    outputHostCanvasLeft,
    patchDiff,
    validationIssues,
    selectedMacroNodeIds,
    selectedNodeId,
    deletePreviewNodeId,
    clearPreviewActive,
    hoveredAttachTarget,
    hoveredNodeId,
    pendingFromPort,
    pendingWirePointer
  ]);

  const getNodeAtPointer = useCallback(
    (rawX: number, rawY: number) => {
      return findPatchNodeAtPoint(
        { nodes: patch.nodes.filter((node) => !isPatchOutputPortId(patch, node.id)) },
        layoutByNode,
        rawX,
        rawY
      );
    },
    [layoutByNode, patch]
  );

  const handlePortSelection = useCallback(
    (hitPort: HitPort, pointer: { x: number; y: number }) => {
      if (pendingProbeId && onAttachProbeTarget) {
        onAttachProbeTarget({
          kind: "port",
          nodeId: hitPort.nodeId,
          portId: hitPort.portId,
          portKind: hitPort.kind
        });
        return;
      }
      if (structureLocked) {
        return;
      }
      if (!pendingFromPort) {
        setPendingFromPort(hitPort);
        setPendingWirePointer(pointer);
        return;
      }

      const resolved = resolveConnectionOp(pendingFromPort, hitPort);
      if (resolved) {
        onApplyOp(resolved.op);
        setPendingFromPort(null);
        setPendingWirePointer(null);
        setHoveredAttachTarget(null);
        return;
      }

      setPendingFromPort(hitPort);
      setPendingWirePointer(pointer);
    },
    [onApplyOp, onAttachProbeTarget, pendingProbeId, pendingFromPort, resolveConnectionOp, structureLocked]
  );

  const handlePortHover = useCallback(
    (hoverPort: HitPort | null, pointer: { x: number; y: number } | null) => {
      if (pendingFromPort && pointer) {
        setPendingWirePointer(pointer);
      }
      if (!pendingFromPort) {
        setHoveredAttachTarget(null);
        return;
      }

      const resolved = resolveConnectionOp(pendingFromPort, hoverPort);
      setHoveredAttachTarget(
        resolved
          ? {
              kind: "port",
              nodeId: resolved.target.nodeId,
              portId: resolved.target.portId,
              portKind: resolved.target.kind
            }
          : null
      );
    },
    [pendingFromPort, resolveConnectionOp]
  );

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const pos = pointerEventToPatchCanvasPoint(canvasRef.current, event);
      pointerDownNodeIdRef.current = null;
      pointerMovedRef.current = false;
      const popoverHit = handleFacePopoverPointerDown(pos.rawX, pos.rawY);
      if (popoverHit.kind === "dismissed") {
        return;
      }
      if (popoverHit.kind === "inside-popover") {
        const hitNodeId = popoverHit.nodeId;
        onSelectNode(hitNodeId);
        dragNodeIdRef.current = hitNodeId;
        setDragNodeId(hitNodeId);
        pointerDownNodeIdRef.current = hitNodeId;
        const layout = layoutByNode.get(hitNodeId);
        dragLastLayoutRef.current = layout ? { x: layout.x, y: layout.y } : null;
        dragPointerOffsetRef.current = layout
          ? {
              x: pos.rawX - layout.x * PATCH_CANVAS_GRID,
              y: pos.rawY - layout.y * PATCH_CANVAS_GRID
            }
          : null;
        event.currentTarget.setPointerCapture(event.pointerId);
        return;
      }

      const hitPort = findPatchPortAtPointWithPadding(hitPortsRef.current, pos.rawX, pos.rawY, Math.max(3, 6 / zoom));
      if (hitPort) {
        handlePortSelection(hitPort, { x: pos.rawX, y: pos.rawY });
        return;
      }

      if (pendingProbeId && onAttachProbeTarget) {
        const hitConnectionId = findPatchConnectionAtPoint(
          patch,
          layoutByNode,
          pos.rawX,
          pos.rawY,
          outputHostCanvasLeft,
          Math.max(8, 10 / zoom)
        );
        if (hitConnectionId) {
          onAttachProbeTarget({
            kind: "connection",
            connectionId: hitConnectionId
          });
          return;
        }
        onCancelProbeAttach?.();
        setHoveredAttachTarget(null);
        return;
      }

      const hitNodeId = getNodeAtPointer(pos.rawX, pos.rawY);
      if (hitNodeId) {
        onSelectNode(hitNodeId);
        dragNodeIdRef.current = hitNodeId;
        setDragNodeId(hitNodeId);
        pointerDownNodeIdRef.current = hitNodeId;
        pointerMovedRef.current = false;
        const layout = layoutByNode.get(hitNodeId);
        dragLastLayoutRef.current = layout ? { x: layout.x, y: layout.y } : null;
        dragPointerOffsetRef.current = layout
          ? {
              x: pos.rawX - layout.x * PATCH_CANVAS_GRID,
              y: pos.rawY - layout.y * PATCH_CANVAS_GRID
            }
          : null;
        event.currentTarget.setPointerCapture(event.pointerId);
      } else {
        onSelectNode(undefined);
        setPendingFromPort(null);
        setPendingWirePointer(null);
        pointerDownNodeIdRef.current = null;
        pointerMovedRef.current = false;
      }
    },
    [
      canvasRef,
      handleFacePopoverPointerDown,
      layoutByNode,
      onAttachProbeTarget,
      onCancelProbeAttach,
      onSelectNode,
      outputHostCanvasLeft,
      patch,
      pendingProbeId,
      zoom,
      getNodeAtPointer,
      handlePortSelection
    ]
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const pos = pointerEventToPatchCanvasPoint(canvasRef.current, event);
      const hoverPort = findPatchPortAtPointWithPadding(hitPortsRef.current, pos.rawX, pos.rawY, Math.max(3, 6 / zoom));
      if (pendingProbeId) {
        if (hoverPort) {
          setHoveredAttachTarget({
            kind: "port",
            nodeId: hoverPort.nodeId,
            portId: hoverPort.portId,
            portKind: hoverPort.kind
          });
        } else {
          const hoverConnectionId = findPatchConnectionAtPoint(
            patch,
            layoutByNode,
            pos.rawX,
            pos.rawY,
            outputHostCanvasLeft,
            Math.max(8, 10 / zoom)
          );
          setHoveredAttachTarget(hoverConnectionId ? { kind: "connection", connectionId: hoverConnectionId } : null);
        }
      } else {
        handlePortHover(hoverPort, { x: pos.rawX, y: pos.rawY });
      }
      const hoverNodeId = hoverPort ? null : getNodeAtPointer(pos.rawX, pos.rawY);
      setHoveredNodeId((prev) => (prev === hoverNodeId ? prev : hoverNodeId));

      const activeDragNodeId = dragNodeIdRef.current ?? dragNodeId;
      if (!activeDragNodeId) {
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
      onApplyOp({
        type: "moveNode",
        nodeId: activeDragNodeId,
        newLayoutPos: nextLayout
      });
    },
    [
      canvasRef,
      dragNodeId,
      getNodeAtPointer,
      handlePortHover,
      layoutByNode,
      onApplyOp,
      outputHostCanvasLeft,
      patch,
      pendingProbeId,
      zoom
    ]
  );

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
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
      dragNodeIdRef.current = null;
      pointerDownNodeIdRef.current = null;
      pointerMovedRef.current = false;
      setDragNodeId(null);
      if (clickedNodeId && !moved) {
        togglePopoverForNode(clickedNodeId);
      }
    },
    [dragNodeId, togglePopoverForNode]
  );

  return {
    dragNodeId,
    hoveredNodeId,
    pendingFromPort,
    pendingWirePointer,
    hoveredAttachTarget,
    handlePortSelection,
    handlePortHover,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    setHoveredNodeId
  };
}

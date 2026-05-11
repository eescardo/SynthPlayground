"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import { drawPatchCanvas } from "@/components/patch/patchCanvasDrawing";
import {
  PatchCanvasModeState,
  PatchCanvasSelectionState,
  PatchCanvasViewportState
} from "@/components/patch/patchCanvasRenderState";
import { resolveArmedWireCancelButtonRect } from "@/components/patch/patchWireGeometry";
import { resolvePatchCanvasHitTarget } from "@/components/patch/patchCanvasHitTargets";
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
import type { PatchModuleFacePopoverPointerResult } from "@/hooks/patch/usePatchModuleFacePopover";
import { PatchWireCommitFeedback } from "@/components/patch/patchWireFeedback";
import { usePatchWireGesture } from "@/hooks/patch/usePatchWireGesture";

interface UsePatchCanvasInteractionsArgs {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  viewport: PatchCanvasViewportState;
  facePopoverNodeId: string | null;
  getFacePopoverRect: (nodeId: string) => { x: number; y: number; width: number; height: number } | null;
  layoutByNode: Map<string, PatchLayoutNode>;
  nodeById: Map<string, PatchNode>;
  patch: Patch;
  patchDiff: PatchDiff;
  validationIssues: PatchValidationIssue[];
  selection: PatchCanvasSelectionState;
  mode: PatchCanvasModeState;
  onApplyOp: (op: PatchOp) => void;
  onSelectNode: (nodeId?: string) => void;
  onSelectConnection?: (connectionId?: string) => void;
  onAttachProbeTarget?: (
    target:
      | { kind: "port"; nodeId: string; portId: string; portKind: "in" | "out" }
      | { kind: "connection"; connectionId: string }
  ) => void;
  onCancelProbeAttach?: () => void;
  makeConnectOp: (fromNodeId: string, fromPortId: string, toNodeId: string, toPortId: string) => PatchOp;
  handleFacePopoverPointerDown: (rawX: number, rawY: number) => PatchModuleFacePopoverPointerResult;
  togglePopoverForNode: (nodeId: string) => void;
  onWireCommitFeedback?: (feedback: PatchWireCommitFeedback) => void;
}

export function usePatchCanvasInteractions(args: UsePatchCanvasInteractionsArgs) {
  const {
    canvasRef,
    viewport,
    facePopoverNodeId,
    getFacePopoverRect,
    layoutByNode,
    nodeById,
    patch,
    patchDiff,
    validationIssues,
    selection,
    mode,
    onApplyOp,
    onSelectNode,
    onSelectConnection,
    onAttachProbeTarget,
    onCancelProbeAttach,
    makeConnectOp,
    handleFacePopoverPointerDown,
    togglePopoverForNode,
    onWireCommitFeedback
  } = args;
  const { outputHostCanvasLeft, visibleCanvasBounds, zoom } = viewport;
  const { pendingProbeId, structureLocked } = mode;
  const hitPortsRef = useRef<HitPort[]>([]);
  const dragNodeIdRef = useRef<string | null>(null);
  const dragInitialLayoutRef = useRef<{ x: number; y: number } | null>(null);
  const dragLastLayoutRef = useRef<{ x: number; y: number } | null>(null);
  const dragPointerOffsetRef = useRef<{ x: number; y: number } | null>(null);
  const dragPointerIdRef = useRef<number | null>(null);
  const pointerDownNodeIdRef = useRef<string | null>(null);
  const pointerMovedRef = useRef(false);
  const [pendingProbePointer, setPendingProbePointer] = useState<{ x: number; y: number } | null>(null);
  const [dragNodeId, setDragNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const {
    armedWireModuleHover,
    clearPendingConnection,
    commitConnectionCandidate,
    dismissReplaceCandidate,
    handleAttachHoverTarget,
    handleModuleHoverWhileWiring,
    handlePortHover: handleWirePortHover,
    handlePortSelection,
    handleReplacePromptHover,
    hoveredAttachTarget,
    lockedPortHovered,
    lockedPortTooltip,
    pendingConnection,
    pendingFromPort,
    pendingWirePointer,
    wireCandidate,
    wireCandidatePulse,
    wireCommitFeedback,
    wireFeedbackNow
  } = usePatchWireGesture({
    patch,
    structureLocked,
    pendingProbeId,
    visibleCanvasBounds,
    onApplyOp,
    onSelectNode,
    onSelectConnection,
    onAttachProbeTarget,
    makeConnectOp,
    onWireCommitFeedback
  });

  const handlePortHover = useCallback(
    (hoverPort: HitPort | null, pointer: { x: number; y: number } | null) => {
      if (pendingProbeId) {
        setPendingProbePointer(pointer);
      }
      handleWirePortHover(hoverPort, pointer);
    },
    [handleWirePortHover, pendingProbeId]
  );

  const clearActiveNodeDrag = useCallback(() => {
    dragInitialLayoutRef.current = null;
    dragLastLayoutRef.current = null;
    dragPointerOffsetRef.current = null;
    dragPointerIdRef.current = null;
    dragNodeIdRef.current = null;
    pointerDownNodeIdRef.current = null;
    pointerMovedRef.current = false;
    setDragNodeId(null);
  }, []);

  const beginNodeDrag = useCallback(
    (nodeId: string, pointer: { x: number; y: number }, event: ReactPointerEvent<HTMLCanvasElement>) => {
      onSelectNode(nodeId);
      dragNodeIdRef.current = nodeId;
      setDragNodeId(nodeId);
      pointerDownNodeIdRef.current = nodeId;
      pointerMovedRef.current = false;
      const layout = layoutByNode.get(nodeId);
      const initialLayout = layout ? { x: layout.x, y: layout.y } : null;
      dragInitialLayoutRef.current = initialLayout;
      dragLastLayoutRef.current = initialLayout;
      dragPointerOffsetRef.current = layout
        ? {
            x: pointer.x - layout.x * PATCH_CANVAS_GRID,
            y: pointer.y - layout.y * PATCH_CANVAS_GRID
          }
        : null;
      dragPointerIdRef.current = event.pointerId;
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [layoutByNode, onSelectNode]
  );

  const cancelActiveNodeDrag = useCallback(() => {
    const nodeId = dragNodeIdRef.current ?? dragNodeId;
    if (!nodeId) {
      return false;
    }
    const initialLayout = dragInitialLayoutRef.current;
    const lastLayout = dragLastLayoutRef.current;
    if (initialLayout && (!lastLayout || lastLayout.x !== initialLayout.x || lastLayout.y !== initialLayout.y)) {
      onApplyOp({
        type: "moveNode",
        nodeId,
        newLayoutPos: initialLayout
      });
    }
    const canvas = canvasRef.current;
    const pointerId = dragPointerIdRef.current;
    if (canvas && pointerId !== null) {
      try {
        if (canvas.hasPointerCapture(pointerId)) {
          canvas.releasePointerCapture(pointerId);
        }
      } catch {
        // ignore
      }
    }
    clearActiveNodeDrag();
    return true;
  }, [canvasRef, clearActiveNodeDrag, dragNodeId, onApplyOp]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    hitPortsRef.current = drawPatchCanvas({
      canvas,
      facePopoverNodeId,
      getFacePopoverRect,
      layoutByNode,
      nodeById,
      patch,
      renderState: {
        viewport,
        selection,
        wire: {
          pendingFromPort,
          pendingWirePointer,
          candidate: wireCandidate,
          candidatePulse: wireCandidatePulse,
          commitFeedback: wireCommitFeedback,
          feedbackNow: wireFeedbackNow,
          lockedPortTooltip,
          armedModuleHover: armedWireModuleHover
        },
        probe: {
          pendingPointer: pendingProbePointer
        },
        diff: {
          patchDiff,
          validationIssues
        },
        hover: {
          nodeId: hoveredNodeId,
          attachTarget: hoveredAttachTarget
        }
      }
    });
  }, [
    canvasRef,
    facePopoverNodeId,
    getFacePopoverRect,
    layoutByNode,
    nodeById,
    patch,
    viewport,
    patchDiff,
    validationIssues,
    selection,
    hoveredAttachTarget,
    pendingProbePointer,
    wireCandidate,
    wireCandidatePulse,
    wireCommitFeedback,
    wireFeedbackNow,
    lockedPortTooltip,
    armedWireModuleHover,
    hoveredNodeId,
    pendingFromPort,
    pendingWirePointer
  ]);

  useEffect(() => {
    if (!dragNodeId) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      if (cancelActiveNodeDrag()) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cancelActiveNodeDrag, dragNodeId]);

  useEffect(() => {
    if (pendingProbeId) {
      return;
    }
    setPendingProbePointer(null);
  }, [pendingProbeId]);

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

  const getNearestNodePortAtPointer = useCallback((nodeId: string, rawX: number, rawY: number): HitPort | null => {
    const ports = hitPortsRef.current.filter((port) => port.nodeId === nodeId);
    if (ports.length === 0) {
      return null;
    }
    return ports.reduce((best, port) => {
      const portDistance = Math.hypot(rawX - (port.x + port.width / 2), rawY - port.y);
      const bestDistance = Math.hypot(rawX - (best.x + best.width / 2), rawY - best.y);
      return portDistance < bestDistance ? port : best;
    });
  }, []);

  const resolveArmedWireCancelRectForNode = useCallback(
    (nodeId: string) => {
      const layout = layoutByNode.get(nodeId);
      if (!layout) {
        return null;
      }
      return resolveArmedWireCancelButtonRect(layout.x * PATCH_CANVAS_GRID, layout.y * PATCH_CANVAS_GRID);
    },
    [layoutByNode]
  );

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const pos = pointerEventToPatchCanvasPoint(canvasRef.current, event);
      pointerDownNodeIdRef.current = null;
      pointerMovedRef.current = false;
      if (!pendingFromPort) {
        const popoverHit = handleFacePopoverPointerDown(pos.rawX, pos.rawY);
        if (popoverHit.kind === "dismissed") {
          return;
        }
        if (popoverHit.kind === "inside-popover") {
          const hitNodeId = popoverHit.nodeId;
          beginNodeDrag(hitNodeId, { x: pos.rawX, y: pos.rawY }, event);
          return;
        }
      }

      const hitTarget = resolvePatchCanvasHitTarget({
        point: { x: pos.rawX, y: pos.rawY },
        hitPorts: hitPortsRef.current,
        zoom,
        patch,
        layoutByNode,
        outputHostCanvasLeft,
        pendingFromPort,
        pendingProbeId,
        replacePrompt:
          wireCandidate?.status === "replace" ? { pointer: wireCandidate.pointer, bounds: visibleCanvasBounds } : null,
        getNodeAtPoint: getNodeAtPointer,
        getArmedWireCancelRect: resolveArmedWireCancelRectForNode
      });

      switch (hitTarget.kind) {
        case "wireReplaceButton": {
          const candidate = pendingConnection?.candidate.result;
          if (hitTarget.value === "yes" && candidate?.status === "replace") {
            commitConnectionCandidate(candidate);
          } else {
            dismissReplaceCandidate();
          }
          return;
        }
        case "port":
          handlePortSelection(hitTarget.port, { x: pos.rawX, y: pos.rawY });
          return;
        case "connection":
          if (pendingProbeId && onAttachProbeTarget) {
            onAttachProbeTarget({
              kind: "connection",
              connectionId: hitTarget.connectionId
            });
            setPendingProbePointer(null);
            handleAttachHoverTarget(null);
            return;
          }
          onSelectConnection?.(hitTarget.connectionId);
          clearPendingConnection();
          pointerDownNodeIdRef.current = null;
          pointerMovedRef.current = false;
          return;
        case "armedWireCancel":
          clearPendingConnection();
          return;
        case "node":
          if (pendingFromPort) {
            const nearestPort = getNearestNodePortAtPointer(hitTarget.nodeId, pos.rawX, pos.rawY);
            if (nearestPort) {
              handlePortSelection(nearestPort, { x: pos.rawX, y: pos.rawY });
              return;
            }
            clearPendingConnection();
            return;
          }
          beginNodeDrag(hitTarget.nodeId, { x: pos.rawX, y: pos.rawY }, event);
          return;
        case "empty":
          if (pendingProbeId && onAttachProbeTarget) {
            onCancelProbeAttach?.();
            setPendingProbePointer(null);
            handleAttachHoverTarget(null);
            return;
          }
          if (pendingFromPort) {
            clearPendingConnection();
            return;
          }
          onSelectNode(undefined);
          onSelectConnection?.(undefined);
          clearPendingConnection();
          pointerDownNodeIdRef.current = null;
          pointerMovedRef.current = false;
          return;
      }
    },
    [
      beginNodeDrag,
      canvasRef,
      clearPendingConnection,
      commitConnectionCandidate,
      dismissReplaceCandidate,
      getNearestNodePortAtPointer,
      getNodeAtPointer,
      handleFacePopoverPointerDown,
      handlePortSelection,
      layoutByNode,
      onAttachProbeTarget,
      onCancelProbeAttach,
      onSelectConnection,
      onSelectNode,
      outputHostCanvasLeft,
      patch,
      pendingConnection,
      pendingFromPort,
      pendingProbeId,
      resolveArmedWireCancelRectForNode,
      handleAttachHoverTarget,
      visibleCanvasBounds,
      wireCandidate?.pointer,
      wireCandidate?.status,
      zoom
    ]
  );
  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const pos = pointerEventToPatchCanvasPoint(canvasRef.current, event);
      const hoverPort = findPatchPortAtPointWithPadding(hitPortsRef.current, pos.rawX, pos.rawY, Math.max(3, 6 / zoom));
      if (
        handleReplacePromptHover({
          point: { x: pos.rawX, y: pos.rawY },
          hoverPort
        })
      ) {
        return;
      }
      if (pendingProbeId) {
        setPendingProbePointer({ x: pos.rawX, y: pos.rawY });
        if (hoverPort) {
          handleAttachHoverTarget({
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
          handleAttachHoverTarget(hoverConnectionId ? { kind: "connection", connectionId: hoverConnectionId } : null);
        }
      } else {
        handlePortHover(hoverPort, { x: pos.rawX, y: pos.rawY });
      }
      const hoverNodeId = hoverPort ? null : getNodeAtPointer(pos.rawX, pos.rawY);
      if (!pendingFromPort && !pendingProbeId && !hoverPort && !hoverNodeId) {
        const hoverConnectionId = findPatchConnectionAtPoint(
          patch,
          layoutByNode,
          pos.rawX,
          pos.rawY,
          outputHostCanvasLeft,
          Math.max(8, 10 / zoom)
        );
        handleAttachHoverTarget(hoverConnectionId ? { kind: "connection", connectionId: hoverConnectionId } : null);
      } else if (!pendingProbeId && !pendingFromPort) {
        handleAttachHoverTarget(null);
      }
      if (pendingFromPort && !pendingProbeId && hoverNodeId) {
        const nearestPort = getNearestNodePortAtPointer(hoverNodeId, pos.rawX, pos.rawY);
        handleModuleHoverWhileWiring({
          enabled: true,
          nodeId: hoverNodeId,
          nearestPort,
          pointer: { x: pos.rawX, y: pos.rawY }
        });
      } else {
        handleModuleHoverWhileWiring({
          enabled: false,
          nodeId: null,
          nearestPort: null,
          pointer: { x: pos.rawX, y: pos.rawY }
        });
      }
      setHoveredNodeId((prev) => (prev === hoverNodeId ? prev : hoverNodeId));

      const activeDragNodeId = dragNodeIdRef.current ?? dragNodeId;
      if (!activeDragNodeId || pendingFromPort) {
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
      getNearestNodePortAtPointer,
      handleModuleHoverWhileWiring,
      handlePortHover,
      handleReplacePromptHover,
      layoutByNode,
      onApplyOp,
      outputHostCanvasLeft,
      patch,
      pendingFromPort,
      pendingProbeId,
      handleAttachHoverTarget,
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
      dragInitialLayoutRef.current = null;
      dragLastLayoutRef.current = null;
      dragPointerOffsetRef.current = null;
      dragPointerIdRef.current = null;
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
    pendingProbePointer,
    wireCandidate,
    hoveredAttachTarget,
    lockedPortHovered,
    handlePortSelection,
    handlePortHover,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    setHoveredNodeId
  };
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import {
  drawPatchCanvas,
  PatchArmedWireModuleHover,
  PatchWireCandidateDisplay,
  resolveArmedWireCancelButtonRect,
  resolveWireReplacePromptBounds,
  resolveWireReplacePromptRects
} from "@/components/patch/patchCanvasDrawing";
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
import { PatchWireCandidate, resolvePatchWireCandidate } from "@/lib/patch/wireCandidate";
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
  const wireCandidateAnchorRef = useRef<{ key: string; pointer: { x: number; y: number } | null } | null>(null);
  const wireActionCandidateRef = useRef<PatchWireCandidate | null>(null);
  const [pendingFromPort, setPendingFromPort] = useState<HitPort | null>(null);
  const [pendingWirePointer, setPendingWirePointer] = useState<{ x: number; y: number } | null>(null);
  const [pendingProbePointer, setPendingProbePointer] = useState<{ x: number; y: number } | null>(null);
  const [dragNodeId, setDragNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [hoveredAttachTarget, setHoveredAttachTarget] = useState<HoveredAttachTarget>(null);
  const [wireCandidate, setWireCandidate] = useState<PatchWireCandidateDisplay | null>(null);
  const [armedWireModuleHover, setArmedWireModuleHover] = useState<PatchArmedWireModuleHover | null>(null);

  const clearWireCandidate = useCallback(() => {
    wireCandidateAnchorRef.current = null;
    wireActionCandidateRef.current = null;
    setWireCandidate(null);
  }, []);

  const resolveConnectionCandidate = useCallback(
    (startPort: HitPort | null, endPort: HitPort | null) =>
      resolvePatchWireCandidate(patch, startPort, endPort, { structureLocked }),
    [patch, structureLocked]
  );

  const buildConnectionOp = useCallback(
    (candidate: Extract<PatchWireCandidate, { status: "valid" | "replace" }>): PatchOp | null => {
      const op = makeConnectOp(candidate.from.nodeId, candidate.from.portId, candidate.to.nodeId, candidate.to.portId);
      if (op.type !== "connect") {
        return op;
      }
      if (candidate.status === "replace") {
        return {
          ...op,
          type: "replaceConnection",
          disconnectConnectionId: candidate.disconnectConnectionId
        };
      }
      return op;
    },
    [makeConnectOp]
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
      hoveredAttachTarget,
      wireCandidate,
      armedWireModuleHover
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
    wireCandidate,
    armedWireModuleHover,
    hoveredNodeId,
    pendingFromPort,
    pendingWirePointer
  ]);

  useEffect(() => {
    if (!pendingFromPort) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      setPendingFromPort(null);
      setPendingWirePointer(null);
      setHoveredAttachTarget(null);
      clearWireCandidate();
      setArmedWireModuleHover(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [clearWireCandidate, pendingFromPort]);

  useEffect(() => {
    if (pendingProbeId) {
      return;
    }
    setPendingProbePointer(null);
    if (!pendingFromPort) {
      setHoveredAttachTarget(null);
      clearWireCandidate();
      setArmedWireModuleHover(null);
    }
  }, [clearWireCandidate, pendingFromPort, pendingProbeId]);

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

  const updateWireCandidateState = useCallback(
    (targetPort: HitPort | null, pointer: { x: number; y: number } | null) => {
      if (!pendingFromPort || !targetPort) {
        clearWireCandidate();
        return resolvePatchWireCandidate(patch, pendingFromPort, targetPort, { structureLocked });
      }
      const candidate = resolveConnectionCandidate(pendingFromPort, targetPort);
      if (candidate.status === "valid" || candidate.status === "replace" || candidate.status === "invalid") {
        wireActionCandidateRef.current = candidate;
        const key = `${candidate.status}:${targetPort.nodeId}:${targetPort.kind}:${targetPort.portId}:${
          candidate.status === "invalid" ? candidate.reason : ""
        }`;
        const anchoredPointer =
          wireCandidateAnchorRef.current?.key === key ? wireCandidateAnchorRef.current.pointer : pointer;
        wireCandidateAnchorRef.current = { key, pointer: anchoredPointer };
        setWireCandidate({
          status: candidate.status,
          target: {
            nodeId: targetPort.nodeId,
            portId: targetPort.portId,
            portKind: targetPort.kind
          },
          reason: candidate.status === "invalid" ? candidate.reason : undefined,
          pointer: anchoredPointer
        });
      } else {
        clearWireCandidate();
      }
      return candidate;
    },
    [clearWireCandidate, patch, pendingFromPort, resolveConnectionCandidate, structureLocked]
  );

  const isPointInRect = useCallback(
    (point: { x: number; y: number }, rect: { x: number; y: number; width: number; height: number }) =>
      point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height,
    []
  );

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

  const handlePortSelection = useCallback(
    (hitPort: HitPort, pointer: { x: number; y: number }) => {
      if (pendingProbeId && onAttachProbeTarget) {
        onAttachProbeTarget({
          kind: "port",
          nodeId: hitPort.nodeId,
          portId: hitPort.portId,
          portKind: hitPort.kind
        });
        setPendingProbePointer(null);
        setHoveredAttachTarget(null);
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

      const candidate = resolveConnectionCandidate(pendingFromPort, hitPort);
      if (candidate.status === "new-source") {
        setPendingFromPort(hitPort);
        setPendingWirePointer(pointer);
        clearWireCandidate();
        return;
      }
      if (candidate.status === "valid") {
        const op = buildConnectionOp(candidate);
        if (!op) {
          return;
        }
        onApplyOp(op);
        setPendingFromPort(null);
        setPendingWirePointer(null);
        setHoveredAttachTarget(null);
        clearWireCandidate();
        setArmedWireModuleHover(null);
        return;
      }
      if (candidate.status === "replace") {
        const promptRects = resolveWireReplacePromptRects(pointer);
        if (promptRects && isPointInRect(pointer, promptRects.yes)) {
          const op = buildConnectionOp(candidate);
          if (!op) {
            return;
          }
          onApplyOp(op);
          setPendingFromPort(null);
          setPendingWirePointer(null);
          setHoveredAttachTarget(null);
          clearWireCandidate();
          setArmedWireModuleHover(null);
        } else {
          updateWireCandidateState(hitPort, pointer);
        }
        return;
      }

      updateWireCandidateState(hitPort, pointer);
    },
    [
      buildConnectionOp,
      clearWireCandidate,
      isPointInRect,
      onApplyOp,
      onAttachProbeTarget,
      pendingProbeId,
      pendingFromPort,
      resolveConnectionCandidate,
      structureLocked,
      updateWireCandidateState
    ]
  );

  const handlePortHover = useCallback(
    (hoverPort: HitPort | null, pointer: { x: number; y: number } | null) => {
      if (pendingProbeId) {
        if (pointer) {
          setPendingProbePointer(pointer);
        }
        setHoveredAttachTarget(
          hoverPort
            ? {
                kind: "port",
                nodeId: hoverPort.nodeId,
                portId: hoverPort.portId,
                portKind: hoverPort.kind
              }
            : null
        );
        return;
      }
      if (pendingFromPort && pointer) {
        setPendingWirePointer(pointer);
      }
      if (!pendingFromPort) {
        setHoveredAttachTarget(null);
        clearWireCandidate();
        return;
      }

      const candidate = updateWireCandidateState(hoverPort, pointer);
      setHoveredAttachTarget(
        candidate.status === "valid"
          ? {
              kind: "port",
              nodeId: candidate.to.nodeId,
              portId: candidate.to.portId,
              portKind: candidate.to.kind
            }
          : null
      );
    },
    [clearWireCandidate, pendingFromPort, pendingProbeId, updateWireCandidateState]
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
      }

      if (pendingFromPort && wireCandidate?.status === "replace") {
        const promptRects = resolveWireReplacePromptRects(wireCandidate.pointer);
        if (promptRects && isPointInRect({ x: pos.rawX, y: pos.rawY }, promptRects.yes)) {
          const candidate = wireActionCandidateRef.current;
          if (candidate?.status === "replace") {
            const op = buildConnectionOp(candidate);
            if (op) {
              onApplyOp(op);
              setPendingFromPort(null);
              setPendingWirePointer(null);
              setHoveredAttachTarget(null);
              clearWireCandidate();
              setArmedWireModuleHover(null);
            }
          }
          return;
        }
        if (promptRects && isPointInRect({ x: pos.rawX, y: pos.rawY }, promptRects.no)) {
          return;
        }
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
          setPendingProbePointer(null);
          setHoveredAttachTarget(null);
          return;
        }
        onCancelProbeAttach?.();
        setPendingProbePointer(null);
        setHoveredAttachTarget(null);
        return;
      }

      if (pendingFromPort) {
        const hitNodeId = getNodeAtPointer(pos.rawX, pos.rawY);
        if (hitNodeId) {
          const cancelRect = resolveArmedWireCancelRectForNode(hitNodeId);
          if (cancelRect && isPointInRect({ x: pos.rawX, y: pos.rawY }, cancelRect)) {
            setPendingFromPort(null);
            setPendingWirePointer(null);
            clearWireCandidate();
            setArmedWireModuleHover(null);
            setHoveredAttachTarget(null);
            return;
          }
          const nearestPort = getNearestNodePortAtPointer(hitNodeId, pos.rawX, pos.rawY);
          if (nearestPort) {
            handlePortSelection(nearestPort, { x: pos.rawX, y: pos.rawY });
            return;
          }
        }
        setPendingFromPort(null);
        setPendingWirePointer(null);
        clearWireCandidate();
        setArmedWireModuleHover(null);
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
      buildConnectionOp,
      clearWireCandidate,
      getNearestNodePortAtPointer,
      handleFacePopoverPointerDown,
      layoutByNode,
      isPointInRect,
      onAttachProbeTarget,
      onCancelProbeAttach,
      onApplyOp,
      onSelectNode,
      outputHostCanvasLeft,
      patch,
      pendingFromPort,
      pendingProbeId,
      resolveArmedWireCancelRectForNode,
      wireCandidate?.pointer,
      wireCandidate?.status,
      zoom,
      getNodeAtPointer,
      handlePortSelection
    ]
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const pos = pointerEventToPatchCanvasPoint(canvasRef.current, event);
      if (pendingFromPort && wireCandidate?.status === "replace") {
        const promptBounds = resolveWireReplacePromptBounds(wireCandidate.pointer);
        if (promptBounds && isPointInRect({ x: pos.rawX, y: pos.rawY }, promptBounds)) {
          setPendingWirePointer({ x: pos.rawX, y: pos.rawY });
          return;
        }
      }
      const hoverPort = findPatchPortAtPointWithPadding(hitPortsRef.current, pos.rawX, pos.rawY, Math.max(3, 6 / zoom));
      if (pendingProbeId) {
        setPendingProbePointer({ x: pos.rawX, y: pos.rawY });
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
      if (pendingFromPort && !pendingProbeId && hoverNodeId) {
        const nearestPort = getNearestNodePortAtPointer(hoverNodeId, pos.rawX, pos.rawY);
        setArmedWireModuleHover({
          nodeId: hoverNodeId,
          nearestPort
        });
        updateWireCandidateState(nearestPort, { x: pos.rawX, y: pos.rawY });
      } else {
        setArmedWireModuleHover(null);
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
      handlePortHover,
      layoutByNode,
      onApplyOp,
      outputHostCanvasLeft,
      patch,
      pendingFromPort,
      pendingProbeId,
      updateWireCandidateState,
      wireCandidate,
      isPointInRect,
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
    pendingProbePointer,
    wireCandidate,
    hoveredAttachTarget,
    handlePortSelection,
    handlePortHover,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    setHoveredNodeId
  };
}

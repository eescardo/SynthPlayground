"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import {
  drawPatchCanvas,
  PatchArmedWireModuleHover,
  PatchLockedPortTooltip,
  PatchWireCandidatePulse,
  PatchWireCandidateDisplay,
  PatchWireTooltipBounds,
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
import { PatchWireCommitFeedback } from "@/components/patch/patchWireFeedback";

interface UsePatchCanvasInteractionsArgs {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  canvasSize: { width: number; height: number };
  visibleCanvasBounds: PatchWireTooltipBounds;
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
  onWireCommitFeedback?: (feedback: PatchWireCommitFeedback) => void;
}

type HoveredAttachTarget =
  | { kind: "port"; nodeId: string; portId: string; portKind: "in" | "out" }
  | { kind: "connection"; connectionId: string }
  | null;

type ReplaceWireSelection = "no" | "yes";

interface PendingConnection {
  fromPort: HitPort;
  pointer: { x: number; y: number };
  candidate: {
    result: PatchWireCandidate;
    targetPort: HitPort | null;
    anchorPointer: { x: number; y: number } | null;
    replaceSelection?: ReplaceWireSelection;
  };
}

const EMPTY_CONNECTION_CANDIDATE: PendingConnection["candidate"] = {
  result: { status: "none" },
  targetPort: null,
  anchorPointer: null
};

const WIRE_REPLACE_PROMPT_MAGNET_PADDING = 18;
const WIRE_CANDIDATE_PULSE_MS = 380;
const WIRE_COMMIT_FEEDBACK_MS = 880;

export function usePatchCanvasInteractions(args: UsePatchCanvasInteractionsArgs) {
  const {
    canvasRef,
    canvasSize,
    visibleCanvasBounds,
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
    togglePopoverForNode,
    onWireCommitFeedback
  } = args;
  const hitPortsRef = useRef<HitPort[]>([]);
  const dragNodeIdRef = useRef<string | null>(null);
  const dragLastLayoutRef = useRef<{ x: number; y: number } | null>(null);
  const dragPointerOffsetRef = useRef<{ x: number; y: number } | null>(null);
  const pointerDownNodeIdRef = useRef<string | null>(null);
  const pointerMovedRef = useRef(false);
  const wireCandidateAnchorRef = useRef<{ key: string; pointer: { x: number; y: number } | null } | null>(null);
  const lastCandidatePulseKeyRef = useRef<string | null>(null);
  const [pendingConnection, setPendingConnection] = useState<PendingConnection | null>(null);
  const [pendingProbePointer, setPendingProbePointer] = useState<{ x: number; y: number } | null>(null);
  const [lockedPortTooltip, setLockedPortTooltip] = useState<PatchLockedPortTooltip | null>(null);
  const [wireCandidatePulse, setWireCandidatePulse] = useState<PatchWireCandidatePulse | null>(null);
  const [wireCommitFeedback, setWireCommitFeedback] = useState<PatchWireCommitFeedback | null>(null);
  const [wireFeedbackNow, setWireFeedbackNow] = useState(() => performance.now());
  const [dragNodeId, setDragNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [hoveredAttachTarget, setHoveredAttachTarget] = useState<HoveredAttachTarget>(null);
  const [armedWireModuleHover, setArmedWireModuleHover] = useState<PatchArmedWireModuleHover | null>(null);
  const pendingFromPort = pendingConnection?.fromPort ?? null;
  const pendingWirePointer = pendingConnection?.pointer ?? null;
  const wireCandidate = useMemo<PatchWireCandidateDisplay | null>(() => {
    if (!pendingConnection?.candidate.targetPort) {
      return null;
    }
    const { result, targetPort, anchorPointer } = pendingConnection.candidate;
    if (result.status !== "valid" && result.status !== "replace" && result.status !== "invalid") {
      return null;
    }
    return {
      status: result.status,
      target: {
        nodeId: targetPort.nodeId,
        portId: targetPort.portId,
        portKind: targetPort.kind
      },
      reason: result.status === "invalid" ? result.reason : undefined,
      pointer: anchorPointer,
      replaceSelection:
        result.status === "replace" ? (pendingConnection.candidate.replaceSelection ?? "no") : undefined,
      tooltipBounds: visibleCanvasBounds
    };
  }, [pendingConnection, visibleCanvasBounds]);

  const clearPendingConnection = useCallback(() => {
    wireCandidateAnchorRef.current = null;
    lastCandidatePulseKeyRef.current = null;
    setPendingConnection(null);
    setHoveredAttachTarget(null);
    setArmedWireModuleHover(null);
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
      wireCandidatePulse,
      wireCommitFeedback,
      wireFeedbackNow,
      lockedPortTooltip,
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
    if (!pendingFromPort) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      clearPendingConnection();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [clearPendingConnection, pendingFromPort]);

  useEffect(() => {
    if (!wireCandidatePulse && !wireCommitFeedback) {
      return;
    }
    let frameId = 0;
    const tick = () => {
      const now = performance.now();
      setWireFeedbackNow(now);
      setWireCandidatePulse((current) =>
        current && now - current.startedAt < WIRE_CANDIDATE_PULSE_MS ? current : null
      );
      setWireCommitFeedback((current) =>
        current && now - current.startedAt < WIRE_COMMIT_FEEDBACK_MS ? current : null
      );
      frameId = window.requestAnimationFrame(tick);
    };
    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [wireCandidatePulse, wireCommitFeedback]);

  useEffect(() => {
    if (pendingProbeId) {
      return;
    }
    setPendingProbePointer(null);
    if (!pendingFromPort) {
      setHoveredAttachTarget(null);
      wireCandidateAnchorRef.current = null;
      setArmedWireModuleHover(null);
      setLockedPortTooltip(null);
    }
  }, [pendingFromPort, pendingProbeId]);

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

  const resolvePendingConnectionCandidate = useCallback(
    (
      fromPort: HitPort,
      targetPort: HitPort | null,
      pointer: { x: number; y: number } | null
    ): PendingConnection["candidate"] => {
      const result = resolveConnectionCandidate(fromPort, targetPort);
      if (!targetPort || (result.status !== "valid" && result.status !== "replace" && result.status !== "invalid")) {
        wireCandidateAnchorRef.current = null;
        return { result, targetPort, anchorPointer: null };
      }
      const key = `${result.status}:${targetPort.nodeId}:${targetPort.kind}:${targetPort.portId}:${
        result.status === "invalid" ? result.reason : ""
      }`;
      const anchorPointer =
        wireCandidateAnchorRef.current?.key === key ? wireCandidateAnchorRef.current.pointer : pointer;
      wireCandidateAnchorRef.current = { key, pointer: anchorPointer };
      return {
        result,
        targetPort,
        anchorPointer,
        replaceSelection: result.status === "replace" ? "no" : undefined
      };
    },
    [resolveConnectionCandidate]
  );

  const pulseConnectionCandidate = useCallback((candidate: PendingConnection["candidate"]) => {
    const { result, targetPort } = candidate;
    if (!targetPort || (result.status !== "valid" && result.status !== "replace" && result.status !== "invalid")) {
      lastCandidatePulseKeyRef.current = null;
      return;
    }
    const key = `${result.status}:${targetPort.nodeId}:${targetPort.kind}:${targetPort.portId}`;
    if (lastCandidatePulseKeyRef.current === key) {
      return;
    }
    lastCandidatePulseKeyRef.current = key;
    setWireCandidatePulse({
      status: result.status,
      target: {
        nodeId: targetPort.nodeId,
        portId: targetPort.portId,
        portKind: targetPort.kind
      },
      startedAt: performance.now()
    });
  }, []);

  const updatePendingConnectionCandidate = useCallback(
    (targetPort: HitPort | null, pointer: { x: number; y: number } | null) => {
      if (!pendingConnection) {
        return resolvePatchWireCandidate(patch, null, targetPort, { structureLocked });
      }
      const candidate = resolvePendingConnectionCandidate(pendingConnection.fromPort, targetPort, pointer);
      pulseConnectionCandidate(candidate);
      setPendingConnection({
        ...pendingConnection,
        pointer: pointer ?? pendingConnection.pointer,
        candidate
      });
      return candidate.result;
    },
    [patch, pendingConnection, pulseConnectionCandidate, resolvePendingConnectionCandidate, structureLocked]
  );

  const isPointInRect = useCallback(
    (point: { x: number; y: number }, rect: { x: number; y: number; width: number; height: number }) =>
      point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height,
    []
  );

  const resolveReplacePromptMagnetBounds = useCallback(
    (pointer: { x: number; y: number } | null | undefined) => {
      const bounds = resolveWireReplacePromptBounds(pointer, visibleCanvasBounds);
      if (!bounds) {
        return null;
      }
      return {
        x: bounds.x - WIRE_REPLACE_PROMPT_MAGNET_PADDING,
        y: bounds.y - WIRE_REPLACE_PROMPT_MAGNET_PADDING,
        width: bounds.width + WIRE_REPLACE_PROMPT_MAGNET_PADDING * 2,
        height: bounds.height + WIRE_REPLACE_PROMPT_MAGNET_PADDING * 2
      };
    },
    [visibleCanvasBounds]
  );

  const getReplaceSelectionAtPoint = useCallback(
    (
      point: { x: number; y: number },
      pointer: { x: number; y: number } | null | undefined
    ): ReplaceWireSelection | null => {
      const promptRects = resolveWireReplacePromptRects(pointer, visibleCanvasBounds);
      if (!promptRects) {
        return null;
      }
      if (isPointInRect(point, promptRects.yes)) {
        return "yes";
      }
      if (isPointInRect(point, promptRects.no)) {
        return "no";
      }
      return null;
    },
    [isPointInRect, visibleCanvasBounds]
  );

  const setReplaceCandidateSelection = useCallback((replaceSelection: ReplaceWireSelection) => {
    setPendingConnection((current) => {
      if (!current || current.candidate.result.status !== "replace") {
        return current;
      }
      return {
        ...current,
        candidate: {
          ...current.candidate,
          replaceSelection
        }
      };
    });
  }, []);

  const dismissReplaceCandidate = useCallback(() => {
    wireCandidateAnchorRef.current = null;
    setPendingConnection((current) => {
      if (!current || current.candidate.result.status !== "replace") {
        return current;
      }
      return {
        ...current,
        candidate: EMPTY_CONNECTION_CANDIDATE
      };
    });
    setHoveredAttachTarget(null);
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

  const armConnectionFromPort = useCallback((fromPort: HitPort, pointer: { x: number; y: number }) => {
    wireCandidateAnchorRef.current = null;
    setPendingConnection({
      fromPort,
      pointer,
      candidate: EMPTY_CONNECTION_CANDIDATE
    });
  }, []);

  const commitConnectionCandidate = useCallback(
    (candidate: Extract<PatchWireCandidate, { status: "valid" | "replace" }>) => {
      const op = buildConnectionOp(candidate);
      if (!op) {
        return;
      }
      onApplyOp(op);
      if (op.type === "connect" || op.type === "replaceConnection") {
        const feedback = {
          connectionId: op.connectionId,
          from: { nodeId: op.fromNodeId, portId: op.fromPortId },
          to: { nodeId: op.toNodeId, portId: op.toPortId },
          startedAt: performance.now()
        };
        setWireCommitFeedback(feedback);
        onWireCommitFeedback?.(feedback);
        onSelectNode(op.toNodeId);
      }
      clearPendingConnection();
    },
    [buildConnectionOp, clearPendingConnection, onApplyOp, onSelectNode, onWireCommitFeedback]
  );

  useEffect(() => {
    const candidate = pendingConnection?.candidate.result;
    if (candidate?.status !== "replace") {
      return;
    }
    const replaceSelection = pendingConnection?.candidate.replaceSelection ?? "no";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setReplaceCandidateSelection("no");
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        setReplaceCandidateSelection("yes");
        return;
      }
      if (event.key !== "Enter") {
        return;
      }
      event.preventDefault();
      if (replaceSelection === "yes") {
        commitConnectionCandidate(candidate);
      } else {
        dismissReplaceCandidate();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [commitConnectionCandidate, dismissReplaceCandidate, pendingConnection, setReplaceCandidateSelection]);

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
        setLockedPortTooltip({ pointer, tooltipBounds: visibleCanvasBounds });
        return;
      }
      if (!pendingConnection) {
        armConnectionFromPort(hitPort, pointer);
        return;
      }

      const candidate = resolveConnectionCandidate(pendingConnection.fromPort, hitPort);
      if (candidate.status === "new-source") {
        armConnectionFromPort(hitPort, pointer);
        return;
      }
      if (candidate.status === "valid") {
        commitConnectionCandidate(candidate);
        return;
      }
      if (candidate.status === "replace") {
        const promptRects = resolveWireReplacePromptRects(pointer, visibleCanvasBounds);
        if (promptRects && isPointInRect(pointer, promptRects.yes)) {
          commitConnectionCandidate(candidate);
        } else {
          updatePendingConnectionCandidate(hitPort, pointer);
        }
        return;
      }

      updatePendingConnectionCandidate(hitPort, pointer);
    },
    [
      armConnectionFromPort,
      commitConnectionCandidate,
      isPointInRect,
      onAttachProbeTarget,
      pendingProbeId,
      pendingConnection,
      resolveConnectionCandidate,
      structureLocked,
      updatePendingConnectionCandidate,
      visibleCanvasBounds
    ]
  );

  const handlePortHover = useCallback(
    (hoverPort: HitPort | null, pointer: { x: number; y: number } | null) => {
      if (pendingProbeId) {
        if (pointer) {
          setPendingProbePointer(pointer);
        }
        setLockedPortTooltip(null);
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
      if (structureLocked) {
        setLockedPortTooltip(hoverPort && pointer ? { pointer, tooltipBounds: visibleCanvasBounds } : null);
        setHoveredAttachTarget(null);
        return;
      }
      if (pendingFromPort && pointer) {
        setPendingConnection((current) => (current ? { ...current, pointer } : current));
      }
      if (!pendingFromPort) {
        setHoveredAttachTarget(null);
        return;
      }

      const candidate = updatePendingConnectionCandidate(hoverPort, pointer);
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
    [pendingFromPort, pendingProbeId, structureLocked, updatePendingConnectionCandidate, visibleCanvasBounds]
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
        const promptRects = resolveWireReplacePromptRects(wireCandidate.pointer, visibleCanvasBounds);
        if (promptRects && isPointInRect({ x: pos.rawX, y: pos.rawY }, promptRects.yes)) {
          const candidate = pendingConnection?.candidate.result;
          if (candidate?.status === "replace") {
            commitConnectionCandidate(candidate);
          }
          return;
        }
        if (promptRects && isPointInRect({ x: pos.rawX, y: pos.rawY }, promptRects.no)) {
          dismissReplaceCandidate();
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
            clearPendingConnection();
            return;
          }
          const nearestPort = getNearestNodePortAtPointer(hitNodeId, pos.rawX, pos.rawY);
          if (nearestPort) {
            handlePortSelection(nearestPort, { x: pos.rawX, y: pos.rawY });
            return;
          }
        }
        clearPendingConnection();
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
        clearPendingConnection();
        pointerDownNodeIdRef.current = null;
        pointerMovedRef.current = false;
      }
    },
    [
      canvasRef,
      clearPendingConnection,
      commitConnectionCandidate,
      dismissReplaceCandidate,
      getNearestNodePortAtPointer,
      handleFacePopoverPointerDown,
      layoutByNode,
      isPointInRect,
      onAttachProbeTarget,
      onCancelProbeAttach,
      onSelectNode,
      outputHostCanvasLeft,
      patch,
      pendingFromPort,
      pendingConnection,
      pendingProbeId,
      resolveArmedWireCancelRectForNode,
      visibleCanvasBounds,
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
      const hoverPort = findPatchPortAtPointWithPadding(hitPortsRef.current, pos.rawX, pos.rawY, Math.max(3, 6 / zoom));
      if (pendingFromPort && wireCandidate?.status === "replace") {
        const point = { x: pos.rawX, y: pos.rawY };
        const promptBounds = resolveWireReplacePromptBounds(wireCandidate.pointer, visibleCanvasBounds);
        const magnetBounds = resolveReplacePromptMagnetBounds(wireCandidate.pointer);
        const currentTarget = pendingConnection?.candidate.targetPort;
        const isDifferentHoverPort =
          hoverPort &&
          currentTarget &&
          (hoverPort.nodeId !== currentTarget.nodeId ||
            hoverPort.kind !== currentTarget.kind ||
            hoverPort.portId !== currentTarget.portId);
        if (
          (promptBounds && isPointInRect(point, promptBounds)) ||
          (magnetBounds && isPointInRect(point, magnetBounds) && !isDifferentHoverPort)
        ) {
          const replaceSelection = getReplaceSelectionAtPoint(point, wireCandidate.pointer);
          setPendingConnection((current) =>
            current ? { ...current, pointer: { x: pos.rawX, y: pos.rawY } } : current
          );
          if (replaceSelection) {
            setReplaceCandidateSelection(replaceSelection);
          }
          return;
        }
      }
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
        updatePendingConnectionCandidate(nearestPort, { x: pos.rawX, y: pos.rawY });
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
      pendingConnection,
      pendingFromPort,
      pendingProbeId,
      resolveReplacePromptMagnetBounds,
      getReplaceSelectionAtPoint,
      setReplaceCandidateSelection,
      updatePendingConnectionCandidate,
      visibleCanvasBounds,
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
    lockedPortHovered: Boolean(lockedPortTooltip),
    handlePortSelection,
    handlePortHover,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    setHoveredNodeId
  };
}

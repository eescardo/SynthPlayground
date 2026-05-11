"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  PatchArmedWireModuleHover,
  PatchCanvasHoverTarget,
  PatchLockedPortTooltip,
  PatchWireCandidateDisplay,
  PatchWireCandidatePulse
} from "@/components/patch/patchCanvasRenderState";
import { HitPort } from "@/components/patch/patchCanvasGeometry";
import {
  isPointInCanvasRect,
  PatchWireTooltipBounds,
  resolveWireReplacePromptBounds,
  resolveWireReplacePromptMagnetBounds,
  resolveWireReplacePromptRects,
  resolveWireReplaceSelectionAtPoint
} from "@/components/patch/patchWireGeometry";
import { PatchWireCommitFeedback } from "@/components/patch/patchWireFeedback";
import { PatchWireCandidate, resolvePatchWireCandidate } from "@/lib/patch/wireCandidate";
import { Patch } from "@/types/patch";
import { PatchOp } from "@/types/ops";

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

interface UsePatchWireGestureArgs {
  patch: Patch;
  structureLocked?: boolean;
  pendingProbeId?: string | null;
  visibleCanvasBounds: PatchWireTooltipBounds;
  onApplyOp: (op: PatchOp) => void;
  onSelectNode: (nodeId?: string) => void;
  onSelectConnection?: (connectionId?: string) => void;
  onAttachProbeTarget?: (
    target:
      | { kind: "port"; nodeId: string; portId: string; portKind: "in" | "out" }
      | { kind: "connection"; connectionId: string }
  ) => void;
  makeConnectOp: (fromNodeId: string, fromPortId: string, toNodeId: string, toPortId: string) => PatchOp;
  onWireCommitFeedback?: (feedback: PatchWireCommitFeedback) => void;
}

const EMPTY_CONNECTION_CANDIDATE: PendingConnection["candidate"] = {
  result: { status: "none" },
  targetPort: null,
  anchorPointer: null
};

const WIRE_CANDIDATE_PULSE_MS = 380;
const WIRE_COMMIT_FEEDBACK_MS = 880;

export function usePatchWireGesture(args: UsePatchWireGestureArgs) {
  const {
    makeConnectOp,
    onApplyOp,
    onAttachProbeTarget,
    onSelectConnection,
    onSelectNode,
    onWireCommitFeedback,
    patch,
    pendingProbeId,
    structureLocked,
    visibleCanvasBounds
  } = args;
  const wireCandidateAnchorRef = useRef<{ key: string; pointer: { x: number; y: number } | null } | null>(null);
  const lastCandidatePulseKeyRef = useRef<string | null>(null);
  const [pendingConnection, setPendingConnection] = useState<PendingConnection | null>(null);
  const [lockedPortTooltip, setLockedPortTooltip] = useState<PatchLockedPortTooltip | null>(null);
  const [wireCandidatePulse, setWireCandidatePulse] = useState<PatchWireCandidatePulse | null>(null);
  const [wireCommitFeedback, setWireCommitFeedback] = useState<PatchWireCommitFeedback | null>(null);
  const [wireFeedbackNow, setWireFeedbackNow] = useState(() => performance.now());
  const [hoveredAttachTarget, setHoveredAttachTarget] = useState<PatchCanvasHoverTarget>(null);
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

  const handlePortSelection = useCallback(
    (hitPort: HitPort, pointer: { x: number; y: number }) => {
      if (pendingProbeId && onAttachProbeTarget) {
        onAttachProbeTarget({
          kind: "port",
          nodeId: hitPort.nodeId,
          portId: hitPort.portId,
          portKind: hitPort.kind
        });
        setHoveredAttachTarget(null);
        return;
      }
      onSelectConnection?.(undefined);
      if (structureLocked) {
        setLockedPortTooltip({
          pointer,
          target: { nodeId: hitPort.nodeId, portId: hitPort.portId, portKind: hitPort.kind },
          tooltipBounds: visibleCanvasBounds
        });
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
        if (promptRects && isPointInCanvasRect(pointer, promptRects.yes)) {
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
      onAttachProbeTarget,
      onSelectConnection,
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
        setLockedPortTooltip(
          hoverPort && pointer
            ? {
                pointer,
                target: { nodeId: hoverPort.nodeId, portId: hoverPort.portId, portKind: hoverPort.kind },
                tooltipBounds: visibleCanvasBounds
              }
            : null
        );
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

  const handleReplacePromptHover = useCallback(
    (args: { point: { x: number; y: number }; hoverPort: HitPort | null }) => {
      if (!pendingFromPort || wireCandidate?.status !== "replace") {
        return false;
      }
      const promptBounds = resolveWireReplacePromptBounds(wireCandidate.pointer, visibleCanvasBounds);
      const magnetBounds = resolveWireReplacePromptMagnetBounds(wireCandidate.pointer, visibleCanvasBounds);
      const currentTarget = pendingConnection?.candidate.targetPort;
      const isDifferentHoverPort =
        args.hoverPort &&
        currentTarget &&
        (args.hoverPort.nodeId !== currentTarget.nodeId ||
          args.hoverPort.kind !== currentTarget.kind ||
          args.hoverPort.portId !== currentTarget.portId);
      if (
        !(
          (promptBounds && isPointInCanvasRect(args.point, promptBounds)) ||
          (magnetBounds && isPointInCanvasRect(args.point, magnetBounds) && !isDifferentHoverPort)
        )
      ) {
        return false;
      }
      const replaceSelection = resolveWireReplaceSelectionAtPoint(
        args.point,
        wireCandidate.pointer,
        visibleCanvasBounds
      );
      setPendingConnection((current) => (current ? { ...current, pointer: args.point } : current));
      if (replaceSelection) {
        setReplaceCandidateSelection(replaceSelection);
      }
      return true;
    },
    [pendingConnection, pendingFromPort, setReplaceCandidateSelection, visibleCanvasBounds, wireCandidate]
  );

  const handleAttachHoverTarget = useCallback((target: PatchCanvasHoverTarget) => {
    setHoveredAttachTarget(target);
  }, []);

  const handleModuleHoverWhileWiring = useCallback(
    (args: {
      nodeId: string | null;
      nearestPort: HitPort | null;
      pointer: { x: number; y: number };
      enabled: boolean;
    }) => {
      if (!args.enabled || !pendingFromPort || pendingProbeId || !args.nodeId) {
        setArmedWireModuleHover(null);
        return;
      }
      setArmedWireModuleHover({
        nodeId: args.nodeId,
        nearestPort: args.nearestPort
      });
      updatePendingConnectionCandidate(args.nearestPort, args.pointer);
    },
    [pendingFromPort, pendingProbeId, updatePendingConnectionCandidate]
  );

  useEffect(() => {
    if (!pendingFromPort) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" && event.key !== "Delete" && event.key !== "Backspace") {
        return;
      }
      event.preventDefault();
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
    if (!pendingFromPort) {
      setHoveredAttachTarget(null);
      wireCandidateAnchorRef.current = null;
      setArmedWireModuleHover(null);
      setLockedPortTooltip(null);
    }
  }, [pendingFromPort, pendingProbeId]);

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

  return {
    armedWireModuleHover,
    clearPendingConnection,
    commitConnectionCandidate,
    dismissReplaceCandidate,
    handlePortHover,
    handlePortSelection,
    handleModuleHoverWhileWiring,
    handleReplacePromptHover,
    handleAttachHoverTarget,
    hoveredAttachTarget,
    lockedPortHovered: Boolean(lockedPortTooltip),
    lockedPortTooltip,
    pendingConnection,
    pendingFromPort,
    pendingWirePointer,
    wireCandidate,
    wireCandidatePulse,
    wireCommitFeedback,
    wireFeedbackNow
  };
}

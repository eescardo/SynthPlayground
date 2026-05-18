"use client";

import { RefObject, useCallback, useEffect, useRef, useState } from "react";
import { PATCH_CANVAS_GRID } from "@/components/patch/patchCanvasConstants";
import { PatchProbeEditorActions, PatchWorkspaceProbeState } from "@/types/probes";

export interface ProbeDragPointer {
  clientX: number;
  clientY: number;
}

export interface ProbeDragCanvasMetrics {
  left: number;
  top: number;
  width: number;
  height: number;
  canvasWidth: number;
  canvasHeight: number;
}

export interface ActiveProbeDrag {
  probeId: string;
  offsetX: number;
  offsetY: number;
}

export interface ProbeDragPosition {
  probeId: string;
  x: number;
  y: number;
}

export function resolveProbeDragPosition(
  event: ProbeDragPointer,
  dragProbe: ActiveProbeDrag,
  metrics: ProbeDragCanvasMetrics
): ProbeDragPosition {
  const scaleX = metrics.width > 0 ? metrics.canvasWidth / metrics.width : 1;
  const scaleY = metrics.height > 0 ? metrics.canvasHeight / metrics.height : 1;
  const rawX = (event.clientX - metrics.left) * scaleX;
  const rawY = (event.clientY - metrics.top) * scaleY;
  return {
    probeId: dragProbe.probeId,
    x: Math.max(0, Math.round((rawX - dragProbe.offsetX) / PATCH_CANVAS_GRID)),
    y: Math.max(0, Math.round((rawY - dragProbe.offsetY) / PATCH_CANVAS_GRID))
  };
}

export function resolveNextProbeDragPosition(
  currentPosition: ProbeDragPosition | null,
  nextPosition: ProbeDragPosition
) {
  return currentPosition?.probeId === nextPosition.probeId &&
    currentPosition.x === nextPosition.x &&
    currentPosition.y === nextPosition.y
    ? currentPosition
    : nextPosition;
}

export function createProbeDragPointerScheduler(args: {
  applyPointerEvent: (event: ProbeDragPointer) => void;
  requestFrame: (callback: () => void) => number;
  cancelFrame: (frameId: number) => void;
}) {
  let pendingPointerEvent: ProbeDragPointer | null = null;
  let animationFrameId: number | null = null;

  const flushPendingPointerMove = () => {
    animationFrameId = null;
    const event = pendingPointerEvent;
    pendingPointerEvent = null;
    if (event) {
      args.applyPointerEvent(event);
      return true;
    }
    return false;
  };

  return {
    handlePointerMove(event: ProbeDragPointer) {
      pendingPointerEvent = event;
      if (animationFrameId === null) {
        animationFrameId = args.requestFrame(flushPendingPointerMove);
      }
    },
    flushNow() {
      if (animationFrameId !== null) {
        args.cancelFrame(animationFrameId);
        animationFrameId = null;
      }
      return flushPendingPointerMove();
    },
    dispose() {
      if (animationFrameId !== null) {
        args.cancelFrame(animationFrameId);
        animationFrameId = null;
      }
      pendingPointerEvent = null;
    }
  };
}

function getProbeDragCanvasMetrics(canvas: HTMLCanvasElement): ProbeDragCanvasMetrics {
  const rect = canvas.getBoundingClientRect();
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    canvasWidth: canvas.width,
    canvasHeight: canvas.height
  };
}

export function usePatchProbeDrag(args: {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  probes: PatchWorkspaceProbeState[];
  probeActions: Pick<PatchProbeEditorActions, "moveProbe">;
}) {
  const [dragProbe, setDragProbe] = useState<ActiveProbeDrag | null>(null);
  const [dragPosition, setDragPosition] = useState<ProbeDragPosition | null>(null);
  const moveProbeRef = useRef(args.probeActions.moveProbe);
  const dragPositionRef = useRef<ProbeDragPosition | null>(null);

  useEffect(() => {
    moveProbeRef.current = args.probeActions.moveProbe;
  }, [args.probeActions.moveProbe]);

  useEffect(() => {
    if (!dragProbe) {
      return;
    }
    const moveProbeToPointer = (event: ProbeDragPointer) => {
      const canvas = args.canvasRef.current;
      if (!canvas) {
        return;
      }
      const lastPosition = dragPositionRef.current;
      const nextPosition = resolveNextProbeDragPosition(
        lastPosition,
        resolveProbeDragPosition(event, dragProbe, getProbeDragCanvasMetrics(canvas))
      );
      if (nextPosition === lastPosition) {
        return;
      }
      dragPositionRef.current = nextPosition;
      setDragPosition(nextPosition);
    };
    const scheduler = createProbeDragPointerScheduler({
      applyPointerEvent: moveProbeToPointer,
      requestFrame: (callback) => window.requestAnimationFrame(callback),
      cancelFrame: (frameId) => window.cancelAnimationFrame(frameId)
    });
    const handlePointerMove = (event: PointerEvent) => {
      scheduler.handlePointerMove(event);
    };
    const commitDragPosition = () => {
      scheduler.flushNow();
      const finalPosition = dragPositionRef.current;
      if (finalPosition) {
        moveProbeRef.current(finalPosition.probeId, finalPosition.x, finalPosition.y);
      }
      dragPositionRef.current = null;
      setDragPosition(null);
      setDragProbe(null);
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", commitDragPosition);
    window.addEventListener("pointercancel", commitDragPosition);
    return () => {
      scheduler.dispose();
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", commitDragPosition);
      window.removeEventListener("pointercancel", commitDragPosition);
    };
  }, [args.canvasRef, dragProbe]);

  const beginProbeDrag = useCallback(
    (probeId: string, clientX: number, clientY: number) => {
      const canvas = args.canvasRef.current;
      const probe = args.probes.find((entry) => entry.id === probeId);
      if (!canvas || !probe) {
        return;
      }
      const metrics = getProbeDragCanvasMetrics(canvas);
      const scaleX = metrics.width > 0 ? metrics.canvasWidth / metrics.width : 1;
      const scaleY = metrics.height > 0 ? metrics.canvasHeight / metrics.height : 1;
      const rawX = (clientX - metrics.left) * scaleX;
      const rawY = (clientY - metrics.top) * scaleY;
      const initialPosition = { probeId, x: probe.x, y: probe.y };
      dragPositionRef.current = initialPosition;
      setDragPosition(initialPosition);
      setDragProbe({
        probeId,
        offsetX: rawX - probe.x * PATCH_CANVAS_GRID,
        offsetY: rawY - probe.y * PATCH_CANVAS_GRID
      });
    },
    [args.canvasRef, args.probes]
  );

  return { beginProbeDrag, dragPosition };
}

"use client";

import { RefObject, useCallback, useEffect, useRef, useState } from "react";
import { PATCH_CANVAS_GRID } from "@/components/patch/patchCanvasConstants";
import { PatchProbeEditorActions, PatchWorkspaceProbeState } from "@/types/probes";

export function usePatchProbeDrag(args: {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  probes: PatchWorkspaceProbeState[];
  probeActions: Pick<PatchProbeEditorActions, "moveProbe">;
}) {
  const [dragProbe, setDragProbe] = useState<{ probeId: string; offsetX: number; offsetY: number } | null>(null);
  const [dragPosition, setDragPosition] = useState<{ probeId: string; x: number; y: number } | null>(null);
  const moveProbeRef = useRef(args.probeActions.moveProbe);
  const dragPositionRef = useRef<{ probeId: string; x: number; y: number } | null>(null);
  const pendingPointerEventRef = useRef<PointerEvent | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    moveProbeRef.current = args.probeActions.moveProbe;
  }, [args.probeActions.moveProbe]);

  useEffect(() => {
    if (!dragProbe) {
      return;
    }
    const moveProbeToPointer = (event: PointerEvent) => {
      const canvas = args.canvasRef.current;
      if (!canvas) {
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
      const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
      const rawX = (event.clientX - rect.left) * scaleX;
      const rawY = (event.clientY - rect.top) * scaleY;
      const x = Math.max(0, Math.round((rawX - dragProbe.offsetX) / PATCH_CANVAS_GRID));
      const y = Math.max(0, Math.round((rawY - dragProbe.offsetY) / PATCH_CANVAS_GRID));
      const lastPosition = dragPositionRef.current;
      if (lastPosition?.probeId === dragProbe.probeId && lastPosition.x === x && lastPosition.y === y) {
        return;
      }
      const nextPosition = { probeId: dragProbe.probeId, x, y };
      dragPositionRef.current = nextPosition;
      setDragPosition(nextPosition);
    };
    const flushPendingPointerMove = () => {
      animationFrameRef.current = null;
      const event = pendingPointerEventRef.current;
      pendingPointerEventRef.current = null;
      if (event) {
        moveProbeToPointer(event);
      }
    };
    const handlePointerMove = (event: PointerEvent) => {
      pendingPointerEventRef.current = event;
      if (animationFrameRef.current === null) {
        animationFrameRef.current = window.requestAnimationFrame(flushPendingPointerMove);
      }
    };
    const commitDragPosition = () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      const pendingEvent = pendingPointerEventRef.current;
      pendingPointerEventRef.current = null;
      if (pendingEvent) {
        moveProbeToPointer(pendingEvent);
      }
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
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      pendingPointerEventRef.current = null;
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
      const rect = canvas.getBoundingClientRect();
      const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
      const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
      const rawX = (clientX - rect.left) * scaleX;
      const rawY = (clientY - rect.top) * scaleY;
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

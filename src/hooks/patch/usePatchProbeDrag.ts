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
  const moveProbeRef = useRef(args.probeActions.moveProbe);
  const lastDragPositionRef = useRef<{ probeId: string; x: number; y: number } | null>(null);
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
      const lastPosition = lastDragPositionRef.current;
      if (lastPosition?.probeId === dragProbe.probeId && lastPosition.x === x && lastPosition.y === y) {
        return;
      }
      lastDragPositionRef.current = { probeId: dragProbe.probeId, x, y };
      moveProbeRef.current(dragProbe.probeId, x, y);
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
    const handlePointerUp = () => {
      setDragProbe(null);
    };
    lastDragPositionRef.current = null;
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      pendingPointerEventRef.current = null;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
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
      setDragProbe({
        probeId,
        offsetX: rawX - probe.x * PATCH_CANVAS_GRID,
        offsetY: rawY - probe.y * PATCH_CANVAS_GRID
      });
    },
    [args.canvasRef, args.probes]
  );

  return { beginProbeDrag };
}

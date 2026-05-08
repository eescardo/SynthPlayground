"use client";

import { RefObject, useCallback, useEffect, useState } from "react";
import { PATCH_CANVAS_GRID } from "@/components/patch/patchCanvasConstants";
import { PatchProbeEditorActions, PatchWorkspaceProbeState } from "@/types/probes";

export function usePatchProbeDrag(args: {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  probes: PatchWorkspaceProbeState[];
  probeActions: Pick<PatchProbeEditorActions, "moveProbe">;
}) {
  const [dragProbe, setDragProbe] = useState<{ probeId: string; offsetX: number; offsetY: number } | null>(null);

  useEffect(() => {
    if (!dragProbe) {
      return;
    }
    const handlePointerMove = (event: PointerEvent) => {
      const canvas = args.canvasRef.current;
      if (!canvas) {
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
      const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
      const rawX = (event.clientX - rect.left) * scaleX;
      const rawY = (event.clientY - rect.top) * scaleY;
      args.probeActions.moveProbe(
        dragProbe.probeId,
        Math.max(0, Math.round((rawX - dragProbe.offsetX) / PATCH_CANVAS_GRID)),
        Math.max(0, Math.round((rawY - dragProbe.offsetY) / PATCH_CANVAS_GRID))
      );
    };
    const handlePointerUp = () => setDragProbe(null);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [args.canvasRef, args.probeActions, dragProbe]);

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

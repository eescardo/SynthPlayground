"use client";

import { useCallback, useEffect, useState } from "react";
import { CanvasRect } from "@/components/patch/patchCanvasGeometry";

interface UsePatchModuleFacePopoverParams {
  getPopoverRect: (nodeId: string) => CanvasRect | null;
  nodeExists: (nodeId: string) => boolean;
}

export type PatchModuleFacePopoverPointerResult =
  | { kind: "none" }
  | { kind: "dismissed" }
  | { kind: "inside-popover"; nodeId: string };

export function usePatchModuleFacePopover({ getPopoverRect, nodeExists }: UsePatchModuleFacePopoverParams) {
  const [popoverNodeId, setPopoverNodeId] = useState<string | null>(null);

  useEffect(() => {
    if (!popoverNodeId || nodeExists(popoverNodeId)) {
      return;
    }
    setPopoverNodeId(null);
  }, [nodeExists, popoverNodeId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPopoverNodeId(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const handleCanvasPointerDown = useCallback((rawX: number, rawY: number) => {
    if (!popoverNodeId) {
      return { kind: "none" } as const;
    }
    const rect = getPopoverRect(popoverNodeId);
    const insidePopover =
      rect &&
      rawX >= rect.x &&
      rawX <= rect.x + rect.width &&
      rawY >= rect.y &&
      rawY <= rect.y + rect.height;
    const nodeId = popoverNodeId;
    if (insidePopover) {
      setPopoverNodeId(null);
      return { kind: "inside-popover", nodeId } as const;
    }
    setPopoverNodeId(null);
    return { kind: "dismissed" } as const;
  }, [getPopoverRect, popoverNodeId]);

  return {
    closePopover: () => setPopoverNodeId(null),
    handleCanvasPointerDown,
    openPopoverForNode: setPopoverNodeId,
    togglePopoverForNode: (nodeId: string) => setPopoverNodeId((current) => (current === nodeId ? null : nodeId)),
    popoverNodeId
  };
}

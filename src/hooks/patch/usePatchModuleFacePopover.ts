"use client";

import { useCallback, useEffect } from "react";
import { CanvasRect } from "@/components/patch/patchCanvasGeometry";

interface UsePatchModuleFacePopoverParams {
  expandedNodeId?: string;
  getPopoverRect: (nodeId: string) => CanvasRect | null;
  nodeExists: (nodeId: string) => boolean;
  onSetExpandedNode: (nodeId?: string) => void;
}

export type PatchModuleFacePopoverPointerResult =
  | { kind: "none" }
  | { kind: "dismissed" }
  | { kind: "inside-popover"; nodeId: string };

export function usePatchModuleFacePopover({
  expandedNodeId,
  getPopoverRect,
  nodeExists,
  onSetExpandedNode
}: UsePatchModuleFacePopoverParams) {
  const popoverNodeId = expandedNodeId ?? null;

  useEffect(() => {
    if (!popoverNodeId || nodeExists(popoverNodeId)) {
      return;
    }
    onSetExpandedNode(undefined);
  }, [nodeExists, onSetExpandedNode, popoverNodeId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onSetExpandedNode(undefined);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onSetExpandedNode]);

  const handleCanvasPointerDown = useCallback(
    (rawX: number, rawY: number) => {
      if (!popoverNodeId) {
        return { kind: "none" } as const;
      }
      const rect = getPopoverRect(popoverNodeId);
      const insidePopover =
        rect && rawX >= rect.x && rawX <= rect.x + rect.width && rawY >= rect.y && rawY <= rect.y + rect.height;
      const nodeId = popoverNodeId;
      if (insidePopover) {
        return { kind: "inside-popover", nodeId } as const;
      }
      onSetExpandedNode(undefined);
      return { kind: "dismissed" } as const;
    },
    [getPopoverRect, onSetExpandedNode, popoverNodeId]
  );

  return {
    closePopover: () => onSetExpandedNode(undefined),
    handleCanvasPointerDown,
    openPopoverForNode: onSetExpandedNode,
    togglePopoverForNode: (nodeId: string) => onSetExpandedNode(popoverNodeId === nodeId ? undefined : nodeId),
    popoverNodeId
  };
}

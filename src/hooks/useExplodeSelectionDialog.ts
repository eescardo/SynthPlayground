"use client";

import { useCallback, useState } from "react";
import { BeatRange } from "@/lib/clipboard";
import { SelectionExplodeMode, SelectionExplodeScope } from "@/hooks/useSelectionClipboardActions";

export interface ExplodeSelectionDialogState {
  countText: string;
  mode: SelectionExplodeMode;
  scope: SelectionExplodeScope;
  selectionKind: "note" | "timeline";
}

interface UseExplodeSelectionDialogParams {
  selectionBeatRange: BeatRange | null;
  selectionKind: "none" | "note" | "timeline";
  onCollapseSelectionActionPopover: () => void;
}

export function useExplodeSelectionDialog({
  selectionBeatRange,
  selectionKind,
  onCollapseSelectionActionPopover
}: UseExplodeSelectionDialogParams) {
  const [explodeSelectionDialogState, setExplodeSelectionDialogState] = useState<ExplodeSelectionDialogState | null>(
    null
  );

  const closeExplodeSelectionDialog = useCallback(() => {
    setExplodeSelectionDialogState(null);
  }, []);

  const openExplodeSelectionDialog = useCallback(() => {
    if (!selectionBeatRange || selectionKind === "none") {
      return;
    }

    onCollapseSelectionActionPopover();
    setExplodeSelectionDialogState({
      countText: "2",
      mode: "insert",
      scope: selectionKind === "timeline" ? "all-tracks" : "selected-tracks",
      selectionKind: selectionKind === "timeline" ? "timeline" : "note"
    });
  }, [onCollapseSelectionActionPopover, selectionBeatRange, selectionKind]);

  return {
    explodeSelectionDialogState,
    setExplodeSelectionDialogState,
    closeExplodeSelectionDialog,
    openExplodeSelectionDialog
  };
}

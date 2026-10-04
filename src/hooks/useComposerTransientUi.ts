"use client";

import { Dispatch, SetStateAction, useCallback, useState } from "react";
import type { PatchRemovalRequest } from "@/lib/patch/patchRemoval";
import { TimelineActionsPopoverRequest } from "@/components/tracks/TrackCanvas";

interface UseComposerTransientUiArgs {
  onClearEditorSelection: () => void;
}

export function useComposerTransientUi({ onClearEditorSelection }: UseComposerTransientUiArgs): {
  clearTransientComposerUi: () => void;
  patchRemovalDialog: PatchRemovalRequest | null;
  pitchPicker: { trackId: string; noteId: string } | null;
  selectionActionPopoverMode: "expanded" | "collapsed";
  setPatchRemovalDialog: Dispatch<SetStateAction<PatchRemovalRequest | null>>;
  setPitchPicker: Dispatch<SetStateAction<{ trackId: string; noteId: string } | null>>;
  setSelectionActionPopoverMode: Dispatch<SetStateAction<"expanded" | "collapsed">>;
  setTimelineActionsPopover: Dispatch<SetStateAction<TimelineActionsPopoverRequest | null>>;
  timelineActionsPopover: TimelineActionsPopoverRequest | null;
} {
  const [pitchPicker, setPitchPicker] = useState<{ trackId: string; noteId: string } | null>(null);
  const [timelineActionsPopover, setTimelineActionsPopover] = useState<TimelineActionsPopoverRequest | null>(null);
  const [selectionActionPopoverMode, setSelectionActionPopoverMode] = useState<"expanded" | "collapsed">("expanded");
  const [patchRemovalDialog, setPatchRemovalDialog] = useState<PatchRemovalRequest | null>(null);

  const clearTransientComposerUi = useCallback(() => {
    setTimelineActionsPopover(null);
    setPitchPicker(null);
    setPatchRemovalDialog(null);
    onClearEditorSelection();
    setSelectionActionPopoverMode("expanded");
  }, [onClearEditorSelection]);

  return {
    clearTransientComposerUi,
    patchRemovalDialog,
    pitchPicker,
    selectionActionPopoverMode,
    setPatchRemovalDialog,
    setPitchPicker,
    setSelectionActionPopoverMode,
    setTimelineActionsPopover,
    timelineActionsPopover
  };
}

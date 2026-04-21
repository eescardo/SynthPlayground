"use client";

import { useState } from "react";
import { useBaseHardwareNavigation } from "@/hooks/useBaseHardwareNavigation";
import { useComposerHardwareNavigation } from "@/hooks/useComposerHardwareNavigation";
import { usePatchWorkspaceHardwareNavigation } from "@/hooks/usePatchWorkspaceHardwareNavigation";
import { HardwareNavigationResult, UseHardwareNavigationArgs } from "@/hooks/useHardwareNavigationTypes";

export function useHardwareNavigation(args: UseHardwareNavigationArgs): HardwareNavigationResult {
  const [activePlacement, setActivePlacement] = useState<HardwareNavigationResult["activePlacement"]>(null);

  const base = useBaseHardwareNavigation({
    ...args,
    interactionLocked: Boolean(activePlacement)
  });

  const composer = useComposerHardwareNavigation({
    ...args,
    activePlacement,
    setActivePlacement,
    base
  });

  usePatchWorkspaceHardwareNavigation(args);

  return {
    activePlacement,
    ghostPreviewNote: composer.ghostPreviewNote,
    tabSelectionPreviewNote: composer.tabSelectionPreviewNote,
    playheadNavigationFocused: base.playheadNavigationFocused,
    selectedNoteTabStopFocusToken: base.selectedNoteTabStopFocusToken,
    returnSelectionFocusToPlayhead: base.returnSelectionFocusToPlayhead
  };
}

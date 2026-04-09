"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type PatchSummaryPopoverState = {
  trackId: string;
  mode: "teaser" | "expanded";
} | null;

interface UsePatchSummaryPopoverOptions {
  selectedTrackId?: string;
  hoverDelayMs?: number;
  leaveDelayMs?: number;
}

const DEFAULT_HOVER_DELAY_MS = 900;
const DEFAULT_LEAVE_DELAY_MS = 140;

export function usePatchSummaryPopover(options: UsePatchSummaryPopoverOptions) {
  const {
    selectedTrackId,
    hoverDelayMs = DEFAULT_HOVER_DELAY_MS,
    leaveDelayMs = DEFAULT_LEAVE_DELAY_MS
  } = options;
  const [patchSummaryPopover, setPatchSummaryPopover] = useState<PatchSummaryPopoverState>(null);
  const hoverOpenTimerRef = useRef<number | null>(null);
  const hoverCloseTimerRef = useRef<number | null>(null);

  const clearHoverTimers = useCallback(() => {
    if (hoverOpenTimerRef.current !== null) {
      window.clearTimeout(hoverOpenTimerRef.current);
      hoverOpenTimerRef.current = null;
    }
    if (hoverCloseTimerRef.current !== null) {
      window.clearTimeout(hoverCloseTimerRef.current);
      hoverCloseTimerRef.current = null;
    }
  }, []);

  const closePatchSummaryPopover = useCallback(() => {
    clearHoverTimers();
    setPatchSummaryPopover(null);
  }, [clearHoverTimers]);

  useEffect(() => () => clearHoverTimers(), [clearHoverTimers]);

  useEffect(() => {
    if (patchSummaryPopover && patchSummaryPopover.trackId !== selectedTrackId) {
      closePatchSummaryPopover();
    }
  }, [closePatchSummaryPopover, patchSummaryPopover, selectedTrackId]);

  useEffect(() => {
    if (!patchSummaryPopover) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closePatchSummaryPopover();
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest(".track-patch-summary-popover, .track-instrument-selection, .track-macro-panel-area")) {
        return;
      }
      closePatchSummaryPopover();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [closePatchSummaryPopover, patchSummaryPopover]);

  const openExpandedPatchSummary = useCallback((args: {
    trackId: string;
    selected: boolean;
    macroPanelExpanded: boolean;
    onSelectTrack: (trackId: string) => void;
    onToggleTrackMacroPanel: (trackId: string) => void;
  }) => {
    clearHoverTimers();
    if (!args.selected) {
      args.onSelectTrack(args.trackId);
    }
    if (!args.macroPanelExpanded) {
      args.onToggleTrackMacroPanel(args.trackId);
    }
    setPatchSummaryPopover({ trackId: args.trackId, mode: "expanded" });
  }, [clearHoverTimers]);

  const scheduleTeaserPatchSummary = useCallback((args: {
    trackId: string;
    selected: boolean;
    macroPanelExpanded: boolean;
  }) => {
    if (!args.selected || !args.macroPanelExpanded || patchSummaryPopover?.mode === "expanded") {
      return;
    }
    if (hoverCloseTimerRef.current !== null) {
      window.clearTimeout(hoverCloseTimerRef.current);
      hoverCloseTimerRef.current = null;
    }
    const hasPatchSummaryPopover = patchSummaryPopover?.trackId === args.trackId;
    if (hasPatchSummaryPopover || hoverOpenTimerRef.current !== null) {
      return;
    }
    hoverOpenTimerRef.current = window.setTimeout(() => {
      hoverOpenTimerRef.current = null;
      setPatchSummaryPopover((current) =>
        current && current.trackId === args.trackId && current.mode === "expanded"
          ? current
          : { trackId: args.trackId, mode: "teaser" }
      );
    }, hoverDelayMs);
  }, [hoverDelayMs, patchSummaryPopover]);

  const schedulePatchSummaryDismiss = useCallback((trackId: string) => {
    if (hoverOpenTimerRef.current !== null) {
      window.clearTimeout(hoverOpenTimerRef.current);
      hoverOpenTimerRef.current = null;
    }
    const hasPatchSummaryPopover = patchSummaryPopover?.trackId === trackId;
    if (!hasPatchSummaryPopover || patchSummaryPopover?.mode !== "teaser") {
      return;
    }
    if (hoverCloseTimerRef.current !== null) {
      window.clearTimeout(hoverCloseTimerRef.current);
    }
    hoverCloseTimerRef.current = window.setTimeout(() => {
      hoverCloseTimerRef.current = null;
      setPatchSummaryPopover((current) =>
        current && current.trackId === trackId && current.mode === "teaser" ? null : current
      );
    }, leaveDelayMs);
  }, [leaveDelayMs, patchSummaryPopover]);

  const cancelPatchSummaryDismiss = useCallback(() => {
    if (hoverOpenTimerRef.current !== null) {
      window.clearTimeout(hoverOpenTimerRef.current);
      hoverOpenTimerRef.current = null;
    }
    if (hoverCloseTimerRef.current !== null) {
      window.clearTimeout(hoverCloseTimerRef.current);
      hoverCloseTimerRef.current = null;
    }
  }, []);

  return {
    patchSummaryPopover,
    setPatchSummaryPopover,
    closePatchSummaryPopover,
    openExpandedPatchSummary,
    scheduleTeaserPatchSummary,
    schedulePatchSummaryDismiss,
    cancelPatchSummaryDismiss
  };
}

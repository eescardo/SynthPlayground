"use client";

import { useCallback, useEffect, useState } from "react";
import { useVolumePopover } from "@/hooks/useVolumePopover";
import { clamp } from "@/lib/numeric";

const PAN_POPOVER_WIDTH = 168;
const PAN_POPOVER_HEIGHT = 132;
const VIEWPORT_MARGIN = 8;
const POPOVER_GAP = 8;

function getPanPopoverPosition(anchor: HTMLElement) {
  const rect = anchor.getBoundingClientRect();
  const preferredLeft = rect.right + POPOVER_GAP;
  const maxLeft = Math.max(VIEWPORT_MARGIN, window.innerWidth - PAN_POPOVER_WIDTH - VIEWPORT_MARGIN);
  const fallbackLeft = rect.left - PAN_POPOVER_WIDTH - POPOVER_GAP;

  return {
    left: preferredLeft <= maxLeft ? preferredLeft : clamp(fallbackLeft, VIEWPORT_MARGIN, maxLeft),
    top: clamp(
      rect.top - 4,
      VIEWPORT_MARGIN,
      Math.max(VIEWPORT_MARGIN, window.innerHeight - PAN_POPOVER_HEIGHT - VIEWPORT_MARGIN)
    )
  };
}

export function useTrackCanvasPopovers() {
  const [panPopoverTrackId, setPanPopoverTrackId] = useState<string | null>(null);
  const [panPopoverPosition, setPanPopoverPosition] = useState<{ left: number; top: number } | null>(null);
  const {
    volumePopoverTrackId,
    volumePopoverPosition,
    openVolumePopover,
    closeVolumePopover,
    scheduleVolumePopoverOpen,
    scheduleVolumePopoverDismiss,
    cancelVolumePopoverTimers,
    cancelScheduledVolumePopoverDismiss
  } = useVolumePopover();

  const closePanPopover = useCallback(() => {
    setPanPopoverTrackId(null);
    setPanPopoverPosition(null);
  }, []);

  const openVolumeOnlyPopover = useCallback(
    (trackId: string, anchor?: HTMLElement | null) => {
      closePanPopover();
      openVolumePopover(trackId, anchor);
    },
    [closePanPopover, openVolumePopover]
  );

  const scheduleVolumeOnlyPopoverOpen = useCallback(
    (trackId: string, anchor?: HTMLElement | null) => {
      closePanPopover();
      scheduleVolumePopoverOpen(trackId, anchor);
    },
    [closePanPopover, scheduleVolumePopoverOpen]
  );

  const openPanPopover = useCallback(
    (trackId: string, anchor?: HTMLElement | null) => {
      cancelVolumePopoverTimers();
      closeVolumePopover();
      setPanPopoverTrackId(trackId);
      if (anchor) {
        setPanPopoverPosition(getPanPopoverPosition(anchor));
      }
    },
    [cancelVolumePopoverTimers, closeVolumePopover]
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeVolumePopover();
        closePanPopover();
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-track-chrome="volume-button"], [data-track-popover="volume"]')) {
        return;
      }
      closeVolumePopover();
      if (target?.closest('[data-track-chrome="pan-button"], [data-track-popover="pan"]')) {
        return;
      }
      closePanPopover();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [closePanPopover, closeVolumePopover]);

  return {
    volumePopoverTrackId,
    volumePopoverPosition,
    panPopoverTrackId,
    panPopoverPosition,
    openVolumePopover: openVolumeOnlyPopover,
    openPanPopover,
    scheduleVolumePopoverOpen: scheduleVolumeOnlyPopoverOpen,
    scheduleVolumePopoverDismiss,
    cancelScheduledVolumePopoverDismiss
  };
}

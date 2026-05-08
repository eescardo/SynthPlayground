"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clamp } from "@/lib/numeric";

const VOLUME_POPOVER_WIDTH = 96;
const VOLUME_POPOVER_HEIGHT = 220;
const VIEWPORT_MARGIN = 8;
const POPOVER_GAP = 8;

function getVolumePopoverPosition(anchor: HTMLElement) {
  const rect = anchor.getBoundingClientRect();
  const maxLeft = Math.max(VIEWPORT_MARGIN, window.innerWidth - VOLUME_POPOVER_WIDTH - VIEWPORT_MARGIN);
  const preferredLeft = rect.right + POPOVER_GAP;
  const fallbackLeft = rect.left - VOLUME_POPOVER_WIDTH - POPOVER_GAP;
  const left = preferredLeft <= maxLeft ? preferredLeft : clamp(fallbackLeft, VIEWPORT_MARGIN, maxLeft);

  const preferredTop = rect.top - 3;
  const maxTop = Math.max(VIEWPORT_MARGIN, window.innerHeight - VOLUME_POPOVER_HEIGHT - VIEWPORT_MARGIN);
  const top = clamp(preferredTop, VIEWPORT_MARGIN, maxTop);

  return { left, top };
}

export function useVolumePopover() {
  const volumeOpenTimerRef = useRef<number | null>(null);
  const volumeDismissTimerRef = useRef<number | null>(null);
  const [volumePopoverTrackId, setVolumePopoverTrackId] = useState<string | null>(null);
  const [volumePopoverPosition, setVolumePopoverPosition] = useState<{ left: number; top: number } | null>(null);

  const clearOpenTimer = useCallback(() => {
    if (volumeOpenTimerRef.current !== null) {
      window.clearTimeout(volumeOpenTimerRef.current);
      volumeOpenTimerRef.current = null;
    }
  }, []);

  const clearDismissTimer = useCallback(() => {
    if (volumeDismissTimerRef.current !== null) {
      window.clearTimeout(volumeDismissTimerRef.current);
      volumeDismissTimerRef.current = null;
    }
  }, []);

  const cancelVolumePopoverTimers = useCallback(() => {
    clearOpenTimer();
    clearDismissTimer();
  }, [clearDismissTimer, clearOpenTimer]);

  const closeVolumePopover = useCallback(() => {
    setVolumePopoverTrackId(null);
    setVolumePopoverPosition(null);
    cancelVolumePopoverTimers();
  }, [cancelVolumePopoverTimers]);

  const openVolumePopover = useCallback(
    (trackId: string, anchor?: HTMLElement | null) => {
      clearOpenTimer();
      clearDismissTimer();
      setVolumePopoverTrackId(trackId);
      if (anchor) {
        setVolumePopoverPosition(getVolumePopoverPosition(anchor));
      }
    },
    [clearDismissTimer, clearOpenTimer]
  );

  const scheduleVolumePopoverOpen = useCallback(
    (trackId: string, anchor?: HTMLElement | null) => {
      clearOpenTimer();
      volumeOpenTimerRef.current = window.setTimeout(() => {
        setVolumePopoverTrackId(trackId);
        if (anchor) {
          setVolumePopoverPosition(getVolumePopoverPosition(anchor));
        }
        volumeOpenTimerRef.current = null;
      }, 1000);
    },
    [clearOpenTimer]
  );

  const scheduleVolumePopoverDismiss = useCallback(() => {
    clearDismissTimer();
    volumeDismissTimerRef.current = window.setTimeout(() => {
      setVolumePopoverTrackId(null);
      volumeDismissTimerRef.current = null;
    }, 2000);
  }, [clearDismissTimer]);

  const cancelScheduledVolumePopoverDismiss = useCallback(() => {
    clearDismissTimer();
  }, [clearDismissTimer]);

  useEffect(() => () => cancelVolumePopoverTimers(), [cancelVolumePopoverTimers]);

  return {
    volumePopoverTrackId,
    volumePopoverPosition,
    openVolumePopover,
    closeVolumePopover,
    scheduleVolumePopoverOpen,
    scheduleVolumePopoverDismiss,
    cancelScheduledVolumePopoverDismiss,
    cancelVolumePopoverTimers
  };
}

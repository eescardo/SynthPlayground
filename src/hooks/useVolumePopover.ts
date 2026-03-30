"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function useVolumePopover() {
  const volumeOpenTimerRef = useRef<number | null>(null);
  const volumeDismissTimerRef = useRef<number | null>(null);
  const [volumePopoverTrackId, setVolumePopoverTrackId] = useState<string | null>(null);

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
    cancelVolumePopoverTimers();
  }, [cancelVolumePopoverTimers]);

  const openVolumePopover = useCallback((trackId: string) => {
    clearOpenTimer();
    clearDismissTimer();
    setVolumePopoverTrackId(trackId);
  }, [clearDismissTimer, clearOpenTimer]);

  const scheduleVolumePopoverOpen = useCallback((trackId: string) => {
    clearOpenTimer();
    volumeOpenTimerRef.current = window.setTimeout(() => {
      setVolumePopoverTrackId(trackId);
      volumeOpenTimerRef.current = null;
    }, 1000);
  }, [clearOpenTimer]);

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
    openVolumePopover,
    closeVolumePopover,
    scheduleVolumePopoverOpen,
    scheduleVolumePopoverDismiss,
    cancelScheduledVolumePopoverDismiss,
    cancelVolumePopoverTimers
  };
}

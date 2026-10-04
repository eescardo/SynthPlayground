"use client";

import { useCallback, useEffect, useState } from "react";
import { getTrackCanvasVisibleBeatRange, isPlayheadTabStopFocused } from "@/hooks/hardwareNavigationUtils";
import type { GhostPreviewNote, UseHardwareNavigationArgs } from "@/hooks/useHardwareNavigationTypes";
import { findNextVisibleTrackNoteAfterBeat, trackHasNoteAtBeat } from "@/lib/hardwareNavigation";
import { snapToGrid } from "@/lib/musicTiming";

const GHOST_PREVIEW_DELAY_MS = 2000;
const TAB_SELECTION_PREVIEW_DELAY_MS = 600;

type ComposerNavigationPreviewsArgs = Pick<
  UseHardwareNavigationArgs,
  "selectedTrack" | "playheadBeat" | "projectGridBeats" | "defaultPitch"
> & {
  isComposerView: boolean;
  isTransportIdle: boolean;
  arePitchPickersClosed: boolean;
  hasActivePlacement: boolean;
  hasNoSelection: boolean;
  playheadNavigationFocused: boolean;
};

// Visual hints only. Key routing, held-note audio and transport remain with
// their existing owners in useComposerHardwareNavigation.
export function useComposerNavigationPreviews({
  selectedTrack,
  playheadBeat,
  projectGridBeats,
  defaultPitch,
  isComposerView,
  isTransportIdle,
  arePitchPickersClosed,
  hasActivePlacement,
  hasNoSelection,
  playheadNavigationFocused
}: ComposerNavigationPreviewsArgs) {
  const hasSelectedTrack = Boolean(selectedTrack);
  const [ghostPreviewNote, setGhostPreviewNote] = useState<GhostPreviewNote | null>(null);
  const [tabSelectionPreviewNote, setTabSelectionPreviewNote] = useState<{ trackId: string; noteId: string } | null>(
    null
  );

  const clearGhostPreview = useCallback(() => setGhostPreviewNote(null), []);

  // Show the delayed ghost note when the composer is idle over an empty spot.
  useEffect(() => {
    const playheadNavigationActive = playheadNavigationFocused || isPlayheadTabStopFocused();
    const canShowGhostPreview =
      isComposerView &&
      hasSelectedTrack &&
      !hasActivePlacement &&
      isTransportIdle &&
      (hasNoSelection || playheadNavigationActive) &&
      arePitchPickersClosed;

    if (!canShowGhostPreview || !selectedTrack) {
      setGhostPreviewNote(null);
      return;
    }

    const snappedPlayheadBeat = Math.max(0, snapToGrid(playheadBeat, projectGridBeats));
    if (trackHasNoteAtBeat(selectedTrack, playheadBeat)) {
      setGhostPreviewNote(null);
      return;
    }

    const nextGhostPreviewNote: GhostPreviewNote = {
      trackId: selectedTrack.id,
      startBeat: snappedPlayheadBeat,
      durationBeats: projectGridBeats,
      pitchStr: defaultPitch,
      anchorPlayheadBeat: playheadBeat
    };

    setGhostPreviewNote((current) => {
      if (!current) {
        return current;
      }
      const sameAnchor =
        current.trackId === nextGhostPreviewNote.trackId &&
        current.startBeat === nextGhostPreviewNote.startBeat &&
        current.anchorPlayheadBeat === nextGhostPreviewNote.anchorPlayheadBeat;
      if (!sameAnchor) {
        return null;
      }
      if (
        current.durationBeats !== nextGhostPreviewNote.durationBeats ||
        current.pitchStr !== nextGhostPreviewNote.pitchStr
      ) {
        return nextGhostPreviewNote;
      }
      return current;
    });

    const ghostAlreadyVisible =
      ghostPreviewNote?.trackId === nextGhostPreviewNote.trackId &&
      ghostPreviewNote.startBeat === nextGhostPreviewNote.startBeat &&
      ghostPreviewNote.anchorPlayheadBeat === nextGhostPreviewNote.anchorPlayheadBeat;
    if (ghostAlreadyVisible) {
      return;
    }

    const timer = window.setTimeout(() => {
      setGhostPreviewNote(nextGhostPreviewNote);
    }, GHOST_PREVIEW_DELAY_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    arePitchPickersClosed,
    playheadNavigationFocused,
    defaultPitch,
    ghostPreviewNote,
    hasActivePlacement,
    hasNoSelection,
    hasSelectedTrack,
    isComposerView,
    isTransportIdle,
    playheadBeat,
    projectGridBeats,
    selectedTrack
  ]);

  // Show the delayed Tab target preview when playhead navigation is the active focus model.
  useEffect(() => {
    const playheadNavigationActive = playheadNavigationFocused || isPlayheadTabStopFocused();
    const canShowTabSelectionPreview =
      isComposerView &&
      hasSelectedTrack &&
      hasNoSelection &&
      playheadNavigationActive &&
      !hasActivePlacement &&
      isTransportIdle &&
      arePitchPickersClosed;

    if (!canShowTabSelectionPreview || !selectedTrack) {
      setTabSelectionPreviewNote(null);
      return;
    }

    const shell = document.querySelector<HTMLElement>('[data-track-canvas-shell="true"]');
    let timer: number | null = null;

    const clearTimer = () => {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
    };

    const schedulePreview = () => {
      const tabTargetNote = findNextVisibleTrackNoteAfterBeat(
        selectedTrack,
        playheadBeat,
        getTrackCanvasVisibleBeatRange()
      );
      if (!tabTargetNote) {
        clearTimer();
        setTabSelectionPreviewNote(null);
        return;
      }

      const nextPreview = {
        trackId: selectedTrack.id,
        noteId: tabTargetNote.id
      };

      if (
        tabSelectionPreviewNote?.trackId === nextPreview.trackId &&
        tabSelectionPreviewNote.noteId === nextPreview.noteId
      ) {
        return;
      }

      clearTimer();
      timer = window.setTimeout(() => {
        setTabSelectionPreviewNote(nextPreview);
      }, TAB_SELECTION_PREVIEW_DELAY_MS);
    };

    schedulePreview();
    shell?.addEventListener("scroll", schedulePreview, { passive: true });

    return () => {
      clearTimer();
      shell?.removeEventListener("scroll", schedulePreview);
    };
  }, [
    arePitchPickersClosed,
    playheadNavigationFocused,
    hasActivePlacement,
    hasNoSelection,
    hasSelectedTrack,
    isComposerView,
    isTransportIdle,
    playheadBeat,
    selectedTrack,
    tabSelectionPreviewNote
  ]);

  return { ghostPreviewNote, tabSelectionPreviewNote, clearGhostPreview };
}

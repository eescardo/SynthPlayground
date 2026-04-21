"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  KEYBOARD_NOTE_PREVIEW_MAX_PITCH,
  KEYBOARD_NOTE_PREVIEW_MIN_PITCH,
  shiftContentSelectionByBeats
} from "@/lib/hardwareNavigation";
import { parseNoteSelectionKey } from "@/lib/clipboard";
import { snapToGrid } from "@/lib/musicTiming";
import { transposePitch } from "@/lib/pitch";
import { focusLastTrackChromeTabStop, isModifierChord, isPlayheadTabStopFocused, isTextEditingTarget } from "@/hooks/hardwareNavigationUtils";
import { UseHardwareNavigationArgs } from "@/hooks/useHardwareNavigationTypes";

interface UseBaseHardwareNavigationArgs extends UseHardwareNavigationArgs {
  interactionLocked: boolean;
}

export interface BaseHardwareNavigationResult {
  playheadNavigationFocused: boolean;
  selectedNoteTabStopFocusToken: number;
  returnSelectionFocusToPlayhead: () => void;
  setPlayheadNavigationFocused: (focused: boolean) => void;
  clearBlockedSelectionTransfer: () => void;
  focusSelectedNoteTabStop: () => void;
  setSingleNoteSelection: (selectionKey: string, options?: { keepCollapsed?: boolean }) => void;
  focusLastTrackChromeTabStop: () => boolean;
}

export function useBaseHardwareNavigation({
  interactionLocked,
  projectGridBeats,
  tracks,
  selectedTrack,
  playheadBeat,
  playbackEndBeat,
  pitchPickerOpen,
  previewPitchPickerOpen,
  defaultPitch,
  selectionKind,
  contentSelection,
  selectionActionPopoverCollapsed,
  setDefaultPitch,
  setSelectedTrackId,
  setPlayheadBeatPreservingSelection,
  setContentSelection,
  commitProjectChange,
  previewDefaultPitchNow
}: UseBaseHardwareNavigationArgs): BaseHardwareNavigationResult {
  const [playheadNavigationFocused, setPlayheadNavigationFocused] = useState(false);
  const [selectedNoteTabStopFocusToken, setSelectedNoteTabStopFocusToken] = useState(0);
  const blockedSelectionTransferRef = useRef<{
    direction: -1 | 1;
    selectedNoteKey: string;
    blockingSelectionKey: string;
  } | null>(null);

  const clearBlockedSelectionTransfer = useCallback(() => {
    blockedSelectionTransferRef.current = null;
  }, []);

  const returnSelectionFocusToPlayhead = useCallback(() => {
    setPlayheadNavigationFocused(true);
    clearBlockedSelectionTransfer();
  }, [clearBlockedSelectionTransfer]);

  const focusSelectedNoteTabStop = useCallback(() => {
    setSelectedNoteTabStopFocusToken((current) => current + 1);
  }, []);

  const setSingleNoteSelection = useCallback((selectionKey: string, options?: { keepCollapsed?: boolean }) => {
    const parsed = parseNoteSelectionKey(selectionKey);
    if (!parsed) {
      return;
    }
    setSelectedTrackId(parsed.trackId);
    setContentSelection({
      noteKeys: [selectionKey],
      automationKeyframeSelectionKeys: []
    }, options);
  }, [setContentSelection, setSelectedTrackId]);

  useEffect(() => {
    if (selectionKind === "none") {
      return;
    }
    if (!isPlayheadTabStopFocused()) {
      setPlayheadNavigationFocused(false);
    }
    clearBlockedSelectionTransfer();
  }, [clearBlockedSelectionTransfer, selectionKind]);

  useEffect(() => {
    clearBlockedSelectionTransfer();
  }, [clearBlockedSelectionTransfer, contentSelection.automationKeyframeSelectionKeys, contentSelection.noteKeys]);

  useEffect(() => {
    const shiftDefaultPitch = (semitones: number) => {
      const nextPitch = transposePitch(defaultPitch, semitones, {
        minPitch: KEYBOARD_NOTE_PREVIEW_MIN_PITCH,
        maxPitch: KEYBOARD_NOTE_PREVIEW_MAX_PITCH
      });
      if (nextPitch === defaultPitch) {
        return;
      }
      setDefaultPitch(nextPitch);
      previewDefaultPitchNow(nextPitch);
    };

    const nudgePlayhead = (direction: -1 | 1) => {
      const nextBeat = direction < 0
        ? Math.max(0, snapToGrid(playheadBeat - projectGridBeats, projectGridBeats))
        : Math.min(playbackEndBeat, snapToGrid(playheadBeat + projectGridBeats, projectGridBeats));
      setPlayheadBeatPreservingSelection(nextBeat);
      setPlayheadNavigationFocused(true);
      clearBlockedSelectionTransfer();
    };

    const hasCollapsedContentSelection =
      selectionActionPopoverCollapsed &&
      (contentSelection.noteKeys.length > 0 || contentSelection.automationKeyframeSelectionKeys.length > 0);
    const hasNonPlayheadSelection =
      selectionKind === "timeline" ||
      (selectionKind === "content" && !hasCollapsedContentSelection);

    const nudgeCollapsedSelection = (direction: -1 | 1) => {
      let moveResult!: ReturnType<typeof shiftContentSelectionByBeats>;
      commitProjectChange((current) => {
        const nextMoveResult = shiftContentSelectionByBeats(current, contentSelection, direction * projectGridBeats);
        moveResult = nextMoveResult;
        return nextMoveResult.status === "moved" ? nextMoveResult.project : current;
      }, {
        actionKey: `selection:nudge:${direction < 0 ? "left" : "right"}`,
        coalesce: true
      });

      if (moveResult.status === "moved") {
        clearBlockedSelectionTransfer();
        setPlayheadNavigationFocused(false);
        return;
      }

      if (
        contentSelection.noteKeys.length === 1 &&
        contentSelection.automationKeyframeSelectionKeys.length === 0 &&
        moveResult.block.reason === "note"
      ) {
        const selectedNoteKey = contentSelection.noteKeys[0]!;
        const previousBlockedTransfer = blockedSelectionTransferRef.current;
        if (
          previousBlockedTransfer &&
          previousBlockedTransfer.direction === direction &&
          previousBlockedTransfer.selectedNoteKey === selectedNoteKey &&
          previousBlockedTransfer.blockingSelectionKey === moveResult.block.blockingSelectionKey
        ) {
          setSingleNoteSelection(moveResult.block.blockingSelectionKey, { keepCollapsed: true });
          clearBlockedSelectionTransfer();
          setPlayheadNavigationFocused(false);
          return;
        }

        blockedSelectionTransferRef.current = {
          direction,
          selectedNoteKey,
          blockingSelectionKey: moveResult.block.blockingSelectionKey
        };
        setPlayheadNavigationFocused(false);
        return;
      }

      clearBlockedSelectionTransfer();
      setPlayheadNavigationFocused(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const playheadDomFocused = target?.classList.contains("track-canvas-playhead-tabstop") ?? false;
      const noteTabStopFocused = target?.classList.contains("track-canvas-note-tabstop") ?? false;
      const selectionPopoverFocused = Boolean(target?.closest(".selection-actions-popover"));
      const selectionCaptureFocused = noteTabStopFocused || selectionPopoverFocused;

      if (event.defaultPrevented) {
        return;
      }
      if (isTextEditingTarget(event.target) || pitchPickerOpen || previewPitchPickerOpen) {
        return;
      }
      if (isModifierChord(event) || interactionLocked) {
        return;
      }

      if ((event.key === "-" || event.key === "_") && !event.repeat) {
        event.preventDefault();
        shiftDefaultPitch(-1);
        return;
      }

      if ((event.key === "=" || event.key === "+") && !event.repeat) {
        event.preventDefault();
        shiftDefaultPitch(1);
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        if (playheadNavigationFocused || playheadDomFocused) {
          nudgePlayhead(-1);
          return;
        }
        if (hasNonPlayheadSelection) {
          if (!selectionCaptureFocused) {
            nudgePlayhead(-1);
            return;
          }
          setPlayheadNavigationFocused(false);
          clearBlockedSelectionTransfer();
          return;
        }
        if (hasCollapsedContentSelection) {
          if (!selectionCaptureFocused) {
            nudgePlayhead(-1);
            return;
          }
          nudgeCollapsedSelection(-1);
          return;
        }
        nudgePlayhead(-1);
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        if (playheadNavigationFocused || playheadDomFocused) {
          nudgePlayhead(1);
          return;
        }
        if (hasNonPlayheadSelection) {
          if (!selectionCaptureFocused) {
            nudgePlayhead(1);
            return;
          }
          setPlayheadNavigationFocused(false);
          clearBlockedSelectionTransfer();
          return;
        }
        if (hasCollapsedContentSelection) {
          if (!selectionCaptureFocused) {
            nudgePlayhead(1);
            return;
          }
          nudgeCollapsedSelection(1);
          return;
        }
        nudgePlayhead(1);
        return;
      }

      if (!selectedTrack) {
        return;
      }

      const selectedTrackIndex = tracks.findIndex((track) => track.id === selectedTrack.id);
      if (selectedTrackIndex === -1) {
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedTrackId(tracks[Math.max(0, selectedTrackIndex - 1)]!.id);
        setPlayheadNavigationFocused(playheadNavigationFocused || playheadDomFocused);
        clearBlockedSelectionTransfer();
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedTrackId(tracks[Math.min(tracks.length - 1, selectedTrackIndex + 1)]!.id);
        setPlayheadNavigationFocused(playheadNavigationFocused || playheadDomFocused);
        clearBlockedSelectionTransfer();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [
    clearBlockedSelectionTransfer,
    commitProjectChange,
    contentSelection,
    defaultPitch,
    interactionLocked,
    pitchPickerOpen,
    playheadBeat,
    playbackEndBeat,
    previewDefaultPitchNow,
    previewPitchPickerOpen,
    projectGridBeats,
    playheadNavigationFocused,
    selectedTrack,
    selectionActionPopoverCollapsed,
    selectionKind,
    setContentSelection,
    setDefaultPitch,
    setPlayheadBeatPreservingSelection,
    setSelectedTrackId,
    setSingleNoteSelection,
    tracks
  ]);

  return {
    playheadNavigationFocused,
    selectedNoteTabStopFocusToken,
    returnSelectionFocusToPlayhead,
    setPlayheadNavigationFocused,
    clearBlockedSelectionTransfer,
    focusSelectedNoteTabStop,
    setSingleNoteSelection,
    focusLastTrackChromeTabStop
  };
}

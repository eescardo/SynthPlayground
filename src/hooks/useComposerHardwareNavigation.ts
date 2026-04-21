"use client";

import { Dispatch, SetStateAction, useCallback, useEffect, useRef, useState } from "react";
import { BaseHardwareNavigationResult } from "@/hooks/useBaseHardwareNavigation";
import { isModifierChord, isPlayheadTabStopFocused, isTextEditingTarget } from "@/hooks/hardwareNavigationUtils";
import {
  ActiveKeyboardPlacement,
  GhostPreviewNote,
  UseHardwareNavigationArgs
} from "@/hooks/useHardwareNavigationTypes";
import {
  findTrackBackspaceTargetNote,
  findTrackNoteAtBeat,
  shiftContentSelectionByBeats,
  trackHasNoteAtBeat,
  upsertKeyboardPlacedNote
} from "@/lib/hardwareNavigation";
import { getNoteSelectionKey } from "@/lib/clipboard";
import { createId } from "@/lib/ids";
import { DEFAULT_NOTE_VELOCITY } from "@/lib/noteDefaults";
import { beatToSample, snapToGrid, snapUpToGrid } from "@/lib/musicTiming";
import { pitchToVoct } from "@/lib/pitch";

const GHOST_PREVIEW_DELAY_MS = 2000;
const TAB_SELECTION_PREVIEW_DELAY_MS = 600;
const HELD_PLACEMENT_PREVIEW_GRID_SPAN = 128;
const HELD_PLACEMENT_PREVIEW_RELEASE_TAIL_GRIDS = 8;

interface UseComposerHardwareNavigationArgs extends UseHardwareNavigationArgs {
  activePlacement: ActiveKeyboardPlacement | null;
  setActivePlacement: Dispatch<SetStateAction<ActiveKeyboardPlacement | null>>;
  base: BaseHardwareNavigationResult;
}

interface ComposerHardwareNavigationResult {
  ghostPreviewNote: GhostPreviewNote | null;
  tabSelectionPreviewNote: { trackId: string; noteId: string } | null;
}

export function useComposerHardwareNavigation({
  view,
  projectGridBeats,
  projectTempo,
  selectedTrack,
  playheadBeat,
  playbackEndBeat,
  isPlaying,
  recordPhase,
  pitchPickerOpen,
  previewPitchPickerOpen,
  defaultPitch,
  selectionKind,
  contentSelection,
  selectionActionPopoverCollapsed,
  setSelectedTrackId,
  setPlayheadBeatFromUser,
  setPlayheadBeatPreservingSelection,
  expandSelectionActionPopover,
  toggleTrackMacroPanel,
  deleteNote,
  commitProjectChange,
  audioEngineRef,
  onComposerPlay,
  onComposerStop,
  setRuntimeError,
  activePlacement,
  setActivePlacement,
  tracks,
  base
}: UseComposerHardwareNavigationArgs): ComposerHardwareNavigationResult {
  const isComposerView = view === "composer";
  const isTransportIdle = !isPlaying && recordPhase === "idle";
  const arePitchPickersClosed = !pitchPickerOpen && !previewPitchPickerOpen;
  const hasActivePlacement = activePlacement !== null;
  const hasSelectedTrack = Boolean(selectedTrack);
  const hasNoSelection = selectionKind === "none";

  const [ghostPreviewNote, setGhostPreviewNote] = useState<GhostPreviewNote | null>(null);
  const [tabSelectionPreviewNote, setTabSelectionPreviewNote] = useState<{ trackId: string; noteId: string } | null>(null);
  const placementRafRef = useRef<number | null>(null);
  const pendingPreviewStartIdsRef = useRef<Set<string>>(new Set());
  const pendingPreviewReleasesRef = useRef<Map<string, { trackId: string; durationBeats: number }>>(new Map());
  const blockedSelectionTransferRef = useRef<{
    direction: -1 | 1;
    selectedNoteKey: string;
    blockingSelectionKey: string;
  } | null>(null);
  const previousSelectionSignatureRef = useRef<string | null>(null);

  const clearBlockedSelectionTransfer = useCallback(() => {
    blockedSelectionTransferRef.current = null;
  }, []);

  const setPlacedNote = useCallback((
    trackId: string,
    noteId: string,
    startBeat: number,
    durationBeats: number,
    pitchStr: string,
    actionKey = `track:${trackId}:keyboard-place:${noteId}`
  ) => {
    commitProjectChange(
      (current) => {
        let changed = false;
        const tracks = current.tracks.map((track) => {
          if (track.id !== trackId) {
            return track;
          }
          const nextTrack = upsertKeyboardPlacedNote(track, {
            id: noteId,
            pitchStr,
            startBeat,
            durationBeats
          });
          if (nextTrack !== track) {
            changed = true;
          }
          return nextTrack;
        });
        return changed ? { ...current, tracks } : current;
      },
      { actionKey, coalesce: true }
    );
  }, [commitProjectChange]);

  const dispatchPlacementPreviewRelease = useCallback((trackId: string, noteId: string, durationBeats: number) => {
    const sampleRate = audioEngineRef.current?.getSampleRate() ?? 48_000;
    const noteOffSampleTime = Math.max(1, beatToSample(durationBeats, sampleRate, projectTempo));
    audioEngineRef.current?.sendParamChanges([
      {
        id: `${noteId}_preview_off_${noteOffSampleTime}`,
        type: "NoteOff",
        source: "preview",
        sampleTime: noteOffSampleTime,
        trackId,
        noteId
      }
    ]);
  }, [audioEngineRef, projectTempo]);

  const startPlacementPreview = useCallback((trackId: string, noteId: string, pitchStr: string, startBeat: number) => {
    const previewDurationBeats = Math.max(
      projectGridBeats,
      projectGridBeats * HELD_PLACEMENT_PREVIEW_GRID_SPAN,
      playbackEndBeat - startBeat + projectGridBeats * HELD_PLACEMENT_PREVIEW_RELEASE_TAIL_GRIDS
    );
    pendingPreviewStartIdsRef.current.add(noteId);
    const previewPromise = audioEngineRef.current
      ?.previewNote(trackId, pitchToVoct(pitchStr), previewDurationBeats, DEFAULT_NOTE_VELOCITY, {
        previewId: noteId
      })
      ?? Promise.resolve();

    previewPromise
      .catch((error) => setRuntimeError((error as Error).message))
      .finally(() => {
        pendingPreviewStartIdsRef.current.delete(noteId);
        const pendingRelease = pendingPreviewReleasesRef.current.get(noteId);
        if (!pendingRelease) {
          return;
        }
        pendingPreviewReleasesRef.current.delete(noteId);
        dispatchPlacementPreviewRelease(pendingRelease.trackId, noteId, pendingRelease.durationBeats);
      });
  }, [audioEngineRef, dispatchPlacementPreviewRelease, playbackEndBeat, projectGridBeats, setRuntimeError]);

  const releasePlacementPreview = useCallback((trackId: string, noteId: string, durationBeats: number) => {
    if (pendingPreviewStartIdsRef.current.has(noteId)) {
      pendingPreviewReleasesRef.current.set(noteId, { trackId, durationBeats });
      return;
    }
    dispatchPlacementPreviewRelease(trackId, noteId, durationBeats);
  }, [dispatchPlacementPreviewRelease]);

  useEffect(() => {
    clearBlockedSelectionTransfer();
  }, [clearBlockedSelectionTransfer, contentSelection.automationKeyframeSelectionKeys, contentSelection.noteKeys, selectionKind]);

  // New content selections should take keyboard ownership away from the playhead.
  useEffect(() => {
    if (!isComposerView || selectionKind !== "content") {
      previousSelectionSignatureRef.current = null;
      return;
    }

    const selectionSignature = JSON.stringify({
      noteKeys: contentSelection.noteKeys,
      automationKeyframeSelectionKeys: contentSelection.automationKeyframeSelectionKeys
    });
    if (selectionSignature === previousSelectionSignatureRef.current) {
      return;
    }
    previousSelectionSignatureRef.current = selectionSignature;

    if (isPlayheadTabStopFocused()) {
      (document.activeElement as HTMLElement | null)?.blur();
    }

    if (contentSelection.noteKeys.length > 0 || contentSelection.automationKeyframeSelectionKeys.length > 0) {
      base.setPlayheadNavigationFocused(false);
      base.focusSelectedNoteTabStop();
    }
  }, [base, contentSelection, isComposerView, selectionKind]);

  // Grow the actively placed note while Enter is held.
  useEffect(() => {
    if (!activePlacement) {
      if (placementRafRef.current !== null) {
        cancelAnimationFrame(placementRafRef.current);
        placementRafRef.current = null;
      }
      return;
    }

    const step = () => {
      const elapsedBeats = ((performance.now() - activePlacement.startedAtMs) / 1000) * (projectTempo / 60);
      const durationBeats = Math.max(projectGridBeats, snapUpToGrid(elapsedBeats, projectGridBeats));
      if (durationBeats !== activePlacement.durationBeats) {
        setPlacedNote(activePlacement.trackId, activePlacement.noteId, activePlacement.startBeat, durationBeats, defaultPitch);
        setActivePlacement((current) =>
          current
            ? {
                ...current,
                durationBeats
              }
            : current
        );
      }
      placementRafRef.current = requestAnimationFrame(step);
    };

    placementRafRef.current = requestAnimationFrame(step);
    return () => {
      if (placementRafRef.current !== null) {
        cancelAnimationFrame(placementRafRef.current);
        placementRafRef.current = null;
      }
    };
  }, [activePlacement, defaultPitch, projectGridBeats, projectTempo, setActivePlacement, setPlacedNote]);

  // Show the delayed ghost note when the composer is idle over an empty spot.
  useEffect(() => {
    const canShowGhostPreview =
      isComposerView &&
      hasSelectedTrack &&
      !hasActivePlacement &&
      isTransportIdle &&
      hasNoSelection &&
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
    defaultPitch,
    ghostPreviewNote,
    hasActivePlacement,
    hasNoSelection,
    hasSelectedTrack,
    isComposerView,
    isTransportIdle,
    playheadBeat,
    projectGridBeats,
    selectedTrack,
  ]);

  // Show the delayed Tab target preview when playhead navigation is the active focus model.
  useEffect(() => {
    const playheadNavigationActive = base.playheadNavigationFocused || isPlayheadTabStopFocused();
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

    const noteAtPlayhead = findTrackNoteAtBeat(selectedTrack, playheadBeat);
    if (!noteAtPlayhead) {
      setTabSelectionPreviewNote(null);
      return;
    }

    const nextPreview = {
      trackId: selectedTrack.id,
      noteId: noteAtPlayhead.id
    };

    if (
      tabSelectionPreviewNote?.trackId === nextPreview.trackId &&
      tabSelectionPreviewNote.noteId === nextPreview.noteId
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      setTabSelectionPreviewNote(nextPreview);
    }, TAB_SELECTION_PREVIEW_DELAY_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    arePitchPickersClosed,
    base.playheadNavigationFocused,
    hasActivePlacement,
    hasNoSelection,
    hasSelectedTrack,
    isComposerView,
    isTransportIdle,
    playheadBeat,
    selectedTrack,
    tabSelectionPreviewNote,
  ]);

  // Keep the live placement aligned when default pitch changes mid-hold.
  useEffect(() => {
    if (!activePlacement || !selectedTrack || selectedTrack.id !== activePlacement.trackId) {
      return;
    }
    setPlacedNote(activePlacement.trackId, activePlacement.noteId, activePlacement.startBeat, activePlacement.durationBeats, defaultPitch);
  }, [activePlacement, defaultPitch, selectedTrack, setPlacedNote]);

  // Attach composer-only keyboard routing for placement, transport, and timeline navigation.
  useEffect(() => {
    const finishPlacement = () => {
      if (activePlacement) {
        releasePlacementPreview(activePlacement.trackId, activePlacement.noteId, activePlacement.durationBeats);
        setPlayheadBeatFromUser(snapToGrid(activePlacement.startBeat + activePlacement.durationBeats, projectGridBeats));
        base.setPlayheadNavigationFocused(true);
      }
      setActivePlacement(null);
    };

    const startPlacement = () => {
      const canStartPlacement =
        isComposerView &&
        Boolean(selectedTrack) &&
        isTransportIdle &&
        !hasActivePlacement;
      if (!canStartPlacement || !selectedTrack) {
        return;
      }
      const startBeat = Math.max(0, snapToGrid(playheadBeat, projectGridBeats));
      const noteId = createId("note");
      setPlacedNote(selectedTrack.id, noteId, startBeat, projectGridBeats, defaultPitch);
      startPlacementPreview(selectedTrack.id, noteId, defaultPitch, startBeat);
      setGhostPreviewNote(null);
      setActivePlacement({
        noteId,
        trackId: selectedTrack.id,
        startBeat,
        durationBeats: projectGridBeats,
        startedAtMs: performance.now()
      });
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const playheadDomFocused = target?.classList.contains("track-canvas-playhead-tabstop") ?? false;
      const noteTabStopFocused = target?.classList.contains("track-canvas-note-tabstop") ?? false;
      const selectionPopoverFocused = Boolean(target?.closest(".selection-actions-popover"));
      const selectionCaptureFocused = noteTabStopFocused || selectionPopoverFocused;
      const hasContentSelection =
        selectionKind === "content" &&
        (contentSelection.noteKeys.length > 0 || contentSelection.automationKeyframeSelectionKeys.length > 0);
      const hasTimelineSelection = selectionKind === "timeline";
      const playheadNavigationActive = base.playheadNavigationFocused || playheadDomFocused;
      const canHandleComposerKeyboardShortcut = isComposerView && arePitchPickersClosed;

      const nudgePlayhead = (direction: -1 | 1) => {
        const nextBeat = direction < 0
          ? Math.max(0, snapToGrid(playheadBeat - projectGridBeats, projectGridBeats))
          : Math.min(playbackEndBeat, snapToGrid(playheadBeat + projectGridBeats, projectGridBeats));
        setPlayheadBeatPreservingSelection(nextBeat);
        base.setPlayheadNavigationFocused(true);
        clearBlockedSelectionTransfer();
      };

      const nudgeContentSelection = (direction: -1 | 1) => {
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
          base.setPlayheadNavigationFocused(false);
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
            base.setSingleNoteSelection(moveResult.block.blockingSelectionKey, { keepCollapsed: true });
            clearBlockedSelectionTransfer();
            base.setPlayheadNavigationFocused(false);
            return;
          }

          blockedSelectionTransferRef.current = {
            direction,
            selectedNoteKey,
            blockingSelectionKey: moveResult.block.blockingSelectionKey
          };
          base.setPlayheadNavigationFocused(false);
          return;
        }

        clearBlockedSelectionTransfer();
        base.setPlayheadNavigationFocused(false);
      };

      if (event.defaultPrevented) {
        return;
      }
      if (isTextEditingTarget(event.target) || !canHandleComposerKeyboardShortcut) {
        return;
      }
      if (isModifierChord(event)) {
        return;
      }
      if (activePlacement && event.key !== "Enter") {
        event.preventDefault();
        return;
      }
      if (!isComposerView) {
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        if (playheadNavigationActive) {
          nudgePlayhead(-1);
          return;
        }
        if (hasContentSelection) {
          nudgeContentSelection(-1);
          return;
        }
        if (hasTimelineSelection) {
          if (!selectionCaptureFocused) {
            nudgePlayhead(-1);
            return;
          }
          base.setPlayheadNavigationFocused(false);
          clearBlockedSelectionTransfer();
          return;
        }
        nudgePlayhead(-1);
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        if (playheadNavigationActive) {
          nudgePlayhead(1);
          return;
        }
        if (hasContentSelection) {
          nudgeContentSelection(1);
          return;
        }
        if (hasTimelineSelection) {
          if (!selectionCaptureFocused) {
            nudgePlayhead(1);
            return;
          }
          base.setPlayheadNavigationFocused(false);
          clearBlockedSelectionTransfer();
          return;
        }
        nudgePlayhead(1);
        return;
      }

      if (event.key === " " || event.code === "Space") {
        event.preventDefault();
        if (event.repeat || !isTransportIdle) {
          return;
        }
        if (isPlaying) {
          onComposerStop();
        } else {
          onComposerPlay();
        }
        return;
      }

      if ((event.key === "[" || event.key === "{") && !event.repeat) {
        if (!selectedTrack) {
          return;
        }
        event.preventDefault();
        toggleTrackMacroPanel(selectedTrack.id, false);
        return;
      }

      if ((event.key === "]" || event.key === "}") && !event.repeat) {
        if (!selectedTrack) {
          return;
        }
        event.preventDefault();
        toggleTrackMacroPanel(selectedTrack.id, true);
        return;
      }

      if (event.key === "Enter" && !event.repeat && selectionActionPopoverCollapsed && selectionKind !== "none") {
        event.preventDefault();
        expandSelectionActionPopover();
        return;
      }

      if (!selectedTrack) {
        return;
      }

      const selectedTrackIndex = tracks.findIndex((track) => track.id === selectedTrack.id);
      if (selectedTrackIndex !== -1) {
        if (event.key === "ArrowUp") {
          event.preventDefault();
          setSelectedTrackId(tracks[Math.max(0, selectedTrackIndex - 1)]!.id);
          base.setPlayheadNavigationFocused(playheadNavigationActive);
          clearBlockedSelectionTransfer();
          return;
        }

        if (event.key === "ArrowDown") {
          event.preventDefault();
          setSelectedTrackId(tracks[Math.min(tracks.length - 1, selectedTrackIndex + 1)]!.id);
          base.setPlayheadNavigationFocused(playheadNavigationActive);
          clearBlockedSelectionTransfer();
          return;
        }
      }

      if (event.key === "Enter" && !event.repeat) {
        event.preventDefault();
        startPlacement();
        return;
      }

      if (!isTransportIdle) {
        return;
      }

      if (event.key === "Backspace" && !event.repeat) {
        event.preventDefault();
        const targetNote = findTrackBackspaceTargetNote(selectedTrack, playheadBeat);
        if (targetNote) {
          deleteNote(selectedTrack.id, targetNote.id);
          setPlayheadBeatFromUser(targetNote.startBeat);
        } else {
          setPlayheadBeatFromUser(Math.max(0, snapToGrid(playheadBeat - projectGridBeats, projectGridBeats)));
        }
        base.setPlayheadNavigationFocused(true);
        clearBlockedSelectionTransfer();
        return;
      }

      if (event.key === "Tab" && playheadNavigationActive) {
        if (event.shiftKey) {
          if (base.focusLastTrackChromeTabStop()) {
            event.preventDefault();
            base.setPlayheadNavigationFocused(false);
          }
          return;
        }

        if (hasContentSelection) {
          event.preventDefault();
          base.setPlayheadNavigationFocused(false);
          base.focusSelectedNoteTabStop();
          return;
        }

        const noteAtPlayhead = findTrackNoteAtBeat(selectedTrack, playheadBeat);
        if (noteAtPlayhead) {
          event.preventDefault();
          base.setSingleNoteSelection(getNoteSelectionKey(selectedTrack.id, noteAtPlayhead.id), { keepCollapsed: true });
          base.setPlayheadNavigationFocused(false);
          base.focusSelectedNoteTabStop();
        }
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Enter") {
        finishPlacement();
      }
    };

    const onBlur = () => {
      finishPlacement();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [
    activePlacement,
    arePitchPickersClosed,
    base,
    clearBlockedSelectionTransfer,
    commitProjectChange,
    contentSelection,
    defaultPitch,
    deleteNote,
    expandSelectionActionPopover,
    hasActivePlacement,
    isComposerView,
    isPlaying,
    isTransportIdle,
    onComposerPlay,
    onComposerStop,
    playbackEndBeat,
    playheadBeat,
    projectGridBeats,
    releasePlacementPreview,
    selectionActionPopoverCollapsed,
    selectionKind,
    selectedTrack,
    setActivePlacement,
    setPlacedNote,
    setPlayheadBeatPreservingSelection,
    setPlayheadBeatFromUser,
    setSelectedTrackId,
    startPlacementPreview,
    tracks,
    toggleTrackMacroPanel,
    view
  ]);

  return {
    ghostPreviewNote,
    tabSelectionPreviewNote
  };
}

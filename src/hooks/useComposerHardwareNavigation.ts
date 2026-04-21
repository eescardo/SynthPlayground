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
  selectionActionPopoverCollapsed,
  setPlayheadBeatFromUser,
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
  base
}: UseComposerHardwareNavigationArgs): ComposerHardwareNavigationResult {
  const [ghostPreviewNote, setGhostPreviewNote] = useState<GhostPreviewNote | null>(null);
  const [tabSelectionPreviewNote, setTabSelectionPreviewNote] = useState<{ trackId: string; noteId: string } | null>(null);
  const placementRafRef = useRef<number | null>(null);
  const pendingPreviewStartIdsRef = useRef<Set<string>>(new Set());
  const pendingPreviewReleasesRef = useRef<Map<string, { trackId: string; durationBeats: number }>>(new Map());

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

  useEffect(() => {
    if (
      view !== "composer" ||
      !selectedTrack ||
      activePlacement ||
      isPlaying ||
      recordPhase !== "idle" ||
      selectionKind !== "none" ||
      pitchPickerOpen ||
      previewPitchPickerOpen
    ) {
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
    activePlacement,
    defaultPitch,
    ghostPreviewNote,
    isPlaying,
    pitchPickerOpen,
    playheadBeat,
    previewPitchPickerOpen,
    projectGridBeats,
    recordPhase,
    selectionKind,
    selectedTrack,
    view
  ]);

  useEffect(() => {
    if (
      view !== "composer" ||
      !selectedTrack ||
      (!base.playheadNavigationFocused && !isPlayheadTabStopFocused()) ||
      activePlacement ||
      isPlaying ||
      recordPhase !== "idle" ||
      pitchPickerOpen ||
      previewPitchPickerOpen
    ) {
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
    activePlacement,
    base.playheadNavigationFocused,
    isPlaying,
    pitchPickerOpen,
    playheadBeat,
    previewPitchPickerOpen,
    recordPhase,
    selectedTrack,
    tabSelectionPreviewNote,
    view
  ]);

  useEffect(() => {
    if (!activePlacement || !selectedTrack || selectedTrack.id !== activePlacement.trackId) {
      return;
    }
    setPlacedNote(activePlacement.trackId, activePlacement.noteId, activePlacement.startBeat, activePlacement.durationBeats, defaultPitch);
  }, [activePlacement, defaultPitch, selectedTrack, setPlacedNote]);

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
      if (view !== "composer" || !selectedTrack || isPlaying || recordPhase !== "idle" || activePlacement) {
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

      if (event.defaultPrevented) {
        return;
      }
      if (isTextEditingTarget(event.target) || pitchPickerOpen || previewPitchPickerOpen) {
        return;
      }
      if (isModifierChord(event)) {
        return;
      }
      if (activePlacement && event.key !== "Enter") {
        event.preventDefault();
        return;
      }
      if (view !== "composer") {
        return;
      }

      if (event.key === " " || event.code === "Space") {
        event.preventDefault();
        if (event.repeat || recordPhase !== "idle") {
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

      if (event.key === "Enter" && !event.repeat) {
        event.preventDefault();
        startPlacement();
        return;
      }

      if (isPlaying || recordPhase !== "idle") {
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
        base.clearBlockedSelectionTransfer();
        return;
      }

      if (event.key === "Tab" && (base.playheadNavigationFocused || playheadDomFocused)) {
        if (event.shiftKey) {
          if (base.focusLastTrackChromeTabStop()) {
            event.preventDefault();
            base.setPlayheadNavigationFocused(false);
          }
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
    base,
    defaultPitch,
    deleteNote,
    expandSelectionActionPopover,
    isPlaying,
    onComposerPlay,
    onComposerStop,
    pitchPickerOpen,
    playheadBeat,
    previewPitchPickerOpen,
    projectGridBeats,
    recordPhase,
    releasePlacementPreview,
    selectionActionPopoverCollapsed,
    selectionKind,
    selectedTrack,
    setActivePlacement,
    setPlacedNote,
    setPlayheadBeatFromUser,
    startPlacementPreview,
    toggleTrackMacroPanel,
    view
  ]);

  return {
    ghostPreviewNote,
    tabSelectionPreviewNote
  };
}

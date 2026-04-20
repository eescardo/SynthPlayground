"use client";

import { RefObject, useCallback, useEffect, useRef, useState } from "react";
import { AudioEngine } from "@/audio/engine";
import {
  findTrackBackspaceTargetNote,
  findTrackNoteAtBeat,
  KEYBOARD_NOTE_PREVIEW_MAX_PITCH,
  KEYBOARD_NOTE_PREVIEW_MIN_PITCH,
  shiftContentSelectionByBeats,
  trackHasNoteAtBeat,
  upsertKeyboardPlacedNote
} from "@/lib/hardwareNavigation";
import { ContentSelection, getNoteSelectionKey, parseNoteSelectionKey } from "@/lib/clipboard";
import { createId } from "@/lib/ids";
import { DEFAULT_NOTE_VELOCITY } from "@/lib/noteDefaults";
import { beatToSample, snapToGrid, snapUpToGrid } from "@/lib/musicTiming";
import { pitchToVoct, transposePitch } from "@/lib/pitch";
import { Project, Track } from "@/types/music";

type WorkspaceView = "composer" | "patch-workspace";

interface ActiveKeyboardPlacement {
  noteId: string;
  trackId: string;
  startBeat: number;
  durationBeats: number;
  startedAtMs: number;
}

interface GhostPreviewNote {
  trackId: string;
  startBeat: number;
  durationBeats: number;
  pitchStr: string;
  anchorPlayheadBeat: number;
}

interface UseHardwareNavigationShortcutsArgs {
  view: WorkspaceView;
  projectGridBeats: number;
  projectTempo: number;
  tracks: Track[];
  selectedTrack?: Track;
  playheadBeat: number;
  playbackEndBeat: number;
  isPlaying: boolean;
  recordPhase: "idle" | "count_in" | "recording";
  pitchPickerOpen: boolean;
  previewPitchPickerOpen: boolean;
  defaultPitch: string;
  selectionKind: "none" | "content" | "timeline";
  contentSelection: ContentSelection;
  selectionActionPopoverCollapsed: boolean;
  setDefaultPitch: (pitch: string) => void;
  setSelectedTrackId: (trackId: string) => void;
  setPlayheadBeatFromUser: (beat: number) => void;
  setContentSelection: (selection: ContentSelection, options?: { keepCollapsed?: boolean }) => void;
  expandSelectionActionPopover: () => void;
  toggleTrackMacroPanel: (trackId: string, expanded: boolean) => void;
  deleteNote: (trackId: string, noteId: string) => void;
  commitProjectChange: (updater: (current: Project) => Project, options?: { actionKey?: string; coalesce?: boolean }) => void;
  audioEngineRef: RefObject<AudioEngine | null>;
  previewDefaultPitchNow: (pitch?: string) => void;
  onComposerPlay: () => void;
  onComposerStop: () => void;
  setRuntimeError: (message: string | null) => void;
}

const GHOST_PREVIEW_DELAY_MS = 2000;
const HELD_PLACEMENT_PREVIEW_GRID_SPAN = 128;
const HELD_PLACEMENT_PREVIEW_RELEASE_TAIL_GRIDS = 8;

const isTextEditingTarget = (target: EventTarget | null) => {
  const element = target as HTMLElement | null;
  return Boolean(
    element &&
      (element.tagName === "INPUT" ||
        element.tagName === "SELECT" ||
        element.tagName === "TEXTAREA" ||
        element.isContentEditable)
  );
};

const isModifierChord = (event: KeyboardEvent) => event.metaKey || event.ctrlKey || event.altKey;

export function useHardwareNavigationShortcuts({
  view,
  projectGridBeats,
  projectTempo,
  tracks,
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
  setDefaultPitch,
  setSelectedTrackId,
  setPlayheadBeatFromUser,
  setContentSelection,
  expandSelectionActionPopover,
  toggleTrackMacroPanel,
  deleteNote,
  commitProjectChange,
  audioEngineRef,
  previewDefaultPitchNow,
  onComposerPlay,
  onComposerStop,
  setRuntimeError
}: UseHardwareNavigationShortcutsArgs) {
  const [activePlacement, setActivePlacement] = useState<ActiveKeyboardPlacement | null>(null);
  const [ghostPreviewNote, setGhostPreviewNote] = useState<GhostPreviewNote | null>(null);
  const [playheadNavigationFocused, setPlayheadNavigationFocused] = useState(false);
  const [selectedNoteTabStopFocusToken, setSelectedNoteTabStopFocusToken] = useState(0);
  const placementRafRef = useRef<number | null>(null);
  const pendingPreviewStartIdsRef = useRef<Set<string>>(new Set());
  const pendingPreviewReleasesRef = useRef<Map<string, { trackId: string; durationBeats: number }>>(new Map());
  const blockedSelectionTransferRef = useRef<{
    direction: -1 | 1;
    selectedNoteKey: string;
    blockingSelectionKey: string;
  } | null>(null);

  const clearBlockedSelectionTransfer = useCallback(() => {
    blockedSelectionTransferRef.current = null;
  }, []);

  const returnSelectionFocusToPlayhead = useCallback(() => {
    setPlayheadBeatFromUser(playheadBeat);
    setPlayheadNavigationFocused(true);
    clearBlockedSelectionTransfer();
  }, [clearBlockedSelectionTransfer, playheadBeat, setPlayheadBeatFromUser]);

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
  }, [activePlacement, defaultPitch, projectGridBeats, projectTempo, setPlacedNote]);

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
    if (!activePlacement || !selectedTrack || selectedTrack.id !== activePlacement.trackId) {
      return;
    }
    setPlacedNote(activePlacement.trackId, activePlacement.noteId, activePlacement.startBeat, activePlacement.durationBeats, defaultPitch);
  }, [activePlacement, defaultPitch, selectedTrack, setPlacedNote]);

  useEffect(() => {
    if (selectionKind !== "none") {
      setPlayheadNavigationFocused(false);
      clearBlockedSelectionTransfer();
    }
  }, [clearBlockedSelectionTransfer, selectionKind]);

  useEffect(() => {
    clearBlockedSelectionTransfer();
  }, [clearBlockedSelectionTransfer, contentSelection.automationKeyframeSelectionKeys, contentSelection.noteKeys]);

  useEffect(() => {
    const finishPlacement = () => {
      if (activePlacement) {
        releasePlacementPreview(activePlacement.trackId, activePlacement.noteId, activePlacement.durationBeats);
        setPlayheadBeatFromUser(snapToGrid(activePlacement.startBeat + activePlacement.durationBeats, projectGridBeats));
        setPlayheadNavigationFocused(true);
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

    const focusLastTrackChromeTabStop = () => {
      const focusableElements = Array.from(
        document.querySelectorAll<HTMLElement>(
          ".track-header-overlays button:not([disabled]), .track-header-overlays input:not([disabled]), .track-header-overlays select:not([disabled]), .track-header-overlays [tabindex]:not([tabindex='-1'])"
        )
      ).filter((element) => element.offsetParent !== null);
      const lastFocusable = focusableElements[focusableElements.length - 1];
      if (!lastFocusable) {
        return false;
      }
      lastFocusable.focus();
      return true;
    };

    const setSingleNoteSelection = (selectionKey: string, options?: { keepCollapsed?: boolean }) => {
      const parsed = parseNoteSelectionKey(selectionKey);
      if (!parsed) {
        return;
      }
      setSelectedTrackId(parsed.trackId);
      setContentSelection({
        noteKeys: [selectionKey],
        automationKeyframeSelectionKeys: []
      }, options);
    };

    const nudgePlayhead = (direction: -1 | 1) => {
      const nextBeat = direction < 0
        ? Math.max(0, snapToGrid(playheadBeat - projectGridBeats, projectGridBeats))
        : Math.min(playbackEndBeat, snapToGrid(playheadBeat + projectGridBeats, projectGridBeats));
      setPlayheadBeatFromUser(nextBeat);
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
      if (isTextEditingTarget(event.target) || pitchPickerOpen || previewPitchPickerOpen) {
        return;
      }
      if (isModifierChord(event)) {
        return;
      }
      if (activePlacement && event.key !== "Enter") {
        return;
      }

      if (event.key === " " || event.code === "Space") {
        event.preventDefault();
        if (event.repeat) {
          return;
        }
        if (view === "patch-workspace") {
          previewDefaultPitchNow();
          return;
        }
        if (recordPhase !== "idle") {
          return;
        }
        if (isPlaying) {
          onComposerStop();
        } else {
          onComposerPlay();
        }
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

      if (view === "composer" && (event.key === "[" || event.key === "{") && !event.repeat) {
        if (!selectedTrack) {
          return;
        }
        event.preventDefault();
        toggleTrackMacroPanel(selectedTrack.id, false);
        return;
      }

      if (view === "composer" && (event.key === "]" || event.key === "}") && !event.repeat) {
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

      if (view !== "composer" || !selectedTrack) {
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
        setPlayheadNavigationFocused(true);
        clearBlockedSelectionTransfer();
        return;
      }

      if (event.key === "Tab" && playheadNavigationFocused) {
        if (event.shiftKey) {
          if (focusLastTrackChromeTabStop()) {
            event.preventDefault();
            setPlayheadNavigationFocused(false);
          }
          return;
        }

        const noteAtPlayhead = findTrackNoteAtBeat(selectedTrack, playheadBeat);
        if (noteAtPlayhead) {
          event.preventDefault();
          setSingleNoteSelection(getNoteSelectionKey(selectedTrack.id, noteAtPlayhead.id));
          setPlayheadNavigationFocused(false);
          setSelectedNoteTabStopFocusToken((current) => current + 1);
        }
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        if (hasNonPlayheadSelection) {
          setPlayheadNavigationFocused(false);
          clearBlockedSelectionTransfer();
          return;
        }
        if (hasCollapsedContentSelection) {
          nudgeCollapsedSelection(-1);
          return;
        }
        nudgePlayhead(-1);
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        if (hasNonPlayheadSelection) {
          setPlayheadNavigationFocused(false);
          clearBlockedSelectionTransfer();
          return;
        }
        if (hasCollapsedContentSelection) {
          nudgeCollapsedSelection(1);
          return;
        }
        nudgePlayhead(1);
        return;
      }

      const selectedTrackIndex = tracks.findIndex((track) => track.id === selectedTrack.id);
      if (selectedTrackIndex === -1) {
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedTrackId(tracks[Math.max(0, selectedTrackIndex - 1)]!.id);
        setPlayheadNavigationFocused(false);
        clearBlockedSelectionTransfer();
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedTrackId(tracks[Math.min(tracks.length - 1, selectedTrackIndex + 1)]!.id);
        setPlayheadNavigationFocused(false);
        clearBlockedSelectionTransfer();
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
    clearBlockedSelectionTransfer,
    commitProjectChange,
    defaultPitch,
    deleteNote,
    contentSelection,
    isPlaying,
    onComposerPlay,
    onComposerStop,
    pitchPickerOpen,
    playbackEndBeat,
    playheadBeat,
    previewPitchPickerOpen,
    previewDefaultPitchNow,
    playheadNavigationFocused,
    projectGridBeats,
    recordPhase,
    selectionActionPopoverCollapsed,
    selectionKind,
    tracks,
    selectedTrack,
    setContentSelection,
    setDefaultPitch,
    setPlayheadBeatFromUser,
    setSelectedTrackId,
    setPlacedNote,
    releasePlacementPreview,
    startPlacementPreview,
    expandSelectionActionPopover,
    toggleTrackMacroPanel,
    view
  ]);

  return {
    activePlacement,
    ghostPreviewNote,
    playheadNavigationFocused
    ,
    selectedNoteTabStopFocusToken,
    returnSelectionFocusToPlayhead
  };
}

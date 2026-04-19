"use client";

import { RefObject, useCallback, useEffect, useRef, useState } from "react";
import { AudioEngine } from "@/audio/engine";
import {
  KEYBOARD_NOTE_PREVIEW_MAX_PITCH,
  KEYBOARD_NOTE_PREVIEW_MIN_PITCH,
  trackHasNoteAtBeat,
  upsertKeyboardPlacedNote
} from "@/lib/hardwareNavigation";
import { createId } from "@/lib/ids";
import { DEFAULT_NOTE_VELOCITY } from "@/lib/noteDefaults";
import { snapToGrid, snapUpToGrid } from "@/lib/musicTiming";
import { pitchToVoct, transposePitch } from "@/lib/pitch";
import { Project, Track } from "@/types/music";

type WorkspaceView = "composer" | "patch-workspace";

interface ActiveKeyboardPlacement {
  noteId: string;
  trackId: string;
  startBeat: number;
  durationBeats: number;
  startedAtMs: number;
  previewStepsPlayed: number;
}

interface GhostPreviewNote {
  trackId: string;
  startBeat: number;
  durationBeats: number;
  pitchStr: string;
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
  setDefaultPitch: (pitch: string) => void;
  setSelectedTrackId: (trackId: string) => void;
  setPlayheadBeatFromUser: (beat: number) => void;
  toggleTrackMacroPanel: (trackId: string, expanded: boolean) => void;
  commitProjectChange: (updater: (current: Project) => Project, options?: { actionKey?: string; coalesce?: boolean }) => void;
  audioEngineRef: RefObject<AudioEngine | null>;
  previewSelectedPatchNow: (pitch?: string) => void;
  onComposerPlay: () => void;
  onComposerStop: () => void;
  setRuntimeError: (message: string | null) => void;
}

const GHOST_PREVIEW_DELAY_MS = 2000;

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
  setDefaultPitch,
  setSelectedTrackId,
  setPlayheadBeatFromUser,
  toggleTrackMacroPanel,
  commitProjectChange,
  audioEngineRef,
  previewSelectedPatchNow,
  onComposerPlay,
  onComposerStop,
  setRuntimeError
}: UseHardwareNavigationShortcutsArgs) {
  const [activePlacement, setActivePlacement] = useState<ActiveKeyboardPlacement | null>(null);
  const [ghostPreviewNote, setGhostPreviewNote] = useState<GhostPreviewNote | null>(null);
  const placementRafRef = useRef<number | null>(null);

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

  const previewPlacementStep = useCallback((trackId: string) => {
    audioEngineRef.current
      ?.previewNote(trackId, pitchToVoct(defaultPitch), projectGridBeats, DEFAULT_NOTE_VELOCITY)
      .catch((error) => setRuntimeError((error as Error).message));
  }, [audioEngineRef, defaultPitch, projectGridBeats, setRuntimeError]);

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
        const previewStepsPlayed = Math.max(1, Math.round(durationBeats / projectGridBeats));
        setPlacedNote(activePlacement.trackId, activePlacement.noteId, activePlacement.startBeat, durationBeats, defaultPitch);
        setActivePlacement((current) =>
          current
            ? {
                ...current,
                durationBeats,
                previewStepsPlayed
              }
            : current
        );
        if (previewStepsPlayed > activePlacement.previewStepsPlayed) {
          previewPlacementStep(activePlacement.trackId);
        }
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
  }, [activePlacement, defaultPitch, previewPlacementStep, projectGridBeats, projectTempo, setPlacedNote]);

  useEffect(() => {
    if (
      view !== "composer" ||
      !selectedTrack ||
      activePlacement ||
      isPlaying ||
      recordPhase !== "idle" ||
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

    const timer = window.setTimeout(() => {
      setGhostPreviewNote({
        trackId: selectedTrack.id,
        startBeat: snappedPlayheadBeat,
        durationBeats: projectGridBeats,
        pitchStr: defaultPitch
      });
    }, GHOST_PREVIEW_DELAY_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    activePlacement,
    defaultPitch,
    isPlaying,
    pitchPickerOpen,
    playheadBeat,
    previewPitchPickerOpen,
    projectGridBeats,
    recordPhase,
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
    const finishPlacement = () => {
      setActivePlacement(null);
    };

    const startPlacement = () => {
      if (view !== "composer" || !selectedTrack || isPlaying || recordPhase !== "idle" || activePlacement) {
        return;
      }
      const startBeat = Math.max(0, snapToGrid(playheadBeat, projectGridBeats));
      const noteId = createId("note");
      setPlacedNote(selectedTrack.id, noteId, startBeat, projectGridBeats, defaultPitch);
      previewPlacementStep(selectedTrack.id);
      setGhostPreviewNote(null);
      setActivePlacement({
        noteId,
        trackId: selectedTrack.id,
        startBeat,
        durationBeats: projectGridBeats,
        startedAtMs: performance.now(),
        previewStepsPlayed: 1
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
      if (view === "patch-workspace") {
        previewSelectedPatchNow(nextPitch);
      }
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
          previewSelectedPatchNow();
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

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setPlayheadBeatFromUser(Math.max(0, snapToGrid(playheadBeat - projectGridBeats, projectGridBeats)));
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        setPlayheadBeatFromUser(Math.min(playbackEndBeat, snapToGrid(playheadBeat + projectGridBeats, projectGridBeats)));
        return;
      }

      const selectedTrackIndex = tracks.findIndex((track) => track.id === selectedTrack.id);
      if (selectedTrackIndex === -1) {
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedTrackId(tracks[Math.max(0, selectedTrackIndex - 1)]!.id);
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedTrackId(tracks[Math.min(tracks.length - 1, selectedTrackIndex + 1)]!.id);
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
    defaultPitch,
    isPlaying,
    onComposerPlay,
    onComposerStop,
    pitchPickerOpen,
    playbackEndBeat,
    playheadBeat,
    previewPitchPickerOpen,
    previewSelectedPatchNow,
    projectGridBeats,
    recordPhase,
    tracks,
    selectedTrack,
    setDefaultPitch,
    setPlayheadBeatFromUser,
    setSelectedTrackId,
    setPlacedNote,
    previewPlacementStep,
    toggleTrackMacroPanel,
    view
  ]);

  return {
    activePlacement,
    ghostPreviewNote
  };
}

"use client";

import { RefObject, useCallback, useEffect, useRef, useState } from "react";
import { AudioEngine } from "@/audio/engine";
import { createId } from "@/lib/ids";
import { keyToPitch, pitchToVoct } from "@/lib/pitch";
import { eraseNotesInBeatRange } from "@/lib/noteEditing";
import { formatBeatName, snapDownToGrid, snapToGrid } from "@/lib/musicTiming";
import {
  advanceRecordPassEraseBeat,
  applyActiveRecordedNoteExtensions,
  createRecordPassOverwrite,
  getRecordPassProtectedNoteIds,
  markRecordPassGridCellErased,
  RecordPassOverwrite,
  registerRecordPassCreatedNote
} from "@/lib/recordPassOverwrite";
import {
  beginRecordingStart,
  cancelRecordingStart,
  claimRecordingPlaybackStart,
  completeRecordingPlaybackStart,
  createRecordingStartGate
} from "@/lib/recordingStartGate";
import { snapRecordedNoteStartBeat } from "@/lib/recordingTiming";
import { createSproutError, SproutErrorSetter, toError } from "@/lib/sproutErrors";
import { Note, Project, Track } from "@/types/music";

export type RecordPhase = "idle" | "count_in" | "recording";

export interface RecordCountInState {
  cueBeat: number;
  trackId: string;
  startedAtMs: number;
  beats: number;
  token: number;
}

interface ActiveRecordNote {
  noteId: string;
  startBeat: number;
  trackId: string;
  pitchStr: string;
}

const COUNT_IN_BEATS = 3;
const RECORD_DENSE_INPUT_HINT_MS = 2_400;

interface UseRecordingControllerArgs {
  project: Project;
  selectedTrack?: Track;
  playheadBeat: number;
  userCueBeat: number;
  pitchPickerOpen: boolean;
  previewPitchPickerOpen: boolean;
  wasmReady: boolean;
  audioEngineRef: RefObject<AudioEngine | null>;
  commitProjectChange: (
    updater: (current: Project) => Project,
    options?: { actionKey?: string; coalesce?: boolean }
  ) => void;
  upsertNote: (trackId: string, note: Note, options?: { actionKey?: string; coalesce?: boolean }) => void;
  updateNote: (
    trackId: string,
    noteId: string,
    patch: Partial<Note>,
    options?: { actionKey?: string; coalesce?: boolean }
  ) => void;
  setPlaying: (value: boolean) => void;
  setPlayheadBeat: (value: number) => void;
  setRuntimeError: SproutErrorSetter;
  onBeginRecordingPlayback: (trackId: string, cueBeat: number) => Promise<void>;
}

export function useRecordingController(args: UseRecordingControllerArgs) {
  const {
    project,
    selectedTrack,
    playheadBeat,
    userCueBeat,
    pitchPickerOpen,
    previewPitchPickerOpen,
    wasmReady,
    audioEngineRef,
    commitProjectChange,
    upsertNote,
    updateNote,
    setPlaying,
    setPlayheadBeat,
    setRuntimeError,
    onBeginRecordingPlayback
  } = args;

  const [recordEnabled, setRecordEnabled] = useState(false);
  const [recordPhase, setRecordPhase] = useState<RecordPhase>("idle");
  const [recordCountIn, setRecordCountIn] = useState<RecordCountInState | null>(null);
  const [countInNowMs, setCountInNowMs] = useState(0);
  const [recordingTrackId, setRecordingTrackId] = useState<string | null>(null);
  const [recordingHintText, setRecordingHintText] = useState<string | null>(null);

  const activeRecordKeys = useRef<Map<string, ActiveRecordNote>>(new Map());
  const recordPassRef = useRef<RecordPassOverwrite | null>(null);
  const countInRafRef = useRef<number | null>(null);
  const hintTimerRef = useRef<number | null>(null);
  const recordingStartGateRef = useRef(createRecordingStartGate());

  const eraseRecordedWindow = useCallback(
    (trackId: string, fromBeat: number, toBeat: number) => {
      const eraseStartBeat = snapDownToGrid(fromBeat, project.global.gridBeats);
      const eraseEndBeat = snapDownToGrid(toBeat, project.global.gridBeats);
      if (eraseEndBeat <= eraseStartBeat) {
        return;
      }

      const protectedNoteIds = getRecordPassProtectedNoteIds(
        recordPassRef.current,
        trackId,
        Array.from(activeRecordKeys.current.values()).map((entry) => entry.noteId)
      );
      commitProjectChange(
        (current) => {
          let changed = false;
          const tracks = current.tracks.map((track) => {
            if (track.id !== trackId) {
              return track;
            }
            const nextNotes = eraseNotesInBeatRange(track.notes, eraseStartBeat, eraseEndBeat, protectedNoteIds);
            if (
              nextNotes.length === track.notes.length &&
              nextNotes.every((note, index) => {
                const previous = track.notes[index];
                return (
                  previous &&
                  previous.id === note.id &&
                  previous.startBeat === note.startBeat &&
                  previous.durationBeats === note.durationBeats
                );
              })
            ) {
              return track;
            }
            changed = true;
            return { ...track, notes: nextNotes };
          });
          return changed ? { ...current, tracks } : current;
        },
        { actionKey: `track:${trackId}:record-overwrite`, coalesce: true }
      );
    },
    [commitProjectChange, project.global.gridBeats]
  );

  const showRecordingHint = useCallback((message: string) => {
    setRecordingHintText(message);
    if (hintTimerRef.current !== null) {
      window.clearTimeout(hintTimerRef.current);
    }
    hintTimerRef.current = window.setTimeout(() => {
      setRecordingHintText(null);
      hintTimerRef.current = null;
    }, RECORD_DENSE_INPUT_HINT_MS);
  }, []);

  const eraseRecordedGridCellOnce = useCallback(
    (trackId: string, startBeat: number) => {
      if (!markRecordPassGridCellErased(recordPassRef.current, trackId, startBeat)) {
        showRecordingHint("One note already landed in this grid step; keeping the existing note.");
        return;
      }
      eraseRecordedWindow(trackId, startBeat, startBeat + project.global.gridBeats);
    },
    [eraseRecordedWindow, project.global.gridBeats, showRecordingHint]
  );

  const extendActiveRecordedNotes = useCallback(
    (endBeat: number) => {
      const updates = Array.from(activeRecordKeys.current.values()).map((entry) => ({
        ...entry,
        durationBeats: Math.max(project.global.gridBeats, endBeat - entry.startBeat)
      }));
      if (updates.length === 0) {
        return;
      }

      commitProjectChange(
        (current) => {
          let changed = false;
          const tracks = current.tracks.map((track) => {
            const trackUpdates = updates.filter((entry) => entry.trackId === track.id);
            if (trackUpdates.length === 0) {
              return track;
            }
            const nextNotes = applyActiveRecordedNoteExtensions({
              activeNoteIds: Array.from(activeRecordKeys.current.values()).map((entry) => entry.noteId),
              gridBeats: project.global.gridBeats,
              notes: track.notes,
              recordPass: recordPassRef.current,
              trackId: track.id,
              updates: trackUpdates
            });
            if (
              nextNotes.length === track.notes.length &&
              nextNotes.every((note, index) => {
                const previous = track.notes[index];
                return (
                  previous &&
                  previous.id === note.id &&
                  previous.startBeat === note.startBeat &&
                  previous.durationBeats === note.durationBeats
                );
              })
            ) {
              return track;
            }
            changed = true;
            return changed ? { ...track, notes: nextNotes } : track;
          });
          return changed ? { ...current, tracks } : current;
        },
        { actionKey: "record:extend-active-notes", coalesce: true }
      );
    },
    [commitProjectChange, project.global.gridBeats]
  );

  const finishActiveRecordedNotes = useCallback(
    (endBeat: number) => {
      const snappedEndBeat = snapToGrid(endBeat, project.global.gridBeats);
      const updates = Array.from(activeRecordKeys.current.values()).map((entry) => ({
        ...entry,
        durationBeats: Math.max(project.global.gridBeats, snappedEndBeat - entry.startBeat)
      }));
      if (updates.length > 0) {
        commitProjectChange(
          (current) => ({
            ...current,
            tracks: current.tracks.map((track) => {
              const trackUpdates = updates.filter((entry) => entry.trackId === track.id);
              if (trackUpdates.length === 0) {
                return track;
              }
              const nextNotes = applyActiveRecordedNoteExtensions({
                activeNoteIds: Array.from(activeRecordKeys.current.values()).map((entry) => entry.noteId),
                gridBeats: project.global.gridBeats,
                notes: track.notes,
                recordPass: recordPassRef.current,
                trackId: track.id,
                updates: trackUpdates
              });
              return { ...track, notes: nextNotes };
            })
          }),
          { actionKey: "record:finish-active-notes", coalesce: true }
        );
      }
      for (const entry of updates) {
        audioEngineRef.current?.recordNoteOff(entry.trackId, entry.noteId);
      }
      activeRecordKeys.current.clear();
    },
    [audioEngineRef, commitProjectChange, project.global.gridBeats]
  );

  const stopRecordSession = useCallback(
    (finalBeat?: number) => {
      cancelRecordingStart(recordingStartGateRef.current);
      if (recordPhase === "recording") {
        finishActiveRecordedNotes(finalBeat ?? playheadBeat);
      } else {
        activeRecordKeys.current.clear();
      }
      audioEngineRef.current?.setRecordingTrack(null);
      recordPassRef.current = null;
      setRecordingTrackId(null);
      setRecordEnabled(false);
      setRecordPhase("idle");
      setRecordCountIn(null);
      setRecordingHintText(null);
      if (hintTimerRef.current !== null) {
        window.clearTimeout(hintTimerRef.current);
        hintTimerRef.current = null;
      }
    },
    [audioEngineRef, finishActiveRecordedNotes, playheadBeat, recordPhase]
  );

  const handlePlayheadBeat = useCallback(
    (beat: number) => {
      if (recordPhase === "recording" && activeRecordKeys.current.size > 0) {
        extendActiveRecordedNotes(beat);
      }

      if (recordPassRef.current) {
        const eraseRange = advanceRecordPassEraseBeat(recordPassRef.current, beat, project.global.gridBeats);
        if (eraseRange) {
          eraseRecordedWindow(recordPassRef.current.trackId, eraseRange.fromBeat, eraseRange.toBeat);
        }
      }
    },
    [eraseRecordedWindow, extendActiveRecordedNotes, project.global.gridBeats, recordPhase]
  );

  const beginRecordingPlayback = useCallback(
    async (trackId: string, cueBeat: number, token: number) => {
      await onBeginRecordingPlayback(trackId, cueBeat);
      const startCompletion = completeRecordingPlaybackStart(recordingStartGateRef.current, token);
      if (!startCompletion.current) {
        if (startCompletion.ownsPlaybackStart) {
          audioEngineRef.current?.stop();
          setPlaying(false);
        }
        return;
      }
      recordPassRef.current = createRecordPassOverwrite(trackId, cueBeat);
      setRecordingTrackId(trackId);
      setRecordPhase("recording");
      setRecordCountIn(null);
      setPlaying(true);
    },
    [audioEngineRef, onBeginRecordingPlayback, setPlaying]
  );

  const startRecordMode = useCallback(async () => {
    if (!wasmReady) {
      setRuntimeError(
        createSproutError({
          source: "recording",
          code: "renderer_not_ready",
          severity: "error",
          message: "The default WASM renderer is not ready.",
          error: new Error("The default WASM renderer is not ready."),
          details: { phase: "start" }
        })
      );
      return;
    }
    if (!selectedTrack) {
      return;
    }

    const token = beginRecordingStart(recordingStartGateRef.current);
    const countIn: RecordCountInState = {
      cueBeat: userCueBeat,
      trackId: selectedTrack.id,
      startedAtMs: performance.now(),
      beats: COUNT_IN_BEATS,
      token
    };
    setPlayheadBeat(userCueBeat);
    setRecordingTrackId(selectedTrack.id);
    setRecordEnabled(true);
    setRecordCountIn(countIn);
    setCountInNowMs(countIn.startedAtMs);
    setRecordPhase("count_in");
  }, [selectedTrack, setPlayheadBeat, setRuntimeError, userCueBeat, wasmReady]);

  useEffect(() => {
    if (!recordCountIn) {
      if (countInRafRef.current !== null) {
        cancelAnimationFrame(countInRafRef.current);
        countInRafRef.current = null;
      }
      return;
    }

    const beatDurationMs = (60 / project.global.tempo) * 1000;
    const totalDurationMs = recordCountIn.beats * beatDurationMs;

    const tick = () => {
      const now = performance.now();
      setCountInNowMs(now);
      if (now - recordCountIn.startedAtMs >= totalDurationMs) {
        countInRafRef.current = null;
        if (!claimRecordingPlaybackStart(recordingStartGateRef.current, recordCountIn.token)) {
          return;
        }
        setRecordCountIn(null);
        void beginRecordingPlayback(recordCountIn.trackId, recordCountIn.cueBeat, recordCountIn.token).catch(
          (error) => {
            const startCompletion = completeRecordingPlaybackStart(recordingStartGateRef.current, recordCountIn.token);
            if (!startCompletion.current) {
              return;
            }
            setRecordPhase("idle");
            setRecordCountIn(null);
            const recordingError = toError(error);
            setRuntimeError(
              createSproutError({
                source: "recording",
                code: "start_playback_failed",
                severity: "error",
                message: `Recording playback failed: ${recordingError.message}`,
                error: recordingError,
                details: { phase: "count_in_complete" }
              })
            );
          }
        );
        return;
      }
      countInRafRef.current = requestAnimationFrame(tick);
    };

    countInRafRef.current = requestAnimationFrame(tick);
    return () => {
      if (countInRafRef.current !== null) {
        cancelAnimationFrame(countInRafRef.current);
        countInRafRef.current = null;
      }
    };
  }, [beginRecordingPlayback, project.global.tempo, recordCountIn, setRuntimeError]);

  const startRecordedNote = useCallback(
    (inputId: string, pitch: string) => {
      if (recordPhase !== "recording" || !recordingTrackId) {
        return;
      }
      if (activeRecordKeys.current.has(inputId)) {
        return;
      }

      const track = project.tracks.find((entry) => entry.id === recordingTrackId);
      if (!track) {
        return;
      }

      const currentBeat = snapRecordedNoteStartBeat(
        audioEngineRef.current?.getPlayheadBeat() ?? playheadBeat,
        project.global.gridBeats,
        project.global.tempo
      );
      if (activeRecordKeys.current.size > 0) {
        finishActiveRecordedNotes(currentBeat);
      }
      eraseRecordedGridCellOnce(recordingTrackId, currentBeat);

      const noteId = createId("note");
      const pitchVoct = pitchToVoct(pitch);
      const noteEntry: ActiveRecordNote = {
        noteId,
        startBeat: currentBeat,
        trackId: recordingTrackId,
        pitchStr: pitch
      };
      activeRecordKeys.current.set(inputId, noteEntry);
      registerRecordPassCreatedNote(recordPassRef.current, recordingTrackId, noteId);

      upsertNote(
        recordingTrackId,
        {
          id: noteId,
          pitchStr: pitch,
          startBeat: currentBeat,
          durationBeats: project.global.gridBeats,
          velocity: 0.9
        },
        { actionKey: `track:${recordingTrackId}:record-note:${noteId}`, coalesce: true }
      );
      void audioEngineRef.current?.recordNoteOn(recordingTrackId, noteId, pitchVoct, 0.9).catch((error) => {
        const noteError = toError(error);
        setRuntimeError(
          createSproutError({
            source: "recording",
            code: "note_on_failed",
            severity: "error",
            message: `Recording note preview failed: ${noteError.message}`,
            error: noteError,
            details: { phase: "record_note_on", trackId: recordingTrackId, noteId }
          })
        );
      });
    },
    [
      audioEngineRef,
      eraseRecordedGridCellOnce,
      finishActiveRecordedNotes,
      playheadBeat,
      project.global.gridBeats,
      project.global.tempo,
      project.tracks,
      recordPhase,
      recordingTrackId,
      setRuntimeError,
      upsertNote
    ]
  );

  const stopRecordedInput = useCallback(
    (inputId: string) => {
      const active = activeRecordKeys.current.get(inputId);
      if (!active) {
        return;
      }
      activeRecordKeys.current.delete(inputId);

      const endBeat = snapToGrid(audioEngineRef.current?.getPlayheadBeat() ?? playheadBeat, project.global.gridBeats);
      const durationBeats = Math.max(project.global.gridBeats, endBeat - active.startBeat);
      updateNote(
        active.trackId,
        active.noteId,
        { durationBeats },
        { actionKey: `track:${active.trackId}:record-note:${active.noteId}`, coalesce: true }
      );
      audioEngineRef.current?.recordNoteOff(active.trackId, active.noteId);
    },
    [audioEngineRef, playheadBeat, project.global.gridBeats, updateNote]
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (pitchPickerOpen || previewPitchPickerOpen) return;
      if (recordPhase !== "recording") return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA")) {
        return;
      }

      const pitch = keyToPitch(event.key);
      if (!pitch) return;
      event.preventDefault();
      startRecordedNote(event.key, pitch);
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (pitchPickerOpen) return;
      stopRecordedInput(event.key);
    };

    const onBlur = () => {
      finishActiveRecordedNotes(audioEngineRef.current?.getPlayheadBeat() ?? playheadBeat);
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
    audioEngineRef,
    finishActiveRecordedNotes,
    pitchPickerOpen,
    playheadBeat,
    previewPitchPickerOpen,
    recordPhase,
    startRecordedNote,
    stopRecordedInput
  ]);

  useEffect(() => {
    const recordingStartGate = recordingStartGateRef.current;
    return () => {
      cancelRecordingStart(recordingStartGate);
      if (hintTimerRef.current !== null) {
        window.clearTimeout(hintTimerRef.current);
      }
    };
  }, []);

  const activeRecordingTrackId =
    recordingTrackId ?? recordCountIn?.trackId ?? (recordEnabled ? (selectedTrack?.id ?? null) : null);
  const pressedRecordingPitches = Array.from(activeRecordKeys.current.values()).map((entry) => entry.pitchStr);
  const activeRecordedNotes = Array.from(activeRecordKeys.current.values()).map((entry) => ({
    trackId: entry.trackId,
    noteId: entry.noteId,
    startBeat: entry.startBeat
  }));
  const countInProgressBeats = recordCountIn
    ? Math.min(recordCountIn.beats, ((countInNowMs - recordCountIn.startedAtMs) / 1000) * (project.global.tempo / 60))
    : 0;
  const ghostPlayheadBeat = recordCountIn ? recordCountIn.cueBeat - recordCountIn.beats + countInProgressBeats : null;
  const countInLabel = recordCountIn
    ? String(Math.max(1, Math.ceil(recordCountIn.beats - countInProgressBeats)))
    : null;
  const recordStatusText =
    recordPhase === "count_in"
      ? recordCountIn
        ? `Starts on beat ${formatBeatName(recordCountIn.cueBeat, project.global.gridBeats)}`
        : "Starting recording..."
      : selectedTrack
        ? `Writing on ${selectedTrack.name}`
        : "";

  return {
    recordEnabled,
    recordPhase,
    recordCountIn,
    recordingTrackId,
    activeRecordingTrackId,
    pressedRecordingPitches,
    recordingHintText,
    activeRecordedNotes,
    ghostPlayheadBeat,
    countInLabel,
    recordStatusText,
    setRecordEnabled,
    startRecordMode,
    stopRecordSession,
    handlePlayheadBeat,
    startRecordedNote,
    stopRecordedInput
  };
}

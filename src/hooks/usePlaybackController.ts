"use client";

import { RefObject, useCallback, useEffect, useRef } from "react";
import { AudioEngine } from "@/audio/engine";
import { AudioEnginePlayOptions } from "@/audio/engineBackends";
import { getLoopPlaybackEndBeat } from "@/lib/looping";
import { createSproutError, SproutErrorSetter } from "@/lib/sproutErrors";
import { Project } from "@/types/music";
import { AudioProject } from "@/types/audio";

interface UsePlaybackControllerArgs {
  project: Project;
  audioProject: AudioProject;
  playbackEndBeat: number;
  userCueBeat: number;
  playheadBeat: number;
  wasmReady: boolean;
  audioEngineRef: RefObject<AudioEngine | null>;
  setPlaying: (value: boolean) => void;
  setPlayheadBeat: (value: number) => void;
  setRuntimeError: SproutErrorSetter;
  onStopRecordingSession: (finalBeat?: number) => void;
  onHandleRecordingBeat: (beat: number) => void;
}

export function usePlaybackController(args: UsePlaybackControllerArgs) {
  const {
    project,
    audioProject,
    playbackEndBeat,
    userCueBeat,
    playheadBeat,
    wasmReady,
    audioEngineRef,
    setPlaying,
    setPlayheadBeat,
    setRuntimeError,
    onStopRecordingSession,
    onHandleRecordingBeat
  } = args;

  const rafRef = useRef<number | null>(null);
  const playbackEndBeatRef = useRef(playbackEndBeat);
  const projectRef = useRef(project);
  const userCueBeatRef = useRef(userCueBeat);
  const stopRecordingSessionRef = useRef(onStopRecordingSession);
  const handleRecordingBeatRef = useRef(onHandleRecordingBeat);

  playbackEndBeatRef.current = playbackEndBeat;
  projectRef.current = project;
  userCueBeatRef.current = userCueBeat;
  stopRecordingSessionRef.current = onStopRecordingSession;
  handleRecordingBeatRef.current = onHandleRecordingBeat;

  const stopPlayback = useCallback(
    (resetToCue = false) => {
      stopRecordingSessionRef.current();
      audioEngineRef.current?.stop();
      setPlaying(false);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (resetToCue) {
        setPlayheadBeat(userCueBeatRef.current);
      }
    },
    [audioEngineRef, setPlaying, setPlayheadBeat]
  );

  const tickPlayhead = useCallback(() => {
    if (!audioEngineRef.current) return;
    const beat = audioEngineRef.current.getPlayheadBeat();
    setPlayheadBeat(beat);
    handleRecordingBeatRef.current(beat);

    const cueBeat = userCueBeatRef.current;
    const playbackStopBeat = getLoopPlaybackEndBeat(projectRef.current, cueBeat, playbackEndBeatRef.current) - cueBeat;
    if (playbackStopBeat > 0 && audioEngineRef.current.getElapsedPlaybackBeat() >= playbackStopBeat - 0.0001) {
      stopPlayback(true);
      return;
    }

    rafRef.current = window.requestAnimationFrame(tickPlayhead);
  }, [audioEngineRef, setPlayheadBeat, stopPlayback]);

  const beginPlaybackAtBeat = useCallback(
    async (cueBeat: number, options?: AudioEnginePlayOptions) => {
      if (!audioEngineRef.current) {
        audioEngineRef.current = new AudioEngine();
      }
      audioEngineRef.current.setRuntimeErrorListener(setRuntimeError);
      audioEngineRef.current.syncProjectSnapshot(audioProject, { syncToWorklet: true });
      await audioEngineRef.current.play(cueBeat, { recordingTrackId: options?.recordingTrackId ?? null });
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
      rafRef.current = requestAnimationFrame(tickPlayhead);
    },
    [audioEngineRef, audioProject, setRuntimeError, tickPlayhead]
  );

  const seekPlaybackToBeat = useCallback(
    async (cueBeat: number) => {
      userCueBeatRef.current = cueBeat;
      await beginPlaybackAtBeat(cueBeat);
    },
    [beginPlaybackAtBeat]
  );

  const startPlayback = useCallback(async () => {
    if (!wasmReady) {
      setRuntimeError(
        createSproutError({
          source: "audio_playback",
          severity: "error",
          message: "The default WASM renderer is not ready.",
          error: "The default WASM renderer is not ready.",
          phase: "start"
        })
      );
      return;
    }
    setPlaying(true);
    await beginPlaybackAtBeat(playheadBeat);
  }, [beginPlaybackAtBeat, playheadBeat, setPlaying, setRuntimeError, wasmReady]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
      audioEngineRef.current?.stop();
    };
  }, [audioEngineRef]);

  return { stopPlayback, beginPlaybackAtBeat, seekPlaybackToBeat, startPlayback };
}

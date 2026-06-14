"use client";

import { RefObject, useCallback, useEffect, useRef, useState } from "react";
import { AudioEngine } from "@/audio/engine";
import { AudioEnginePlayOptions } from "@/audio/engineBackends";
import { getLoopPlaybackEndBeat } from "@/lib/looping";
import { createSproutError, SproutErrorSetter } from "@/lib/sproutErrors";
import { Project } from "@/types/music";
import { AudioRenderProject } from "@/types/audio";

interface UsePlaybackControllerArgs {
  project: Project;
  renderProject: AudioRenderProject;
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

export type PlaybackStopMode = "reset" | "continue";

export const shouldResetPlayheadOnStop = (playMode: PlaybackStopMode, options?: { resetToCue?: boolean }) =>
  options?.resetToCue ?? playMode === "reset";

export function usePlaybackController(args: UsePlaybackControllerArgs) {
  const {
    project,
    renderProject,
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
  const [playMode, setPlayMode] = useState<PlaybackStopMode>("reset");
  const playModeRef = useRef<PlaybackStopMode>("reset");
  const playbackEndBeatRef = useRef(playbackEndBeat);
  const projectRef = useRef(project);
  const userCueBeatRef = useRef(userCueBeat);
  const stopRecordingSessionRef = useRef(onStopRecordingSession);
  const handleRecordingBeatRef = useRef(onHandleRecordingBeat);

  playModeRef.current = playMode;
  playbackEndBeatRef.current = playbackEndBeat;
  projectRef.current = project;
  userCueBeatRef.current = userCueBeat;
  stopRecordingSessionRef.current = onStopRecordingSession;
  handleRecordingBeatRef.current = onHandleRecordingBeat;

  const stopPlayback = useCallback(
    (options?: { resetToCue?: boolean }) => {
      stopRecordingSessionRef.current();
      audioEngineRef.current?.stop();
      setPlaying(false);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      const resetToCue = shouldResetPlayheadOnStop(playModeRef.current, options);
      if (resetToCue) {
        setPlayheadBeat(userCueBeatRef.current);
      }
    },
    [audioEngineRef, setPlaying, setPlayheadBeat]
  );

  const tickPlayhead = useCallback(() => {
    if (!audioEngineRef.current) return;
    const beat = audioEngineRef.current.getPlayheadBeat();
    const clampedBeat = Math.min(beat, playbackEndBeatRef.current);
    setPlayheadBeat(clampedBeat);
    handleRecordingBeatRef.current(clampedBeat);

    const cueBeat = userCueBeatRef.current;
    const playbackStopBeat = getLoopPlaybackEndBeat(projectRef.current, cueBeat, playbackEndBeatRef.current) - cueBeat;
    if (
      clampedBeat >= playbackEndBeatRef.current - 0.0001 ||
      (playbackStopBeat > 0 && audioEngineRef.current.getElapsedPlaybackBeat() >= playbackStopBeat - 0.0001)
    ) {
      stopPlayback({ resetToCue: true });
      return;
    }

    rafRef.current = window.requestAnimationFrame(tickPlayhead);
  }, [audioEngineRef, setPlayheadBeat, stopPlayback]);

  const beginPlaybackAtBeat = useCallback(
    async (cueBeat: number, options?: AudioEnginePlayOptions) => {
      const clampedCueBeat = Math.min(Math.max(0, cueBeat), playbackEndBeatRef.current);
      userCueBeatRef.current = clampedCueBeat;
      setPlayheadBeat(clampedCueBeat);
      if (clampedCueBeat >= playbackEndBeatRef.current - 0.0001) {
        setPlaying(false);
        return;
      }
      if (!audioEngineRef.current) {
        audioEngineRef.current = new AudioEngine();
      }
      audioEngineRef.current.setRuntimeErrorListener(setRuntimeError);
      audioEngineRef.current.syncProjectSnapshot(renderProject, { syncToWorklet: true });
      await audioEngineRef.current.play(clampedCueBeat, { recordingTrackId: options?.recordingTrackId ?? null });
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
      rafRef.current = requestAnimationFrame(tickPlayhead);
    },
    [audioEngineRef, renderProject, setPlaying, setPlayheadBeat, setRuntimeError, tickPlayhead]
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
          code: "renderer_not_ready",
          severity: "error",
          message: "The default WASM renderer is not ready.",
          error: new Error("The default WASM renderer is not ready."),
          details: { phase: "start" }
        })
      );
      return;
    }
    const clampedPlayheadBeat = Math.min(Math.max(0, playheadBeat), playbackEndBeat);
    if (clampedPlayheadBeat >= playbackEndBeat - 0.0001) {
      setPlayheadBeat(clampedPlayheadBeat);
      setPlaying(false);
      return;
    }
    setPlaying(true);
    await beginPlaybackAtBeat(clampedPlayheadBeat);
  }, [beginPlaybackAtBeat, playheadBeat, playbackEndBeat, setPlaying, setPlayheadBeat, setRuntimeError, wasmReady]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
      audioEngineRef.current?.stop();
    };
  }, [audioEngineRef]);

  const togglePlayMode = useCallback(() => {
    setPlayMode((current) => (current === "reset" ? "continue" : "reset"));
  }, []);

  return { stopPlayback, beginPlaybackAtBeat, seekPlaybackToBeat, startPlayback, playMode, togglePlayMode };
}

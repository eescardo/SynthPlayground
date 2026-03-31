"use client";

import { MutableRefObject, useCallback, useEffect, useRef } from "react";
import { AudioEngine } from "@/audio/engine";
import { getLoopPlaybackEndBeat } from "@/lib/looping";
import { Project } from "@/types/music";

interface UsePlaybackControllerArgs {
  project: Project;
  playbackEndBeat: number;
  userCueBeat: number;
  playheadBeat: number;
  strictWasmReady: boolean;
  audioEngineRef: MutableRefObject<AudioEngine | null>;
  setPlaying: (value: boolean) => void;
  setPlayheadBeat: (value: number) => void;
  setRuntimeError: (value: string | null) => void;
  onStopRecordingSession: (finalBeat?: number) => void;
  onHandleRecordingBeat: (beat: number) => void;
}

export function usePlaybackController(args: UsePlaybackControllerArgs) {
  const {
    project,
    playbackEndBeat,
    userCueBeat,
    playheadBeat,
    strictWasmReady,
    audioEngineRef,
    setPlaying,
    setPlayheadBeat,
    setRuntimeError,
    onStopRecordingSession,
    onHandleRecordingBeat
  } = args;

  const rafRef = useRef<number | null>(null);
  const stopRecordingSessionRef = useRef(onStopRecordingSession);
  const handleRecordingBeatRef = useRef(onHandleRecordingBeat);

  stopRecordingSessionRef.current = onStopRecordingSession;
  handleRecordingBeatRef.current = onHandleRecordingBeat;

  const stopPlayback = useCallback((resetToCue = false) => {
    stopRecordingSessionRef.current();
    audioEngineRef.current?.stop();
    setPlaying(false);
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (resetToCue) {
      setPlayheadBeat(userCueBeat);
    }
  }, [audioEngineRef, setPlaying, setPlayheadBeat, userCueBeat]);

  const tickPlayhead = useCallback(() => {
    if (!audioEngineRef.current) return;
    const beat = audioEngineRef.current.getPlayheadBeat();
    setPlayheadBeat(beat);
    handleRecordingBeatRef.current(beat);

    const playbackStopBeat = getLoopPlaybackEndBeat(project, userCueBeat, playbackEndBeat) - userCueBeat;
    if (playbackStopBeat > 0 && audioEngineRef.current.getElapsedPlaybackBeat() >= playbackStopBeat - 0.0001) {
      stopPlayback(true);
      return;
    }

    rafRef.current = window.requestAnimationFrame(tickPlayhead);
  }, [audioEngineRef, playbackEndBeat, project, setPlayheadBeat, stopPlayback, userCueBeat]);

  const beginPlaybackAtBeat = useCallback(async (cueBeat: number) => {
    if (!audioEngineRef.current) {
      audioEngineRef.current = new AudioEngine();
    }
    audioEngineRef.current.setProject(project, { syncToWorklet: true });
    await audioEngineRef.current.play(cueBeat);
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
    }
    rafRef.current = requestAnimationFrame(tickPlayhead);
  }, [audioEngineRef, project, tickPlayhead]);

  const startPlayback = useCallback(async () => {
    if (process.env.NEXT_PUBLIC_STRICT_WASM === "1" && !strictWasmReady) {
      setRuntimeError("Strict WASM mode is enabled and WASM is not ready. Run `npm run dev:wasm:strict`.");
      return;
    }
    setPlaying(true);
    await beginPlaybackAtBeat(playheadBeat);
  }, [beginPlaybackAtBeat, playheadBeat, setPlaying, setRuntimeError, strictWasmReady]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
      audioEngineRef.current?.stop();
    };
  }, [audioEngineRef]);

  return { stopPlayback, beginPlaybackAtBeat, startPlayback };
}

"use client";

import { RefObject, useCallback } from "react";
import { AudioEngine } from "@/audio/engine";
import { pitchToVoct } from "@/lib/pitch";
import { createSproutError, SproutErrorSetter, toError } from "@/lib/sproutErrors";
import { Track } from "@/types/music";

type WorkspaceView = "composer" | "patch-workspace";

interface UseHardwareNavigationPreviewArgs {
  view: WorkspaceView;
  selectedTrack?: Track;
  defaultPitch: string;
  isPlaying: boolean;
  audioEngineRef: RefObject<AudioEngine | null>;
  previewSelectedPatchNow: (pitch?: string) => void;
  releaseHeldPatchPreview: () => void;
  startHeldPatchPreview: (pitch?: string) => void;
  setRuntimeError: SproutErrorSetter;
}

export function useHardwareNavigationPreview({
  view,
  selectedTrack,
  defaultPitch,
  isPlaying,
  audioEngineRef,
  previewSelectedPatchNow,
  releaseHeldPatchPreview,
  startHeldPatchPreview,
  setRuntimeError
}: UseHardwareNavigationPreviewArgs) {
  const previewDefaultPitchNow = useCallback(
    (pitch = defaultPitch) => {
      if (view === "patch-workspace") {
        previewSelectedPatchNow(pitch);
        return;
      }
      if (isPlaying || !selectedTrack) {
        return;
      }
      audioEngineRef.current?.previewNote(selectedTrack.id, pitchToVoct(pitch), 1, 0.9).catch((error) => {
        const previewError = toError(error);
        setRuntimeError(
          createSproutError({
            source: "hardware_navigation",
            code: "preview_failed",
            severity: "error",
            message: `Hardware navigation preview failed: ${previewError.message}`,
            error: previewError,
            details: { phase: "preview_default_pitch", trackId: selectedTrack.id }
          })
        );
      });
    },
    [audioEngineRef, defaultPitch, isPlaying, previewSelectedPatchNow, selectedTrack, setRuntimeError, view]
  );

  const startHeldDefaultPitchPreview = useCallback(
    (pitch = defaultPitch) => {
      if (view === "patch-workspace") {
        startHeldPatchPreview(pitch);
      }
    },
    [defaultPitch, startHeldPatchPreview, view]
  );

  return {
    previewDefaultPitchNow,
    releaseHeldPatchPreview,
    startHeldDefaultPitchPreview
  };
}

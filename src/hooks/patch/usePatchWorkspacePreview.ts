"use client";

import type { Dispatch, RefObject, SetStateAction } from "react";
import { useCallback, useEffect, useState } from "react";
import { toAudioProject } from "@/audio/audioProject";
import { AudioEngine } from "@/audio/engine";
import { DEFAULT_NOTE_PITCH } from "@/lib/noteDefaults";
import { pitchToVoct } from "@/lib/pitch";
import { Patch } from "@/types/patch";
import { Project, Track } from "@/types/music";
import { AudioProject } from "@/types/audio";

const PREVIEW_DURATION_BEATS = 1;

const buildPatchedPreviewProject = (
  project: AudioProject,
  sourceTrack: Track,
  patch: Patch,
  macroValues?: Record<string, number>
): AudioProject => ({
  ...project,
  patches: project.patches.map((entry) => (entry.id === patch.id ? patch : entry)),
  tracks: project.tracks.map((track) =>
    track.id === sourceTrack.id
      ? {
          ...track,
          instrumentPatchId: patch.id,
          macroValues: macroValues ? { ...track.macroValues, ...macroValues } : track.macroValues
        }
      : track
  )
});

interface UsePatchWorkspacePreviewOptions {
  project: Project;
  selectedPatch?: Patch;
  selectedTrack?: Track;
  audioEngineRef: RefObject<AudioEngine | null>;
  playing: boolean;
  setRuntimeError: Dispatch<SetStateAction<string | null>>;
}

export function usePatchWorkspacePreview(options: UsePatchWorkspacePreviewOptions) {
  const {
    project,
    selectedPatch,
    selectedTrack,
    audioEngineRef,
    playing,
    setRuntimeError
  } = options;
  const audioProject = toAudioProject(project);
  const [previewPitch, setPreviewPitch] = useState(DEFAULT_NOTE_PITCH);
  const [previewPitchPickerOpen, setPreviewPitchPickerOpen] = useState(false);
  const [pendingPreview, setPendingPreview] = useState<{
    patchId: string;
    nonce: number;
    patchOverride?: Patch;
    macroValues?: Record<string, number>;
  } | null>(null);

  const schedulePatchPreview = useCallback((patchId: string, patchOverride?: Patch, macroValues?: Record<string, number>) => {
    setPendingPreview({ patchId, nonce: Date.now(), patchOverride, macroValues });
  }, []);

  const previewPatchById = useCallback((patchId: string, pitch = previewPitch, macroValues?: Record<string, number>, patchOverride?: Patch) => {
    if (playing) {
      return;
    }
    const engine = audioEngineRef.current;
    const patch = patchOverride ?? audioProject.patches.find((entry) => entry.id === patchId);
    if (!engine || !patch) {
      return;
    }

    const assignedTrack = audioProject.tracks.find((track) => track.instrumentPatchId === patchId);
    const previewTrack = assignedTrack ?? selectedTrack ?? audioProject.tracks[0];
    if (!previewTrack) {
      return;
    }

    const resolvedMacroValues = macroValues;
    const needsTemporaryBinding = previewTrack.instrumentPatchId !== patchId;
    const needsTemporaryProject = needsTemporaryBinding || Boolean(resolvedMacroValues && Object.keys(resolvedMacroValues).length > 0);
    const previewProject = needsTemporaryProject
      ? buildPatchedPreviewProject(audioProject, previewTrack, patch, resolvedMacroValues)
      : undefined;

    engine
      .previewNote(previewTrack.id, pitchToVoct(pitch), PREVIEW_DURATION_BEATS, 0.9, { projectOverride: previewProject })
      .catch((error) => setRuntimeError((error as Error).message));
  }, [audioEngineRef, audioProject, playing, previewPitch, selectedTrack, setRuntimeError]);

  useEffect(() => {
    if (!pendingPreview || playing) {
      return;
    }
    previewPatchById(pendingPreview.patchId, previewPitch, pendingPreview.macroValues, pendingPreview.patchOverride);
    setPendingPreview(null);
  }, [pendingPreview, playing, previewPatchById, previewPitch]);

  const previewSelectedPatchNow = useCallback((pitch = previewPitch, macroValues?: Record<string, number>) => {
    if (!selectedPatch) {
      return;
    }
    previewPatchById(selectedPatch.id, pitch, macroValues, selectedPatch);
  }, [previewPatchById, previewPitch, selectedPatch]);

  return {
    previewPatchById,
    previewPitch,
    previewPitchPickerOpen,
    previewSelectedPatchNow,
    schedulePatchPreview,
    setPreviewPitch,
    setPreviewPitchPickerOpen
  };
}

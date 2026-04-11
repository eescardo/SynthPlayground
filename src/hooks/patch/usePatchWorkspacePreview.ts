"use client";

import type { Dispatch, RefObject, SetStateAction } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AudioEngine } from "@/audio/engine";
import { DEFAULT_NOTE_PITCH } from "@/lib/noteDefaults";
import { pitchToVoct } from "@/lib/pitch";
import { Patch } from "@/types/patch";
import { Project, Track } from "@/types/music";

const PREVIEW_DURATION_BEATS = 1;
const PREVIEW_RESTORE_PADDING_MS = 60;

const getPreviewDurationMs = (project: Project, durationBeats: number) =>
  Math.max(50, (durationBeats * 60 * 1000) / project.global.tempo + PREVIEW_RESTORE_PADDING_MS);

const buildPatchedPreviewProject = (
  project: Project,
  sourceTrack: Track,
  patch: Patch,
  macroValues?: Record<string, number>
): Project => ({
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
  workspaceMacroValuesByPatchId: Record<string, Record<string, number>>;
  audioEngineRef: RefObject<AudioEngine | null>;
  playing: boolean;
  setRuntimeError: Dispatch<SetStateAction<string | null>>;
}

export function usePatchWorkspacePreview(options: UsePatchWorkspacePreviewOptions) {
  const {
    project,
    selectedPatch,
    selectedTrack,
    workspaceMacroValuesByPatchId,
    audioEngineRef,
    playing,
    setRuntimeError
  } = options;
  const [previewPitch, setPreviewPitch] = useState(DEFAULT_NOTE_PITCH);
  const [previewPitchPickerOpen, setPreviewPitchPickerOpen] = useState(false);
  const [pendingPreview, setPendingPreview] = useState<{ patchId: string; nonce: number } | null>(null);
  const previewRestoreTimerRef = useRef<number | null>(null);
  const temporaryPreviewProjectActiveRef = useRef(false);

  const clearPreviewRestoreTimer = useCallback(() => {
    if (previewRestoreTimerRef.current !== null) {
      window.clearTimeout(previewRestoreTimerRef.current);
      previewRestoreTimerRef.current = null;
    }
  }, []);

  const restoreActualProject = useCallback(() => {
    clearPreviewRestoreTimer();
    if (!temporaryPreviewProjectActiveRef.current) {
      return;
    }
    temporaryPreviewProjectActiveRef.current = false;
    audioEngineRef.current?.setProject(project, { syncToWorklet: true });
  }, [audioEngineRef, clearPreviewRestoreTimer, project]);

  useEffect(() => () => restoreActualProject(), [restoreActualProject]);

  const schedulePatchPreview = useCallback((patchId: string) => {
    setPendingPreview({ patchId, nonce: Date.now() });
  }, []);

  const previewPatchById = useCallback((patchId: string, pitch = previewPitch, macroValues?: Record<string, number>) => {
    if (playing) {
      return;
    }
    const engine = audioEngineRef.current;
    const patch = project.patches.find((entry) => entry.id === patchId);
    if (!engine || !patch) {
      return;
    }

    restoreActualProject();

    const assignedTrack = project.tracks.find((track) => track.instrumentPatchId === patchId);
    const previewTrack = assignedTrack ?? selectedTrack ?? project.tracks[0];
    if (!previewTrack) {
      return;
    }

    const resolvedMacroValues = macroValues ?? workspaceMacroValuesByPatchId[patchId];
    const needsTemporaryBinding = previewTrack.instrumentPatchId !== patchId;
    const needsTemporaryProject = needsTemporaryBinding || Boolean(resolvedMacroValues && Object.keys(resolvedMacroValues).length > 0);
    if (needsTemporaryProject) {
      temporaryPreviewProjectActiveRef.current = true;
      engine.setProject(buildPatchedPreviewProject(project, previewTrack, patch, resolvedMacroValues), { syncToWorklet: true });
    }

    engine
      .previewNote(previewTrack.id, pitchToVoct(pitch), PREVIEW_DURATION_BEATS)
      .catch((error) => setRuntimeError((error as Error).message));

    if (needsTemporaryProject) {
      previewRestoreTimerRef.current = window.setTimeout(() => {
        previewRestoreTimerRef.current = null;
        restoreActualProject();
      }, getPreviewDurationMs(project, PREVIEW_DURATION_BEATS));
    }
  }, [audioEngineRef, playing, previewPitch, project, restoreActualProject, selectedTrack, setRuntimeError, workspaceMacroValuesByPatchId]);

  useEffect(() => {
    if (!pendingPreview || playing) {
      return;
    }
    previewPatchById(pendingPreview.patchId, previewPitch);
    setPendingPreview(null);
  }, [pendingPreview, playing, previewPatchById, previewPitch]);

  const previewSelectedPatchNow = useCallback((pitch = previewPitch) => {
    if (!selectedPatch) {
      return;
    }
    previewPatchById(selectedPatch.id, pitch);
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

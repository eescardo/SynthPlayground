"use client";

import type { Dispatch, RefObject, SetStateAction } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toAudioProject } from "@/audio/audioProject";
import { AudioEngine } from "@/audio/engine";
import { resolvePatchWorkspaceMacroValues } from "@/hooks/patch/usePatchWorkspaceMacroValues";
import { DEFAULT_NOTE_PITCH } from "@/lib/noteDefaults";
import { pitchToVoct } from "@/lib/pitch";
import { hydratePatchSamplePlayerAssetsForRuntime } from "@/lib/sampleAssetLibrary";
import { Patch } from "@/types/patch";
import { Project, Track } from "@/types/music";
import { AudioProject } from "@/types/audio";
import { PatchWorkspaceProbeState, PreviewProbeCapture, PreviewProbeRequest } from "@/types/probes";
import { ProjectAssetLibrary } from "@/types/assets";

const PREVIEW_DURATION_BEATS = 1;
const PREVIEW_PROGRESS_TICK_MS = 33;

export const buildPatchedPreviewProject = (
  project: AudioProject,
  sourceTrack: Track,
  patch: Patch,
  macroValues?: Record<string, number>
): AudioProject => {
  const patchMacroIds = new Set(patch.ui.macros.map((macro) => macro.id));
  const nonPatchMacroValues = Object.fromEntries(
    Object.entries(sourceTrack.macroValues).filter(([macroId]) => !patchMacroIds.has(macroId))
  );
  const previewMacroValues = macroValues
    ? {
        ...nonPatchMacroValues,
        ...resolvePatchWorkspaceMacroValues(patch, macroValues)
      }
    : sourceTrack.macroValues;

  return {
    ...project,
    patches: project.patches.map((entry) => (entry.id === patch.id ? patch : entry)),
    tracks: project.tracks.map((track) =>
      track.id === sourceTrack.id
        ? {
            ...track,
            instrumentPatchId: patch.id,
            macroValues: previewMacroValues
          }
        : track
    )
  };
};

interface UsePatchWorkspacePreviewOptions {
  project: Project;
  projectAssets: ProjectAssetLibrary;
  selectedPatch?: Patch;
  selectedTrack?: Track;
  probes?: PatchWorkspaceProbeState[];
  audioEngineRef: RefObject<AudioEngine | null>;
  playing: boolean;
  setRuntimeError: Dispatch<SetStateAction<string | null>>;
}

export function usePatchWorkspacePreview(options: UsePatchWorkspacePreviewOptions) {
  const {
    project,
    projectAssets,
    selectedPatch,
    selectedTrack,
    probes = [],
    audioEngineRef,
    playing,
    setRuntimeError
  } = options;
  const audioProject = toAudioProject(project, projectAssets);
  const [previewPitch, setPreviewPitch] = useState(DEFAULT_NOTE_PITCH);
  const [previewPitchPickerOpen, setPreviewPitchPickerOpen] = useState(false);
  const [pendingPreview, setPendingPreview] = useState<{
    patchId: string;
    nonce: number;
    patchOverride?: Patch;
    macroValues?: Record<string, number>;
  } | null>(null);
  const [previewProgress, setPreviewProgress] = useState(0);
  const [previewCaptureByProbeId, setPreviewCaptureByProbeId] = useState<Record<string, PreviewProbeCapture>>({});
  const [activePreviewId, setActivePreviewId] = useState<string | null>(null);
  const captureRequests = useMemo<PreviewProbeRequest[]>(
    () =>
      probes.flatMap((probe) =>
        probe.target
          ? [{
              probeId: probe.id,
              kind: probe.kind,
              target: probe.target,
              spectrumWindowSize: probe.spectrumWindowSize
            }]
          : []
      ),
    [probes]
  );

  const schedulePatchPreview = useCallback((patchId: string, patchOverride?: Patch, macroValues?: Record<string, number>) => {
    setPendingPreview({ patchId, nonce: Date.now(), patchOverride, macroValues });
  }, []);

  useEffect(() => {
    const engine = audioEngineRef.current;
    if (!engine) {
      return;
    }
    engine.setPreviewCaptureListener((previewId, captures) => {
      if (previewId && activePreviewId && previewId !== activePreviewId) {
        return;
      }
      setPreviewCaptureByProbeId(Object.fromEntries(captures.map((capture) => [capture.probeId, capture])));
    });
    return () => engine.setPreviewCaptureListener(null);
  }, [activePreviewId, audioEngineRef]);

  useEffect(() => {
    if (!activePreviewId) {
      setPreviewProgress(0);
      return;
    }
    const startedAt = performance.now();
    const durationMs = (PREVIEW_DURATION_BEATS * 60 * 1000) / Math.max(project.global.tempo, 1);
    const tick = () => {
      const nextProgress = Math.min(1, (performance.now() - startedAt) / durationMs);
      setPreviewProgress(nextProgress);
      if (nextProgress >= 1) {
        setActivePreviewId(null);
      }
    };
    tick();
    const timer = window.setInterval(tick, PREVIEW_PROGRESS_TICK_MS);
    return () => window.clearInterval(timer);
  }, [activePreviewId, project.global.tempo]);

  const previewPatchById = useCallback((patchId: string, pitch = previewPitch, macroValues?: Record<string, number>, patchOverride?: Patch) => {
    if (playing) {
      return;
    }
    const engine = audioEngineRef.current;
    const patch = patchOverride
      ? hydratePatchSamplePlayerAssetsForRuntime(patchOverride, projectAssets)
      : audioProject.patches.find((entry) => entry.id === patchId);
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
    const previewId = `preview_${Date.now()}`;
    setActivePreviewId(previewId);
    setPreviewProgress(0);

    engine
      .previewNote(previewTrack.id, pitchToVoct(pitch), PREVIEW_DURATION_BEATS, 0.9, {
        projectOverride: previewProject,
        captureProbes: captureRequests,
        previewId
      })
      .catch((error) => setRuntimeError((error as Error).message));
  }, [audioEngineRef, audioProject, captureRequests, playing, previewPitch, projectAssets, selectedTrack, setRuntimeError]);

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
    previewCaptureByProbeId,
    previewProgress,
    previewPatchById,
    previewPitch,
    previewPitchPickerOpen,
    previewSelectedPatchNow,
    schedulePatchPreview,
    setPreviewPitch,
    setPreviewPitchPickerOpen
  };
}

"use client";

import { useCallback, useMemo, type RefObject } from "react";
import { createTrackEditingActions, type TrackEditingOptions } from "@/lib/appTrackEditing";
import { createPatchLifecycleActions, type PatchLifecycleOptions } from "@/lib/appPatchLifecycle";
import { createTrackAudioActions, type TrackAudioOptions, type TrackAudioEngine } from "@/lib/appTrackAudio";

type UseAppTrackEditingOptions = Omit<
  TrackEditingOptions & PatchLifecycleOptions & TrackAudioOptions,
  "clearWorkspaceSelection" | "getAudioEngine"
> & {
  setSelectedNodeId: (id: string | undefined) => void;
  audioEngineRef: RefObject<TrackAudioEngine | null>;
};

/** React binding only; action ownership and cross-state effects live in testable controllers. */
export function useAppTrackEditing(options: UseAppTrackEditingOptions) {
  const {
    project,
    selectedTrack,
    selectedTrackPatch,
    selectedTrackId,
    patchRemovalDialog,
    setPatchRemovalDialog,
    setSelectedTrackId,
    setSelectedNodeId,
    setRuntimeError,
    commitProjectChange,
    audioEngineRef,
    previewPatchById
  } = options;
  const clearWorkspaceSelection = useCallback(() => setSelectedNodeId(undefined), [setSelectedNodeId]);
  const getAudioEngine = useCallback(() => audioEngineRef.current, [audioEngineRef]);
  const trackActions = useMemo(
    () =>
      createTrackEditingActions({
        project,
        selectedTrack,
        commitProjectChange,
        setSelectedTrackId,
        clearWorkspaceSelection
      }),
    [project, selectedTrack, commitProjectChange, setSelectedTrackId, clearWorkspaceSelection]
  );
  const patchActions = useMemo(
    () =>
      createPatchLifecycleActions({
        project,
        selectedTrack,
        selectedTrackPatch,
        selectedTrackId,
        patchRemovalDialog,
        setPatchRemovalDialog,
        setSelectedTrackId,
        clearWorkspaceSelection,
        setRuntimeError,
        commitProjectChange
      }),
    [
      project,
      selectedTrack,
      selectedTrackPatch,
      selectedTrackId,
      patchRemovalDialog,
      setPatchRemovalDialog,
      setSelectedTrackId,
      clearWorkspaceSelection,
      setRuntimeError,
      commitProjectChange
    ]
  );
  const audioActions = useMemo(
    () =>
      createTrackAudioActions({
        project,
        getAudioEngine,
        previewPatchById,
        setRuntimeError,
        commitProjectChange
      }),
    [project, getAudioEngine, previewPatchById, setRuntimeError, commitProjectChange]
  );
  return { ...trackActions, ...patchActions, ...audioActions };
}

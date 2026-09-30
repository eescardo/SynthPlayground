"use client";

import { useCallback, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { AudioEngine } from "@/audio/engine";
import type { PatchRemovalDialogState } from "@/components/composer/PatchRemovalDialogModal";
import type { usePatchWorkspaceState } from "@/hooks/patch/usePatchWorkspaceState";
import type { CommitProjectChange } from "./useAppProjectChanges";
import { createId } from "@/lib/ids";
import { isPatchRemovable } from "@/lib/patch/source";
import {
  buildPatchRemovalRequest,
  hasInvalidPatchRemovalFallback,
  removePatchFromProject,
  resolveSurvivingTrackIds
} from "@/lib/patch/patchRemoval";
import { pitchToVoct } from "@/lib/pitch";
import { createSproutError, toError, type SproutErrorSetter } from "@/lib/sproutErrors";
import { TRACK_PAN_CENTER } from "@/lib/trackPan";
import {
  moveTrackInProject,
  removeTrackFromProject,
  renameTrackInProject,
  switchTrackPatchInProject
} from "@/lib/trackEdits";
import type { Project, Track } from "@/types/music";
import type { Patch } from "@/types/patch";

interface UseAppTrackEditingOptions {
  project: Project;
  selectedTrack: Track | undefined;
  selectedTrackPatch: Patch | undefined;
  selectedTrackId: string | undefined;
  patchWorkspace: Pick<ReturnType<typeof usePatchWorkspaceState>, "setSelectedNodeId" | "previewPatchById">;
  patchRemovalDialog: PatchRemovalDialogState | null;
  setPatchRemovalDialog: Dispatch<SetStateAction<PatchRemovalDialogState | null>>;
  setSelectedTrackId: Dispatch<SetStateAction<string | undefined>>;
  setRuntimeError: SproutErrorSetter;
  audioEngineRef: RefObject<AudioEngine | null>;
  commitProjectChange: CommitProjectChange;
}

export function useAppTrackEditing({
  project,
  selectedTrack,
  selectedTrackPatch,
  selectedTrackId,
  patchWorkspace,
  patchRemovalDialog,
  setPatchRemovalDialog,
  setSelectedTrackId,
  setRuntimeError,
  audioEngineRef,
  commitProjectChange
}: UseAppTrackEditingOptions) {
  const toggleTrackMute = useCallback(
    (trackId: string) => {
      const currentTrack = project.tracks.find((track) => track.id === trackId);
      if (currentTrack) {
        audioEngineRef.current?.setTrackMuted(trackId, !currentTrack.mute);
      }
      commitProjectChange(
        (current) => ({
          ...current,
          tracks: current.tracks.map((track) => (track.id === trackId ? { ...track, mute: !track.mute } : track))
        }),
        { actionKey: `track:${trackId}:mute` }
      );
    },
    [audioEngineRef, commitProjectChange, project.tracks]
  );
  const addTrack = () => {
    const fallbackPatch = project.patches[0];
    if (!fallbackPatch) return;

    const trackId = createId("track");
    commitProjectChange(
      (current) => ({
        ...current,
        tracks: [
          ...current.tracks,
          {
            id: trackId,
            name: `Track ${current.tracks.length + 1}`,
            instrumentPatchId: fallbackPatch.id,
            notes: [],
            macroValues: {},
            macroAutomations: {},
            macroPanelExpanded: false,
            volume: 1,
            pan: TRACK_PAN_CENTER,
            fx: {
              delayEnabled: false,
              reverbEnabled: false,
              saturationEnabled: false,
              compressorEnabled: false,
              delayMix: 0.2,
              reverbMix: 0.2,
              drive: 0.2,
              compression: 0.4
            }
          }
        ]
      }),
      { actionKey: `track:add:${trackId}` }
    );
    setSelectedTrackId(trackId);
  };

  const renameTrack = useCallback(
    (trackId: string, name: string) => {
      commitProjectChange((current) => renameTrackInProject(current, trackId, name), {
        actionKey: `track:${trackId}:rename`
      });
    },
    [commitProjectChange]
  );

  const removeSelectedTrack = useCallback(() => {
    if (!selectedTrack || project.tracks.length <= 1) {
      return;
    }

    const remainingTracks = project.tracks.filter((track) => track.id !== selectedTrack.id);
    commitProjectChange((current) => removeTrackFromProject(current, selectedTrack.id), {
      actionKey: `track:${selectedTrack.id}:remove`
    });
    setSelectedTrackId(remainingTracks[0]?.id);
    patchWorkspace.setSelectedNodeId(undefined);
  }, [commitProjectChange, patchWorkspace, project.tracks, selectedTrack, setSelectedTrackId]);

  const duplicatePatchForSelectedTrack = () => {
    if (!selectedTrackPatch || !selectedTrack) return;

    const duplicate = structuredClone(selectedTrackPatch);
    duplicate.id = createId("patch");
    duplicate.name = `${selectedTrackPatch.name} Copy`;
    duplicate.meta = { source: "custom" };

    commitProjectChange(
      (current) => ({
        ...current,
        patches: [...current.patches, duplicate],
        tracks: current.tracks.map((track) =>
          track.id === selectedTrack.id ? { ...track, instrumentPatchId: duplicate.id } : track
        )
      }),
      { actionKey: `patch:duplicate:${duplicate.id}` }
    );
  };

  const requestRemoveSelectedTrackPatch = useCallback(() => {
    if (!selectedTrackPatch || !isPatchRemovable(selectedTrackPatch)) {
      return;
    }
    const removalRequest = buildPatchRemovalRequest(project, selectedTrackPatch);
    if (!removalRequest) {
      return;
    }
    if (removalRequest.rows.length === 0) {
      commitProjectChange(
        (current) => ({
          ...current,
          patches: current.patches.filter((patch) => patch.id !== selectedTrackPatch.id)
        }),
        { actionKey: `patch:${selectedTrackPatch.id}:remove` }
      );
      patchWorkspace.setSelectedNodeId(undefined);
      return;
    }
    setPatchRemovalDialog(removalRequest);
  }, [commitProjectChange, patchWorkspace, project, selectedTrackPatch, setPatchRemovalDialog]);

  const confirmRemovePatch = useCallback(() => {
    if (!patchRemovalDialog) {
      return;
    }

    if (hasInvalidPatchRemovalFallback(patchRemovalDialog)) {
      return;
    }
    const nextTrackIds = resolveSurvivingTrackIds(project, patchRemovalDialog);
    if (nextTrackIds.size === 0) {
      setRuntimeError(
        createSproutError({
          source: "patch_workspace",
          code: "remove_patch_last_track",
          severity: "error",
          message: "At least one track must remain in the project.",
          error: new Error("At least one track must remain in the project."),
          details: { phase: "remove_patch" }
        })
      );
      return;
    }

    commitProjectChange((current) => removePatchFromProject(current, patchRemovalDialog), {
      actionKey: `patch:${patchRemovalDialog.patchId}:remove`
    });

    const survivingSelectedTrack =
      selectedTrackId && nextTrackIds.has(selectedTrackId)
        ? selectedTrackId
        : project.tracks.find((track) => nextTrackIds.has(track.id))?.id;
    setSelectedTrackId(survivingSelectedTrack);
    setPatchRemovalDialog(null);
    patchWorkspace.setSelectedNodeId(undefined);
  }, [
    commitProjectChange,
    patchRemovalDialog,
    patchWorkspace,
    project,
    selectedTrackId,
    setPatchRemovalDialog,
    setRuntimeError,
    setSelectedTrackId
  ]);

  const updateTrackPatch = (trackId: string, patchId: string) => {
    commitProjectChange((current) => switchTrackPatchInProject(current, trackId, patchId), {
      actionKey: `track:${trackId}:patch`
    });
    patchWorkspace.setSelectedNodeId(undefined);
  };

  const changeTrackMacro = useCallback(
    (trackId: string, macroId: string, normalized: number, options?: { commit?: boolean }) => {
      audioEngineRef.current?.setMacroValue(trackId, macroId, normalized);
      commitProjectChange(
        (current) => ({
          ...current,
          tracks: current.tracks.map((track) =>
            track.id === trackId ? { ...track, macroValues: { ...track.macroValues, [macroId]: normalized } } : track
          )
        }),
        { actionKey: `track:${trackId}:macro:${macroId}`, coalesce: !options?.commit }
      );
      if (options?.commit) {
        const track = project.tracks.find((entry) => entry.id === trackId);
        if (track) {
          patchWorkspace.previewPatchById(track.instrumentPatchId);
        }
      }
    },
    [audioEngineRef, commitProjectChange, patchWorkspace, project.tracks]
  );

  const previewPlacedNote = useCallback(
    (trackId: string, note: Project["tracks"][number]["notes"][number]) => {
      audioEngineRef.current
        ?.previewNote(trackId, pitchToVoct(note.pitchStr), note.durationBeats, note.velocity)
        .catch((error) => {
          const cause = toError(error);
          setRuntimeError(
            createSproutError({
              source: "patch_workspace",
              code: "preview_failed",
              severity: "error",
              message: cause.message,
              error: cause,
              details: { phase: "preview" }
            })
          );
        });
    },
    [audioEngineRef, setRuntimeError]
  );

  const moveTrack = useCallback(
    (trackId: string, targetTrackId: string, position: "before" | "after") => {
      commitProjectChange((current) => moveTrackInProject(current, trackId, targetTrackId, position), {
        actionKey: `track:${trackId}:move`
      });
    },
    [commitProjectChange]
  );

  return {
    addTrack,
    renameTrack,
    removeSelectedTrack,
    duplicatePatchForSelectedTrack,
    requestRemoveSelectedTrackPatch,
    confirmRemovePatch,
    updateTrackPatch,
    toggleTrackMute,
    changeTrackMacro,
    previewPlacedNote,
    moveTrack
  };
}

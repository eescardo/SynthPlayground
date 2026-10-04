import { createId } from "@/lib/ids";
import { isPatchRemovable } from "@/lib/patch/source";
import {
  buildPatchRemovalRequest,
  hasInvalidPatchRemovalFallback,
  removePatchFromProject,
  resolveSurvivingTrackIds,
  type PatchRemovalRequest
} from "@/lib/patch/patchRemoval";
import { switchTrackPatchInProject } from "@/lib/trackEdits";
import { createSproutError, type SproutErrorSetter } from "@/lib/sproutErrors";
import type { CommitProjectChange } from "@/lib/projectChanges";
import type { Project, Track } from "@/types/music";
import type { Patch } from "@/types/patch";

export interface PatchLifecycleOptions {
  project: Project;
  selectedTrack: Track | undefined;
  selectedTrackPatch: Patch | undefined;
  selectedTrackId: string | undefined;
  patchRemovalDialog: PatchRemovalRequest | null;
  setPatchRemovalDialog: (request: PatchRemovalRequest | null) => void;
  setSelectedTrackId: (id: string | undefined) => void;
  clearWorkspaceSelection: () => void;
  setRuntimeError: SproutErrorSetter;
  commitProjectChange: CommitProjectChange;
}
export function createPatchLifecycleActions({
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
}: PatchLifecycleOptions) {
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

  const requestRemoveSelectedTrackPatch = () => {
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
      clearWorkspaceSelection();
      return;
    }
    setPatchRemovalDialog(removalRequest);
  };

  const confirmRemovePatch = () => {
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
    clearWorkspaceSelection();
  };

  const updateTrackPatch = (trackId: string, patchId: string) => {
    commitProjectChange((current) => switchTrackPatchInProject(current, trackId, patchId), {
      actionKey: `track:${trackId}:patch`
    });
    clearWorkspaceSelection();
  };
  return { duplicatePatchForSelectedTrack, requestRemoveSelectedTrackPatch, confirmRemovePatch, updateTrackPatch };
}

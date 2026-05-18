import { PatchRemovalDialogState } from "@/components/composer/PatchRemovalDialogModal";
import { resolveRemovedPatchFallbackId } from "@/hooks/patch/patchWorkspaceStateUtils";
import { Project } from "@/types/music";
import { Patch } from "@/types/patch";

export function buildPatchRemovalRequest(
  project: Pick<Project, "patches" | "tracks">,
  patch: Patch | undefined
): PatchRemovalDialogState | null {
  if (!patch) {
    return null;
  }
  const affectedTracks = project.tracks.filter((track) => track.instrumentPatchId === patch.id);
  const fallbackPatchId = resolveRemovedPatchFallbackId(project.patches, patch.id) ?? "";
  return {
    patchId: patch.id,
    rows: affectedTracks.map((track) => ({
      trackId: track.id,
      mode: fallbackPatchId ? "fallback" : "remove",
      fallbackPatchId
    }))
  };
}

export function removePatchFromProject(project: Project, removal: PatchRemovalDialogState): Project {
  const rowsByTrackId = new Map(removal.rows.map((row) => [row.trackId, row] as const));
  const tracks = project.tracks.flatMap((track) => {
    if (track.instrumentPatchId !== removal.patchId) {
      return [track];
    }
    const row = rowsByTrackId.get(track.id);
    if (!row || row.mode === "remove") {
      return [];
    }
    return [{ ...track, instrumentPatchId: row.fallbackPatchId }];
  });

  return {
    ...project,
    tracks,
    patches: project.patches.filter((patch) => patch.id !== removal.patchId)
  };
}

export function resolveSurvivingTrackIds(project: Pick<Project, "tracks">, removal: PatchRemovalDialogState) {
  const nextTrackIds = new Set(project.tracks.map((track) => track.id));
  for (const row of removal.rows) {
    if (row.mode === "remove") {
      nextTrackIds.delete(row.trackId);
    }
  }
  return nextTrackIds;
}

export function hasInvalidPatchRemovalFallback(removal: PatchRemovalDialogState) {
  return removal.rows.some(
    (row) => row.mode === "fallback" && (!row.fallbackPatchId || row.fallbackPatchId === removal.patchId)
  );
}

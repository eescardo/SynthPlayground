import { createId } from "@/lib/ids";
import { TRACK_PAN_CENTER } from "@/lib/trackPan";
import { moveTrackInProject, removeTrackFromProject, renameTrackInProject } from "@/lib/trackEdits";
import type { CommitProjectChange } from "@/lib/projectChanges";
import type { Project, Track } from "@/types/music";

export interface TrackEditingOptions {
  project: Project;
  selectedTrack: Track | undefined;
  commitProjectChange: CommitProjectChange;
  setSelectedTrackId: (id: string | undefined) => void;
  clearWorkspaceSelection: () => void;
}
export function createTrackEditingActions({
  project,
  selectedTrack,
  commitProjectChange,
  setSelectedTrackId,
  clearWorkspaceSelection
}: TrackEditingOptions) {
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

  const renameTrack = (trackId: string, name: string) => {
    commitProjectChange((current) => renameTrackInProject(current, trackId, name), {
      actionKey: `track:${trackId}:rename`
    });
  };

  const removeSelectedTrack = () => {
    if (!selectedTrack || project.tracks.length <= 1) {
      return;
    }

    const remainingTracks = project.tracks.filter((track) => track.id !== selectedTrack.id);
    commitProjectChange((current) => removeTrackFromProject(current, selectedTrack.id), {
      actionKey: `track:${selectedTrack.id}:remove`
    });
    setSelectedTrackId(remainingTracks[0]?.id);
    clearWorkspaceSelection();
  };

  const moveTrack = (trackId: string, targetTrackId: string, position: "before" | "after") => {
    commitProjectChange((current) => moveTrackInProject(current, trackId, targetTrackId, position), {
      actionKey: `track:${trackId}:move`
    });
  };
  return { addTrack, renameTrack, removeSelectedTrack, moveTrack };
}

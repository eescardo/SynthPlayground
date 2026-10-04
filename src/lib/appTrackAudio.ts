import type { AudioEngine } from "@/audio/engine";
import type { CommitProjectChange } from "@/lib/projectChanges";
import { pitchToVoct } from "@/lib/pitch";
import { createSproutError, toError, type SproutErrorSetter } from "@/lib/sproutErrors";
import type { Project } from "@/types/music";

export type TrackAudioEngine = Pick<AudioEngine, "setTrackMuted" | "setMacroValue" | "previewNote">;

export interface TrackAudioOptions {
  project: Project;
  getAudioEngine: () => TrackAudioEngine | null;
  previewPatchById: (patchId: string) => void;
  setRuntimeError: SproutErrorSetter;
  commitProjectChange: CommitProjectChange;
}
export function createTrackAudioActions({
  project,
  getAudioEngine,
  previewPatchById,
  setRuntimeError,
  commitProjectChange
}: TrackAudioOptions) {
  const toggleTrackMute = (trackId: string) => {
    const currentTrack = project.tracks.find((track) => track.id === trackId);
    if (currentTrack) {
      getAudioEngine()?.setTrackMuted(trackId, !currentTrack.mute);
    }
    commitProjectChange(
      (current) => ({
        ...current,
        tracks: current.tracks.map((track) => (track.id === trackId ? { ...track, mute: !track.mute } : track))
      }),
      { actionKey: `track:${trackId}:mute` }
    );
  };

  const changeTrackMacro = (trackId: string, macroId: string, normalized: number, options?: { commit?: boolean }) => {
    getAudioEngine()?.setMacroValue(trackId, macroId, normalized);
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
        previewPatchById(track.instrumentPatchId);
      }
    }
  };

  const previewPlacedNote = (trackId: string, note: Project["tracks"][number]["notes"][number]) => {
    getAudioEngine()
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
  };
  return { toggleTrackMute, changeTrackMacro, previewPlacedNote };
}

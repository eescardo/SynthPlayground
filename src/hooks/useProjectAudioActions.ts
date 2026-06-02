"use client";

import { RefObject, useCallback, useState } from "react";
import { AudioEngine } from "@/audio/engine";
import { toAudioProject } from "@/audio/audioProject";
import { TRACK_VOLUME_AUTOMATION_ID } from "@/lib/macroAutomation";
import { createSproutError, SproutErrorSetter, toError } from "@/lib/sproutErrors";
import { clampTrackVolume, isTrackVolumeMuted } from "@/lib/trackVolume";
import { ProjectAssetLibrary } from "@/types/assets";
import { Project } from "@/types/music";

interface CommitProjectChange {
  (updater: (current: Project) => Project, options?: { actionKey?: string; coalesce?: boolean }): void;
}

interface UseProjectAudioActionsOptions {
  project: Project;
  projectAssets: ProjectAssetLibrary;
  audioEngineRef: RefObject<AudioEngine | null>;
  commitProjectChange: CommitProjectChange;
  setRuntimeError: SproutErrorSetter;
}

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

export const getTrackMuteForVolumeChange = (
  project: Project,
  trackId: string,
  volume: number
): { muted: boolean; changed: boolean } | null => {
  const currentTrack = project.tracks.find((track) => track.id === trackId);
  if (!currentTrack) {
    return null;
  }
  const muted = isTrackVolumeMuted(clampTrackVolume(volume));
  return {
    muted,
    changed: Boolean(currentTrack.mute) !== muted
  };
};

export function useProjectAudioActions(options: UseProjectAudioActionsOptions) {
  const { audioEngineRef, commitProjectChange, project, projectAssets, setRuntimeError } = options;
  const [exportingAudio, setExportingAudio] = useState(false);

  const setTrackVolume = useCallback(
    (trackId: string, volume: number, actionOptions?: { commit?: boolean }) => {
      const clampedVolume = clampTrackVolume(volume);
      const muteChange = getTrackMuteForVolumeChange(project, trackId, clampedVolume);
      if (muteChange?.changed) {
        audioEngineRef.current?.setTrackMuted(trackId, muteChange.muted, { restoreVolume: false });
      }
      audioEngineRef.current?.setMacroValue(trackId, TRACK_VOLUME_AUTOMATION_ID, clampedVolume / 2);
      commitProjectChange(
        (current) => ({
          ...current,
          tracks: current.tracks.map((track) =>
            track.id === trackId
              ? {
                  ...track,
                  volume: clampedVolume,
                  mute: muteChange?.muted ?? track.mute
                }
              : track
          )
        }),
        {
          actionKey: `track:${trackId}:volume`,
          coalesce: actionOptions?.commit === false
        }
      );
    },
    [audioEngineRef, commitProjectChange, project]
  );

  const exportAudio = useCallback(async () => {
    if (!audioEngineRef.current || exportingAudio) {
      return;
    }
    setExportingAudio(true);
    try {
      const blob = await audioEngineRef.current.exportProjectAudio({
        project: toAudioProject(project),
        runtimeAssets: projectAssets
      });
      downloadBlob(blob, `${project.name.replace(/\s+/g, "_").toLowerCase()}.wav`);
    } catch (error) {
      const cause = toError(error);
      setRuntimeError(
        createSproutError({
          source: "audio_export",
          code: "render_failed",
          severity: "error",
          message: cause.message,
          error: cause,
          details: { phase: "render" }
        })
      );
    } finally {
      setExportingAudio(false);
    }
  }, [audioEngineRef, exportingAudio, project, projectAssets, setRuntimeError]);

  return {
    exportingAudio,
    exportAudio,
    setTrackVolume
  };
}

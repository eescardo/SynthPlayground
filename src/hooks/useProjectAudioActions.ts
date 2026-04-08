"use client";

import { MutableRefObject, useCallback, useState } from "react";
import { AudioEngine } from "@/audio/engine";
import { TRACK_VOLUME_AUTOMATION_ID } from "@/lib/macroAutomation";
import { clampTrackVolume, isTrackVolumeMuted } from "@/lib/trackVolume";
import { Project } from "@/types/music";

interface CommitProjectChange {
  (updater: (current: Project) => Project, options?: { actionKey?: string; coalesce?: boolean }): void;
}

interface UseProjectAudioActionsOptions {
  project: Project;
  audioEngineRef: MutableRefObject<AudioEngine | null>;
  commitProjectChange: CommitProjectChange;
  setRuntimeError: (message: string | null | ((prev: string | null) => string | null)) => void;
}

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

export function useProjectAudioActions(options: UseProjectAudioActionsOptions) {
  const { audioEngineRef, commitProjectChange, project, setRuntimeError } = options;
  const [exportingAudio, setExportingAudio] = useState(false);

  const setTrackVolume = useCallback((trackId: string, volume: number, actionOptions?: { commit?: boolean }) => {
    const clampedVolume = clampTrackVolume(volume);
    audioEngineRef.current?.setMacroValue(trackId, TRACK_VOLUME_AUTOMATION_ID, clampedVolume / 2);
    commitProjectChange((current) => ({
      ...current,
      tracks: current.tracks.map((track) =>
        track.id === trackId
          ? {
              ...track,
              volume: clampedVolume,
              mute: isTrackVolumeMuted(volume) ? true : false
            }
          : track
      )
    }), {
      actionKey: `track:${trackId}:volume`,
      coalesce: actionOptions?.commit === false
    });
  }, [audioEngineRef, commitProjectChange]);

  const exportAudio = useCallback(async () => {
    if (!audioEngineRef.current || exportingAudio) {
      return;
    }
    setExportingAudio(true);
    try {
      const blob = await audioEngineRef.current.exportProjectAudio(project);
      downloadBlob(blob, `${project.name.replace(/\s+/g, "_").toLowerCase()}.wav`);
    } catch (error) {
      setRuntimeError((error as Error).message);
    } finally {
      setExportingAudio(false);
    }
  }, [audioEngineRef, exportingAudio, project, setRuntimeError]);

  return {
    exportingAudio,
    exportAudio,
    setTrackVolume
  };
}

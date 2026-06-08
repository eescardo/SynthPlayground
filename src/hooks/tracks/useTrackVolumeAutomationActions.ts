"use client";

import { RefObject, useCallback } from "react";
import { AudioEngine } from "@/audio/engine";
import {
  createTrackPanAutomationLane,
  createTrackVolumeAutomationLane,
  TRACK_PAN_AUTOMATION_ID,
  TRACK_VOLUME_AUTOMATION_ID
} from "@/lib/macroAutomation";
import { clamp } from "@/lib/numeric";
import { pitchToVoct } from "@/lib/pitch";
import { createSproutError, SproutErrorSetter, toError } from "@/lib/sproutErrors";
import { Project } from "@/types/music";

type CommitProjectChange = (
  updater: (current: Project) => Project,
  options?: { actionKey?: string; coalesce?: boolean }
) => void;

interface UseTrackVolumeAutomationActionsParams {
  audioEngineRef: RefObject<AudioEngine | null>;
  commitProjectChange: CommitProjectChange;
  previewPitch: string;
  setRuntimeError: SproutErrorSetter;
}

export function useTrackVolumeAutomationActions({
  audioEngineRef,
  commitProjectChange,
  previewPitch,
  setRuntimeError
}: UseTrackVolumeAutomationActionsParams) {
  const bindTrackVolumeToAutomation = useCallback(
    (trackId: string, initialValue: number) => {
      commitProjectChange(
        (current) => ({
          ...current,
          tracks: current.tracks.map((track) =>
            track.id === trackId
              ? {
                  ...track,
                  macroAutomations: {
                    ...track.macroAutomations,
                    [TRACK_VOLUME_AUTOMATION_ID]: createTrackVolumeAutomationLane(initialValue)
                  }
                }
              : track
          )
        }),
        { actionKey: `track:${trackId}:volume:bind-automation` }
      );
    },
    [commitProjectChange]
  );

  const unbindTrackVolumeFromAutomation = useCallback(
    (trackId: string) => {
      commitProjectChange(
        (current) => ({
          ...current,
          tracks: current.tracks.map((track) => {
            if (track.id !== trackId) {
              return track;
            }
            const nextAutomations = { ...track.macroAutomations };
            const lane = nextAutomations[TRACK_VOLUME_AUTOMATION_ID];
            delete nextAutomations[TRACK_VOLUME_AUTOMATION_ID];
            return {
              ...track,
              macroAutomations: nextAutomations,
              volume: lane ? lane.startValue * 2 : track.volume
            };
          })
        }),
        { actionKey: `track:${trackId}:volume:unbind-automation` }
      );
    },
    [commitProjectChange]
  );

  const toggleTrackVolumeAutomationLane = useCallback(
    (trackId: string) => {
      commitProjectChange(
        (current) => ({
          ...current,
          tracks: current.tracks.map((track) => {
            if (track.id !== trackId) {
              return track;
            }
            const lane = track.macroAutomations[TRACK_VOLUME_AUTOMATION_ID];
            if (!lane) {
              return track;
            }
            return {
              ...track,
              macroAutomations: {
                ...track.macroAutomations,
                [TRACK_VOLUME_AUTOMATION_ID]: {
                  ...lane,
                  expanded: !lane.expanded
                }
              }
            };
          })
        }),
        { actionKey: `track:${trackId}:volume:toggle-lane` }
      );
    },
    [commitProjectChange]
  );

  const bindTrackPanToAutomation = useCallback(
    (trackId: string, initialValue: number) => {
      commitProjectChange(
        (current) => ({
          ...current,
          tracks: current.tracks.map((track) =>
            track.id === trackId
              ? {
                  ...track,
                  macroAutomations: {
                    ...track.macroAutomations,
                    [TRACK_PAN_AUTOMATION_ID]: createTrackPanAutomationLane(initialValue)
                  }
                }
              : track
          )
        }),
        { actionKey: `track:${trackId}:pan:bind-automation` }
      );
    },
    [commitProjectChange]
  );

  const unbindTrackPanFromAutomation = useCallback(
    (trackId: string) => {
      commitProjectChange(
        (current) => ({
          ...current,
          tracks: current.tracks.map((track) => {
            if (track.id !== trackId) {
              return track;
            }
            const nextAutomations = { ...track.macroAutomations };
            const lane = nextAutomations[TRACK_PAN_AUTOMATION_ID];
            delete nextAutomations[TRACK_PAN_AUTOMATION_ID];
            return {
              ...track,
              macroAutomations: nextAutomations,
              pan: lane ? lane.startValue : track.pan
            };
          })
        }),
        { actionKey: `track:${trackId}:pan:unbind-automation` }
      );
    },
    [commitProjectChange]
  );

  const toggleTrackPanAutomationLane = useCallback(
    (trackId: string) => {
      commitProjectChange(
        (current) => ({
          ...current,
          tracks: current.tracks.map((track) => {
            if (track.id !== trackId) {
              return track;
            }
            const lane = track.macroAutomations[TRACK_PAN_AUTOMATION_ID];
            if (!lane) {
              return track;
            }
            return {
              ...track,
              macroAutomations: {
                ...track.macroAutomations,
                [TRACK_PAN_AUTOMATION_ID]: {
                  ...lane,
                  expanded: !lane.expanded
                }
              }
            };
          })
        }),
        { actionKey: `track:${trackId}:pan:toggle-lane` }
      );
    },
    [commitProjectChange]
  );

  const previewTrackPan = useCallback(
    (trackId: string, pan: number) => {
      audioEngineRef.current?.setMacroValue(trackId, TRACK_PAN_AUTOMATION_ID, clamp(pan, 0, 1));
    },
    [audioEngineRef]
  );

  const previewTrackVolume = useCallback(
    (trackId: string, volume: number) => {
      audioEngineRef.current?.setMacroValue(trackId, TRACK_VOLUME_AUTOMATION_ID, clamp(volume, 0, 2) / 2);
      audioEngineRef.current
        ?.previewNote(trackId, pitchToVoct(previewPitch), 1, 0.9, { ignoreVolume: false })
        .catch((error) => {
          const previewError = toError(error);
          setRuntimeError(
            createSproutError({
              source: "track_volume_automation",
              code: "preview_failed",
              severity: "error",
              message: `Volume automation preview failed: ${previewError.message}`,
              error: previewError,
              details: { phase: "preview_volume_change", trackId }
            })
          );
        });
    },
    [audioEngineRef, previewPitch, setRuntimeError]
  );

  return {
    bindTrackVolumeToAutomation,
    unbindTrackVolumeFromAutomation,
    toggleTrackVolumeAutomationLane,
    bindTrackPanToAutomation,
    unbindTrackPanFromAutomation,
    toggleTrackPanAutomationLane,
    previewTrackPan,
    previewTrackVolume
  };
}

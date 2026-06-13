"use client";

import { RefObject, useCallback } from "react";
import { AudioEngine } from "@/audio/engine";
import {
  getTrackHostAutomationDescriptor,
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

interface UseTrackHostAutomationActionsParams {
  audioEngineRef: RefObject<AudioEngine | null>;
  commitProjectChange: CommitProjectChange;
  previewPitch: string;
  setRuntimeError: SproutErrorSetter;
}

export function useTrackHostAutomationActions({
  audioEngineRef,
  commitProjectChange,
  previewPitch,
  setRuntimeError
}: UseTrackHostAutomationActionsParams) {
  const previewTrackNote = useCallback(
    (trackId: string, source: "track_volume_automation" | "track_pan_automation", phase: string, label: string) => {
      audioEngineRef.current
        ?.previewNote(trackId, pitchToVoct(previewPitch), 1, 0.9, { ignoreVolume: false })
        .catch((error) => {
          const previewError = toError(error);
          setRuntimeError(
            createSproutError({
              source,
              code: "preview_failed",
              severity: "error",
              message: `${label} automation preview failed: ${previewError.message}`,
              error: previewError,
              details: { phase, trackId }
            })
          );
        });
    },
    [audioEngineRef, previewPitch, setRuntimeError]
  );

  const bindTrackHostAutomation = useCallback(
    (trackId: string, macroId: string, initialValue: number) => {
      const descriptor = getTrackHostAutomationDescriptor(macroId);
      if (!descriptor) {
        return;
      }
      commitProjectChange(
        (current) => ({
          ...current,
          tracks: current.tracks.map((track) =>
            track.id === trackId
              ? {
                  ...track,
                  macroAutomations: {
                    ...track.macroAutomations,
                    [descriptor.id]: descriptor.createLane(initialValue)
                  }
                }
              : track
          )
        }),
        { actionKey: `track:${trackId}:${descriptor.actionKey}:bind-automation` }
      );
    },
    [commitProjectChange]
  );

  const unbindTrackHostAutomation = useCallback(
    (trackId: string, macroId: string) => {
      const descriptor = getTrackHostAutomationDescriptor(macroId);
      if (!descriptor) {
        return;
      }
      commitProjectChange(
        (current) => ({
          ...current,
          tracks: current.tracks.map((track) => {
            if (track.id !== trackId) {
              return track;
            }
            const nextAutomations = { ...track.macroAutomations };
            const lane = nextAutomations[descriptor.id];
            delete nextAutomations[descriptor.id];
            const nextTrack = {
              ...track,
              macroAutomations: nextAutomations
            };
            return lane ? descriptor.applyFixedValue(nextTrack, lane.startValue) : nextTrack;
          })
        }),
        { actionKey: `track:${trackId}:${descriptor.actionKey}:unbind-automation` }
      );
    },
    [commitProjectChange]
  );

  const toggleTrackHostAutomationLane = useCallback(
    (trackId: string, macroId: string) => {
      const descriptor = getTrackHostAutomationDescriptor(macroId);
      if (!descriptor) {
        return;
      }
      commitProjectChange(
        (current) => ({
          ...current,
          tracks: current.tracks.map((track) => {
            if (track.id !== trackId) {
              return track;
            }
            const lane = track.macroAutomations[descriptor.id];
            if (!lane) {
              return track;
            }
            return {
              ...track,
              macroAutomations: {
                ...track.macroAutomations,
                [descriptor.id]: {
                  ...lane,
                  expanded: !lane.expanded
                }
              }
            };
          })
        }),
        { actionKey: `track:${trackId}:${descriptor.actionKey}:toggle-lane` }
      );
    },
    [commitProjectChange]
  );

  const bindTrackVolumeToAutomation = useCallback(
    (trackId: string, initialValue: number) =>
      bindTrackHostAutomation(trackId, TRACK_VOLUME_AUTOMATION_ID, initialValue),
    [bindTrackHostAutomation]
  );
  const unbindTrackVolumeFromAutomation = useCallback(
    (trackId: string) => unbindTrackHostAutomation(trackId, TRACK_VOLUME_AUTOMATION_ID),
    [unbindTrackHostAutomation]
  );
  const toggleTrackVolumeAutomationLane = useCallback(
    (trackId: string) => toggleTrackHostAutomationLane(trackId, TRACK_VOLUME_AUTOMATION_ID),
    [toggleTrackHostAutomationLane]
  );
  const bindTrackPanToAutomation = useCallback(
    (trackId: string, initialValue: number) => bindTrackHostAutomation(trackId, TRACK_PAN_AUTOMATION_ID, initialValue),
    [bindTrackHostAutomation]
  );
  const unbindTrackPanFromAutomation = useCallback(
    (trackId: string) => unbindTrackHostAutomation(trackId, TRACK_PAN_AUTOMATION_ID),
    [unbindTrackHostAutomation]
  );
  const toggleTrackPanAutomationLane = useCallback(
    (trackId: string) => toggleTrackHostAutomationLane(trackId, TRACK_PAN_AUTOMATION_ID),
    [toggleTrackHostAutomationLane]
  );

  const previewTrackPan = useCallback(
    (trackId: string, pan: number) => {
      audioEngineRef.current?.setMacroValue(trackId, TRACK_PAN_AUTOMATION_ID, clamp(pan, 0, 1));
      previewTrackNote(trackId, "track_pan_automation", "preview_pan_change", "Pan");
    },
    [audioEngineRef, previewTrackNote]
  );

  const previewTrackVolume = useCallback(
    (trackId: string, volume: number) => {
      audioEngineRef.current?.setMacroValue(trackId, TRACK_VOLUME_AUTOMATION_ID, clamp(volume, 0, 2) / 2);
      previewTrackNote(trackId, "track_volume_automation", "preview_volume_change", "Volume");
    },
    [audioEngineRef, previewTrackNote]
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

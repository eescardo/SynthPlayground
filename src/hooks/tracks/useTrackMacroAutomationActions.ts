"use client";

import { RefObject, useCallback } from "react";
import { AudioEngine } from "@/audio/engine";
import {
  AutomationKeyframeSide,
  createTrackMacroAutomationLane,
  getProjectTimelineEndBeat,
  getTrackMacroLane,
  TrackPreviewStateAtBeat,
  TRACK_VOLUME_AUTOMATION_ID,
  removeAutomationLaneKeyframeSide,
  splitAutomationLaneKeyframe,
  updateAutomationLaneKeyframeSide,
  upsertAutomationLaneKeyframe
} from "@/lib/macroAutomation";
import { pitchToVoct } from "@/lib/pitch";
import { Project } from "@/types/music";

type CommitProjectChange = (
  updater: (current: Project) => Project,
  options?: { actionKey?: string; coalesce?: boolean }
) => void;

interface UseTrackMacroAutomationActionsParams {
  audioEngineRef: RefObject<AudioEngine | null>;
  commitProjectChange: CommitProjectChange;
  previewPitch: string;
  resolveTrackPreviewStateAtBeat: (
    trackId: string,
    beat: number,
    override: { macroId: string; normalized: number }
  ) => TrackPreviewStateAtBeat | null;
  setRuntimeError: (message: string | null) => void;
}

export function useTrackMacroAutomationActions({
  audioEngineRef,
  commitProjectChange,
  previewPitch,
  resolveTrackPreviewStateAtBeat,
  setRuntimeError
}: UseTrackMacroAutomationActionsParams) {
  const commitTrackMacroAutomationLaneChange = useCallback((
    trackId: string,
    macroId: string,
    updateLane: (
      lane: NonNullable<ReturnType<typeof getTrackMacroLane>>,
      current: Project
    ) => NonNullable<ReturnType<typeof getTrackMacroLane>>,
    history: { actionKey: string; coalesce?: boolean }
  ) => {
    commitProjectChange(
      (current) => ({
        ...current,
        tracks: current.tracks.map((track) => {
          if (track.id !== trackId) {
            return track;
          }
          const lane = getTrackMacroLane(track, macroId);
          if (!lane) {
            return track;
          }
          const nextLane = updateLane(lane, current);
          return {
            ...track,
            macroAutomations: {
              ...track.macroAutomations,
              [macroId]: nextLane
            },
            macroValues: {
              ...track.macroValues,
              [macroId]: nextLane.startValue
            }
          };
        })
      }),
      history
    );
  }, [commitProjectChange]);

  const applyPreviewState = useCallback((trackId: string, macroId: string, normalized: number, beat?: number) => {
    const engine = audioEngineRef.current;
    if (!engine) {
      return;
    }

    if (beat === undefined) {
      engine.setMacroValue(trackId, macroId, normalized);
      return;
    }

    const previewState = resolveTrackPreviewStateAtBeat(trackId, beat, { macroId, normalized });
    if (!previewState) {
      engine.setMacroValue(trackId, macroId, normalized);
      return;
    }

    for (const [previewMacroId, previewNormalized] of Object.entries(previewState.macroValues)) {
      engine.setMacroValue(trackId, previewMacroId, previewNormalized);
    }
    engine.setMacroValue(trackId, TRACK_VOLUME_AUTOMATION_ID, previewState.volumeNormalized);
  }, [audioEngineRef, resolveTrackPreviewStateAtBeat]);

  const previewTrackMacroAutomation = useCallback((
    trackId: string,
    macroId: string,
    normalized: number,
    options?: { retrigger?: boolean; beat?: number }
  ) => {
    if (!options?.retrigger) {
      applyPreviewState(trackId, macroId, normalized, options?.beat);
      return;
    }

    window.setTimeout(() => {
      applyPreviewState(trackId, macroId, normalized, options?.beat);
      audioEngineRef.current
        ?.previewNote(trackId, pitchToVoct(previewPitch), 1, 0.9, { ignoreVolume: macroId !== TRACK_VOLUME_AUTOMATION_ID })
        .catch((error) => setRuntimeError((error as Error).message));
    }, 0);
  }, [applyPreviewState, audioEngineRef, previewPitch, setRuntimeError]);

  const bindTrackMacroToAutomation = useCallback((trackId: string, macroId: string, initialValue: number) => {
    commitProjectChange(
      (current) => ({
        ...current,
        tracks: current.tracks.map((track) =>
          track.id === trackId
            ? {
                ...track,
                macroValues: { ...track.macroValues, [macroId]: initialValue },
                macroAutomations: {
                  ...track.macroAutomations,
                  [macroId]: createTrackMacroAutomationLane(macroId, initialValue)
                }
              }
            : track
        )
      }),
      { actionKey: `track:${trackId}:macro:${macroId}:bind-automation` }
    );
  }, [commitProjectChange]);

  const unbindTrackMacroFromAutomation = useCallback((trackId: string, macroId: string) => {
    commitProjectChange(
      (current) => ({
        ...current,
        tracks: current.tracks.map((track) => {
          if (track.id !== trackId) {
            return track;
          }
          const nextAutomations = { ...track.macroAutomations };
          const currentLane = nextAutomations[macroId];
          delete nextAutomations[macroId];
          return {
            ...track,
            macroAutomations: nextAutomations,
            macroValues: currentLane
              ? { ...track.macroValues, [macroId]: currentLane.startValue }
              : track.macroValues
          };
        })
      }),
      { actionKey: `track:${trackId}:macro:${macroId}:unbind-automation` }
    );
  }, [commitProjectChange]);

  const toggleTrackMacroAutomationLane = useCallback((trackId: string, macroId: string) => {
    commitProjectChange(
      (current) => ({
        ...current,
        tracks: current.tracks.map((track) => {
          if (track.id !== trackId) {
            return track;
          }
          const lane = getTrackMacroLane(track, macroId);
          if (!lane) {
            return track;
          }
          return {
            ...track,
            macroAutomations: {
              ...track.macroAutomations,
              [macroId]: {
                ...lane,
                expanded: !lane.expanded
              }
            }
          };
        })
      }),
      { actionKey: `track:${trackId}:macro:${macroId}:toggle-lane` }
    );
  }, [commitProjectChange]);

  const upsertTrackMacroAutomationKeyframe = useCallback((
    trackId: string,
    macroId: string,
    beat: number,
    value: number,
    options?: { keyframeId?: string; commit?: boolean }
  ) => {
    commitTrackMacroAutomationLaneChange(
      trackId,
      macroId,
      (lane, current) => upsertAutomationLaneKeyframe(lane, beat, value, getProjectTimelineEndBeat(current), options?.keyframeId),
      { actionKey: `track:${trackId}:macro:${macroId}:keyframe`, coalesce: !options?.commit }
    );
  }, [commitTrackMacroAutomationLaneChange]);

  const splitTrackMacroAutomationKeyframe = useCallback((trackId: string, macroId: string, keyframeId: string) => {
    commitTrackMacroAutomationLaneChange(
      trackId,
      macroId,
      (lane) => splitAutomationLaneKeyframe(lane, keyframeId),
      { actionKey: `track:${trackId}:macro:${macroId}:split-keyframe` }
    );
  }, [commitTrackMacroAutomationLaneChange]);

  const updateTrackMacroAutomationKeyframeSide = useCallback((
    trackId: string,
    macroId: string,
    keyframeId: string,
    side: AutomationKeyframeSide,
    value: number,
    options?: { commit?: boolean }
  ) => {
    commitTrackMacroAutomationLaneChange(
      trackId,
      macroId,
      (lane) => updateAutomationLaneKeyframeSide(lane, keyframeId, side, value),
      { actionKey: `track:${trackId}:macro:${macroId}:keyframe:${keyframeId}:${side}`, coalesce: !options?.commit }
    );
  }, [commitTrackMacroAutomationLaneChange]);

  const deleteTrackMacroAutomationKeyframeSide = useCallback((
    trackId: string,
    macroId: string,
    keyframeId: string,
    side: AutomationKeyframeSide
  ) => {
    commitTrackMacroAutomationLaneChange(
      trackId,
      macroId,
      (lane) => removeAutomationLaneKeyframeSide(lane, keyframeId, side),
      { actionKey: `track:${trackId}:macro:${macroId}:delete-keyframe:${side}` }
    );
  }, [commitTrackMacroAutomationLaneChange]);

  return {
    bindTrackMacroToAutomation,
    unbindTrackMacroFromAutomation,
    toggleTrackMacroAutomationLane,
    upsertTrackMacroAutomationKeyframe,
    splitTrackMacroAutomationKeyframe,
    updateTrackMacroAutomationKeyframeSide,
    deleteTrackMacroAutomationKeyframeSide,
    previewTrackMacroAutomation
  };
}

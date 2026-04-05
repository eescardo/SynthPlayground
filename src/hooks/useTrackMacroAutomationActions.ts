"use client";

import { useCallback } from "react";
import {
  AutomationKeyframeSide,
  getProjectTimelineEndBeat,
  getTrackMacroLane,
  removeAutomationLaneKeyframeSide,
  splitAutomationLaneKeyframe,
  updateAutomationLaneKeyframeSide,
  upsertAutomationLaneKeyframe
} from "@/lib/macroAutomation";
import { Project } from "@/types/music";

type CommitProjectChange = (
  updater: (current: Project) => Project,
  options?: { actionKey?: string; coalesce?: boolean }
) => void;

interface UseTrackMacroAutomationActionsParams {
  commitProjectChange: CommitProjectChange;
}

export function useTrackMacroAutomationActions({
  commitProjectChange
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
    upsertTrackMacroAutomationKeyframe,
    splitTrackMacroAutomationKeyframe,
    updateTrackMacroAutomationKeyframeSide,
    deleteTrackMacroAutomationKeyframeSide
  };
}

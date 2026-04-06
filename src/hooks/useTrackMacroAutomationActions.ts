"use client";

import { RefObject, useCallback } from "react";
import { AudioEngine } from "@/audio/engine";
import {
  AutomationKeyframeSide,
  createTrackMacroAutomationLane,
  getProjectTimelineEndBeat,
  getTrackMacroLane,
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
  setRuntimeError: (message: string | null) => void;
}

export function useTrackMacroAutomationActions({
  audioEngineRef,
  commitProjectChange,
  previewPitch,
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

  const previewTrackMacroAutomation = useCallback((trackId: string, macroId: string, normalized: number, options?: { retrigger?: boolean }) => {
    if (!options?.retrigger) {
      audioEngineRef.current?.setMacroValue(trackId, macroId, normalized);
      return;
    }

    window.setTimeout(() => {
      audioEngineRef.current?.setMacroValue(trackId, macroId, normalized);
      audioEngineRef.current
        ?.previewNote(trackId, pitchToVoct(previewPitch), 1)
        .catch((error) => setRuntimeError((error as Error).message));
    }, 0);
  }, [audioEngineRef, previewPitch, setRuntimeError]);

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

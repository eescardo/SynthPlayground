"use client";

import { useCallback } from "react";
import { Project, Track } from "@/types/music";

type CommitProjectChange = (
  updater: (current: Project) => Project,
  options?: { actionKey?: string; coalesce?: boolean }
) => void;

interface UseTrackMacroPanelStateArgs {
  tracks: Track[];
  commitProjectChange: CommitProjectChange;
}

export function useTrackMacroPanelState({
  tracks,
  commitProjectChange
}: UseTrackMacroPanelStateArgs) {
  const setTrackMacroPanelExpanded = useCallback((trackId: string, expanded: boolean) => {
    commitProjectChange((current) => {
      let changed = false;
      const nextTracks = current.tracks.map((track) => {
        if (track.id !== trackId || track.macroPanelExpanded === expanded) {
          return track;
        }
        changed = true;
        return { ...track, macroPanelExpanded: expanded };
      });
      return changed ? { ...current, tracks: nextTracks } : current;
    }, { actionKey: `track:${trackId}:macro-panel` });
  }, [commitProjectChange]);

  const toggleTrackMacroPanel = useCallback((trackId: string) => {
    const track = tracks.find((entry) => entry.id === trackId);
    if (!track) {
      return;
    }
    setTrackMacroPanelExpanded(trackId, !track.macroPanelExpanded);
  }, [setTrackMacroPanelExpanded, tracks]);

  return {
    setTrackMacroPanelExpanded,
    toggleTrackMacroPanel
  };
}

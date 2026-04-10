import { useMemo } from "react";
import {
  AUTOMATION_LANE_COLLAPSED_HEIGHT,
  AUTOMATION_LANE_HEIGHT,
  RULER_HEIGHT,
  TRACK_HEIGHT
} from "@/components/tracks/trackCanvasConstants";
import { AutomationLaneLayout, TrackLayout } from "@/components/tracks/trackCanvasTypes";
import { getTrackMacroLane, getTrackVolumeLane } from "@/lib/macroAutomation";
import { Project } from "@/types/music";

export function useTrackCanvasLayout(project: Project): { trackLayouts: TrackLayout[]; height: number } {
  const trackLayouts = useMemo<TrackLayout[]>(() => {
    let currentY = RULER_HEIGHT;
    return project.tracks.map((track, index) => {
      const trackY = currentY;
      const patch = project.patches.find((entry) => entry.id === track.instrumentPatchId);
      let laneY = trackY + TRACK_HEIGHT;
      const automationLanes: AutomationLaneLayout[] = [];

      if (track.macroPanelExpanded) {
        const volumeLane = getTrackVolumeLane(track);
        const patchMacros = patch?.ui.macros ?? [];
        if (volumeLane) {
          const volumeLayout = {
            laneId: volumeLane.macroId,
            laneType: "volume" as const,
            macroId: null,
            name: "Volume",
            y: laneY,
            height: volumeLane.expanded ? AUTOMATION_LANE_HEIGHT : AUTOMATION_LANE_COLLAPSED_HEIGHT,
            expanded: volumeLane.expanded,
            automated: true
          };
          laneY += volumeLayout.height;
          automationLanes.push(volumeLayout);
        }

        for (const macro of patchMacros) {
          const lane = getTrackMacroLane(track, macro.id);
          const automated = Boolean(lane);
          const macroLayout = {
            laneId: macro.id,
            laneType: "macro" as const,
            macroId: macro.id,
            name: macro.name,
            y: laneY,
            height: automated
              ? lane?.expanded
                ? AUTOMATION_LANE_HEIGHT
                : AUTOMATION_LANE_COLLAPSED_HEIGHT
              : AUTOMATION_LANE_COLLAPSED_HEIGHT,
            expanded: automated ? Boolean(lane?.expanded) : false,
            automated
          };
          laneY += macroLayout.height;
          automationLanes.push(macroLayout);
        }

        if (!volumeLane && patchMacros.length === 0) {
          // Reserve one collapsed lane so zero-macro patches still expose a stable
          // macro-panel surface for hover/double-click patch-summary interactions.
          automationLanes.push({
            laneId: `${track.id}:macro-placeholder`,
            laneType: "macro",
            macroId: null,
            name: "",
            y: laneY,
            height: AUTOMATION_LANE_COLLAPSED_HEIGHT,
            expanded: false,
            automated: false
          });
          laneY += AUTOMATION_LANE_COLLAPSED_HEIGHT;
        }
      }

      const occupiedHeight = TRACK_HEIGHT + automationLanes.reduce((acc, lane) => acc + lane.height, 0);
      currentY += occupiedHeight;
      return {
        trackId: track.id,
        index,
        y: trackY,
        height: occupiedHeight,
        automationLanes
      };
    });
  }, [project.patches, project.tracks]);

  const height = trackLayouts.at(-1)
    ? trackLayouts[trackLayouts.length - 1].y + trackLayouts[trackLayouts.length - 1].height
    : RULER_HEIGHT;

  return { trackLayouts, height };
}

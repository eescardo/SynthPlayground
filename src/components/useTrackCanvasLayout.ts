import { useMemo } from "react";
import {
  AUTOMATION_LANE_COLLAPSED_HEIGHT,
  AUTOMATION_LANE_HEIGHT,
  RULER_HEIGHT,
  TRACK_HEIGHT
} from "@/components/trackCanvasConstants";
import { TrackLayout } from "@/components/trackCanvasTypes";
import { getTrackMacroLane } from "@/lib/macroAutomation";
import { Project } from "@/types/music";

export function useTrackCanvasLayout(project: Project): { trackLayouts: TrackLayout[]; height: number } {
  const trackLayouts = useMemo<TrackLayout[]>(() => {
    let currentY = RULER_HEIGHT;
    return project.tracks.map((track, index) => {
      const trackY = currentY;
      const patch = project.patches.find((entry) => entry.id === track.instrumentPatchId);
      let laneY = trackY + TRACK_HEIGHT;
      const automationLanes =
        patch?.ui.macros.flatMap((macro) => {
          const lane = getTrackMacroLane(track, macro.id);
          if (!lane) {
            return [];
          }
          const layout = {
            macroId: macro.id,
            name: macro.name,
            y: laneY,
            height: lane.expanded ? AUTOMATION_LANE_HEIGHT : AUTOMATION_LANE_COLLAPSED_HEIGHT,
            expanded: lane.expanded
          };
          laneY += layout.height;
          return [layout];
        }) ?? [];
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

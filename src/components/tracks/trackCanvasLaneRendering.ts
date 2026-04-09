"use client";

import {
  AutomationKeyframeRect,
  HoveredAutomationKeyframe,
  renderAutomationLane,
  renderFixedLane
} from "@/components/tracks/trackCanvasAutomationLane";
import { BEAT_WIDTH, HEADER_WIDTH, TRACK_CANVAS_COLORS } from "@/components/tracks/trackCanvasConstants";
import { AutomationLaneLayout } from "@/components/tracks/trackCanvasTypes";
import { getTrackAutomationPoints, getTrackMacroLane, getTrackVolumeLane } from "@/lib/macroAutomation";
import { Project, Track } from "@/types/music";

export interface AutomatedLaneRenderSpec {
  kind: "automated";
  laneId: string;
  name: string;
  points: ReturnType<typeof getTrackAutomationPoints>;
  expanded: boolean;
  y: number;
  height: number;
}

export interface FixedLaneRenderSpec {
  kind: "fixed";
  macroId: string;
  name: string;
  defaultValue: number;
  value: number;
  y: number;
  height: number;
}

export type LaneRenderSpec = AutomatedLaneRenderSpec | FixedLaneRenderSpec;

export const resolveAutomatedTrackLane = (track: Track, automationLayout: AutomationLaneLayout) =>
  automationLayout.laneType === "volume"
    ? getTrackVolumeLane(track)
    : automationLayout.macroId
      ? getTrackMacroLane(track, automationLayout.macroId)
      : null;

export const resolveLaneRenderSpec = (
  track: Track,
  trackPatch: Project["patches"][number] | undefined,
  automationLayout: AutomationLaneLayout,
  totalBeats: number
): LaneRenderSpec | null => {
  if (automationLayout.automated) {
    const lane = resolveAutomatedTrackLane(track, automationLayout);
    if (!lane) {
      return null;
    }
    return {
      kind: "automated",
      laneId: automationLayout.laneId,
      name: automationLayout.name,
      points: getTrackAutomationPoints(lane, totalBeats),
      expanded: automationLayout.expanded,
      y: automationLayout.y,
      height: automationLayout.height
    };
  }

  if (!automationLayout.macroId) {
    return null;
  }
  const macro = trackPatch?.ui.macros.find((entry: Project["patches"][number]["ui"]["macros"][number]) => entry.id === automationLayout.macroId);
  if (!macro) {
    return null;
  }
  return {
    kind: "fixed",
    macroId: macro.id,
    name: macro.name,
    defaultValue: macro.defaultNormalized ?? 0.5,
    value: track.macroValues[macro.id] ?? macro.defaultNormalized ?? 0.5,
    y: automationLayout.y,
    height: automationLayout.height
  };
};

export function renderLaneSpec(
  ctx: CanvasRenderingContext2D,
  spec: LaneRenderSpec,
  options: {
    hoveredAutomationKeyframe: HoveredAutomationKeyframe | null;
    registerHitTargets: boolean;
    automationKeyframeSelectionKeys?: ReadonlySet<string>;
    trackId: string;
    veilTimeline?: boolean;
    width: number;
  },
  automationKeyframeRects: AutomationKeyframeRect[]
) {
  if (spec.kind === "automated") {
    renderAutomationLane({
      automationKeyframeRects,
      beatWidth: BEAT_WIDTH,
      colors: TRACK_CANVAS_COLORS,
      ctx,
      expanded: spec.expanded,
      headerWidth: HEADER_WIDTH,
      height: spec.height,
      hoveredAutomationKeyframe: options.hoveredAutomationKeyframe,
      laneY: spec.y,
      macroId: spec.laneId,
      macroName: spec.name,
      points: spec.points,
      registerHitTargets: options.registerHitTargets,
      automationKeyframeSelectionKeys: options.automationKeyframeSelectionKeys,
      trackId: options.trackId,
      veilTimeline: options.veilTimeline,
      width: options.width
    });
    return;
  }

  renderFixedLane({
    beatWidth: BEAT_WIDTH,
    colors: TRACK_CANVAS_COLORS,
    ctx,
    headerWidth: HEADER_WIDTH,
    height: spec.height,
    laneY: spec.y,
    name: spec.name,
    defaultValue: spec.defaultValue,
    value: spec.value,
    veilTimeline: options.veilTimeline,
    width: options.width
  });
}

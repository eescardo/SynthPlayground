import { CanvasCursor } from "@/components/tracks/trackCanvasGeometry";

export const HEADER_WIDTH = 170;
export const RULER_HEIGHT = 28;
export const TRACK_HEIGHT = 72;
export const AUTOMATION_LANE_HEIGHT = 56;
export const AUTOMATION_LANE_COLLAPSED_HEIGHT = 22;
export const BEAT_WIDTH = 72;
export const MUTE_ICON_SIZE = 16;
export const NOTE_RESIZE_HANDLE_WIDTH = 8;
export const SPEAKER_X = 126;
export const SPEAKER_Y_OFFSET = 22;
export const MACRO_PANEL_TOGGLE_Y_OFFSET = 45;
export const SPEAKER_ICON_SRC = "/icons/speaker.svg";
export const SPEAKER_MUTED_ICON_SRC = "/icons/speaker-muted.svg";
export const MOVE_CURSOR = "move";
export const MOVE_CURSOR_ACTIVE = "grabbing";
export const RESIZE_CURSOR = "ew-resize";

export const TRACK_CANVAS_COLORS = {
  canvasBg: "#0a1118",
  headerBg: "#121b27",
  rulerBg: "#0d1620",
  barGrid: "#2f4f7f",
  beatGrid: "#1e3551",
  subGrid: "#142230",
  rulerText: "#8fb8e8",
  rowSeparator: "#1a2e42",
  selectedTrackOverlay: "rgba(33, 112, 210, 0.2)",
  trackName: "#d4e4ff",
  trackInvalidOverlay: "rgba(214, 76, 76, 0.18)",
  trackInvalidName: "#ffb1b1",
  note: "#2d8cff",
  noteHover: "#43a0ff",
  noteMuted: "#405f83",
  noteMutedHover: "#55769e",
  noteOverlap: "#dc4a4a",
  noteOverlapHover: "#ef6262",
  noteOverlapMuted: "#7b4b4b",
  noteOverlapMutedHover: "#946060",
  noteEdgeHighlight: "rgba(255, 255, 255, 0.2)",
  noteHoverBorder: "rgba(214, 238, 255, 0.95)",
  notePitchHover: "rgba(255, 219, 120, 0.26)",
  noteLabel: "#ecf5ff",
  noteSelectedOverlay: "rgba(210, 234, 255, 0.16)",
  noteSelectedBorder: "#d4ecff",
  selectionBoundary: "rgba(255, 123, 151, 0.58)",
  selectionSourceIndicator: "rgba(255, 112, 112, 0.92)",
  selectionFill: "rgba(79, 184, 255, 0.2)",
  selectionBorder: "rgba(183, 228, 255, 0.95)",
  overlapRange: "rgba(255, 35, 35, 0.52)",
  playhead: "#ff5a7b",
  ghostPlayhead: "rgba(121, 201, 255, 0.82)",
  countInBadge: "rgba(255, 208, 113, 0.18)",
  countInBadgeBorder: "rgba(255, 208, 113, 0.48)",
  countInText: "#ffe5a9",
  muteIconFallback: "#ff8092",
  unmuteIconFallback: "#a7c8eb",
  loopStart: "#6ddb84",
  loopEnd: "#6edec6",
  loopUnmatched: "#e27a7a",
  loopGhost: "rgba(255, 90, 123, 0.35)",
  loopMarkerText: "#07281e",
  automationLaneBg: "rgba(18, 35, 51, 0.92)",
  automationLaneBorder: "rgba(103, 157, 219, 0.38)",
  automationLaneTimelineVeil: "rgba(12, 24, 35, 0.5)",
  automationFill: "rgba(45, 140, 255, 0.22)",
  automationLine: "#84c0ff",
  automationHandle: "#d8ecff",
  automationHandleBorder: "#0d2944",
  automationLabel: "#9ec8f5"
} as const;

export const resolveTrackCanvasCursor = (canvasCursor: CanvasCursor): string => {
  if (canvasCursor === "move") {
    return MOVE_CURSOR;
  }
  if (canvasCursor === "move-active") {
    return MOVE_CURSOR_ACTIVE;
  }
  if (canvasCursor === "resize") {
    return RESIZE_CURSOR;
  }
  return canvasCursor;
};

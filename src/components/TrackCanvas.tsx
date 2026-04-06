"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MacroPanel } from "@/components/MacroPanel";
import { SelectionActionPopover } from "@/components/SelectionActionPopover";
import {
  automationValueFromY,
  AutomationKeyframeRect,
  findAutomationKeyframeRect,
  renderAutomationLane
} from "@/components/trackCanvasAutomationLane";
import { TrackVolumePopover } from "@/components/TrackVolumePopover";
import {
  CanvasCursor,
  findMuteRect,
  findPitchRect,
  findLoopMarkerRect,
  getHoverTarget,
  getCursorForPosition,
  isOverPlayhead,
  LOOP_MARKER_BAR_WIDTH,
  LOOP_MARKER_DOT_OFFSET_Y,
  LOOP_MARKER_DOT_RADIUS,
  LOOP_MARKER_HOVER_RING_RADIUS,
  LoopMarkerRect,
  MuteRect,
  PitchRect,
  PLAYHEAD_HIT_HALF_WIDTH
} from "@/components/trackCanvasGeometry";
import {
  drawNoteBody,
  fillRoundedRect,
  NOTE_CORNER_RADIUS,
  strokeRoundedRect
} from "@/components/trackCanvasNoteGeometry";
import { useVolumePopover } from "@/hooks/useVolumePopover";
import { getLoopMarkerStates } from "@/lib/looping";
import {
  AutomationKeyframeSide,
  getProjectTimelineEndBeat,
  getTrackAutomationPoints,
  getTrackMacroLane
} from "@/lib/macroAutomation";
import { createDefaultPlacedNote } from "@/lib/noteDefaults";
import { resolvePatchPresetStatus, resolvePatchSource } from "@/lib/patch/source";
import { getNoteSelectionKey } from "@/lib/noteClipboard";
import { isTrackVolumeMuted } from "@/lib/trackVolume";
import { midiToPitch, pitchToMidi } from "@/lib/pitch";
import { formatBeatName, snapToGrid } from "@/lib/musicTiming";
import { Project, Note, Track } from "@/types/music";

const HEADER_WIDTH = 170;
const RULER_HEIGHT = 28;
const TRACK_HEIGHT = 72;
const AUTOMATION_LANE_HEIGHT = 56;
const AUTOMATION_LANE_COLLAPSED_HEIGHT = 22;
const BEAT_WIDTH = 72;
const MUTE_ICON_SIZE = 16;
const NOTE_RESIZE_HANDLE_WIDTH = 8;
const SPEAKER_X = 126;
const SPEAKER_Y_OFFSET = 29;
const SPEAKER_ICON_SRC = "/icons/speaker.svg";
const SPEAKER_MUTED_ICON_SRC = "/icons/speaker-muted.svg";
const MOVE_CURSOR = "move";
const MOVE_CURSOR_ACTIVE = "grabbing";
const RESIZE_CURSOR = "ew-resize";
const TRACK_CANVAS_COLORS = {
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

interface TrackCanvasProps {
  project: Project;
  invalidPatchIds?: Set<string>;
  selectedTrackId?: string;
  playheadBeat: number;
  activeRecordedNotes?: Array<{ trackId: string; noteId: string; startBeat: number }>;
  ghostPlayheadBeat?: number;
  countInLabel?: string;
  timelineActionsPopoverOpen?: boolean;
  selectedNoteKeys?: ReadonlySet<string>;
  selectionBeatRange?: { startBeat: number; endBeat: number } | null;
  selectionSourceTrackId?: string;
  selectionSourceTrackName?: string;
  selectionIndicatorTrackId?: string;
  hideSelectionActionPopover?: boolean;
  onSetPlayheadBeat: (beat: number) => void;
  onRequestTimelineActionsPopover: (request: TimelineActionsPopoverRequest) => void;
  onSelectTrack: (trackId: string) => void;
  onRenameTrack: (trackId: string, name: string) => void;
  onToggleTrackMute: (trackId: string) => void;
  onSetTrackVolume: (trackId: string, volume: number, options?: { commit?: boolean }) => void;
  onUpdateTrackPatch: (trackId: string, patchId: string) => void;
  onToggleTrackMacroPanel: (trackId: string) => void;
  onChangeTrackMacro: (trackId: string, macroId: string, normalized: number, options?: { commit?: boolean }) => void;
  onBindTrackMacroToAutomation: (trackId: string, macroId: string, normalized: number) => void;
  onUnbindTrackMacroFromAutomation: (trackId: string, macroId: string) => void;
  onToggleTrackMacroAutomationLane: (trackId: string, macroId: string) => void;
  onUpsertTrackMacroAutomationKeyframe: (
    trackId: string,
    macroId: string,
    beat: number,
    value: number,
    options?: { keyframeId?: string; commit?: boolean }
  ) => void;
  onSplitTrackMacroAutomationKeyframe: (trackId: string, macroId: string, keyframeId: string) => void;
  onUpdateTrackMacroAutomationKeyframeSide: (
    trackId: string,
    macroId: string,
    keyframeId: string,
    side: AutomationKeyframeSide,
    value: number,
    options?: { commit?: boolean }
  ) => void;
  onDeleteTrackMacroAutomationKeyframeSide: (
    trackId: string,
    macroId: string,
    keyframeId: string,
    side: AutomationKeyframeSide
  ) => void;
  onPreviewTrackMacroAutomation: (trackId: string, macroId: string, normalized: number, options?: { retrigger?: boolean }) => void;
  onResetTrackMacros: (trackId: string) => void;
  onOpenPitchPicker: (trackId: string, noteId: string) => void;
  onPreviewPlacedNote: (trackId: string, note: Note) => void;
  onUpsertNote: (trackId: string, note: Note, options?: { actionKey?: string; coalesce?: boolean }) => void;
  onUpdateNote: (trackId: string, noteId: string, patch: Partial<Note>, options?: { actionKey?: string; coalesce?: boolean }) => void;
  onDeleteNote: (trackId: string, noteId: string) => void;
  onSetNoteSelection: (selectionKeys: string[]) => void;
  onSetSelectionMarqueeActive: (active: boolean) => void;
  onPreviewSelectionActionScopeChange: (scope: "source" | "all-tracks") => void;
  onCopySelection: () => void;
  onCutSelection: () => void;
  onDeleteSelection: () => void;
  onCopyAllTracksInSelection: () => void;
  onCutAllTracksInSelection: () => void;
  onDeleteAllTracksInSelection: () => void;
}

interface DragState {
  trackId: string;
  noteId: string;
  mode: "move" | "resize";
  offsetBeats: number;
  noteStartBeats: number;
}

interface NoteRect {
  trackId: string;
  noteId: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface SelectionRect {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

interface PendingCanvasAction {
  trackId: string;
  startX: number;
  startY: number;
  beat: number;
  pointerId: number;
}

interface AutomationLaneLayout {
  macroId: string;
  name: string;
  y: number;
  height: number;
  expanded: boolean;
}

interface TrackLayout {
  trackId: string;
  index: number;
  y: number;
  height: number;
  automationLanes: AutomationLaneLayout[];
}

interface PendingAutomationAction {
  trackId: string;
  macroId: string;
  beat: number;
  value: number;
  pointerId: number;
}

interface AutomationDragState {
  trackId: string;
  macroId: string;
  keyframeId: string;
  beat: number;
  side: AutomationKeyframeSide;
  boundary: "start" | "end" | null;
}

export interface TimelineActionsPopoverRequest {
  beat: number;
  clientX: number;
  clientY: number;
}

interface HoveredLoopMarker {
  markerId: string;
  kind: "start" | "end";
  beat: number;
}

function drawGhostPlayhead(
  ctx: CanvasRenderingContext2D,
  ghostPlayheadBeat: number | undefined,
  countInLabel: string | undefined,
  height: number
) {
  if (typeof ghostPlayheadBeat !== "number" || !Number.isFinite(ghostPlayheadBeat)) {
    return;
  }

  const ghostX = HEADER_WIDTH + ghostPlayheadBeat * BEAT_WIDTH;
  ctx.strokeStyle = TRACK_CANVAS_COLORS.ghostPlayhead;
  ctx.lineWidth = 2;
  ctx.setLineDash([7, 6]);
  ctx.beginPath();
  ctx.moveTo(ghostX, 0);
  ctx.lineTo(ghostX, height);
  ctx.stroke();
  ctx.setLineDash([]);

  if (!countInLabel) {
    return;
  }

  const badgeWidth = 34;
  const badgeHeight = 24;
  const badgeX = ghostX - badgeWidth * 0.5;
  const badgeY = 6;
  ctx.fillStyle = TRACK_CANVAS_COLORS.countInBadge;
  ctx.strokeStyle = TRACK_CANVAS_COLORS.countInBadgeBorder;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, 8);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = TRACK_CANVAS_COLORS.countInText;
  ctx.font = "bold 14px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textAlign = "center";
  ctx.fillText(countInLabel, ghostX, badgeY + 16);
  ctx.textAlign = "start";
}

function drawLoopMarker(
  ctx: CanvasRenderingContext2D,
  x: number,
  height: number,
  kind: "start" | "end",
  color: string,
  hovered: boolean,
  repeatCount?: number
) {
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = color;
  ctx.fillRect(x - LOOP_MARKER_BAR_WIDTH * 0.5, 0, LOOP_MARKER_BAR_WIDTH, height);

  const dotX = kind === "start" ? x + 10 : x - 10;
  const topDotY = RULER_HEIGHT * 0.5 - LOOP_MARKER_DOT_OFFSET_Y;
  const bottomDotY = RULER_HEIGHT * 0.5 + LOOP_MARKER_DOT_OFFSET_Y;
  ctx.beginPath();
  ctx.arc(dotX, topDotY, LOOP_MARKER_DOT_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(dotX, bottomDotY, LOOP_MARKER_DOT_RADIUS, 0, Math.PI * 2);
  ctx.fill();

  if (hovered) {
    ctx.globalAlpha = 0.3;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(x - LOOP_MARKER_BAR_WIDTH * 0.5 - 1, 0, LOOP_MARKER_BAR_WIDTH + 2, height);
    ctx.beginPath();
    ctx.arc(dotX, topDotY, LOOP_MARKER_HOVER_RING_RADIUS, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(dotX, bottomDotY, LOOP_MARKER_HOVER_RING_RADIUS, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (kind === "end" && repeatCount !== undefined) {
    ctx.globalAlpha = 1;
    ctx.fillStyle = TRACK_CANVAS_COLORS.loopMarkerText;
    ctx.font = "bold 11px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.textAlign = "center";
    ctx.fillText(String(repeatCount), x, 16);
    ctx.textAlign = "start";
  }

  ctx.restore();
}

const findTrackOverlaps = (notes: Note[]): {
  overlapNoteIds: Set<string>;
  overlapRanges: Array<{ startBeat: number; endBeat: number }>;
} => {
  const overlapNoteIds = new Set<string>();
  const ranges: Array<{ startBeat: number; endBeat: number }> = [];
  const sorted = [...notes].sort((a, b) => a.startBeat - b.startBeat);
  const epsilon = 1e-9;

  for (let i = 0; i < sorted.length; i += 1) {
    const a = sorted[i];
    const aEnd = a.startBeat + a.durationBeats;
    for (let j = i + 1; j < sorted.length; j += 1) {
      const b = sorted[j];
      if (b.startBeat >= aEnd - epsilon) {
        break;
      }
      const bEnd = b.startBeat + b.durationBeats;
      const overlapStart = Math.max(a.startBeat, b.startBeat);
      const overlapEnd = Math.min(aEnd, bEnd);
      if (overlapEnd > overlapStart + epsilon) {
        overlapNoteIds.add(a.id);
        overlapNoteIds.add(b.id);
        ranges.push({ startBeat: overlapStart, endBeat: overlapEnd });
      }
    }
  }

  if (ranges.length === 0) {
    return { overlapNoteIds, overlapRanges: [] };
  }

  ranges.sort((a, b) => a.startBeat - b.startBeat);
  const merged: Array<{ startBeat: number; endBeat: number }> = [ranges[0]];
  for (let i = 1; i < ranges.length; i += 1) {
    const current = ranges[i];
    const last = merged[merged.length - 1];
    if (current.startBeat <= last.endBeat + epsilon) {
      last.endBeat = Math.max(last.endBeat, current.endBeat);
    } else {
      merged.push({ ...current });
    }
  }

  return { overlapNoteIds, overlapRanges: merged };
};


export function TrackCanvas(props: TrackCanvasProps) {
  const { onUpdateNote, project } = props;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const pendingCanvasActionRef = useRef<PendingCanvasAction | null>(null);
  const automationDragRef = useRef<AutomationDragState | null>(null);
  const pendingAutomationActionRef = useRef<PendingAutomationAction | null>(null);
  const noteRectsRef = useRef<NoteRect[]>([]);
  const automationKeyframeRectsRef = useRef<AutomationKeyframeRect[]>([]);
  const muteRectsRef = useRef<MuteRect[]>([]);
  const pitchRectsRef = useRef<PitchRect[]>([]);
  const loopMarkerRectsRef = useRef<LoopMarkerRect[]>([]);
  const speakerIconsRef = useRef<{ normal: HTMLImageElement | null; muted: HTMLImageElement | null }>({
    normal: null,
    muted: null
  });
  const wheelPitchLockUntilRef = useRef(0);
  const wheelLockedScrollTopRef = useRef(0);
  const wheelLockedScrollLeftRef = useRef(0);
  const wheelLockTimerRef = useRef<number | null>(null);
  const [hoveredPitch, setHoveredPitch] = useState<{ trackId: string; noteId: string } | null>(null);
  const [hoveredNote, setHoveredNote] = useState<{ trackId: string; noteId: string } | null>(null);
  const [hoveredAutomationKeyframe, setHoveredAutomationKeyframe] = useState<{ trackId: string; macroId: string; keyframeId: string; side: AutomationKeyframeSide } | null>(null);
  const [hoveredLoopMarker, setHoveredLoopMarker] = useState<HoveredLoopMarker | null>(null);
  const [hoveredPlayhead, setHoveredPlayhead] = useState(false);
  const [speakerIconsReady, setSpeakerIconsReady] = useState(false);
  const [canvasCursor, setCanvasCursor] = useState<CanvasCursor>("default");
  const [editingTrackId, setEditingTrackId] = useState<string | null>(null);
  const [editingTrackName, setEditingTrackName] = useState("");
  const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null);
  const {
    volumePopoverTrackId,
    openVolumePopover,
    closeVolumePopover,
    scheduleVolumePopoverOpen,
    scheduleVolumePopoverDismiss,
    cancelScheduledVolumePopoverDismiss
  } = useVolumePopover();

  const meterBeats = props.project.global.meter === "4/4" ? 4 : 3;
  const selectedTrack = props.project.tracks.find((track) => track.id === props.selectedTrackId) ?? null;
  const selectedPatch = selectedTrack
    ? props.project.patches.find((patch) => patch.id === selectedTrack.instrumentPatchId) ?? null
    : null;
  const selectionPopoverLeft = props.selectionBeatRange
    ? HEADER_WIDTH + props.selectionBeatRange.endBeat * BEAT_WIDTH + 14
    : 0;
  const selectionPopoverTop = 10;

  const getPatchOptionLabel = useCallback((patch: Project["patches"][number]) => {
    const presetStatus = resolvePatchPresetStatus(patch);
    if (presetStatus === "legacy_preset") {
      return `${patch.name} (Legacy Preset)`;
    }
    if (presetStatus === "preset_update_available") {
      return `${patch.name} (Preset Update Available)`;
    }
    if (resolvePatchSource(patch) === "custom") {
      return `${patch.name} (Custom)`;
    }
    return `${patch.name} (Preset)`;
  }, []);

  const totalBeats = useMemo(() => {
    return getProjectTimelineEndBeat(props.project);
  }, [props.project]);

  const width = HEADER_WIDTH + totalBeats * BEAT_WIDTH;
  const trackLayouts = useMemo<TrackLayout[]>(() => {
    let currentY = RULER_HEIGHT;
    return props.project.tracks.map((track, index) => {
      const trackY = currentY;
      const patch = props.project.patches.find((entry) => entry.id === track.instrumentPatchId);
      let laneY = trackY + TRACK_HEIGHT;
      const automationLanes = patch?.ui.macros.flatMap((macro) => {
        const lane = getTrackMacroLane(track, macro.id);
        if (!lane) {
          return [];
        }
        const layout: AutomationLaneLayout = {
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
  }, [props.project.patches, props.project.tracks]);
  const height = trackLayouts.at(-1) ? trackLayouts[trackLayouts.length - 1].y + trackLayouts[trackLayouts.length - 1].height : RULER_HEIGHT;

  const beatFromX = (x: number) => (x - HEADER_WIDTH) / BEAT_WIDTH;
  const isTrackSilenced = useCallback((track: Track) => track.mute || isTrackVolumeMuted(track.volume), []);

  const getCanvasPoint = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return { x: 0, y: 0 };
    }
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
    const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  const getTrackLayoutAtY = useCallback((y: number): TrackLayout | null => {
    if (y < RULER_HEIGHT) {
      return null;
    }
    return trackLayouts.find((layout) => y >= layout.y && y <= layout.y + layout.height) ?? null;
  }, [trackLayouts]);

  const getTrackAtY = (y: number): Track | null => {
    const layout = getTrackLayoutAtY(y);
    if (!layout) {
      return null;
    }
    return props.project.tracks.find((track) => track.id === layout.trackId) ?? null;
  };

  const getAutomationLaneAtPoint = useCallback((x: number, y: number): { track: Track; lane: AutomationLaneLayout } | null => {
    if (x < HEADER_WIDTH) {
      return null;
    }
    const layout = getTrackLayoutAtY(y);
    if (!layout) {
      return null;
    }
    const lane = layout.automationLanes.find((entry) => y >= entry.y && y <= entry.y + entry.height);
    if (!lane) {
      return null;
    }
    const track = props.project.tracks.find((entry) => entry.id === layout.trackId);
    return track ? { track, lane } : null;
  }, [getTrackLayoutAtY, props.project.tracks]);

  const resolvePointerTargets = useCallback((x: number, y: number) => {
    const automationLaneHit = getAutomationLaneAtPoint(x, y);
    const muteRect = findMuteRect(muteRectsRef.current, x, y);
    const pitchRect = findPitchRect(pitchRectsRef.current, x, y);
    const noteRect = findNoteRect(x, y);
    const loopMarkerRect = automationLaneHit ? null : findLoopMarkerRect(loopMarkerRectsRef.current, x, y);
    const playheadHit = automationLaneHit
      ? false
      : isOverPlayhead(x, props.playheadBeat, HEADER_WIDTH, BEAT_WIDTH, PLAYHEAD_HIT_HALF_WIDTH);
    const hoverTarget = getHoverTarget({
      hasMuteHit: Boolean(muteRect),
      hasPitchHit: Boolean(pitchRect),
      hasLoopMarkerHit: Boolean(loopMarkerRect),
      hasPlayheadHit: playheadHit,
      noteRect
    });
    return {
      muteRect,
      pitchRect,
      noteRect,
      automationLaneHit,
      loopMarkerRect,
      playheadHit,
      hoverTarget
    };
  }, [getAutomationLaneAtPoint, props.playheadBeat]);

  const updateSelectionFromRect = useCallback((nextRect: SelectionRect | null) => {
    setSelectionRect(nextRect);
    props.onSetSelectionMarqueeActive(Boolean(nextRect));
    if (!nextRect) {
      return;
    }

    const left = Math.min(nextRect.startX, nextRect.endX);
    const right = Math.max(nextRect.startX, nextRect.endX);
    const top = Math.min(nextRect.startY, nextRect.endY);
    const bottom = Math.max(nextRect.startY, nextRect.endY);
    const selectedKeys = noteRectsRef.current
      .filter((rect) => rect.x < right && rect.x + rect.w > left && rect.y < bottom && rect.y + rect.h > top)
      .map((rect) => getNoteSelectionKey(rect.trackId, rect.noteId));
    props.onSetNoteSelection(selectedKeys);
  }, [props]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = width;
    canvas.height = height;

    ctx.fillStyle = TRACK_CANVAS_COLORS.canvasBg;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = TRACK_CANVAS_COLORS.headerBg;
    ctx.fillRect(0, 0, HEADER_WIDTH, height);

    ctx.fillStyle = TRACK_CANVAS_COLORS.rulerBg;
    ctx.fillRect(HEADER_WIDTH, 0, width - HEADER_WIDTH, RULER_HEIGHT);

    for (let beat = 0; beat <= totalBeats; beat += props.project.global.gridBeats) {
      const x = HEADER_WIDTH + beat * BEAT_WIDTH;
      const isBar = beat % meterBeats === 0;
      const isBeat = Number.isInteger(beat);

      ctx.strokeStyle = isBar
        ? TRACK_CANVAS_COLORS.barGrid
        : isBeat
          ? TRACK_CANVAS_COLORS.beatGrid
          : TRACK_CANVAS_COLORS.subGrid;
      ctx.lineWidth = isBar ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();

      if (isBeat) {
        ctx.fillStyle = TRACK_CANVAS_COLORS.rulerText;
        ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillText(formatBeatName(beat, props.project.global.gridBeats), x + 4, 18);
      }
    }

    ctx.strokeStyle = TRACK_CANVAS_COLORS.rowSeparator;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, RULER_HEIGHT);
    ctx.lineTo(width, RULER_HEIGHT);
    for (const layout of trackLayouts) {
      const y = layout.y + layout.height;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    noteRectsRef.current = [];
    automationKeyframeRectsRef.current = [];
    muteRectsRef.current = [];
    pitchRectsRef.current = [];
    loopMarkerRectsRef.current = [];
    const activeRecordedNoteById = new Map(
      (props.activeRecordedNotes ?? []).map((entry) => [`${entry.trackId}:${entry.noteId}`, entry] as const)
    );
    props.project.tracks.forEach((track) => {
      const layout = trackLayouts.find((entry) => entry.trackId === track.id);
      if (!layout) {
        return;
      }
      const y = layout.y;
      const isSelected = track.id === props.selectedTrackId;
      const trackPatchInvalid = props.invalidPatchIds?.has(track.instrumentPatchId) ?? false;
      const { overlapNoteIds, overlapRanges } = findTrackOverlaps(track.notes);
      const trackPatch = props.project.patches.find((entry) => entry.id === track.instrumentPatchId);

      if (isSelected) {
        ctx.fillStyle = TRACK_CANVAS_COLORS.selectedTrackOverlay;
        ctx.fillRect(0, y, width, layout.height);
      }
      if (trackPatchInvalid) {
        ctx.fillStyle = TRACK_CANVAS_COLORS.trackInvalidOverlay;
        ctx.fillRect(0, y, HEADER_WIDTH, TRACK_HEIGHT);
      }

      ctx.fillStyle = trackPatchInvalid ? TRACK_CANVAS_COLORS.trackInvalidName : TRACK_CANVAS_COLORS.trackName;
      ctx.font = "13px 'Trebuchet MS', 'Segoe UI', sans-serif";
      ctx.fillText(track.name, 12, y + 24);
      const muteY = y + 29;
      const trackSilenced = isTrackSilenced(track);
      const speakerIcon = trackSilenced ? speakerIconsRef.current.muted : speakerIconsRef.current.normal;
      if (speakerIconsReady && speakerIcon) {
        ctx.drawImage(speakerIcon, SPEAKER_X, muteY, MUTE_ICON_SIZE, MUTE_ICON_SIZE);
      } else {
        ctx.fillStyle = trackSilenced ? TRACK_CANVAS_COLORS.muteIconFallback : TRACK_CANVAS_COLORS.unmuteIconFallback;
        ctx.fillRect(SPEAKER_X + 2, muteY + 2, 12, 12);
      }
      muteRectsRef.current.push({ trackId: track.id, x: SPEAKER_X, y: muteY, w: MUTE_ICON_SIZE, h: MUTE_ICON_SIZE });

      for (const note of track.notes) {
        const activeRecord = activeRecordedNoteById.get(`${track.id}:${note.id}`);
        const visualDurationBeats = activeRecord
          ? Math.max(note.durationBeats, props.playheadBeat - activeRecord.startBeat, props.project.global.gridBeats)
          : note.durationBeats;
        const noteX = HEADER_WIDTH + note.startBeat * BEAT_WIDTH;
        const noteW = Math.max(8, visualDurationBeats * BEAT_WIDTH);
        const noteY = y + 14;
        const noteH = TRACK_HEIGHT - 28;
        const overlaps = overlapNoteIds.has(note.id);
        const isHovered = hoveredNote?.trackId === track.id && hoveredNote.noteId === note.id;
        const noteSelected = props.selectedNoteKeys?.has(getNoteSelectionKey(track.id, note.id)) ?? false;

        const noteFill = overlaps
          ? trackSilenced
            ? isHovered
              ? TRACK_CANVAS_COLORS.noteOverlapMutedHover
              : TRACK_CANVAS_COLORS.noteOverlapMuted
            : isHovered
              ? TRACK_CANVAS_COLORS.noteOverlapHover
              : TRACK_CANVAS_COLORS.noteOverlap
          : trackSilenced
            ? isHovered
              ? TRACK_CANVAS_COLORS.noteMutedHover
              : TRACK_CANVAS_COLORS.noteMuted
            : isHovered
              ? TRACK_CANVAS_COLORS.noteHover
              : TRACK_CANVAS_COLORS.note;
        drawNoteBody(ctx, noteX, noteY, noteW, noteH, noteFill);

        if (isHovered) {
          strokeRoundedRect(
            ctx,
            noteX + 1,
            noteY + 1,
            Math.max(0, noteW - 2),
            Math.max(0, noteH - 2),
            Math.max(0, NOTE_CORNER_RADIUS - 1),
            TRACK_CANVAS_COLORS.noteHoverBorder,
            2
          );
        }

        if (noteSelected) {
          fillRoundedRect(
            ctx,
            noteX,
            noteY,
            noteW,
            noteH,
            NOTE_CORNER_RADIUS,
            TRACK_CANVAS_COLORS.noteSelectedOverlay
          );
          ctx.setLineDash([5, 3]);
          strokeRoundedRect(
            ctx,
            noteX + 1,
            noteY + 1,
            Math.max(0, noteW - 2),
            Math.max(0, noteH - 2),
            Math.max(0, NOTE_CORNER_RADIUS - 1),
            TRACK_CANVAS_COLORS.noteSelectedBorder,
            2
          );
          ctx.setLineDash([]);
        }

        const labelX = noteX + 6;
        const labelY = noteY + 16;
        const labelWidth = Math.max(14, ctx.measureText(note.pitchStr).width);
        if (hoveredPitch?.trackId === track.id && hoveredPitch.noteId === note.id) {
          fillRoundedRect(ctx, labelX - 3, labelY - 10, labelWidth + 6, 13, 5, TRACK_CANVAS_COLORS.notePitchHover);
        }

        ctx.fillStyle = TRACK_CANVAS_COLORS.noteLabel;
        ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillText(note.pitchStr, labelX, labelY);

        noteRectsRef.current.push({ trackId: track.id, noteId: note.id, x: noteX, y: noteY, w: noteW, h: noteH });
        pitchRectsRef.current.push({
          trackId: track.id,
          noteId: note.id,
          x: labelX - 3,
          y: labelY - 10,
          w: labelWidth + 6,
          h: 13
        });
      }

      for (const overlap of overlapRanges) {
        const overlapX = HEADER_WIDTH + overlap.startBeat * BEAT_WIDTH;
        const overlapW = Math.max(2, (overlap.endBeat - overlap.startBeat) * BEAT_WIDTH);
        ctx.fillStyle = TRACK_CANVAS_COLORS.overlapRange;
        ctx.fillRect(overlapX, y + 14, overlapW, TRACK_HEIGHT - 28);
      }

      for (const automationLayout of layout.automationLanes) {
        const lane = getTrackMacroLane(track, automationLayout.macroId);
        const macro = trackPatch?.ui.macros.find((entry) => entry.id === automationLayout.macroId);
        if (!lane || !macro) {
          continue;
        }
        renderAutomationLane({
          automationKeyframeRects: automationKeyframeRectsRef.current,
          beatWidth: BEAT_WIDTH,
          colors: TRACK_CANVAS_COLORS,
          ctx,
          expanded: automationLayout.expanded,
          headerWidth: HEADER_WIDTH,
          height: automationLayout.height,
          hoveredAutomationKeyframe,
          laneY: automationLayout.y,
          macroId: automationLayout.macroId,
          macroName: macro.name,
          points: getTrackAutomationPoints(lane, totalBeats),
          registerHitTargets: true,
          trackId: track.id,
          width
        });
      }
    });

    const playheadX = HEADER_WIDTH + props.playheadBeat * BEAT_WIDTH;
    if (hoveredPlayhead && !props.timelineActionsPopoverOpen) {
      ctx.strokeStyle = TRACK_CANVAS_COLORS.loopGhost;
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, height);
      ctx.stroke();
    }
    ctx.strokeStyle = TRACK_CANVAS_COLORS.playhead;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, height);
    ctx.stroke();

    const loopMarkers = getLoopMarkerStates(props.project.global.loop);
    for (const marker of loopMarkers) {
      const color =
        marker.kind === "start"
          ? marker.matched
            ? TRACK_CANVAS_COLORS.loopStart
            : TRACK_CANVAS_COLORS.loopUnmatched
          : marker.matched
            ? TRACK_CANVAS_COLORS.loopEnd
            : TRACK_CANVAS_COLORS.loopUnmatched;
      const markerX = HEADER_WIDTH + marker.beat * BEAT_WIDTH;
      const isHovered =
        hoveredLoopMarker?.markerId === marker.markerId &&
        hoveredLoopMarker.kind === marker.kind &&
        hoveredLoopMarker.beat === marker.beat;
      drawLoopMarker(ctx, markerX, height, marker.kind, color, isHovered, marker.repeatCount);
      loopMarkerRectsRef.current.push({ markerId: marker.markerId, kind: marker.kind, beat: marker.beat, x: markerX - 18, y: 0, w: 30, h: height });
    }
    drawGhostPlayhead(ctx, props.ghostPlayheadBeat, props.countInLabel, height);

    props.project.tracks.forEach((track) => {
      const layout = trackLayouts.find((entry) => entry.trackId === track.id);
      const trackPatch = props.project.patches.find((entry) => entry.id === track.instrumentPatchId);
      if (!layout) {
        return;
      }
      for (const automationLayout of layout.automationLanes) {
        const lane = getTrackMacroLane(track, automationLayout.macroId);
        const macro = trackPatch?.ui.macros.find((entry) => entry.id === automationLayout.macroId);
        if (!lane || !macro) {
          continue;
        }
        renderAutomationLane({
          automationKeyframeRects: automationKeyframeRectsRef.current,
          beatWidth: BEAT_WIDTH,
          colors: TRACK_CANVAS_COLORS,
          ctx,
          expanded: automationLayout.expanded,
          headerWidth: HEADER_WIDTH,
          height: automationLayout.height,
          hoveredAutomationKeyframe,
          laneY: automationLayout.y,
          macroId: automationLayout.macroId,
          macroName: macro.name,
          points: getTrackAutomationPoints(lane, totalBeats),
          registerHitTargets: false,
          trackId: track.id,
          veilTimeline: true,
          width
        });
      }
    });

    if (props.selectionBeatRange) {
      const startX = HEADER_WIDTH + props.selectionBeatRange.startBeat * BEAT_WIDTH;
      const endX = HEADER_WIDTH + props.selectionBeatRange.endBeat * BEAT_WIDTH;
      ctx.strokeStyle = TRACK_CANVAS_COLORS.selectionBoundary;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(startX, 0);
      ctx.lineTo(startX, height);
      ctx.moveTo(endX, 0);
      ctx.lineTo(endX, height);
      ctx.stroke();
    }

    if (props.selectionBeatRange && !selectionRect && !props.hideSelectionActionPopover && props.selectionIndicatorTrackId) {
      const indicatorTrackLayout = trackLayouts.find((track) => track.trackId === props.selectionIndicatorTrackId);
      if (indicatorTrackLayout) {
        const indicatorY = indicatorTrackLayout.y;
        ctx.strokeStyle = TRACK_CANVAS_COLORS.selectionSourceIndicator;
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(0, indicatorY + 0.5);
        ctx.lineTo(width, indicatorY + 0.5);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    if (selectionRect) {
      const left = Math.min(selectionRect.startX, selectionRect.endX);
      const top = Math.min(selectionRect.startY, selectionRect.endY);
      const widthRect = Math.abs(selectionRect.endX - selectionRect.startX);
      const heightRect = Math.abs(selectionRect.endY - selectionRect.startY);
      ctx.fillStyle = TRACK_CANVAS_COLORS.selectionFill;
      ctx.fillRect(left, top, widthRect, heightRect);
      ctx.strokeStyle = TRACK_CANVAS_COLORS.selectionBorder;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 4]);
      ctx.strokeRect(left + 0.5, top + 0.5, Math.max(0, widthRect - 1), Math.max(0, heightRect - 1));
      ctx.setLineDash([]);
    }
  }, [
    props.countInLabel,
    props.ghostPlayheadBeat,
    props.hideSelectionActionPopover,
    props.timelineActionsPopoverOpen,
    height,
    hoveredPlayhead,
    hoveredPitch,
    hoveredNote,
    hoveredAutomationKeyframe,
    hoveredLoopMarker,
    isTrackSilenced,
    meterBeats,
    props.activeRecordedNotes,
    props.invalidPatchIds,
    props.playheadBeat,
    props.project.global.gridBeats,
    props.project.global.loop,
    props.project.patches,
    props.project.tracks,
    props.selectionBeatRange,
    props.selectionIndicatorTrackId,
    props.selectedNoteKeys,
    props.selectedTrackId,
    selectionRect,
    speakerIconsReady,
    totalBeats,
    trackLayouts,
    width
  ]);

  useEffect(() => {
    let cancelled = false;

    const loadImage = (src: string): Promise<HTMLImageElement> =>
      new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error(`Failed to load image: ${src}`));
        image.src = src;
      });

    Promise.all([loadImage(SPEAKER_ICON_SRC), loadImage(SPEAKER_MUTED_ICON_SRC)])
      .then(([normal, muted]) => {
        if (cancelled) {
          return;
        }
        speakerIconsRef.current = { normal, muted };
        setSpeakerIconsReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          setSpeakerIconsReady(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    draw();
  }, [draw]);

  const findNoteRect = (x: number, y: number): NoteRect | null => {
    for (const rect of noteRectsRef.current) {
      if (x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h) {
        return rect;
      }
    }
    return null;
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { x, y } = getCanvasPoint(event.clientX, event.clientY);
    const targets = resolvePointerTargets(x, y);
    const automationKeyframe = findAutomationKeyframeRect(automationKeyframeRectsRef.current, x, y);
    const automationLaneHit = targets.automationLaneHit;
    const hasActiveSelection = Boolean(props.selectedNoteKeys?.size);

    if (y <= RULER_HEIGHT && x >= HEADER_WIDTH) {
      if (targets.hoverTarget === "loop-marker" && targets.loopMarkerRect) {
        props.onSetPlayheadBeat(targets.loopMarkerRect.beat);
        props.onRequestTimelineActionsPopover({
          beat: targets.loopMarkerRect.beat,
          clientX: event.clientX,
          clientY: event.clientY
        });
        setCanvasCursor("pointer");
        return;
      }

      if (targets.hoverTarget === "playhead") {
        props.onRequestTimelineActionsPopover({
          beat: props.playheadBeat,
          clientX: event.clientX,
          clientY: event.clientY
        });
        setCanvasCursor("pointer");
        return;
      }

      const beat = Math.max(0, snapToGrid(beatFromX(x), props.project.global.gridBeats));
      props.onSetPlayheadBeat(beat);
      return;
    }

    const track = getTrackAtY(y);
    if (!track) return;

    props.onSelectTrack(track.id);

    if (targets.hoverTarget === "mute" && targets.muteRect) {
      props.onToggleTrackMute(targets.muteRect.trackId);
      setCanvasCursor("pointer");
      return;
    }

    if (x < HEADER_WIDTH) {
      return;
    }

    if (targets.hoverTarget === "loop-marker" && targets.loopMarkerRect) {
      props.onSetPlayheadBeat(targets.loopMarkerRect.beat);
      props.onRequestTimelineActionsPopover({
        beat: targets.loopMarkerRect.beat,
        clientX: event.clientX,
        clientY: event.clientY
      });
      setCanvasCursor("pointer");
      return;
    }

    if (targets.hoverTarget === "playhead") {
      props.onRequestTimelineActionsPopover({
        beat: props.playheadBeat,
        clientX: event.clientX,
        clientY: event.clientY
      });
      setCanvasCursor("pointer");
      return;
    }

    if (targets.hoverTarget === "pitch" && targets.pitchRect && event.button === 0) {
      props.onSetNoteSelection([getNoteSelectionKey(targets.pitchRect.trackId, targets.pitchRect.noteId)]);
      props.onOpenPitchPicker(targets.pitchRect.trackId, targets.pitchRect.noteId);
      setCanvasCursor("pointer");
      return;
    }

    if (event.button === 2) {
      if (automationKeyframe && automationKeyframe.boundary === null) {
        props.onDeleteTrackMacroAutomationKeyframeSide(
          automationKeyframe.trackId,
          automationKeyframe.macroId,
          automationKeyframe.keyframeId,
          automationKeyframe.side
        );
        return;
      }
      if (targets.noteRect) {
        props.onDeleteNote(targets.noteRect.trackId, targets.noteRect.noteId);
      }
      return;
    }

    if (automationKeyframe) {
      automationDragRef.current = {
        trackId: automationKeyframe.trackId,
        macroId: automationKeyframe.macroId,
        keyframeId: automationKeyframe.keyframeId,
        beat: automationKeyframe.beat,
        side: automationKeyframe.side,
        boundary: automationKeyframe.boundary
      };
      canvas.setPointerCapture(event.pointerId);
      setCanvasCursor("ns-resize");
      return;
    }

    if (automationLaneHit) {
      const previewValue = automationValueFromY(y, automationLaneHit.lane.y, automationLaneHit.lane.height);
      pendingAutomationActionRef.current = {
        trackId: automationLaneHit.track.id,
        macroId: automationLaneHit.lane.macroId,
        beat: Math.max(0, snapToGrid(beatFromX(x), props.project.global.gridBeats)),
        value: previewValue,
        pointerId: event.pointerId
      };
      canvas.setPointerCapture(event.pointerId);
      return;
    }

    if (targets.noteRect) {
      const note = track.notes.find((entry) => entry.id === targets.noteRect?.noteId);
      if (!note) return;

      props.onSetNoteSelection([getNoteSelectionKey(targets.noteRect.trackId, targets.noteRect.noteId)]);
      const beat = beatFromX(x);
      const nearRightEdge = x > targets.noteRect.x + targets.noteRect.w - NOTE_RESIZE_HANDLE_WIDTH;
      dragRef.current = {
        trackId: targets.noteRect.trackId,
        noteId: targets.noteRect.noteId,
        mode: nearRightEdge ? "resize" : "move",
        offsetBeats: beat - note.startBeat,
        noteStartBeats: note.startBeat
      };
      setCanvasCursor(nearRightEdge ? "resize" : "move-active");
      canvas.setPointerCapture(event.pointerId);
      return;
    }

    if (hasActiveSelection) {
      props.onSetNoteSelection([]);
      props.onPreviewSelectionActionScopeChange("source");
      setSelectionRect(null);
      props.onSetSelectionMarqueeActive(false);
      pendingCanvasActionRef.current = null;
      setCanvasCursor("default");
      return;
    }

    pendingCanvasActionRef.current = {
      trackId: track.id,
      startX: x,
      startY: y,
      beat: Math.max(0, snapToGrid(beatFromX(x), props.project.global.gridBeats)),
      pointerId: event.pointerId
    };
    setSelectionRect(null);
    props.onSetSelectionMarqueeActive(false);
    canvas.setPointerCapture(event.pointerId);
  };

  useEffect(() => {
    if (!editingTrackId) {
      return;
    }
    const trackStillExists = props.project.tracks.some((track) => track.id === editingTrackId);
    if (!trackStillExists) {
      setEditingTrackId(null);
      setEditingTrackName("");
    }
  }, [editingTrackId, props.project.tracks]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeVolumePopover();
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest(".track-volume-button, .track-volume-popover")) {
        return;
      }
      closeVolumePopover();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [closeVolumePopover]);

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { x, y } = getCanvasPoint(event.clientX, event.clientY);
    const targets = resolvePointerTargets(x, y);
    const automationKeyframe = findAutomationKeyframeRect(automationKeyframeRectsRef.current, x, y);
    const automationLaneHit = targets.automationLaneHit;
    setHoveredPlayhead(automationLaneHit ? false : targets.hoverTarget === "playhead");
    setHoveredLoopMarker((prev) => {
      const next = !automationLaneHit && targets.hoverTarget === "loop-marker" && targets.loopMarkerRect
        ? { markerId: targets.loopMarkerRect.markerId, kind: targets.loopMarkerRect.kind, beat: targets.loopMarkerRect.beat }
        : null;
      if (
        prev?.markerId === next?.markerId &&
        prev?.kind === next?.kind &&
        prev?.beat === next?.beat
      ) {
        return prev;
      }
      return next;
    });
    setHoveredPitch((prev) => {
      const next = targets.pitchRect ? { trackId: targets.pitchRect.trackId, noteId: targets.pitchRect.noteId } : null;
      if (prev?.trackId === next?.trackId && prev?.noteId === next?.noteId) {
        return prev;
      }
      return next;
    });
    setHoveredNote((prev) => {
      const next =
        targets.noteRect || targets.pitchRect
          ? {
              trackId: (targets.pitchRect ?? targets.noteRect)!.trackId,
              noteId: (targets.pitchRect ?? targets.noteRect)!.noteId
            }
          : null;
      if (prev?.trackId === next?.trackId && prev?.noteId === next?.noteId) {
        return prev;
      }
      return next;
    });
    setHoveredAutomationKeyframe((prev) => {
      const next = automationKeyframe
        ? {
            trackId: automationKeyframe.trackId,
            macroId: automationKeyframe.macroId,
            keyframeId: automationKeyframe.keyframeId,
            side: automationKeyframe.side
          }
        : null;
      if (
        prev?.trackId === next?.trackId &&
        prev?.macroId === next?.macroId &&
        prev?.keyframeId === next?.keyframeId &&
        prev?.side === next?.side
      ) {
        return prev;
      }
      return next;
    });

    const drag = dragRef.current;
    const pendingAction = pendingCanvasActionRef.current;
    const automationDrag = automationDragRef.current;
    const pendingAutomationAction = pendingAutomationActionRef.current;
    if (!drag && !automationDrag && pendingAutomationAction) {
      const lane = automationLaneHit?.lane;
      if (!lane) {
        return;
      }
      const nextValue = automationValueFromY(y, lane.y, lane.height);
      pendingAutomationActionRef.current = {
        ...pendingAutomationAction,
        value: nextValue
      };
      props.onPreviewTrackMacroAutomation(pendingAutomationAction.trackId, pendingAutomationAction.macroId, nextValue);
      setCanvasCursor("ns-resize");
      return;
    }
    if (!drag && pendingAction) {
      const movedFarEnough =
        Math.abs(x - pendingAction.startX) >= 4 || Math.abs(y - pendingAction.startY) >= 4;
      if (movedFarEnough) {
        updateSelectionFromRect({
          startX: pendingAction.startX,
          startY: pendingAction.startY,
          endX: x,
          endY: y
        });
        setCanvasCursor("default");
      }
      return;
    }

    if (automationDrag) {
      const lane = automationLaneHit?.lane ??
        trackLayouts
          .find((layout) => layout.trackId === automationDrag.trackId)
          ?.automationLanes.find((entry) => entry.macroId === automationDrag.macroId);
      if (!lane) {
        return;
      }
      const nextValue = automationValueFromY(y, lane.y, lane.height);
      props.onPreviewTrackMacroAutomation(automationDrag.trackId, automationDrag.macroId, nextValue);
      if (automationDrag.boundary) {
        props.onUpsertTrackMacroAutomationKeyframe(
          automationDrag.trackId,
          automationDrag.macroId,
          automationDrag.beat,
          nextValue,
          { commit: false }
        );
      } else {
        props.onUpdateTrackMacroAutomationKeyframeSide(
          automationDrag.trackId,
          automationDrag.macroId,
          automationDrag.keyframeId,
          automationDrag.side,
          nextValue,
          { commit: false }
        );
      }
      setCanvasCursor("ns-resize");
      return;
    }

    if (!drag) {
      if (automationKeyframe || automationLaneHit) {
        setCanvasCursor("crosshair");
        return;
      }
      setCanvasCursor(
        getCursorForPosition({
          hasMuteHit: Boolean(targets.muteRect),
          hasPitchHit: Boolean(targets.pitchRect),
          hasLoopMarkerHit: Boolean(targets.loopMarkerRect),
          hasPlayheadHit: targets.playheadHit,
          noteRect: targets.noteRect,
          x,
          noteResizeHandleWidth: NOTE_RESIZE_HANDLE_WIDTH
        })
      );
      return;
    }

    setCanvasCursor(drag.mode === "resize" ? "resize" : "move-active");
    const beat = snapToGrid(Math.max(0, beatFromX(x)), props.project.global.gridBeats);
    const track = props.project.tracks.find((entry) => entry.id === drag.trackId);
    const note = track?.notes.find((entry) => entry.id === drag.noteId);
    if (!note) {
      return;
    }

    if (drag.mode === "move") {
      const nextStart = Math.max(0, snapToGrid(beat - drag.offsetBeats, props.project.global.gridBeats));
      props.onUpdateNote(drag.trackId, drag.noteId, { startBeat: nextStart }, {
        actionKey: `track:${drag.trackId}:note:${drag.noteId}:move`,
        coalesce: true
      });
    } else {
      const end = Math.max(note.startBeat + props.project.global.gridBeats, beat);
      props.onUpdateNote(drag.trackId, drag.noteId, {
        durationBeats: snapToGrid(end - note.startBeat, props.project.global.gridBeats)
      }, {
        actionKey: `track:${drag.trackId}:note:${drag.noteId}:resize`,
        coalesce: true
      });
    }
  };

  const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const hadDrag = Boolean(dragRef.current);
    const automationDrag = automationDragRef.current;
    const hadAutomationDrag = Boolean(automationDrag);
    const pendingAction = pendingCanvasActionRef.current;
    const pendingAutomationAction = pendingAutomationActionRef.current;
    if (canvasRef.current && (dragRef.current || pendingAction || automationDragRef.current || pendingAutomationAction)) {
      try {
        canvasRef.current.releasePointerCapture(event.pointerId);
      } catch {
        // ignore release failures
      }
    }
    dragRef.current = null;
    automationDragRef.current = null;
    if (!canvas) {
      pendingCanvasActionRef.current = null;
      pendingAutomationActionRef.current = null;
      setCanvasCursor("default");
      return;
    }
    const { x, y } = getCanvasPoint(event.clientX, event.clientY);

    const hadSelectionRect = Boolean(selectionRect);
    if (pendingAction && !hadSelectionRect) {
      const newNote = createDefaultPlacedNote(pendingAction.beat, props.project.global.gridBeats);
      props.onUpsertNote(pendingAction.trackId, newNote, {
        actionKey: `track:${pendingAction.trackId}:note:${newNote.id}:create`
      });
      props.onPreviewPlacedNote(pendingAction.trackId, newNote);
    }

    if (pendingAutomationAction) {
      props.onUpsertTrackMacroAutomationKeyframe(
        pendingAutomationAction.trackId,
        pendingAutomationAction.macroId,
        pendingAutomationAction.beat,
        pendingAutomationAction.value,
        { commit: true }
      );
      props.onPreviewTrackMacroAutomation(
        pendingAutomationAction.trackId,
        pendingAutomationAction.macroId,
        pendingAutomationAction.value,
        { retrigger: true }
      );
    } else if (automationDrag) {
      const lane = trackLayouts
        .find((layout) => layout.trackId === automationDrag.trackId)
        ?.automationLanes.find((entry) => entry.macroId === automationDrag.macroId);
      if (lane) {
        const finalValue = automationValueFromY(y, lane.y, lane.height);
        if (automationDrag.boundary) {
          props.onUpsertTrackMacroAutomationKeyframe(
            automationDrag.trackId,
            automationDrag.macroId,
            automationDrag.beat,
            finalValue,
            { commit: true }
          );
        } else {
          props.onUpdateTrackMacroAutomationKeyframeSide(
            automationDrag.trackId,
            automationDrag.macroId,
            automationDrag.keyframeId,
            automationDrag.side,
            finalValue,
            { commit: true }
          );
        }
        props.onPreviewTrackMacroAutomation(
          automationDrag.trackId,
          automationDrag.macroId,
          finalValue,
          { retrigger: true }
        );
      }
    }

    pendingCanvasActionRef.current = null;
    pendingAutomationActionRef.current = null;
    setSelectionRect(null);
    props.onSetSelectionMarqueeActive(false);
    const targets = resolvePointerTargets(x, y);
    if (targets.automationLaneHit || findAutomationKeyframeRect(automationKeyframeRectsRef.current, x, y)) {
      setCanvasCursor("crosshair");
    } else {
      setCanvasCursor(
        getCursorForPosition({
          hasMuteHit: Boolean(targets.muteRect),
          hasPitchHit: Boolean(targets.pitchRect),
          hasLoopMarkerHit: Boolean(targets.loopMarkerRect),
          hasPlayheadHit: targets.playheadHit,
          noteRect: targets.noteRect,
          x,
          noteResizeHandleWidth: NOTE_RESIZE_HANDLE_WIDTH
        })
      );
    }
    if (hadDrag || hadAutomationDrag) {
      return;
    }
  };

  const onPointerLeave = (event: React.PointerEvent<HTMLCanvasElement>) => {
    onPointerUp(event);
    setHoveredPitch(null);
    setHoveredNote(null);
    setHoveredAutomationKeyframe(null);
    setHoveredLoopMarker(null);
    setHoveredPlayhead(false);
    setCanvasCursor("default");
  };

  const onDoubleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) {
      return;
    }
    const { x, y } = getCanvasPoint(event.clientX, event.clientY);
    const automationKeyframe = findAutomationKeyframeRect(automationKeyframeRectsRef.current, x, y);
    if (!automationKeyframe || automationKeyframe.boundary !== null || automationKeyframe.side !== "single") {
      return;
    }
    props.onSplitTrackMacroAutomationKeyframe(
      automationKeyframe.trackId,
      automationKeyframe.macroId,
      automationKeyframe.keyframeId
    );
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;

    const engageWheelLock = (now: number) => {
      const wasUnlocked = now >= wheelPitchLockUntilRef.current;
      wheelPitchLockUntilRef.current = now + 420;
      if (wasUnlocked) {
        wheelLockedScrollTopRef.current = wrapper.scrollTop;
        wheelLockedScrollLeftRef.current = wrapper.scrollLeft;
      }
      wrapper.style.overflowX = "hidden";

      if (wheelLockTimerRef.current !== null) {
        window.clearTimeout(wheelLockTimerRef.current);
      }
      wheelLockTimerRef.current = window.setTimeout(() => {
        wrapper.style.overflowX = "auto";
        wheelLockTimerRef.current = null;
      }, 440);
    };

    const onWheelNative = (event: WheelEvent) => {
      const now = performance.now();
      const { x, y } = getCanvasPoint(event.clientX, event.clientY);
      const hitPitch = findPitchRect(pitchRectsRef.current, x, y);
      const shouldLockScroll = now < wheelPitchLockUntilRef.current;
      if (!hitPitch && !shouldLockScroll) return;

      event.stopPropagation();
      engageWheelLock(now);
      wrapper.scrollTop = wheelLockedScrollTopRef.current;
      wrapper.scrollLeft = wheelLockedScrollLeftRef.current;
      if (!hitPitch) return;

      const track = project.tracks.find((entry) => entry.id === hitPitch.trackId);
      const note = track?.notes.find((entry) => entry.id === hitPitch.noteId);
      if (!note) return;

      let midi = 60;
      try {
        midi = pitchToMidi(note.pitchStr);
      } catch {
        return;
      }
      const semitone = event.deltaY < 0 ? 1 : -1;
      const nextPitch = midiToPitch(Math.max(21, Math.min(108, midi + semitone)));
      onUpdateNote(hitPitch.trackId, hitPitch.noteId, { pitchStr: nextPitch }, {
        actionKey: `track:${hitPitch.trackId}:pitch:${hitPitch.noteId}`
      });
    };

    const onScrollNative = () => {
      if (performance.now() < wheelPitchLockUntilRef.current) {
        wrapper.scrollTop = wheelLockedScrollTopRef.current;
        wrapper.scrollLeft = wheelLockedScrollLeftRef.current;
      }
    };

    wrapper.addEventListener("wheel", onWheelNative, { passive: false, capture: true });
    wrapper.addEventListener("scroll", onScrollNative, { capture: true });
    return () => {
      wrapper.removeEventListener("wheel", onWheelNative, true);
      wrapper.removeEventListener("scroll", onScrollNative, true);
      if (wheelLockTimerRef.current !== null) {
        window.clearTimeout(wheelLockTimerRef.current);
        wheelLockTimerRef.current = null;
      }
      wrapper.style.overflowX = "auto";
    };
  }, [onUpdateNote, project.tracks]);

  return (
    <div className="track-canvas-shell" ref={wrapperRef}>
      <div className="track-header-overlays">
        {project.tracks.map((track) => {
          const layout = trackLayouts.find((entry) => entry.trackId === track.id);
          if (!layout) {
            return null;
          }
          const effectiveVolume = track.mute ? 0 : track.volume;
          const rememberedVolume = track.volume;

          return (
          <div key={track.id}>
            <button
              type="button"
              className="track-name-button"
              aria-label={`Rename track ${track.name}`}
              style={{
                top: `${layout.y + 8}px`,
                cursor: props.selectedTrackId === track.id ? "text" : "default"
              }}
              onClick={(event) => {
                event.stopPropagation();
                if (props.selectedTrackId === track.id) {
                  setEditingTrackId(track.id);
                  setEditingTrackName(track.name);
                } else {
                  props.onSelectTrack(track.id);
                }
              }}
            />
            <button
              type="button"
              className="track-volume-button"
              aria-label={`Track volume for ${track.name}`}
              aria-expanded={volumePopoverTrackId === track.id}
              style={{
                top: `${layout.y + SPEAKER_Y_OFFSET}px`
              }}
              onMouseEnter={() => scheduleVolumePopoverOpen(track.id)}
              onMouseLeave={() => scheduleVolumePopoverDismiss()}
              onClick={(event) => {
                event.stopPropagation();
                props.onToggleTrackMute(track.id);
                openVolumePopover(track.id);
              }}
            />
            {volumePopoverTrackId === track.id && (
              <TrackVolumePopover
                trackName={track.name}
                effectiveVolume={effectiveVolume}
                rememberedVolume={rememberedVolume}
                muted={Boolean(track.mute)}
                top={`${layout.y + 6}px`}
                onMouseEnter={() => cancelScheduledVolumePopoverDismiss()}
                onMouseLeave={() => scheduleVolumePopoverDismiss()}
                onVolumeChange={(volume, options) => props.onSetTrackVolume(track.id, volume, options)}
              />
            )}
            {editingTrackId === track.id && (
              <input
                className="track-name-input"
                value={editingTrackName}
                style={{ top: `${layout.y + 8}px` }}
                autoFocus
                onChange={(event) => setEditingTrackName(event.target.value)}
                onBlur={() => {
                  const nextName = editingTrackName.trim();
                  if (nextName) {
                    props.onRenameTrack(track.id, nextName);
                  }
                  setEditingTrackId(null);
                  setEditingTrackName("");
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.currentTarget.blur();
                  } else if (event.key === "Escape") {
                    setEditingTrackId(null);
                    setEditingTrackName("");
                  }
                }}
                onPointerDown={(event) => event.stopPropagation()}
              />
            )}
            <select
              className={`track-patch-select${(props.invalidPatchIds?.has(track.instrumentPatchId) ?? false) ? " invalid" : ""}`}
              value={track.instrumentPatchId}
              style={{ top: `${layout.y + 44}px` }}
              onChange={(event) => props.onUpdateTrackPatch(track.id, event.target.value)}
              onPointerDown={(event) => event.stopPropagation()}
            >
              {project.patches.map((patch) => (
                <option key={patch.id} value={patch.id}>
                  {getPatchOptionLabel(patch)}
                </option>
              ))}
            </select>
          </div>
          );
        })}
      </div>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{
          cursor:
            canvasCursor === "move"
              ? MOVE_CURSOR
              : canvasCursor === "move-active"
                ? MOVE_CURSOR_ACTIVE
                : canvasCursor === "resize"
                  ? RESIZE_CURSOR
                  : canvasCursor
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerLeave}
        onDoubleClick={onDoubleClick}
        onContextMenu={(event) => event.preventDefault()}
      />
      {props.selectionBeatRange && !selectionRect && !props.hideSelectionActionPopover && (
        <SelectionActionPopover
          left={selectionPopoverLeft}
          top={selectionPopoverTop}
          sourceTrackName={props.selectionSourceTrackName ?? "Track 1"}
          onPreviewScopeChange={props.onPreviewSelectionActionScopeChange}
          onCut={props.onCutSelection}
          onCopy={props.onCopySelection}
          onDelete={props.onDeleteSelection}
          onCutAllTracks={props.onCutAllTracksInSelection}
          onCopyAllTracks={props.onCopyAllTracksInSelection}
          onDeleteAllTracks={props.onDeleteAllTracksInSelection}
        />
      )}
      {selectedTrack && selectedPatch && (
        <div className="track-macro-panel-shell">
          <div className="track-macro-panel-header">
            <div>
              <strong>Track Macros</strong>
              <span className="track-macro-panel-subtitle">
                {selectedTrack.name} · {selectedPatch.name}
              </span>
            </div>
            <div className="track-macro-panel-actions">
              <button type="button" onClick={() => props.onResetTrackMacros(selectedTrack.id)}>
                Reset
              </button>
              <button type="button" onClick={() => props.onToggleTrackMacroPanel(selectedTrack.id)}>
                {selectedTrack.macroPanelExpanded ? "Collapse" : "Expand"}
              </button>
            </div>
          </div>
          {selectedTrack.macroPanelExpanded && (
            <MacroPanel
              patch={selectedPatch}
              macroValues={selectedTrack.macroValues}
              automatedMacroIds={new Set(Object.keys(selectedTrack.macroAutomations))}
              automationExpandedByMacroId={new Map(
                Object.values(selectedTrack.macroAutomations).map((lane) => [lane.macroId, lane.expanded] as const)
              )}
              onMacroChange={(macroId, normalized) => props.onChangeTrackMacro(selectedTrack.id, macroId, normalized)}
              onMacroCommit={(macroId, normalized) =>
                props.onChangeTrackMacro(selectedTrack.id, macroId, normalized, { commit: true })
              }
              onBindMacroToAutomation={(macroId, normalized) =>
                props.onBindTrackMacroToAutomation(selectedTrack.id, macroId, normalized)
              }
              onUnbindMacroFromAutomation={(macroId) => props.onUnbindTrackMacroFromAutomation(selectedTrack.id, macroId)}
              onToggleMacroAutomationLane={(macroId) =>
                props.onToggleTrackMacroAutomationLane(selectedTrack.id, macroId)
              }
            />
          )}
        </div>
      )}
    </div>
  );
}

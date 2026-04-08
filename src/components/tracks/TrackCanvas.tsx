"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SelectionActionPopover } from "@/components/SelectionActionPopover";
import { TrackHeaderChrome } from "@/components/tracks/TrackCanvasChrome";
import {
  automationValueFromY,
  AutomationKeyframeRect,
  findAutomationKeyframeRect,
  renderAutomationLane,
  renderFixedLane
} from "@/components/tracks/trackCanvasAutomationLane";
import {
  BEAT_WIDTH,
  HEADER_WIDTH,
  MUTE_ICON_SIZE,
  NOTE_RESIZE_HANDLE_WIDTH,
  resolveTrackCanvasCursor,
  RULER_HEIGHT,
  SPEAKER_ICON_SRC,
  SPEAKER_MUTED_ICON_SRC,
  SPEAKER_X,
  SPEAKER_Y_OFFSET,
  TRACK_CANVAS_COLORS,
  TRACK_HEIGHT
} from "@/components/tracks/trackCanvasConstants";
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
} from "@/components/tracks/trackCanvasGeometry";
import {
  drawNoteBody,
  fillRoundedRect,
  NOTE_CORNER_RADIUS,
  strokeRoundedRect
} from "@/components/tracks/trackCanvasNoteGeometry";
import {
  AutomationLaneLayout,
  TrackCanvasProps,
  TrackLayout
} from "@/components/tracks/trackCanvasTypes";
import { useTrackCanvasLayout } from "@/components/tracks/useTrackCanvasLayout";
import { useTrackCanvasWheelPitchEditing } from "@/components/tracks/useTrackCanvasWheelPitchEditing";
import { useVolumePopover } from "@/hooks/useVolumePopover";
import { getLoopMarkerStates } from "@/lib/looping";
import {
  AutomationKeyframeSide,
  getProjectTimelineEndBeat,
  getTrackAutomationPoints,
  getTrackMacroLane,
  getTrackVolumeLane
} from "@/lib/macroAutomation";
import { PRIMARY_POINTER_BUTTON, SECONDARY_POINTER_BUTTON } from "@/lib/inputConstants";
import { createDefaultPlacedNote } from "@/lib/noteDefaults";
import { getNoteSelectionKey } from "@/lib/noteClipboard";
import { isTrackVolumeMuted } from "@/lib/trackVolume";
import { formatBeatName, snapToGrid } from "@/lib/musicTiming";
import { Note, Track } from "@/types/music";
export type { TimelineActionsPopoverRequest, TrackCanvasProps, TrackCanvasSelection } from "@/components/tracks/trackCanvasTypes";

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

type PendingCanvasAction =
  | {
      kind: "track";
      trackId: string;
      startX: number;
      startY: number;
      beat: number;
      pointerId: number;
    }
  | {
      kind: "ruler";
      startBeat: number;
      pointerId: number;
    };

interface PendingAutomationAction {
  trackId: string;
  macroId: string;
  beat: number;
  value: number;
  pointerId: number;
}

interface PendingFixedLaneAction {
  trackId: string;
  macroId: string;
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
  const {
    automationActions,
    noteActions,
    project,
    selection,
    selectionActions,
    trackActions
  } = props;
  const { onUpdateNote } = noteActions;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const pendingCanvasActionRef = useRef<PendingCanvasAction | null>(null);
  const automationDragRef = useRef<AutomationDragState | null>(null);
  const pendingAutomationActionRef = useRef<PendingAutomationAction | null>(null);
  const pendingFixedLaneActionRef = useRef<PendingFixedLaneAction | null>(null);
  const noteRectsRef = useRef<NoteRect[]>([]);
  const automationKeyframeRectsRef = useRef<AutomationKeyframeRect[]>([]);
  const muteRectsRef = useRef<MuteRect[]>([]);
  const pitchRectsRef = useRef<PitchRect[]>([]);
  const loopMarkerRectsRef = useRef<LoopMarkerRect[]>([]);
  const speakerIconsRef = useRef<{ normal: HTMLImageElement | null; muted: HTMLImageElement | null }>({
    normal: null,
    muted: null
  });
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

  const {
    activeRecordedNotes,
    countInLabel,
    ghostPlayheadBeat,
    hideSelectionActionPopover,
    invalidPatchIds,
    playheadBeat,
    selectedTrackId,
    timelineActionsPopoverOpen
  } = props;
  const { onRequestTimelineActionsPopover, onSetPlayheadBeat } = props;
  const gridBeats = project.global.gridBeats;
  const meterBeats = project.global.meter === "4/4" ? 4 : 3;
  const selectionBeatRange = selection.kind === "none" ? null : selection.beatRange;
  const selectionLabel = selection.kind === "none" ? null : selection.label;
  const selectionMarkerTrackId = selection.kind === "none" ? null : selection.markerTrackId;
  const selectedNoteKeys = selection.kind === "note" ? selection.selectedNoteKeys : undefined;
  const selectionPopoverLeft = selectionBeatRange
    ? HEADER_WIDTH + selectionBeatRange.endBeat * BEAT_WIDTH + 14
    : 0;
  const selectionPopoverTop = 10;

  const totalBeats = useMemo(() => {
    return getProjectTimelineEndBeat(project);
  }, [project]);

  const width = HEADER_WIDTH + totalBeats * BEAT_WIDTH;
  const { trackLayouts, height } = useTrackCanvasLayout(project);

  const beatFromX = (x: number) => (x - HEADER_WIDTH) / BEAT_WIDTH;
  const fixedLaneSliderStartX = HEADER_WIDTH + Math.min(BEAT_WIDTH * 0.25, 18);
  const fixedLaneSliderEndX = Math.min(width - 10, fixedLaneSliderStartX + BEAT_WIDTH * 3.8);
  const fixedLaneValueFromX = (x: number) =>
    Math.max(0, Math.min(1, (x - fixedLaneSliderStartX) / Math.max(1, fixedLaneSliderEndX - fixedLaneSliderStartX)));
  const isTrackSilenced = useCallback((track: Track) => track.mute || isTrackVolumeMuted(track.volume), []);

  const getCanvasPoint = useCallback((clientX: number, clientY: number) => {
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
  }, []);

  useTrackCanvasWheelPitchEditing({
    wrapperRef,
    pitchRectsRef,
    tracks: project.tracks,
    getCanvasPoint,
    onUpdateNote
  });

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
    return project.tracks.find((track) => track.id === layout.trackId) ?? null;
  };

  const getAutomationLaneAtPoint = useCallback((x: number, y: number): { track: Track; lane: AutomationLaneLayout } | null => {
    if (x < HEADER_WIDTH) {
      return null;
    }
    const layout = getTrackLayoutAtY(y);
    if (!layout) {
      return null;
    }
    const lane = layout.automationLanes.find((entry) => entry.automated && y >= entry.y && y <= entry.y + entry.height);
    if (!lane) {
      return null;
    }
    const track = project.tracks.find((entry) => entry.id === layout.trackId);
    return track ? { track, lane } : null;
  }, [getTrackLayoutAtY, project.tracks]);

  const resolvePointerTargets = useCallback((x: number, y: number) => {
    const automationLaneHit = getAutomationLaneAtPoint(x, y);
    const muteRect = findMuteRect(muteRectsRef.current, x, y);
    const pitchRect = findPitchRect(pitchRectsRef.current, x, y);
    const noteRect = findNoteRect(x, y);
    const loopMarkerRect = automationLaneHit ? null : findLoopMarkerRect(loopMarkerRectsRef.current, x, y);
    const playheadHit = automationLaneHit
      ? false
      : isOverPlayhead(x, playheadBeat, HEADER_WIDTH, BEAT_WIDTH, PLAYHEAD_HIT_HALF_WIDTH);
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
  }, [getAutomationLaneAtPoint, playheadBeat]);

  const updateSelectionFromRect = useCallback((nextRect: SelectionRect | null) => {
    setSelectionRect(nextRect);
    selectionActions.onSetSelectionMarqueeActive(Boolean(nextRect));
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
    selectionActions.onSetNoteSelection(selectedKeys);
  }, [selectionActions]);

  const updateTimelineSelectionFromRuler = useCallback((startBeat: number, endBeat: number) => {
    const orderedStartBeat = Math.min(startBeat, endBeat);
    const orderedEndBeat = Math.max(startBeat, endBeat);
    const beatSpan = orderedEndBeat - orderedStartBeat;
    selectionActions.onSetSelectionMarqueeActive(beatSpan > 0);
    selectionActions.onSetTimelineSelectionBeatRange(
      beatSpan > 0
        ? { startBeat: orderedStartBeat, endBeat: orderedEndBeat, beatSpan }
        : null
    );
  }, [selectionActions]);

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

    for (let beat = 0; beat <= totalBeats; beat += gridBeats) {
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
        ctx.fillText(formatBeatName(beat, gridBeats), x + 4, 18);
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
      (activeRecordedNotes ?? []).map((entry) => [`${entry.trackId}:${entry.noteId}`, entry] as const)
    );
    project.tracks.forEach((track) => {
      const layout = trackLayouts.find((entry) => entry.trackId === track.id);
      if (!layout) {
        return;
      }
      const y = layout.y;
      const isSelected = track.id === selectedTrackId;
      const trackPatchInvalid = invalidPatchIds?.has(track.instrumentPatchId) ?? false;
      const { overlapNoteIds, overlapRanges } = findTrackOverlaps(track.notes);
      const trackPatch = project.patches.find((entry) => entry.id === track.instrumentPatchId);

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
      const muteY = y + SPEAKER_Y_OFFSET;
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
          ? Math.max(note.durationBeats, playheadBeat - activeRecord.startBeat, gridBeats)
          : note.durationBeats;
        const noteX = HEADER_WIDTH + note.startBeat * BEAT_WIDTH;
        const noteW = Math.max(8, visualDurationBeats * BEAT_WIDTH);
        const noteY = y + 14;
        const noteH = TRACK_HEIGHT - 28;
        const overlaps = overlapNoteIds.has(note.id);
        const isHovered = hoveredNote?.trackId === track.id && hoveredNote.noteId === note.id;
        const noteSelected = selectedNoteKeys?.has(getNoteSelectionKey(track.id, note.id)) ?? false;

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
        if (automationLayout.automated) {
          const lane =
            automationLayout.laneType === "volume"
              ? getTrackVolumeLane(track)
              : automationLayout.macroId
                ? getTrackMacroLane(track, automationLayout.macroId)
                : null;
          if (!lane) {
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
            macroId: automationLayout.laneId,
            macroName: automationLayout.name,
            points: getTrackAutomationPoints(lane, totalBeats),
            registerHitTargets: true,
            trackId: track.id,
            width
          });
          continue;
        }

        if (!automationLayout.macroId) {
          continue;
        }
        const macro = trackPatch?.ui.macros.find((entry) => entry.id === automationLayout.macroId);
        if (!macro) {
          continue;
        }
        const manualValue = track.macroValues[macro.id] ?? macro.defaultNormalized ?? 0.5;
        renderFixedLane({
          beatWidth: BEAT_WIDTH,
          colors: TRACK_CANVAS_COLORS,
          ctx,
          headerWidth: HEADER_WIDTH,
          height: automationLayout.height,
          laneY: automationLayout.y,
          name: macro.name,
          defaultValue: macro.defaultNormalized ?? 0.5,
          value: manualValue,
          width
        });
      }
    });

    const playheadX = HEADER_WIDTH + playheadBeat * BEAT_WIDTH;
    if (hoveredPlayhead && !timelineActionsPopoverOpen) {
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

    const loopMarkers = getLoopMarkerStates(project.global.loop);
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
    drawGhostPlayhead(ctx, ghostPlayheadBeat, countInLabel, height);

    project.tracks.forEach((track) => {
      const layout = trackLayouts.find((entry) => entry.trackId === track.id);
      const trackPatch = project.patches.find((entry) => entry.id === track.instrumentPatchId);
      if (!layout) {
        return;
      }
      for (const automationLayout of layout.automationLanes) {
        if (automationLayout.automated) {
          const lane =
            automationLayout.laneType === "volume"
              ? getTrackVolumeLane(track)
              : automationLayout.macroId
                ? getTrackMacroLane(track, automationLayout.macroId)
                : null;
          if (!lane) {
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
            macroId: automationLayout.laneId,
            macroName: automationLayout.name,
            points: getTrackAutomationPoints(lane, totalBeats),
            registerHitTargets: false,
            trackId: track.id,
            veilTimeline: true,
            width
          });
          continue;
        }

        if (!automationLayout.macroId) {
          continue;
        }
        const macro = trackPatch?.ui.macros.find((entry) => entry.id === automationLayout.macroId);
        if (!macro) {
          continue;
        }
        const manualValue = track.macroValues[macro.id] ?? macro.defaultNormalized ?? 0.5;
        renderFixedLane({
          beatWidth: BEAT_WIDTH,
          colors: TRACK_CANVAS_COLORS,
          ctx,
          headerWidth: HEADER_WIDTH,
          height: automationLayout.height,
          laneY: automationLayout.y,
          name: macro.name,
          defaultValue: macro.defaultNormalized ?? 0.5,
          value: manualValue,
          veilTimeline: true,
          width
        });
      }
    });

    if (selectionBeatRange) {
      const startX = HEADER_WIDTH + selectionBeatRange.startBeat * BEAT_WIDTH;
      const endX = HEADER_WIDTH + selectionBeatRange.endBeat * BEAT_WIDTH;
      ctx.strokeStyle = TRACK_CANVAS_COLORS.selectionBoundary;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(startX, 0);
      ctx.lineTo(startX, height);
      ctx.moveTo(endX, 0);
      ctx.lineTo(endX, height);
      ctx.stroke();
    }

    if (selectionBeatRange && !selectionRect && !hideSelectionActionPopover && selectionMarkerTrackId) {
      const indicatorTrackLayout = trackLayouts.find((track) => track.trackId === selectionMarkerTrackId);
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
    countInLabel,
    ghostPlayheadBeat,
    hideSelectionActionPopover,
    timelineActionsPopoverOpen,
    height,
    hoveredPlayhead,
    hoveredPitch,
    hoveredNote,
    hoveredAutomationKeyframe,
    hoveredLoopMarker,
    isTrackSilenced,
    meterBeats,
    activeRecordedNotes,
    invalidPatchIds,
    playheadBeat,
    gridBeats,
    project.global.loop,
    project.patches,
    project.tracks,
    selectedNoteKeys,
    selectionBeatRange,
    selectionMarkerTrackId,
    selectedTrackId,
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
    const hasActiveSelection = Boolean(selectedNoteKeys?.size) || selection.kind === "timeline";

    // TODO: If TrackCanvas keeps growing, extract a dedicated canvas interaction layer
    // that centralizes hit resolution, cursor selection, and primary-pointer dispatch.
    // Right now those concerns are interleaved across pointer handlers, which makes
    // small duplicated action branches easy to miss when interaction rules change.
    // A good next step would be plain helpers or a hook, not React components.

    if (y <= RULER_HEIGHT && x >= HEADER_WIDTH) {
      if (targets.hoverTarget === "loop-marker" && targets.loopMarkerRect) {
        onSetPlayheadBeat(targets.loopMarkerRect.beat);
        onRequestTimelineActionsPopover({
          beat: targets.loopMarkerRect.beat,
          clientX: event.clientX,
          clientY: event.clientY
        });
        setCanvasCursor("pointer");
        return;
      }

      if (targets.hoverTarget === "playhead") {
        onRequestTimelineActionsPopover({
          beat: playheadBeat,
          clientX: event.clientX,
          clientY: event.clientY
        });
        setCanvasCursor("pointer");
        return;
      }

      if (event.button === PRIMARY_POINTER_BUTTON) {
        selectionActions.onSetNoteSelection([]);
        selectionActions.onSetTimelineSelectionBeatRange(null);
        pendingCanvasActionRef.current = {
          kind: "ruler",
          startBeat: Math.max(0, snapToGrid(beatFromX(x), gridBeats)),
          pointerId: event.pointerId
        };
        selectionActions.onSetSelectionMarqueeActive(false);
        canvas.setPointerCapture(event.pointerId);
        return;
      }

      const beat = Math.max(0, snapToGrid(beatFromX(x), gridBeats));
      onSetPlayheadBeat(beat);
      return;
    }

    const track = getTrackAtY(y);
    if (!track) return;

    trackActions.onSelectTrack(track.id);

    if (targets.hoverTarget === "mute" && targets.muteRect) {
      trackActions.onToggleTrackMute(targets.muteRect.trackId);
      setCanvasCursor("pointer");
      return;
    }

    if (x < HEADER_WIDTH) {
      return;
    }

    if (targets.hoverTarget === "loop-marker" && targets.loopMarkerRect) {
      onSetPlayheadBeat(targets.loopMarkerRect.beat);
      onRequestTimelineActionsPopover({
        beat: targets.loopMarkerRect.beat,
        clientX: event.clientX,
        clientY: event.clientY
      });
      setCanvasCursor("pointer");
      return;
    }

    if (targets.hoverTarget === "playhead") {
      onRequestTimelineActionsPopover({
        beat: playheadBeat,
        clientX: event.clientX,
        clientY: event.clientY
      });
      setCanvasCursor("pointer");
      return;
    }

    if (targets.hoverTarget === "pitch" && targets.pitchRect && event.button === PRIMARY_POINTER_BUTTON) {
      selectionActions.onSetNoteSelection([getNoteSelectionKey(targets.pitchRect.trackId, targets.pitchRect.noteId)]);
      noteActions.onOpenPitchPicker(targets.pitchRect.trackId, targets.pitchRect.noteId);
      setCanvasCursor("pointer");
      return;
    }

    if (event.button === SECONDARY_POINTER_BUTTON) {
      if (automationKeyframe && automationKeyframe.boundary === null) {
        automationActions.onDeleteTrackMacroAutomationKeyframeSide(
          automationKeyframe.trackId,
          automationKeyframe.macroId,
          automationKeyframe.keyframeId,
          automationKeyframe.side
        );
        return;
      }
      if (targets.noteRect) {
        noteActions.onDeleteNote(targets.noteRect.trackId, targets.noteRect.noteId);
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
        macroId: automationLaneHit.lane.laneId,
        beat: Math.max(0, snapToGrid(beatFromX(x), gridBeats)),
        value: previewValue,
        pointerId: event.pointerId
      };
      canvas.setPointerCapture(event.pointerId);
      return;
    }

    const fixedLaneHit = trackLayouts
      .find((entry) => entry.trackId === track.id)
      ?.automationLanes.find((entry) => !entry.automated && y >= entry.y && y <= entry.y + entry.height);
    if (fixedLaneHit?.macroId) {
      const nextValue = fixedLaneValueFromX(x);
      pendingFixedLaneActionRef.current = {
        trackId: track.id,
        macroId: fixedLaneHit.macroId,
        pointerId: event.pointerId
      };
      automationActions.onChangeTrackMacro(track.id, fixedLaneHit.macroId, nextValue);
      canvas.setPointerCapture(event.pointerId);
      setCanvasCursor("resize");
      return;
    }

    if (targets.noteRect) {
      const note = track.notes.find((entry) => entry.id === targets.noteRect?.noteId);
      if (!note) return;

      selectionActions.onSetNoteSelection([getNoteSelectionKey(targets.noteRect.trackId, targets.noteRect.noteId)]);
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
      selectionActions.onSetNoteSelection([]);
      selectionActions.onPreviewSelectionActionScopeChange("source");
      setSelectionRect(null);
      selectionActions.onSetSelectionMarqueeActive(false);
      pendingCanvasActionRef.current = null;
      setCanvasCursor("default");
      return;
    }

    pendingCanvasActionRef.current = {
      kind: "track",
      trackId: track.id,
      startX: x,
      startY: y,
      beat: Math.max(0, snapToGrid(beatFromX(x), gridBeats)),
      pointerId: event.pointerId
    };
    setSelectionRect(null);
    selectionActions.onSetSelectionMarqueeActive(false);
    canvas.setPointerCapture(event.pointerId);
  };

  useEffect(() => {
    if (!editingTrackId) {
      return;
    }
    const trackStillExists = project.tracks.some((track) => track.id === editingTrackId);
    if (!trackStillExists) {
      setEditingTrackId(null);
      setEditingTrackName("");
    }
  }, [editingTrackId, project.tracks]);

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
    const pendingFixedLaneAction = pendingFixedLaneActionRef.current;
    if (!drag && !automationDrag && pendingFixedLaneAction) {
      const nextValue = fixedLaneValueFromX(x);
      automationActions.onChangeTrackMacro(
        pendingFixedLaneAction.trackId,
        pendingFixedLaneAction.macroId,
        nextValue
      );
      setCanvasCursor("resize");
      return;
    }
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
      automationActions.onPreviewTrackMacroAutomation(pendingAutomationAction.trackId, pendingAutomationAction.macroId, nextValue);
      setCanvasCursor("ns-resize");
      return;
    }
    if (!drag && pendingAction) {
      if (pendingAction.kind === "track") {
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
      } else {
        const startX = HEADER_WIDTH + pendingAction.startBeat * BEAT_WIDTH;
        if (Math.abs(x - startX) >= 4) {
          const currentBeat = Math.max(0, snapToGrid(beatFromX(x), gridBeats));
          updateTimelineSelectionFromRuler(pendingAction.startBeat, currentBeat);
          setCanvasCursor("default");
        }
      }
      return;
    }

    if (automationDrag) {
      const lane = automationLaneHit?.lane ??
        trackLayouts
          .find((layout) => layout.trackId === automationDrag.trackId)
          ?.automationLanes.find((entry) => entry.laneId === automationDrag.macroId);
      if (!lane) {
        return;
      }
      const nextValue = automationValueFromY(y, lane.y, lane.height);
      automationActions.onPreviewTrackMacroAutomation(automationDrag.trackId, automationDrag.macroId, nextValue);
      if (automationDrag.boundary) {
        automationActions.onUpsertTrackMacroAutomationKeyframe(
          automationDrag.trackId,
          automationDrag.macroId,
          automationDrag.beat,
          nextValue,
          { commit: false }
        );
      } else {
        automationActions.onUpdateTrackMacroAutomationKeyframeSide(
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
      const fixedLaneHit = x >= HEADER_WIDTH
        ? getTrackLayoutAtY(y)?.automationLanes.find((entry) => !entry.automated && y >= entry.y && y <= entry.y + entry.height)
        : null;
      if (automationKeyframe || automationLaneHit) {
        setCanvasCursor("crosshair");
        return;
      }
      if (fixedLaneHit) {
        setCanvasCursor("resize");
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
    const beat = snapToGrid(Math.max(0, beatFromX(x)), gridBeats);
    const track = project.tracks.find((entry) => entry.id === drag.trackId);
    const note = track?.notes.find((entry) => entry.id === drag.noteId);
    if (!note) {
      return;
    }

    if (drag.mode === "move") {
      const nextStart = Math.max(0, snapToGrid(beat - drag.offsetBeats, gridBeats));
      noteActions.onUpdateNote(drag.trackId, drag.noteId, { startBeat: nextStart }, {
        actionKey: `track:${drag.trackId}:note:${drag.noteId}:move`,
        coalesce: true
      });
    } else {
      const end = Math.max(note.startBeat + gridBeats, beat);
      noteActions.onUpdateNote(drag.trackId, drag.noteId, {
        durationBeats: snapToGrid(end - note.startBeat, gridBeats)
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
    const pendingFixedLaneAction = pendingFixedLaneActionRef.current;
    const { x, y } = getCanvasPoint(event.clientX, event.clientY);
    if (canvasRef.current && (dragRef.current || pendingAction || automationDragRef.current || pendingAutomationAction || pendingFixedLaneAction)) {
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
      pendingFixedLaneActionRef.current = null;
      setCanvasCursor("default");
      return;
    }

    const hadSelectionRect = Boolean(selectionRect);
    if (pendingAction?.kind === "track" && !hadSelectionRect) {
      const newNote = createDefaultPlacedNote(pendingAction.beat, gridBeats);
      noteActions.onUpsertNote(pendingAction.trackId, newNote, {
        actionKey: `track:${pendingAction.trackId}:note:${newNote.id}:create`
      });
      noteActions.onPreviewPlacedNote(pendingAction.trackId, newNote);
    }

    if (pendingAutomationAction) {
      automationActions.onUpsertTrackMacroAutomationKeyframe(
        pendingAutomationAction.trackId,
        pendingAutomationAction.macroId,
        pendingAutomationAction.beat,
        pendingAutomationAction.value,
        { commit: true }
      );
      automationActions.onPreviewTrackMacroAutomation(
        pendingAutomationAction.trackId,
        pendingAutomationAction.macroId,
        pendingAutomationAction.value,
        { retrigger: true }
      );
    } else if (pendingFixedLaneAction) {
      automationActions.onChangeTrackMacro(
        pendingFixedLaneAction.trackId,
        pendingFixedLaneAction.macroId,
        fixedLaneValueFromX(x),
        { commit: true }
      );
    } else if (automationDrag) {
      const lane = trackLayouts
        .find((layout) => layout.trackId === automationDrag.trackId)
        ?.automationLanes.find((entry) => entry.laneId === automationDrag.macroId);
      if (lane) {
        const finalValue = automationValueFromY(y, lane.y, lane.height);
        if (automationDrag.boundary) {
          automationActions.onUpsertTrackMacroAutomationKeyframe(
            automationDrag.trackId,
            automationDrag.macroId,
            automationDrag.beat,
            finalValue,
            { commit: true }
          );
        } else {
          automationActions.onUpdateTrackMacroAutomationKeyframeSide(
            automationDrag.trackId,
            automationDrag.macroId,
            automationDrag.keyframeId,
            automationDrag.side,
            finalValue,
            { commit: true }
          );
        }
        automationActions.onPreviewTrackMacroAutomation(
          automationDrag.trackId,
          automationDrag.macroId,
          finalValue,
          { retrigger: true }
        );
      }
    }

    if (pendingAction?.kind === "ruler") {
      const beat = Math.max(0, snapToGrid(beatFromX(x), gridBeats));
      if (!selectionBeatRange) {
        onSetPlayheadBeat(beat);
      } else {
        selectionActions.onPreviewSelectionActionScopeChange("all-tracks");
      }
    }

    pendingCanvasActionRef.current = null;
    pendingAutomationActionRef.current = null;
    pendingFixedLaneActionRef.current = null;
    setSelectionRect(null);
    selectionActions.onSetSelectionMarqueeActive(false);
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
    if (event.button !== PRIMARY_POINTER_BUTTON) {
      return;
    }
    const { x, y } = getCanvasPoint(event.clientX, event.clientY);
    const automationKeyframe = findAutomationKeyframeRect(automationKeyframeRectsRef.current, x, y);
    if (!automationKeyframe || automationKeyframe.boundary !== null || automationKeyframe.side !== "single") {
      return;
    }
    automationActions.onSplitTrackMacroAutomationKeyframe(
      automationKeyframe.trackId,
      automationKeyframe.macroId,
      automationKeyframe.keyframeId
    );
  };

  return (
    <div className="track-canvas-shell" ref={wrapperRef}>
      <TrackHeaderChrome
        project={project}
        trackLayouts={trackLayouts}
        selectedTrackId={selectedTrackId}
        invalidPatchIds={invalidPatchIds}
        editingTrackId={editingTrackId}
        editingTrackName={editingTrackName}
        setEditingTrackId={setEditingTrackId}
        setEditingTrackName={setEditingTrackName}
        volumePopoverTrackId={volumePopoverTrackId}
        openVolumePopover={openVolumePopover}
        scheduleVolumePopoverOpen={scheduleVolumePopoverOpen}
        scheduleVolumePopoverDismiss={scheduleVolumePopoverDismiss}
        cancelScheduledVolumePopoverDismiss={cancelScheduledVolumePopoverDismiss}
        trackActions={trackActions}
        automationActions={automationActions}
      />
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{
          cursor: resolveTrackCanvasCursor(canvasCursor)
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerLeave}
        onDoubleClick={onDoubleClick}
        onContextMenu={(event) => event.preventDefault()}
      />
      {selectionBeatRange && !selectionRect && !hideSelectionActionPopover && (
        <SelectionActionPopover
          left={selectionPopoverLeft}
          top={selectionPopoverTop}
          selectionLabel={selectionLabel ?? (selection.kind === "timeline" ? "All Tracks" : "Track 1")}
          collapsed={selectionActions.selectionActionPopoverCollapsed}
          onPreviewScopeChange={selectionActions.onPreviewSelectionActionScopeChange}
          onExpand={selectionActions.onExpandSelectionActionPopover}
          onDismiss={selectionActions.onDismissSelectionActionPopover}
          onCut={selectionActions.onCutSelection}
          onCopy={selectionActions.onCopySelection}
          onDelete={selectionActions.onDeleteSelection}
          onCutAllTracks={selectionActions.onCutAllTracksInSelection}
          onCopyAllTracks={selectionActions.onCopyAllTracksInSelection}
          onDeleteAllTracks={selectionActions.onDeleteAllTracksInSelection}
        />
      )}
    </div>
  );
}

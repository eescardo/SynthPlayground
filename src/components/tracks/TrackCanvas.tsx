"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SelectionActionPopover } from "@/components/SelectionActionPopover";
import { TrackCanvasTabStops } from "@/components/tracks/TrackCanvasTabStops";
import { TrackHeaderChrome } from "@/components/tracks/TrackCanvasChrome";
import {
  AutomationKeyframeRect,
} from "@/components/tracks/trackCanvasAutomationLane";
import { renderLaneSpec, resolveLaneRenderSpec } from "@/components/tracks/trackCanvasLaneRendering";
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
  LOOP_MARKER_BAR_WIDTH,
  LOOP_MARKER_DOT_OFFSET_Y,
  LOOP_MARKER_DOT_RADIUS,
  LOOP_MARKER_HOVER_RING_RADIUS,
  LoopMarkerRect,
  MuteRect,
  PitchRect,
} from "@/components/tracks/trackCanvasGeometry";
import { NoteRect, useTrackCanvasPointerInteractions } from "@/hooks/tracks/useTrackCanvasPointerInteractions";
import {
  drawNoteBody,
  fillRoundedRect
} from "@/components/tracks/trackCanvasNoteGeometry";
import {
  resolveTrackCanvasNoteFill,
  resolveTrackCanvasNoteLabelFill,
  shouldCenterTrackCanvasNoteLabel,
  splitTrackCanvasPitchLabel
} from "@/components/tracks/trackCanvasNoteRendering";
import { drawTrackCanvasNoteState } from "@/components/tracks/trackCanvasNoteStateRendering";
import {
  drawGhostPreviewNote,
  drawTabSelectionPreview
} from "@/components/tracks/trackCanvasPreviewGeometry";
import { resolveSelectedContentTabStopRect } from "@/components/tracks/trackCanvasSelection";
import {
  TrackCanvasProps,
  TrackLayout
} from "@/components/tracks/trackCanvasTypes";
import { useTrackCanvasLayout } from "@/hooks/tracks/useTrackCanvasLayout";
import { useTrackCanvasWheelPitchEditing } from "@/hooks/tracks/useTrackCanvasWheelPitchEditing";
import { useVolumePopover } from "@/hooks/useVolumePopover";
import { getLoopMarkerStates } from "@/lib/looping";
import { getProjectTimelineEndBeat } from "@/lib/macroAutomation";
import { getNoteSelectionKey } from "@/lib/clipboard";
import { isTrackVolumeMuted } from "@/lib/trackVolume";
import { formatBeatName } from "@/lib/musicTiming";
import { Note, Track } from "@/types/music";
export type { TimelineActionsPopoverRequest, TrackCanvasProps, TrackCanvasSelection } from "@/components/tracks/trackCanvasTypes";

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
    patchActions,
    project,
    selection,
    selectionActions,
    trackActions
  } = props;
  const { onUpdateNote } = noteActions;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const playheadTabStopRef = useRef<HTMLButtonElement | null>(null);
  const selectedContentTabStopRef = useRef<HTMLButtonElement | null>(null);
  const noteRectsRef = useRef<NoteRect[]>([]);
  const automationKeyframeRectsRef = useRef<AutomationKeyframeRect[]>([]);
  const muteRectsRef = useRef<MuteRect[]>([]);
  const pitchRectsRef = useRef<PitchRect[]>([]);
  const loopMarkerRectsRef = useRef<LoopMarkerRect[]>([]);
  const speakerIconsRef = useRef<{ normal: HTMLImageElement | null; muted: HTMLImageElement | null }>({
    normal: null,
    muted: null
  });
  const [speakerIconsReady, setSpeakerIconsReady] = useState(false);
  const [playheadTabStopFocused, setPlayheadTabStopFocused] = useState(false);
  const [editingTrackId, setEditingTrackId] = useState<string | null>(null);
  const [editingTrackName, setEditingTrackName] = useState("");
  const [selectedContentTabStopFocused, setSelectedContentTabStopFocused] = useState(false);
  const {
    volumePopoverTrackId,
    volumePopoverPosition,
    openVolumePopover,
    closeVolumePopover,
    scheduleVolumePopoverOpen,
    scheduleVolumePopoverDismiss,
    cancelScheduledVolumePopoverDismiss
  } = useVolumePopover();

  const {
    activeRecordedNotes,
    countInLabel,
    defaultPitch,
    ghostPlayheadBeat,
    ghostPreviewNote,
    hideSelectionActionPopover,
    invalidPatchIds,
    keyboardPlacementNote,
    tabSelectionPreviewNote,
    playheadFocused,
    playheadBeat,
    selectedContentTabStopFocusToken,
    selectedTrackId,
    timelineActionsPopoverOpen
  } = props;
  const { onRequestTimelineActionsPopover, onReturnSelectedNoteFocusToPlayhead, onSetPlayheadBeat } = props;
  const gridBeats = project.global.gridBeats;
  const meterBeats = project.global.meter === "4/4" ? 4 : 3;
  const selectionBeatRange = selection.kind === "none" ? null : selection.beatRange;
  const selectionLabel = selection.kind === "none" ? null : selection.label;
  const selectionMarkerTrackId = selection.kind === "none" ? null : selection.markerTrackId;
  const selectedNoteKeys = selection.kind === "note" ? selection.content.noteKeys : undefined;
  const automationKeyframeSelectionKeys = selection.kind === "note" ? selection.content.automationKeyframeSelectionKeys : undefined;

  const totalBeats = useMemo(() => {
    return getProjectTimelineEndBeat(project);
  }, [project]);

  const width = HEADER_WIDTH + totalBeats * BEAT_WIDTH;
  const { trackLayouts, height } = useTrackCanvasLayout(project);
  const playheadTabStopLeft = HEADER_WIDTH + playheadBeat * BEAT_WIDTH - 1;
  const selectedContentTabStopRect = useMemo(
    () => resolveSelectedContentTabStopRect(project.tracks, selection, trackLayouts),
    [project.tracks, selection, trackLayouts]
  );

  const beatFromX = (x: number) => (x - HEADER_WIDTH) / BEAT_WIDTH;
  const fixedLaneSliderStartX = HEADER_WIDTH + Math.min(BEAT_WIDTH * 0.25, 18);
  const fixedLaneSliderEndX = Math.min(width - 10, fixedLaneSliderStartX + BEAT_WIDTH * 3.8);
  const fixedLaneValueFromX = (x: number) =>
    Math.max(0, Math.min(1, (x - fixedLaneSliderStartX) / Math.max(1, fixedLaneSliderEndX - fixedLaneSliderStartX)));
  const isTrackSilenced = useCallback((track: Track) => track.mute || isTrackVolumeMuted(track.volume), []);
  const getSelectionPopoverAnchorPosition = useCallback(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper || !selectionBeatRange) {
      return null;
    }
    const rect = wrapper.getBoundingClientRect();
    return {
      left: rect.left + HEADER_WIDTH + selectionBeatRange.endBeat * BEAT_WIDTH + 14 - wrapper.scrollLeft,
      top: rect.top + 10
    };
  }, [selectionBeatRange]);

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

  const {
    hoveredPitch,
    hoveredNote,
    hoveredAutomationKeyframe,
    hoveredLoopMarker,
    hoveredPlayhead,
    canvasCursor,
    selectionRect,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerLeave,
    onDoubleClick
  } = useTrackCanvasPointerInteractions({
    canvasRef,
    project,
    trackLayouts,
    playheadBeat,
    gridBeats,
    defaultPitch,
    selection,
    contentSelection:
      selection.kind === "note"
        ? {
            noteKeys: selection.content.noteKeys,
            automationKeyframeSelectionKeys: selection.content.automationKeyframeSelectionKeys
          }
        : undefined,
    noteActions,
    automationActions,
    selectionActions,
    trackActions,
    noteRectsRef,
    automationKeyframeRectsRef,
    muteRectsRef,
    pitchRectsRef,
    loopMarkerRectsRef,
    getCanvasPoint,
    getTrackLayoutAtY,
    beatFromX,
    fixedLaneValueFromX,
    headerWidth: HEADER_WIDTH,
    noteResizeHandleWidth: NOTE_RESIZE_HANDLE_WIDTH,
    onSetPlayheadBeat,
    onRequestTimelineActionsPopover
  });

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
        ctx.fillRect(0, y, width, layout.height);
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
        const noteFocused =
          noteSelected &&
          selectedContentTabStopFocused;
        const noteBeingPlaced = keyboardPlacementNote?.trackId === track.id && keyboardPlacementNote.noteId === note.id;

        const baseNoteFill = overlaps
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
        const pitchLabel = splitTrackCanvasPitchLabel(note.pitchStr);
        const noteFill = resolveTrackCanvasNoteFill(baseNoteFill, pitchLabel.octaveNumber);
        const centerLabel = shouldCenterTrackCanvasNoteLabel(visualDurationBeats, gridBeats);
        drawNoteBody(ctx, noteX, noteY, noteW, noteH, noteFill);

        drawTrackCanvasNoteState(ctx, { x: noteX, y: noteY, w: noteW, h: noteH }, {
          hovered: isHovered,
          selected: noteSelected,
          focused: noteFocused,
          beingPlaced: noteBeingPlaced
        });

        if (
          tabSelectionPreviewNote?.trackId === track.id &&
          tabSelectionPreviewNote.noteId === note.id &&
          !noteSelected
        ) {
          drawTabSelectionPreview(ctx, { x: noteX, y: noteY, w: noteW, h: noteH });
        }

        const noteNameFont = "bold 11px ui-monospace, SFMono-Regular, Menlo, monospace";
        const microtoneFont = "8px ui-monospace, SFMono-Regular, Menlo, monospace";
        const octaveFont = "8.5px ui-monospace, SFMono-Regular, Menlo, monospace";
        const labelLines: Array<{ text: string; font: string; alpha?: number }> = [{ text: pitchLabel.noteName, font: noteNameFont }];
        if (pitchLabel.microtoneText) {
          labelLines.push({ text: pitchLabel.microtoneText, font: microtoneFont, alpha: 0.5 });
        }
        if (pitchLabel.octaveText) {
          labelLines.push({ text: pitchLabel.octaveText, font: octaveFont });
        }
        const measuredWidths = labelLines.map((line, index) => {
          ctx.font = line.font;
          const minWidth = index === 0 ? 8 : 6;
          return Math.max(minWidth, ctx.measureText(line.text).width);
        });
        const labelWidth = Math.max(...measuredWidths);
        const lineHeights = labelLines.map((line, index) => (index === 0 ? 10 : line.font === microtoneFont ? 8 : 9));
        const lineGap = labelLines.length <= 1 ? 0 : 1;
        const labelHeight = lineHeights.reduce((sum, height) => sum + height, 0) + lineGap * (labelLines.length - 1);
        const labelPaddingX = 3;
        const labelPaddingY = 2;
        const labelX = centerLabel
          ? noteX + Math.max(0, (noteW - labelWidth) * 0.5)
          : noteX + 6;
        const labelY = noteY + Math.max(4, (noteH - labelHeight) * 0.5);
        const labelCenterX = labelX + labelWidth * 0.5;
        const labelFill = resolveTrackCanvasNoteLabelFill(noteFill, TRACK_CANVAS_COLORS.noteLabel);
        if (hoveredPitch?.trackId === track.id && hoveredPitch.noteId === note.id) {
          fillRoundedRect(
            ctx,
            labelX - labelPaddingX,
            labelY - labelPaddingY,
            labelWidth + labelPaddingX * 2,
            labelHeight + labelPaddingY * 2,
            5,
            TRACK_CANVAS_COLORS.notePitchHover
          );
        }

        ctx.fillStyle = labelFill;
        ctx.textAlign = centerLabel ? "center" : "start";
        ctx.textBaseline = "top";
        let lineY = labelY;
        labelLines.forEach((line, index) => {
          ctx.save();
          ctx.font = line.font;
          ctx.globalAlpha = line.alpha ?? 1;
          const lineX = centerLabel ? labelCenterX : labelX + (labelWidth - measuredWidths[index]) * 0.5;
          ctx.fillText(line.text, lineX, lineY);
          ctx.restore();
          lineY += lineHeights[index] + lineGap;
        });
        ctx.textAlign = "start";
        ctx.textBaseline = "alphabetic";

        noteRectsRef.current.push({ trackId: track.id, noteId: note.id, x: noteX, y: noteY, w: noteW, h: noteH });
        pitchRectsRef.current.push({
          trackId: track.id,
          noteId: note.id,
          x: labelX - labelPaddingX,
          y: labelY - labelPaddingY,
          w: labelWidth + labelPaddingX * 2,
          h: labelHeight + labelPaddingY * 2
        });
      }

      for (const overlap of overlapRanges) {
        const overlapX = HEADER_WIDTH + overlap.startBeat * BEAT_WIDTH;
        const overlapW = Math.max(2, (overlap.endBeat - overlap.startBeat) * BEAT_WIDTH);
        ctx.fillStyle = TRACK_CANVAS_COLORS.overlapRange;
        ctx.fillRect(overlapX, y + 14, overlapW, TRACK_HEIGHT - 28);
      }

      if (ghostPreviewNote?.trackId === track.id) {
        drawGhostPreviewNote(ctx, ghostPreviewNote, y);
      }

      for (const automationLayout of layout.automationLanes) {
        const spec = resolveLaneRenderSpec(track, trackPatch, automationLayout, totalBeats);
        if (!spec) {
          continue;
        }
        renderLaneSpec(
          ctx,
          spec,
          {
            hoveredAutomationKeyframe,
            registerHitTargets: true,
            automationKeyframeSelectionKeys,
            trackId: track.id,
            width
          },
          automationKeyframeRectsRef.current
        );
      }
    });

    const playheadX = HEADER_WIDTH + playheadBeat * BEAT_WIDTH;
    if (hoveredPlayhead && !timelineActionsPopoverOpen) {
      ctx.strokeStyle = TRACK_CANVAS_COLORS.playheadHoverGlow;
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, height);
      ctx.stroke();
    }
    if (playheadTabStopFocused && !timelineActionsPopoverOpen) {
      ctx.strokeStyle = TRACK_CANVAS_COLORS.playheadFocusGlow;
      ctx.lineWidth = 12;
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
        const spec = resolveLaneRenderSpec(track, trackPatch, automationLayout, totalBeats);
        if (!spec) {
          continue;
        }
        renderLaneSpec(
          ctx,
          spec,
          {
            hoveredAutomationKeyframe,
            registerHitTargets: false,
            automationKeyframeSelectionKeys,
            trackId: track.id,
            veilTimeline: true,
            width
          },
          automationKeyframeRectsRef.current
        );
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
    ghostPreviewNote,
    hideSelectionActionPopover,
    tabSelectionPreviewNote,
    timelineActionsPopoverOpen,
    height,
    hoveredPlayhead,
    playheadTabStopFocused,
    hoveredPitch,
    hoveredNote,
    hoveredAutomationKeyframe,
    hoveredLoopMarker,
    isTrackSilenced,
    meterBeats,
    activeRecordedNotes,
    keyboardPlacementNote,
    invalidPatchIds,
    playheadBeat,
    gridBeats,
    project.global.loop,
    project.patches,
    project.tracks,
    selectedNoteKeys,
    selectedContentTabStopFocused,
    automationKeyframeSelectionKeys,
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

  useEffect(() => {
    if (!playheadFocused) {
      return;
    }
    if (document.activeElement === selectedContentTabStopRef.current) {
      return;
    }
    playheadTabStopRef.current?.focus();
  }, [playheadBeat, playheadFocused]);

  useEffect(() => {
    if (!selectedContentTabStopFocusToken || !selectedContentTabStopRect) {
      return;
    }
    selectedContentTabStopRef.current?.focus();
  }, [selectedContentTabStopFocusToken, selectedContentTabStopRect]);

  useEffect(() => {
    if (selectedContentTabStopRect) {
      return;
    }
    setSelectedContentTabStopFocused(false);
  }, [selectedContentTabStopRect]);

  return (
    <div className="track-canvas-shell" ref={wrapperRef}>
      <TrackHeaderChrome
        project={project}
        canvasShellRef={wrapperRef}
        trackLayouts={trackLayouts}
        selectedTrackId={selectedTrackId}
        invalidPatchIds={invalidPatchIds}
        editingTrackId={editingTrackId}
        editingTrackName={editingTrackName}
        setEditingTrackId={setEditingTrackId}
        setEditingTrackName={setEditingTrackName}
        volumePopoverTrackId={volumePopoverTrackId}
        volumePopoverPosition={volumePopoverPosition}
        openVolumePopover={openVolumePopover}
        scheduleVolumePopoverOpen={scheduleVolumePopoverOpen}
        scheduleVolumePopoverDismiss={scheduleVolumePopoverDismiss}
        cancelScheduledVolumePopoverDismiss={cancelScheduledVolumePopoverDismiss}
        trackActions={trackActions}
        patchActions={patchActions}
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
      <TrackCanvasTabStops
        playheadLabel={`Playhead at beat ${formatBeatName(playheadBeat, meterBeats)}`}
        playheadLeft={playheadTabStopLeft}
        height={height}
        playheadTabStopRef={playheadTabStopRef}
        selectedContentTabStopRef={selectedContentTabStopRef}
        selectedContentRect={selectedContentTabStopRect}
        onPlayheadFocus={() => setPlayheadTabStopFocused(true)}
        onPlayheadBlur={() => setPlayheadTabStopFocused(false)}
        onSelectedContentFocus={() => setSelectedContentTabStopFocused(true)}
        onSelectedContentBlur={() => setSelectedContentTabStopFocused(false)}
        onReturnSelectedContentFocusToPlayhead={onReturnSelectedNoteFocusToPlayhead}
      />
      {selectionBeatRange && !selectionRect && !hideSelectionActionPopover && (
        <SelectionActionPopover
          selectionLabel={selectionLabel ?? (selection.kind === "timeline" ? "All Tracks" : "Track 1")}
          getAnchorPosition={getSelectionPopoverAnchorPosition}
          collapsed={selectionActions.selectionActionPopoverCollapsed}
          onPreviewScopeChange={selectionActions.onPreviewSelectionActionScopeChange}
          onExpand={selectionActions.onExpandSelectionActionPopover}
          onDismiss={selectionActions.onDismissSelectionActionPopover}
          onCut={selectionActions.onCutSelection}
          onCopy={selectionActions.onCopySelection}
          onDelete={selectionActions.onDeleteSelection}
          onExplode={selectionActions.onOpenExplodeSelectionDialog}
          onCutAllTracks={selectionActions.onCutAllTracksInSelection}
          onCopyAllTracks={selectionActions.onCopyAllTracksInSelection}
          onDeleteAllTracks={selectionActions.onDeleteAllTracksInSelection}
        />
      )}
    </div>
  );
}

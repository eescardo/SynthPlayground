import type { MutableRefObject } from "react";
import type { AutomationKeyframeRect, HoveredAutomationKeyframe } from "@/components/tracks/trackCanvasAutomationLane";
import {
  drawCompositionEndMarker,
  drawPostCompositionFade
} from "@/components/tracks/trackCanvasCompositionEndRendering";
import { renderLaneSpec, resolveLaneRenderSpec } from "@/components/tracks/trackCanvasLaneRendering";
import { drawLoopMarkers } from "@/components/tracks/trackCanvasLoopMarkerRendering";
import {
  HEADER_WIDTH,
  MUTE_ICON_SIZE,
  RULER_HEIGHT,
  SPEAKER_X,
  SPEAKER_Y_OFFSET,
  TRACK_CANVAS_COLORS,
  TRACK_HEIGHT
} from "@/components/tracks/trackCanvasConstants";
import { type LoopMarkerRect, type MuteRect, type PitchRect } from "@/components/tracks/trackCanvasGeometry";
import {
  drawNoteBody,
  fillRoundedRect,
  NOTE_LABEL_X_OFFSET,
  NOTE_MIN_WIDTH,
  NOTE_VERTICAL_INSET
} from "@/components/tracks/trackCanvasNoteGeometry";
import {
  resolveTrackCanvasNoteFill,
  resolveTrackCanvasNoteLabelFill,
  shouldCenterTrackCanvasNoteLabel,
  splitTrackCanvasPitchLabel
} from "@/components/tracks/trackCanvasNoteRendering";
import { drawTrackCanvasNoteState } from "@/components/tracks/trackCanvasNoteStateRendering";
import { drawGhostPreviewNote, drawTabSelectionPreview } from "@/components/tracks/trackCanvasPreviewGeometry";
import { findTrackOverlaps, type TrackCanvasRenderModel } from "@/components/tracks/trackCanvasRenderModel";
import type { TrackCanvasProps, TrackLayout } from "@/components/tracks/trackCanvasTypes";
import type { NoteRect, SelectionRect } from "@/hooks/tracks/trackCanvasPointerTypes";
import { getNoteSelectionKey } from "@/lib/clipboard";
import { formatBeatName } from "@/lib/musicTiming";
import type { Project, Track } from "@/types/music";

interface TrackCanvasDrawingOptions extends Pick<
  TrackCanvasProps,
  | "activeRecordedNotes"
  | "countInLabel"
  | "ghostPlayheadBeat"
  | "ghostPreviewNote"
  | "hideSelectionActionPopover"
  | "invalidPatchIds"
  | "keyboardPlacementNote"
  | "playheadBeat"
  | "selectedTrackId"
  | "selection"
  | "selectionMarqueeActive"
  | "tabSelectionPreviewNote"
  | "timelineActionsPopoverOpen"
> {
  canvasRef: MutableRefObject<HTMLCanvasElement | null>;
  noteRectsRef: MutableRefObject<NoteRect[]>;
  automationKeyframeRectsRef: MutableRefObject<AutomationKeyframeRect[]>;
  muteRectsRef: MutableRefObject<MuteRect[]>;
  pitchRectsRef: MutableRefObject<PitchRect[]>;
  loopMarkerRectsRef: MutableRefObject<LoopMarkerRect[]>;
  project: Project;
  renderModel: Pick<
    TrackCanvasRenderModel,
    | "automationKeyframeSelectionKeys"
    | "beatWidth"
    | "gridBeats"
    | "height"
    | "meterBeats"
    | "projectEndBeat"
    | "selectedNoteKeys"
    | "selectionBeatRange"
    | "selectionMarkerTrackId"
    | "totalBeats"
    | "trackLayouts"
    | "width"
  >;
  hoveredPitch: { trackId: string; noteId: string } | null;
  hoveredNote: { trackId: string; noteId: string } | null;
  hoveredAutomationKeyframe: HoveredAutomationKeyframe | null;
  hoveredLoopMarker: { markerId: string; kind: "start" | "end"; beat: number } | null;
  hoveredCompositionEnd: boolean;
  selectedLoopMarker: { markerId: string; kind: "start" | "end"; beat: number } | null;
  hoveredPlayhead: boolean;
  isTrackSilenced: (track: Track) => boolean;
  playheadTabStopFocused: boolean;
  selectedContentTabStopFocused: boolean;
  selectionRect: SelectionRect | null;
}

function drawGhostPlayhead(
  ctx: CanvasRenderingContext2D,
  ghostPlayheadBeat: number | undefined,
  countInLabel: string | undefined,
  height: number,
  beatWidth: number
) {
  if (typeof ghostPlayheadBeat !== "number" || !Number.isFinite(ghostPlayheadBeat)) {
    return;
  }

  const ghostX = HEADER_WIDTH + ghostPlayheadBeat * beatWidth;
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

function withAlpha(hexColor: string, alpha: number): string {
  const match = /^#([0-9a-f]{6})$/i.exec(hexColor);
  if (!match) {
    return hexColor;
  }
  const value = match[1];
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function drawCanvasFrame(
  ctx: CanvasRenderingContext2D,
  options: Pick<
    TrackCanvasDrawingOptions["renderModel"],
    "beatWidth" | "gridBeats" | "height" | "meterBeats" | "totalBeats" | "trackLayouts" | "width" | "projectEndBeat"
  >
) {
  const { beatWidth, gridBeats, height, meterBeats, projectEndBeat, totalBeats, trackLayouts, width } = options;

  ctx.fillStyle = TRACK_CANVAS_COLORS.canvasBg;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = TRACK_CANVAS_COLORS.headerBg;
  ctx.fillRect(0, 0, HEADER_WIDTH, height);

  ctx.fillStyle = TRACK_CANVAS_COLORS.rulerBg;
  ctx.fillRect(HEADER_WIDTH, 0, width - HEADER_WIDTH, RULER_HEIGHT);

  for (let beat = 0; beat <= totalBeats; beat += gridBeats) {
    const x = HEADER_WIDTH + beat * beatWidth;
    const isBar = beat % meterBeats === 0;
    const isBeat = Number.isInteger(beat);
    const afterProjectEnd = beat > projectEndBeat + 1e-6;
    const gridColor = isBar
      ? TRACK_CANVAS_COLORS.barGrid
      : isBeat
        ? TRACK_CANVAS_COLORS.beatGrid
        : TRACK_CANVAS_COLORS.subGrid;

    ctx.strokeStyle = afterProjectEnd ? withAlpha(gridColor, 0.5) : gridColor;
    ctx.lineWidth = isBar ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();

    if (isBeat) {
      ctx.fillStyle = afterProjectEnd ? withAlpha(TRACK_CANVAS_COLORS.rulerText, 0.5) : TRACK_CANVAS_COLORS.rulerText;
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
}

function clearHitTargetRects(
  options: Pick<
    TrackCanvasDrawingOptions,
    "automationKeyframeRectsRef" | "loopMarkerRectsRef" | "muteRectsRef" | "noteRectsRef" | "pitchRectsRef"
  >
) {
  options.noteRectsRef.current = [];
  options.automationKeyframeRectsRef.current = [];
  options.muteRectsRef.current = [];
  options.pitchRectsRef.current = [];
  options.loopMarkerRectsRef.current = [];
}

function drawAutomationLanes(
  ctx: CanvasRenderingContext2D,
  options: Pick<TrackCanvasDrawingOptions, "automationKeyframeRectsRef" | "hoveredAutomationKeyframe"> & {
    automationKeyframeSelectionKeys: TrackCanvasRenderModel["automationKeyframeSelectionKeys"];
    beatWidth: number;
    projectPatches: Project["patches"];
    registerHitTargets: boolean;
    projectEndBeat: number;
    track: Track;
    trackLayout: TrackLayout;
    veilTimeline?: boolean;
    width: number;
  }
) {
  const {
    automationKeyframeRectsRef,
    automationKeyframeSelectionKeys,
    beatWidth,
    hoveredAutomationKeyframe,
    projectPatches,
    registerHitTargets,
    projectEndBeat,
    track,
    trackLayout,
    veilTimeline,
    width
  } = options;

  const trackPatch = projectPatches.find((entry) => entry.id === track.instrumentPatchId);
  for (const automationLayout of trackLayout.automationLanes) {
    const spec = resolveLaneRenderSpec(track, trackPatch, automationLayout, projectEndBeat);
    if (!spec) {
      continue;
    }
    renderLaneSpec(
      ctx,
      spec,
      {
        beatWidth,
        hoveredAutomationKeyframe,
        registerHitTargets,
        automationKeyframeSelectionKeys,
        trackId: track.id,
        veilTimeline,
        width
      },
      automationKeyframeRectsRef.current
    );
  }
}

function drawTrackContent(
  ctx: CanvasRenderingContext2D,
  options: Pick<
    TrackCanvasDrawingOptions,
    | "activeRecordedNotes"
    | "automationKeyframeRectsRef"
    | "ghostPreviewNote"
    | "hoveredAutomationKeyframe"
    | "hoveredNote"
    | "hoveredPitch"
    | "invalidPatchIds"
    | "isTrackSilenced"
    | "keyboardPlacementNote"
    | "muteRectsRef"
    | "noteRectsRef"
    | "pitchRectsRef"
    | "playheadBeat"
    | "project"
    | "selectedContentTabStopFocused"
    | "selectedTrackId"
    | "tabSelectionPreviewNote"
  > & {
    automationKeyframeSelectionKeys: TrackCanvasRenderModel["automationKeyframeSelectionKeys"];
    beatWidth: number;
    gridBeats: number;
    projectEndBeat: number;
    selectedNoteKeys: TrackCanvasRenderModel["selectedNoteKeys"];
    trackLayouts: TrackLayout[];
    width: number;
  }
) {
  const {
    activeRecordedNotes,
    automationKeyframeRectsRef,
    automationKeyframeSelectionKeys,
    beatWidth,
    ghostPreviewNote,
    gridBeats,
    hoveredAutomationKeyframe,
    hoveredNote,
    hoveredPitch,
    invalidPatchIds,
    isTrackSilenced,
    keyboardPlacementNote,
    muteRectsRef,
    noteRectsRef,
    pitchRectsRef,
    playheadBeat,
    project,
    projectEndBeat,
    selectedContentTabStopFocused,
    selectedNoteKeys,
    selectedTrackId,
    tabSelectionPreviewNote,
    trackLayouts,
    width
  } = options;

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

    if (isSelected) {
      ctx.fillStyle = TRACK_CANVAS_COLORS.selectedTrackOverlay;
      const projectEndX = HEADER_WIDTH + projectEndBeat * beatWidth;
      ctx.fillRect(0, y, Math.min(width, projectEndX), layout.height);
      if (projectEndX < width) {
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.fillRect(projectEndX, y, width - projectEndX, layout.height);
        ctx.restore();
      }
    }
    if (trackPatchInvalid) {
      ctx.fillStyle = TRACK_CANVAS_COLORS.trackInvalidOverlay;
      ctx.fillRect(0, y, width, layout.height);
    }

    const muteY = y + SPEAKER_Y_OFFSET;
    const trackSilenced = isTrackSilenced(track);
    muteRectsRef.current.push({ trackId: track.id, x: SPEAKER_X, y: muteY, w: MUTE_ICON_SIZE, h: MUTE_ICON_SIZE });

    for (const note of track.notes) {
      const activeRecord = activeRecordedNoteById.get(`${track.id}:${note.id}`);
      const visualDurationBeats = activeRecord
        ? Math.max(note.durationBeats, playheadBeat - activeRecord.startBeat, gridBeats)
        : note.durationBeats;
      const noteX = HEADER_WIDTH + note.startBeat * beatWidth;
      const noteW = Math.max(NOTE_MIN_WIDTH, visualDurationBeats * beatWidth);
      const noteY = y + NOTE_VERTICAL_INSET;
      const noteH = TRACK_HEIGHT - NOTE_VERTICAL_INSET * 2;
      const overlaps = overlapNoteIds.has(note.id);
      const isHovered = hoveredNote?.trackId === track.id && hoveredNote.noteId === note.id;
      const noteSelected = selectedNoteKeys?.has(getNoteSelectionKey(track.id, note.id)) ?? false;
      const noteFocused = noteSelected && selectedContentTabStopFocused;
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

      drawTrackCanvasNoteState(
        ctx,
        { x: noteX, y: noteY, w: noteW, h: noteH },
        {
          hovered: isHovered,
          selected: noteSelected,
          focused: noteFocused,
          beingPlaced: noteBeingPlaced
        }
      );

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
      const labelLines: Array<{ text: string; font: string; alpha?: number }> = [
        { text: pitchLabel.noteName, font: noteNameFont }
      ];
      if (pitchLabel.octaveText) {
        labelLines.push({ text: pitchLabel.octaveText, font: octaveFont });
      }
      if (pitchLabel.microtoneText) {
        labelLines.push({ text: pitchLabel.microtoneText, font: microtoneFont, alpha: 0.5 });
      }
      const measuredWidths = labelLines.map((line, index) => {
        ctx.font = line.font;
        const minWidth = index === 0 ? 8 : 6;
        return Math.max(minWidth, ctx.measureText(line.text).width);
      });
      const labelWidth = Math.max(...measuredWidths);
      const lineHeights = labelLines.map((line, index) => (index === 0 ? 10 : line.font === microtoneFont ? 8 : 9));
      const lineGap = labelLines.length <= 1 ? 0 : 1;
      const labelHeight =
        lineHeights.reduce((sum, lineHeight) => sum + lineHeight, 0) + lineGap * (labelLines.length - 1);
      const labelPaddingX = 3;
      const labelPaddingY = 2;
      const labelX = centerLabel ? noteX + Math.max(0, (noteW - labelWidth) * 0.5) : noteX + NOTE_LABEL_X_OFFSET;
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
      const overlapX = HEADER_WIDTH + overlap.startBeat * beatWidth;
      const overlapW = Math.max(2, (overlap.endBeat - overlap.startBeat) * beatWidth);
      ctx.fillStyle = TRACK_CANVAS_COLORS.overlapRange;
      ctx.fillRect(overlapX, y + NOTE_VERTICAL_INSET, overlapW, TRACK_HEIGHT - NOTE_VERTICAL_INSET * 2);
    }

    if (ghostPreviewNote?.trackId === track.id) {
      drawGhostPreviewNote(ctx, ghostPreviewNote, y, beatWidth);
    }

    drawAutomationLanes(ctx, {
      automationKeyframeRectsRef,
      automationKeyframeSelectionKeys,
      beatWidth,
      hoveredAutomationKeyframe,
      projectPatches: project.patches,
      registerHitTargets: true,
      projectEndBeat,
      track,
      trackLayout: layout,
      width
    });
  });
}

function drawAutomationVeilPass(
  ctx: CanvasRenderingContext2D,
  options: Pick<TrackCanvasDrawingOptions, "automationKeyframeRectsRef" | "hoveredAutomationKeyframe" | "project"> & {
    automationKeyframeSelectionKeys: TrackCanvasRenderModel["automationKeyframeSelectionKeys"];
    beatWidth: number;
    projectEndBeat: number;
    trackLayouts: TrackLayout[];
    width: number;
  }
) {
  const {
    automationKeyframeRectsRef,
    automationKeyframeSelectionKeys,
    beatWidth,
    hoveredAutomationKeyframe,
    project,
    projectEndBeat,
    trackLayouts,
    width
  } = options;

  project.tracks.forEach((track) => {
    const layout = trackLayouts.find((entry) => entry.trackId === track.id);
    if (!layout) {
      return;
    }
    drawAutomationLanes(ctx, {
      automationKeyframeRectsRef,
      automationKeyframeSelectionKeys,
      beatWidth,
      hoveredAutomationKeyframe,
      projectPatches: project.patches,
      registerHitTargets: false,
      projectEndBeat,
      track,
      trackLayout: layout,
      veilTimeline: true,
      width
    });
  });
}

function drawPlayhead(
  ctx: CanvasRenderingContext2D,
  options: Pick<
    TrackCanvasDrawingOptions,
    "hoveredPlayhead" | "playheadBeat" | "playheadTabStopFocused" | "timelineActionsPopoverOpen"
  > & {
    beatWidth: number;
    height: number;
  }
) {
  const { beatWidth, height, hoveredPlayhead, playheadBeat, playheadTabStopFocused, timelineActionsPopoverOpen } =
    options;
  const playheadX = HEADER_WIDTH + playheadBeat * beatWidth;
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
}

function drawSelectionOverlays(
  ctx: CanvasRenderingContext2D,
  options: Pick<
    TrackCanvasDrawingOptions,
    "hideSelectionActionPopover" | "selection" | "selectionMarqueeActive" | "selectionRect"
  > & {
    beatWidth: number;
    height: number;
    selectionBeatRange: TrackCanvasRenderModel["selectionBeatRange"];
    selectionMarkerTrackId: TrackCanvasRenderModel["selectionMarkerTrackId"];
    trackLayouts: TrackLayout[];
  }
) {
  const {
    beatWidth,
    height,
    hideSelectionActionPopover,
    selection,
    selectionBeatRange,
    selectionMarkerTrackId,
    selectionMarqueeActive,
    selectionRect,
    trackLayouts
  } = options;

  if (selectionBeatRange) {
    const startX = HEADER_WIDTH + selectionBeatRange.startBeat * beatWidth;
    const endX = HEADER_WIDTH + selectionBeatRange.endBeat * beatWidth;
    if (selection.kind === "timeline" && !selectionRect) {
      ctx.save();
      ctx.globalAlpha = selectionMarqueeActive ? 1 : 0.5;
      ctx.fillStyle = TRACK_CANVAS_COLORS.selectionFill;
      ctx.fillRect(startX, 0, Math.max(0, endX - startX), height);
      ctx.restore();
    }

    ctx.save();
    ctx.strokeStyle = TRACK_CANVAS_COLORS.selectionBoundary;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.setLineDash([5, 7]);
    ctx.beginPath();
    ctx.moveTo(startX, 0);
    ctx.lineTo(startX, height);
    ctx.moveTo(endX, 0);
    ctx.lineTo(endX, height);
    ctx.stroke();
    ctx.restore();
  }

  if (
    selectionBeatRange &&
    selection.kind === "note" &&
    !selectionRect &&
    !hideSelectionActionPopover &&
    selectionMarkerTrackId
  ) {
    const indicatorTrackLayout = trackLayouts.find((track) => track.trackId === selectionMarkerTrackId);
    if (indicatorTrackLayout) {
      const startX = HEADER_WIDTH + selectionBeatRange.startBeat * beatWidth;
      const endX = HEADER_WIDTH + selectionBeatRange.endBeat * beatWidth;
      const indicatorY = indicatorTrackLayout.y;
      const tickY = Math.min(indicatorY + 8, indicatorTrackLayout.y + indicatorTrackLayout.height);
      ctx.strokeStyle = TRACK_CANVAS_COLORS.selectionSourceIndicator;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(startX, indicatorY + 0.5);
      ctx.lineTo(endX, indicatorY + 0.5);
      ctx.moveTo(startX, indicatorY + 0.5);
      ctx.lineTo(startX, tickY + 0.5);
      ctx.moveTo(endX, indicatorY + 0.5);
      ctx.lineTo(endX, tickY + 0.5);
      ctx.stroke();
    }
  }

  if (selectionRect) {
    const left = Math.min(selectionRect.startX, selectionRect.endX);
    const top = Math.min(selectionRect.startY, selectionRect.endY);
    const rectWidth = Math.abs(selectionRect.endX - selectionRect.startX);
    const rectHeight = Math.abs(selectionRect.endY - selectionRect.startY);
    ctx.fillStyle = TRACK_CANVAS_COLORS.selectionFill;
    ctx.fillRect(left, top, rectWidth, rectHeight);
    ctx.strokeStyle = TRACK_CANVAS_COLORS.selectionBorder;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);
    ctx.strokeRect(left + 0.5, top + 0.5, Math.max(0, rectWidth - 1), Math.max(0, rectHeight - 1));
    ctx.setLineDash([]);
  }
}

export function renderTrackCanvas(options: TrackCanvasDrawingOptions) {
  const {
    activeRecordedNotes,
    automationKeyframeRectsRef,
    canvasRef,
    countInLabel,
    ghostPlayheadBeat,
    ghostPreviewNote,
    hideSelectionActionPopover,
    hoveredAutomationKeyframe,
    hoveredCompositionEnd,
    hoveredLoopMarker,
    hoveredNote,
    hoveredPitch,
    hoveredPlayhead,
    invalidPatchIds,
    isTrackSilenced,
    keyboardPlacementNote,
    loopMarkerRectsRef,
    muteRectsRef,
    noteRectsRef,
    pitchRectsRef,
    playheadBeat,
    playheadTabStopFocused,
    project,
    renderModel,
    selectedContentTabStopFocused,
    selectedLoopMarker,
    selectedTrackId,
    selection,
    selectionMarqueeActive,
    selectionRect,
    tabSelectionPreviewNote,
    timelineActionsPopoverOpen
  } = options;
  const {
    automationKeyframeSelectionKeys,
    beatWidth,
    gridBeats,
    height,
    meterBeats,
    projectEndBeat,
    selectedNoteKeys,
    selectionBeatRange,
    selectionMarkerTrackId,
    totalBeats,
    trackLayouts,
    width
  } = renderModel;
  const canvas = canvasRef.current;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  canvas.width = width;
  canvas.height = height;

  drawCanvasFrame(ctx, { beatWidth, gridBeats, height, meterBeats, projectEndBeat, totalBeats, trackLayouts, width });
  clearHitTargetRects({ automationKeyframeRectsRef, loopMarkerRectsRef, muteRectsRef, noteRectsRef, pitchRectsRef });
  drawTrackContent(ctx, {
    activeRecordedNotes,
    automationKeyframeRectsRef,
    automationKeyframeSelectionKeys,
    beatWidth,
    ghostPreviewNote,
    gridBeats,
    hoveredAutomationKeyframe,
    hoveredNote,
    hoveredPitch,
    invalidPatchIds,
    isTrackSilenced,
    keyboardPlacementNote,
    muteRectsRef,
    noteRectsRef,
    pitchRectsRef,
    playheadBeat,
    project,
    projectEndBeat,
    selectedContentTabStopFocused,
    selectedNoteKeys,
    selectedTrackId,
    tabSelectionPreviewNote,
    trackLayouts,
    width
  });
  drawPlayhead(ctx, {
    beatWidth,
    height,
    hoveredPlayhead,
    playheadBeat,
    playheadTabStopFocused,
    timelineActionsPopoverOpen
  });
  drawLoopMarkers(ctx, { beatWidth, height, hoveredLoopMarker, loopMarkerRectsRef, project, selectedLoopMarker });
  drawGhostPlayhead(ctx, ghostPlayheadBeat, countInLabel, height, beatWidth);
  drawAutomationVeilPass(ctx, {
    automationKeyframeRectsRef,
    automationKeyframeSelectionKeys,
    beatWidth,
    hoveredAutomationKeyframe,
    project,
    projectEndBeat,
    trackLayouts,
    width
  });
  drawPostCompositionFade(ctx, projectEndBeat, beatWidth, height, width);
  drawSelectionOverlays(ctx, {
    beatWidth,
    height,
    hideSelectionActionPopover,
    selection,
    selectionBeatRange,
    selectionMarkerTrackId,
    selectionMarqueeActive,
    selectionRect,
    trackLayouts
  });
  drawCompositionEndMarker(ctx, projectEndBeat, beatWidth, height, hoveredCompositionEnd);
}

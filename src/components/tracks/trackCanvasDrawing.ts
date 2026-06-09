import type { MutableRefObject } from "react";
import type { AutomationKeyframeRect, HoveredAutomationKeyframe } from "@/components/tracks/trackCanvasAutomationLane";
import { renderLaneSpec, resolveLaneRenderSpec } from "@/components/tracks/trackCanvasLaneRendering";
import {
  HEADER_WIDTH,
  MUTE_ICON_SIZE,
  RULER_HEIGHT,
  SPEAKER_X,
  SPEAKER_Y_OFFSET,
  TRACK_CANVAS_COLORS,
  TRACK_HEIGHT
} from "@/components/tracks/trackCanvasConstants";
import {
  LOOP_MARKER_BAR_WIDTH,
  LOOP_MARKER_DIFFUSION_WIDTH,
  LOOP_MARKER_HIT_BUFFER,
  LOOP_MARKER_LABEL_HEIGHT,
  LOOP_MARKER_LABEL_PADDING_X,
  LOOP_MARKER_NOTCH_HEIGHT,
  LOOP_MARKER_NOTCH_WIDTH,
  type LoopMarkerRect,
  type MuteRect,
  type PitchRect
} from "@/components/tracks/trackCanvasGeometry";
import { drawNoteBody, fillRoundedRect } from "@/components/tracks/trackCanvasNoteGeometry";
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
import type { NoteRect, SelectionRect } from "@/hooks/tracks/useTrackCanvasPointerInteractions";
import { getNoteSelectionKey } from "@/lib/clipboard";
import { getLoopMarkerStates, getMatchedLoopRegions, type MatchedLoopRegion } from "@/lib/looping";
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

const LOOP_INTENSITY_COLORS = [
  TRACK_CANVAS_COLORS.loopIntensity1,
  TRACK_CANVAS_COLORS.loopIntensity2,
  TRACK_CANVAS_COLORS.loopIntensity3,
  TRACK_CANVAS_COLORS.loopIntensity4,
  TRACK_CANVAS_COLORS.loopIntensity5
] as const;

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

interface LoopMarkerVisualGeometry {
  stemX: number;
  stemWidth: number;
  centerY: number;
  labelX: number;
  labelWidth: number;
  labelHeight: number;
  notchWidth: number;
  notchHeight: number;
  hitX: number;
  hitW: number;
}

function getLoopMarkerVisualGeometry(
  ctx: CanvasRenderingContext2D,
  x: number,
  kind: "start" | "end",
  repeatCount?: number
): LoopMarkerVisualGeometry {
  const stemWidth = Math.max(3, LOOP_MARKER_BAR_WIDTH * 0.5);
  const stemX = x - stemWidth * 0.5;
  const centerY = RULER_HEIGHT * 0.5;
  const labelText = repeatCount === undefined ? "" : String(repeatCount);
  const labelWidth =
    kind === "end" && labelText
      ? Math.max(18, Math.ceil(ctx.measureText(labelText).width) + LOOP_MARKER_LABEL_PADDING_X * 2)
      : 0;
  const labelHeight = LOOP_MARKER_LABEL_HEIGHT;
  const notchWidth = LOOP_MARKER_NOTCH_WIDTH;
  const notchHeight = LOOP_MARKER_NOTCH_HEIGHT;
  const labelX = stemX - labelWidth + 1;
  const hitLeft = kind === "start" ? stemX - LOOP_MARKER_DIFFUSION_WIDTH : labelX - notchWidth - LOOP_MARKER_HIT_BUFFER;
  const hitRight =
    kind === "start"
      ? stemX + stemWidth + notchWidth + LOOP_MARKER_HIT_BUFFER
      : stemX + stemWidth + LOOP_MARKER_DIFFUSION_WIDTH;

  return {
    stemX,
    stemWidth,
    centerY,
    labelX,
    labelWidth,
    labelHeight,
    notchWidth,
    notchHeight,
    hitX: hitLeft,
    hitW: Math.max(1, hitRight - hitLeft)
  };
}

function drawLoopMarkerStem(
  ctx: CanvasRenderingContext2D,
  geometry: LoopMarkerVisualGeometry,
  height: number,
  color: string,
  active: boolean
) {
  const { stemWidth, stemX } = geometry;
  const diffusion = LOOP_MARKER_DIFFUSION_WIDTH;

  ctx.save();
  if (active) {
    const gradient = ctx.createLinearGradient(stemX - diffusion, 0, stemX + stemWidth + diffusion, 0);
    gradient.addColorStop(0, withAlpha(color, 0));
    gradient.addColorStop(0.42, color);
    gradient.addColorStop(0.58, color);
    gradient.addColorStop(1, withAlpha(color, 0));
    ctx.globalAlpha = 0.26;
    ctx.fillStyle = gradient;
    ctx.fillRect(stemX - diffusion, 0, stemWidth + diffusion * 2, height);
  }
  ctx.globalAlpha = 0.94;
  ctx.fillStyle = color;
  ctx.fillRect(stemX, 0, stemWidth, height);
  ctx.restore();
}

function drawStartLoopMarkerShape(ctx: CanvasRenderingContext2D, geometry: LoopMarkerVisualGeometry) {
  const { centerY, notchHeight, notchWidth, stemWidth, stemX } = geometry;
  const baseX = stemX + stemWidth;
  ctx.beginPath();
  ctx.moveTo(baseX, centerY - notchHeight * 0.5);
  ctx.lineTo(baseX + notchWidth, centerY);
  ctx.lineTo(baseX, centerY + notchHeight * 0.5);
  ctx.closePath();
}

function drawEndLoopMarkerShape(ctx: CanvasRenderingContext2D, geometry: LoopMarkerVisualGeometry) {
  const { centerY, labelHeight, labelX, notchWidth, stemWidth, stemX } = geometry;
  const labelY = centerY - labelHeight * 0.5;
  const labelRightX = stemX + stemWidth;
  ctx.moveTo(labelRightX, labelY);
  ctx.lineTo(labelX, labelY);
  ctx.lineTo(labelX - notchWidth, centerY);
  ctx.lineTo(labelX, labelY + labelHeight);
  ctx.lineTo(labelRightX, labelY + labelHeight);
  ctx.closePath();
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
  ctx.font = "bold 9px ui-monospace, SFMono-Regular, Menlo, monospace";
  const geometry = getLoopMarkerVisualGeometry(ctx, x, kind, repeatCount);

  drawLoopMarkerStem(ctx, geometry, height, color, hovered);

  ctx.globalAlpha = hovered ? 1 : 0.94;
  ctx.fillStyle = color;
  ctx.beginPath();
  if (kind === "start") {
    drawStartLoopMarkerShape(ctx, geometry);
  } else {
    drawEndLoopMarkerShape(ctx, geometry);
  }
  ctx.fill();

  if (hovered) {
    ctx.globalAlpha = 0.82;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.beginPath();
    if (kind === "start") {
      drawStartLoopMarkerShape(ctx, geometry);
    } else {
      drawEndLoopMarkerShape(ctx, geometry);
    }
    ctx.stroke();
  }

  if (kind === "end" && repeatCount !== undefined) {
    ctx.globalAlpha = 1;
    ctx.fillStyle = TRACK_CANVAS_COLORS.loopMarkerText;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("x", geometry.labelX - geometry.notchWidth * 0.2, geometry.centerY + 0.5);
    ctx.fillText(String(repeatCount), geometry.labelX + geometry.labelWidth * 0.5, geometry.centerY + 0.5);
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
  }

  ctx.restore();
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

function drawCompositionEndMarker(
  ctx: CanvasRenderingContext2D,
  projectEndBeat: number,
  beatWidth: number,
  height: number
) {
  const projectEndX = HEADER_WIDTH + projectEndBeat * beatWidth;
  ctx.save();
  ctx.strokeStyle = TRACK_CANVAS_COLORS.barGrid;
  ctx.lineCap = "butt";
  ctx.beginPath();
  ctx.lineWidth = 2;
  ctx.moveTo(projectEndX, 0);
  ctx.lineTo(projectEndX, height);
  ctx.stroke();
  ctx.beginPath();
  ctx.lineWidth = 4;
  ctx.moveTo(projectEndX + 3, 0);
  ctx.lineTo(projectEndX + 3, height);
  ctx.stroke();
  ctx.restore();
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
      const noteW = Math.max(8, visualDurationBeats * beatWidth);
      const noteY = y + 14;
      const noteH = TRACK_HEIGHT - 28;
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
      const labelX = centerLabel ? noteX + Math.max(0, (noteW - labelWidth) * 0.5) : noteX + 6;
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
      ctx.fillRect(overlapX, y + 14, overlapW, TRACK_HEIGHT - 28);
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

function getLoopIntensityLevel(region: MatchedLoopRegion, regions: MatchedLoopRegion[]): number {
  const depth = regions.filter(
    (candidate) => candidate.startBeat < region.startBeat && candidate.endBeat > region.endBeat
  ).length;
  const maxDepth = regions.reduce(
    (max, candidate) =>
      Math.max(
        max,
        regions.filter(
          (possibleParent) =>
            possibleParent.startBeat < candidate.startBeat && possibleParent.endBeat > candidate.endBeat
        ).length
      ),
    0
  );

  if (maxDepth === 0) {
    return 3;
  }
  if (maxDepth === 1) {
    return 3 + depth;
  }
  if (maxDepth <= 3) {
    return 2 + depth;
  }
  return Math.max(1, 5 - (maxDepth - depth));
}

function buildLoopIntensityByMarkerId(regions: MatchedLoopRegion[]): Map<string, number> {
  const intensityByMarkerId = new Map<string, number>();
  for (const region of regions) {
    const level = getLoopIntensityLevel(region, regions);
    intensityByMarkerId.set(region.startMarkerId, level);
    intensityByMarkerId.set(region.endMarkerId, level);
  }
  return intensityByMarkerId;
}

function getLoopMarkerColor(markerId: string, matched: boolean, intensityByMarkerId: Map<string, number>): string {
  if (!matched) {
    return TRACK_CANVAS_COLORS.loopUnmatched;
  }
  const intensity = intensityByMarkerId.get(markerId) ?? 3;
  return LOOP_INTENSITY_COLORS[Math.min(5, Math.max(1, intensity)) - 1];
}

function getHoveredLoopRegion(
  hoveredLoopMarker: TrackCanvasDrawingOptions["hoveredLoopMarker"],
  regions: MatchedLoopRegion[]
): MatchedLoopRegion | null {
  if (!hoveredLoopMarker) {
    return null;
  }
  return (
    regions.find(
      (region) =>
        region.startMarkerId === hoveredLoopMarker.markerId || region.endMarkerId === hoveredLoopMarker.markerId
    ) ?? null
  );
}

function drawLoopBracket(ctx: CanvasRenderingContext2D, region: MatchedLoopRegion, color: string, beatWidth: number) {
  ctx.font = "bold 9px ui-monospace, SFMono-Regular, Menlo, monospace";
  const endLabelWidth = Math.max(
    18,
    Math.ceil(ctx.measureText(String(region.repeatCount)).width) + LOOP_MARKER_LABEL_PADDING_X * 2
  );
  const startX =
    HEADER_WIDTH + region.startBeat * beatWidth + LOOP_MARKER_BAR_WIDTH * 0.5 + LOOP_MARKER_NOTCH_WIDTH + 6;
  const endX =
    HEADER_WIDTH +
    region.endBeat * beatWidth -
    LOOP_MARKER_BAR_WIDTH * 0.5 -
    endLabelWidth -
    LOOP_MARKER_NOTCH_WIDTH -
    6;
  if (endX - startX < Math.max(44, beatWidth * 0.55)) {
    return;
  }

  const y = 5.5;
  const tickY = RULER_HEIGHT - 8;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(startX, y);
  ctx.lineTo(endX, y);
  ctx.moveTo(startX, y);
  ctx.lineTo(startX, tickY);
  ctx.moveTo(endX, y);
  ctx.lineTo(endX, tickY);
  ctx.stroke();
  ctx.restore();
}

function drawLoopMarkers(
  ctx: CanvasRenderingContext2D,
  options: Pick<
    TrackCanvasDrawingOptions,
    "hoveredLoopMarker" | "loopMarkerRectsRef" | "project" | "selectedLoopMarker"
  > & {
    beatWidth: number;
    height: number;
  }
) {
  const { beatWidth, height, hoveredLoopMarker, loopMarkerRectsRef, project, selectedLoopMarker } = options;
  const loopMarkers = getLoopMarkerStates(project.global.loop);
  const regions = getMatchedLoopRegions(project.global.loop);
  const intensityByMarkerId = buildLoopIntensityByMarkerId(regions);
  const activeLoopMarker = selectedLoopMarker ?? hoveredLoopMarker;
  const activeRegion = getHoveredLoopRegion(activeLoopMarker, regions);
  if (activeRegion) {
    const intensity = intensityByMarkerId.get(activeRegion.startMarkerId) ?? 3;
    drawLoopBracket(ctx, activeRegion, LOOP_INTENSITY_COLORS[Math.min(5, Math.max(1, intensity)) - 1], beatWidth);
  }

  for (const marker of loopMarkers) {
    const color = getLoopMarkerColor(marker.markerId, marker.matched, intensityByMarkerId);
    const markerX = HEADER_WIDTH + marker.beat * beatWidth;
    const isHovered =
      hoveredLoopMarker?.markerId === marker.markerId &&
      hoveredLoopMarker.kind === marker.kind &&
      hoveredLoopMarker.beat === marker.beat;
    const isSelected =
      selectedLoopMarker?.markerId === marker.markerId &&
      selectedLoopMarker.kind === marker.kind &&
      selectedLoopMarker.beat === marker.beat;
    ctx.font = "bold 9px ui-monospace, SFMono-Regular, Menlo, monospace";
    const markerGeometry = getLoopMarkerVisualGeometry(ctx, markerX, marker.kind, marker.repeatCount);
    drawLoopMarker(ctx, markerX, height, marker.kind, color, isHovered || isSelected, marker.repeatCount);
    loopMarkerRectsRef.current.push({
      markerId: marker.markerId,
      kind: marker.kind,
      beat: marker.beat,
      x: markerGeometry.hitX,
      y: 0,
      w: markerGeometry.hitW,
      h: height
    });
  }
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
  drawCompositionEndMarker(ctx, projectEndBeat, beatWidth, height);
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
}

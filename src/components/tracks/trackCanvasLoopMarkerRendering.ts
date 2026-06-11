import type { MutableRefObject } from "react";
import { BEAT_WIDTH, HEADER_WIDTH, RULER_HEIGHT, TRACK_CANVAS_COLORS } from "@/components/tracks/trackCanvasConstants";
import {
  LOOP_MARKER_BAR_WIDTH,
  LOOP_MARKER_DIFFUSION_WIDTH,
  LOOP_MARKER_HIT_BUFFER,
  LOOP_MARKER_LABEL_HEIGHT,
  LOOP_MARKER_LABEL_PADDING_X,
  LOOP_MARKER_NOTCH_HEIGHT,
  LOOP_MARKER_NOTCH_WIDTH,
  type LoopMarkerRect
} from "@/components/tracks/trackCanvasGeometry";
import { getLoopMarkerStates, getMatchedLoopRegions, type MatchedLoopRegion } from "@/lib/looping";
import type { Project } from "@/types/music";

type LoopMarkerInteractionState = { markerId: string; kind: "start" | "end"; beat: number };

interface DrawLoopMarkersOptions {
  beatWidth: number;
  height: number;
  hoveredLoopMarker: LoopMarkerInteractionState | null;
  loopMarkerRectsRef: MutableRefObject<LoopMarkerRect[]>;
  project: Project;
  selectedLoopMarker: LoopMarkerInteractionState | null;
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

const LOOP_INTENSITY_COLORS = [
  TRACK_CANVAS_COLORS.loopIntensity1,
  TRACK_CANVAS_COLORS.loopIntensity2,
  TRACK_CANVAS_COLORS.loopIntensity3,
  TRACK_CANVAS_COLORS.loopIntensity4,
  TRACK_CANVAS_COLORS.loopIntensity5
] as const;

const END_LOOP_LABEL_PADDING_X = LOOP_MARKER_LABEL_PADDING_X * 0.45;
const END_LOOP_MIN_LABEL_WIDTH = 13;
const END_LOOP_COMPACT_BEAT_WIDTH = BEAT_WIDTH * 0.9;

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

function getLoopMarkerVisualGeometry(
  ctx: CanvasRenderingContext2D,
  x: number,
  beatWidth: number,
  kind: "start" | "end",
  repeatCount?: number
): LoopMarkerVisualGeometry {
  const stemWidth = Math.max(3, LOOP_MARKER_BAR_WIDTH * 0.5);
  const stemX = x - stemWidth * 0.5;
  const centerY = RULER_HEIGHT * 0.5;
  const labelText = repeatCount === undefined ? "" : String(repeatCount);
  const labelWidth =
    kind === "end" && labelText
      ? Math.max(END_LOOP_MIN_LABEL_WIDTH, Math.ceil(ctx.measureText(labelText).width) + END_LOOP_LABEL_PADDING_X * 2)
      : 0;
  const labelHeight = LOOP_MARKER_LABEL_HEIGHT;
  const compactEndLabel = kind === "end" && beatWidth <= END_LOOP_COMPACT_BEAT_WIDTH;
  const notchWidth = compactEndLabel ? 0 : LOOP_MARKER_NOTCH_WIDTH;
  const notchHeight = LOOP_MARKER_NOTCH_HEIGHT;
  const labelX = stemX - labelWidth;
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
  ctx.globalAlpha = active ? 0.94 : 0.6;
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
  const { centerY, labelHeight, labelX, notchWidth, stemX } = geometry;
  const labelY = centerY - labelHeight * 0.5;
  const labelRightX = stemX;
  ctx.moveTo(labelRightX, labelY);
  ctx.lineTo(labelX, labelY);
  if (notchWidth > 0) {
    ctx.lineTo(labelX - notchWidth, centerY);
    ctx.lineTo(labelX, labelY + labelHeight);
  } else {
    ctx.lineTo(labelX, labelY + labelHeight);
  }
  ctx.lineTo(labelRightX, labelY + labelHeight);
  ctx.closePath();
}

function drawLoopMarker(
  ctx: CanvasRenderingContext2D,
  x: number,
  beatWidth: number,
  height: number,
  kind: "start" | "end",
  color: string,
  hovered: boolean,
  repeatCount?: number
) {
  ctx.save();
  ctx.font = "bold 9px ui-monospace, SFMono-Regular, Menlo, monospace";
  const geometry = getLoopMarkerVisualGeometry(ctx, x, beatWidth, kind, repeatCount);

  drawLoopMarkerStem(ctx, geometry, height, color, hovered);

  ctx.globalAlpha = hovered ? 0.94 : 0.6;
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
    ctx.globalAlpha = hovered ? 1 : 0.78;
    ctx.fillStyle = TRACK_CANVAS_COLORS.loopMarkerText;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (beatWidth > END_LOOP_COMPACT_BEAT_WIDTH) {
      ctx.fillText("x", geometry.labelX - geometry.notchWidth * 0.06, geometry.centerY + 0.5);
    }
    ctx.fillText(String(repeatCount), geometry.labelX + geometry.labelWidth * 0.5, geometry.centerY + 0.5);
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
  }

  ctx.restore();
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
  hoveredLoopMarker: LoopMarkerInteractionState | null,
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
    END_LOOP_MIN_LABEL_WIDTH,
    Math.ceil(ctx.measureText(String(region.repeatCount)).width) + END_LOOP_LABEL_PADDING_X * 2
  );
  const startX =
    HEADER_WIDTH + region.startBeat * beatWidth + LOOP_MARKER_BAR_WIDTH * 0.5 + LOOP_MARKER_NOTCH_WIDTH + 6;
  const endX =
    HEADER_WIDTH +
    region.endBeat * beatWidth -
    LOOP_MARKER_BAR_WIDTH * 0.5 -
    endLabelWidth -
    (beatWidth > END_LOOP_COMPACT_BEAT_WIDTH ? LOOP_MARKER_NOTCH_WIDTH : 0) -
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

export function drawLoopMarkers(ctx: CanvasRenderingContext2D, options: DrawLoopMarkersOptions) {
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
    const markerGeometry = getLoopMarkerVisualGeometry(ctx, markerX, beatWidth, marker.kind, marker.repeatCount);
    drawLoopMarker(ctx, markerX, beatWidth, height, marker.kind, color, isHovered || isSelected, marker.repeatCount);
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

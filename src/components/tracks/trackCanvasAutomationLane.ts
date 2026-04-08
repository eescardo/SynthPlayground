import { AutomationKeyframeSide, AutomationPoint } from "@/lib/macroAutomation";

export interface AutomationKeyframeRect {
  trackId: string;
  macroId: string;
  keyframeId: string;
  beat: number;
  value: number;
  side: AutomationKeyframeSide;
  kind: "single" | "split";
  x: number;
  y: number;
  hitLeft: number;
  hitRight: number;
  hitTop: number;
  hitBottom: number;
  boundary: "start" | "end" | null;
}

export interface HoveredAutomationKeyframe {
  trackId: string;
  macroId: string;
  keyframeId: string;
  side: AutomationKeyframeSide;
}

export interface TrackCanvasAutomationLaneColors {
  automationLaneBg: string;
  automationLaneBorder: string;
  automationLaneTimelineVeil: string;
  automationFill: string;
  automationLine: string;
  automationHandle: string;
  automationHandleBorder: string;
  automationLabel: string;
  noteHoverBorder: string;
}

const AUTOMATION_SINGLE_RADIUS = 5;
const AUTOMATION_SPLIT_HALF_WIDTH = 4;
const AUTOMATION_SPLIT_HALF_HEIGHT = 4;
const AUTOMATION_SPLIT_CENTER_OFFSET = 3;
const LANE_LABEL_X = 18;

export const automationValueFromY = (y: number, laneY: number, laneHeight: number): number =>
  Math.max(0, Math.min(1, 1 - (y - (laneY + 6)) / Math.max(1, laneHeight - 12)));

export const automationYFromValue = (value: number, laneY: number, laneHeight: number): number =>
  laneY + 6 + (1 - value) * Math.max(1, laneHeight - 12);

function drawAutomationTriangle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  side: "incoming" | "outgoing"
) {
  ctx.beginPath();
  if (side === "incoming") {
    ctx.moveTo(x - AUTOMATION_SPLIT_HALF_WIDTH, y);
    ctx.lineTo(x + AUTOMATION_SPLIT_HALF_WIDTH, y - AUTOMATION_SPLIT_HALF_HEIGHT);
    ctx.lineTo(x + AUTOMATION_SPLIT_HALF_WIDTH, y + AUTOMATION_SPLIT_HALF_HEIGHT);
  } else {
    ctx.moveTo(x + AUTOMATION_SPLIT_HALF_WIDTH, y);
    ctx.lineTo(x - AUTOMATION_SPLIT_HALF_WIDTH, y - AUTOMATION_SPLIT_HALF_HEIGHT);
    ctx.lineTo(x - AUTOMATION_SPLIT_HALF_WIDTH, y + AUTOMATION_SPLIT_HALF_HEIGHT);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

export const findAutomationKeyframeRect = (rects: AutomationKeyframeRect[], x: number, y: number): AutomationKeyframeRect | null => {
  for (const rect of rects) {
    if (x >= rect.hitLeft && x <= rect.hitRight && y >= rect.hitTop && y <= rect.hitBottom) {
      return rect;
    }
  }
  return null;
};

interface RenderAutomationLaneParams {
  automationKeyframeRects: AutomationKeyframeRect[];
  beatWidth: number;
  colors: TrackCanvasAutomationLaneColors;
  ctx: CanvasRenderingContext2D;
  expanded: boolean;
  headerWidth: number;
  height: number;
  hoveredAutomationKeyframe: HoveredAutomationKeyframe | null;
  laneY: number;
  macroId: string;
  macroName: string;
  points: AutomationPoint[];
  registerHitTargets?: boolean;
  trackId: string;
  veilTimeline?: boolean;
  width: number;
}

interface RenderFixedLaneParams {
  beatWidth: number;
  colors: TrackCanvasAutomationLaneColors;
  ctx: CanvasRenderingContext2D;
  headerWidth: number;
  height: number;
  laneY: number;
  name: string;
  defaultValue: number;
  value: number;
  veilTimeline?: boolean;
  width: number;
}

export function renderAutomationLane({
  automationKeyframeRects,
  beatWidth,
  colors,
  ctx,
  expanded,
  headerWidth,
  height,
  hoveredAutomationKeyframe,
  laneY,
  macroId,
  macroName,
  points,
  registerHitTargets = true,
  trackId,
  veilTimeline = false,
  width
}: RenderAutomationLaneParams) {
  const laneBottom = laneY + height;

  ctx.fillStyle = veilTimeline ? colors.automationLaneTimelineVeil : colors.automationLaneBg;
  ctx.fillRect(headerWidth, laneY, width - headerWidth, height);
  ctx.strokeStyle = colors.automationLaneBorder;
  ctx.strokeRect(headerWidth + 0.5, laneY + 0.5, width - headerWidth - 1, height - 1);
  ctx.fillStyle = colors.automationLabel;
  ctx.font = "11px 'Trebuchet MS', 'Segoe UI', sans-serif";
  const labelY = laneY + Math.min(16, height - 6);
  const stateLabel = "auto";
  ctx.fillText(macroName, LANE_LABEL_X, labelY);
  const macroNameWidth = ctx.measureText(macroName).width;
  ctx.fillStyle = colors.noteHoverBorder;
  ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText(stateLabel, LANE_LABEL_X + macroNameWidth + 8, labelY);

  if (expanded) {
    ctx.beginPath();
    ctx.moveTo(headerWidth + points[0].beat * beatWidth, laneBottom);
    ctx.lineTo(headerWidth + points[0].beat * beatWidth, automationYFromValue(points[0].rightValue, laneY, height));
    for (let pointIndex = 1; pointIndex < points.length; pointIndex += 1) {
      const point = points[pointIndex];
      const pointX = headerWidth + point.beat * beatWidth;
      const leftY = automationYFromValue(point.leftValue, laneY, height);
      const rightY = automationYFromValue(point.rightValue, laneY, height);
      ctx.lineTo(pointX, leftY);
      if (Math.abs(point.leftValue - point.rightValue) > 1e-9) {
        ctx.lineTo(pointX, rightY);
      }
    }
    ctx.lineTo(headerWidth + points[points.length - 1].beat * beatWidth, laneBottom);
    ctx.closePath();
    ctx.fillStyle = colors.automationFill;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(headerWidth + points[0].beat * beatWidth, automationYFromValue(points[0].rightValue, laneY, height));
    for (let pointIndex = 1; pointIndex < points.length; pointIndex += 1) {
      const point = points[pointIndex];
      const pointX = headerWidth + point.beat * beatWidth;
      const leftY = automationYFromValue(point.leftValue, laneY, height);
      const rightY = automationYFromValue(point.rightValue, laneY, height);
      ctx.lineTo(pointX, leftY);
      if (Math.abs(point.leftValue - point.rightValue) > 1e-9) {
        ctx.lineTo(pointX, rightY);
      }
    }
    ctx.strokeStyle = colors.automationLine;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  for (const point of points) {
    const pointX = headerWidth + point.beat * beatWidth;
    const incomingY = automationYFromValue(point.leftValue, laneY, height);
    const outgoingY = automationYFromValue(point.rightValue, laneY, height);
    if (expanded) {
      ctx.strokeStyle = colors.automationLine;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pointX, laneBottom - 4);
      ctx.lineTo(pointX, outgoingY);
      ctx.stroke();
      if (Math.abs(point.leftValue - point.rightValue) > 1e-9) {
        ctx.beginPath();
        ctx.moveTo(pointX, incomingY);
        ctx.lineTo(pointX, outgoingY);
        ctx.stroke();
      }
    }
    ctx.strokeStyle = colors.automationHandleBorder;
    ctx.lineWidth = 2;
    if (point.kind === "split") {
      const incomingX = pointX - AUTOMATION_SPLIT_CENTER_OFFSET;
      const outgoingX = pointX + AUTOMATION_SPLIT_CENTER_OFFSET;
      ctx.fillStyle =
        hoveredAutomationKeyframe?.trackId === trackId &&
        hoveredAutomationKeyframe.macroId === macroId &&
        hoveredAutomationKeyframe.keyframeId === point.id &&
        hoveredAutomationKeyframe.side === "incoming"
          ? colors.noteHoverBorder
          : colors.automationHandle;
      drawAutomationTriangle(ctx, incomingX, incomingY, "incoming");
      ctx.fillStyle =
        hoveredAutomationKeyframe?.trackId === trackId &&
        hoveredAutomationKeyframe.macroId === macroId &&
        hoveredAutomationKeyframe.keyframeId === point.id &&
        hoveredAutomationKeyframe.side === "outgoing"
          ? colors.noteHoverBorder
          : colors.automationHandle;
      drawAutomationTriangle(ctx, outgoingX, outgoingY, "outgoing");
      if (registerHitTargets) {
        automationKeyframeRects.push({
          trackId,
          macroId,
          keyframeId: point.id,
          beat: point.beat,
          value: point.leftValue,
          side: "incoming",
          kind: point.kind,
          x: incomingX,
          y: incomingY,
          hitLeft: pointX - AUTOMATION_SPLIT_HALF_WIDTH - AUTOMATION_SPLIT_CENTER_OFFSET - 4,
          hitRight: pointX + 1,
          hitTop: incomingY - AUTOMATION_SPLIT_HALF_HEIGHT - 5,
          hitBottom: incomingY + AUTOMATION_SPLIT_HALF_HEIGHT + 5,
          boundary: point.boundary
        });
        automationKeyframeRects.push({
          trackId,
          macroId,
          keyframeId: point.id,
          beat: point.beat,
          value: point.rightValue,
          side: "outgoing",
          kind: point.kind,
          x: outgoingX,
          y: outgoingY,
          hitLeft: pointX - 1,
          hitRight: pointX + AUTOMATION_SPLIT_HALF_WIDTH + AUTOMATION_SPLIT_CENTER_OFFSET + 4,
          hitTop: outgoingY - AUTOMATION_SPLIT_HALF_HEIGHT - 5,
          hitBottom: outgoingY + AUTOMATION_SPLIT_HALF_HEIGHT + 5,
          boundary: point.boundary
        });
      }
    } else {
      ctx.fillStyle =
        hoveredAutomationKeyframe?.trackId === trackId &&
        hoveredAutomationKeyframe.macroId === macroId &&
        hoveredAutomationKeyframe.keyframeId === point.id
          ? colors.noteHoverBorder
          : colors.automationHandle;
      ctx.beginPath();
      ctx.arc(pointX, outgoingY, AUTOMATION_SINGLE_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (registerHitTargets) {
        automationKeyframeRects.push({
          trackId,
          macroId,
          keyframeId: point.id,
          beat: point.beat,
          value: point.rightValue,
          side: "single",
          kind: point.kind,
          x: pointX,
          y: outgoingY,
          hitLeft: pointX - 7,
          hitRight: pointX + 7,
          hitTop: outgoingY - 7,
          hitBottom: outgoingY + 7,
          boundary: point.boundary
        });
      }
    }
  }
}

export function renderFixedLane({
  beatWidth,
  colors,
  ctx,
  headerWidth,
  height,
  laneY,
  name,
  defaultValue,
  value,
  veilTimeline = false,
  width
}: RenderFixedLaneParams) {
  const laneBottom = laneY + height;
  const sliderStartX = headerWidth + Math.min(beatWidth * 0.25, 18);
  const sliderEndX = Math.min(width - 10, sliderStartX + beatWidth * 3.8);
  const sliderCenterY = laneY + height * 0.5;
  const normalized = Math.max(0, Math.min(1, value));
  const thumbX = sliderStartX + (sliderEndX - sliderStartX) * normalized;
  const defaultNormalized = Math.max(0, Math.min(1, defaultValue));
  const defaultX = sliderStartX + (sliderEndX - sliderStartX) * defaultNormalized;

  ctx.fillStyle = veilTimeline ? colors.automationLaneTimelineVeil : colors.automationLaneBg;
  ctx.fillRect(headerWidth, laneY, width - headerWidth, height);
  ctx.strokeStyle = colors.automationLaneBorder;
  ctx.strokeRect(headerWidth + 0.5, laneY + 0.5, width - headerWidth - 1, height - 1);
  ctx.fillStyle = colors.automationLabel;
  ctx.font = "11px 'Trebuchet MS', 'Segoe UI', sans-serif";
  const labelY = laneY + Math.min(16, height - 6);
  ctx.fillText(name, LANE_LABEL_X, labelY);
  const nameWidth = ctx.measureText(name).width;
  ctx.fillStyle = colors.noteHoverBorder;
  ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText("fixed", LANE_LABEL_X + nameWidth + 8, labelY);

  ctx.strokeStyle = colors.automationLaneBorder;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(sliderStartX, sliderCenterY);
  ctx.lineTo(sliderEndX, sliderCenterY);
  ctx.stroke();

  ctx.strokeStyle = colors.noteHoverBorder;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(defaultX, sliderCenterY - 6);
  ctx.lineTo(defaultX, sliderCenterY + 6);
  ctx.stroke();

  const fillWidth = Math.max(0, thumbX - sliderStartX);
  ctx.fillStyle = colors.automationFill;
  ctx.fillRect(sliderStartX, sliderCenterY - 2, fillWidth, 4);

  ctx.fillStyle = colors.automationHandle;
  ctx.strokeStyle = colors.automationHandleBorder;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(thumbX, sliderCenterY, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  const percent = Math.round(normalized * 100);
  ctx.fillStyle = colors.automationLabel;
  ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText(`${percent}%`, sliderEndX + 8, Math.min(laneBottom - 6, sliderCenterY + 4));
}

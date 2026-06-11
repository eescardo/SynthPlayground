import { FIXED_MACRO_SLIDER_START_OFFSET, FIXED_MACRO_SLIDER_WIDTH } from "@/components/tracks/trackCanvasConstants";
import { AutomationKeyframeSide, AutomationPoint } from "@/lib/macroAutomation";
import { clamp01 } from "@/lib/numeric";

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
const AUTOMATION_VALUE_VERTICAL_PADDING = 6;
const AUTOMATION_BORDER_INSET = 0.5;
const AUTOMATION_BORDER_WIDTH = 1;
const AUTOMATION_LINE_WIDTH = 2;
const AUTOMATION_GUIDE_LINE_WIDTH = 1;
const AUTOMATION_GUIDE_BOTTOM_OFFSET = 4;
const AUTOMATION_STATE_LABEL_GAP = 8;
const AUTOMATION_HANDLE_HIT_PADDING_X = 4;
const AUTOMATION_HANDLE_HIT_PADDING_Y = 5;
const AUTOMATION_SINGLE_HIT_RADIUS = 7;
const FIXED_LANE_RIGHT_PADDING = 10;
const FIXED_LANE_DEFAULT_TICK_HALF_HEIGHT = 6;
const FIXED_LANE_FILL_HALF_HEIGHT = 2;
const FIXED_LANE_FILL_HEIGHT = FIXED_LANE_FILL_HALF_HEIGHT * 2;
const FIXED_LANE_THUMB_RADIUS = 5;
const FIXED_LANE_VALUE_LABEL_GAP = 8;
const FIXED_LANE_VALUE_LABEL_BOTTOM_PADDING = 6;
const FIXED_LANE_VALUE_LABEL_BASELINE_OFFSET = 4;
const AUTOMATION_LABEL_FONT = "11px 'Trebuchet MS', 'Segoe UI', sans-serif";
const AUTOMATION_STATE_LABEL_FONT = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
const LANE_LABEL_X = 18;

export const automationValueFromY = (y: number, laneY: number, laneHeight: number): number =>
  clamp01(
    1 -
      (y - (laneY + AUTOMATION_VALUE_VERTICAL_PADDING)) /
        Math.max(1, laneHeight - AUTOMATION_VALUE_VERTICAL_PADDING * 2)
  );

export const automationYFromValue = (value: number, laneY: number, laneHeight: number): number =>
  laneY +
  AUTOMATION_VALUE_VERTICAL_PADDING +
  (1 - value) * Math.max(1, laneHeight - AUTOMATION_VALUE_VERTICAL_PADDING * 2);

function drawAutomationTriangle(ctx: CanvasRenderingContext2D, x: number, y: number, side: "incoming" | "outgoing") {
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

export const findAutomationKeyframeRect = (
  rects: AutomationKeyframeRect[],
  x: number,
  y: number
): AutomationKeyframeRect | null => {
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
  automationKeyframeSelectionKeys?: ReadonlySet<string>;
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
  automationKeyframeSelectionKeys,
  trackId,
  veilTimeline = false,
  width
}: RenderAutomationLaneParams) {
  const laneBottom = laneY + height;

  ctx.fillStyle = veilTimeline ? colors.automationLaneTimelineVeil : colors.automationLaneBg;
  ctx.fillRect(headerWidth, laneY, width - headerWidth, height);
  ctx.strokeStyle = colors.automationLaneBorder;
  ctx.strokeRect(
    headerWidth + AUTOMATION_BORDER_INSET,
    laneY + AUTOMATION_BORDER_INSET,
    width - headerWidth - AUTOMATION_BORDER_WIDTH,
    height - AUTOMATION_BORDER_WIDTH
  );
  ctx.fillStyle = colors.automationLabel;
  ctx.font = AUTOMATION_LABEL_FONT;
  const labelY = laneY + height * 0.5;
  const stateLabel = "auto";
  ctx.textBaseline = "middle";
  ctx.fillText(macroName, LANE_LABEL_X, labelY);
  const macroNameWidth = ctx.measureText(macroName).width;
  ctx.fillStyle = colors.noteHoverBorder;
  ctx.font = AUTOMATION_STATE_LABEL_FONT;
  ctx.fillText(stateLabel, LANE_LABEL_X + macroNameWidth + AUTOMATION_STATE_LABEL_GAP, labelY);
  ctx.textBaseline = "alphabetic";

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
    ctx.lineWidth = AUTOMATION_LINE_WIDTH;
    ctx.stroke();
  }

  for (const point of points) {
    const pointX = headerWidth + point.beat * beatWidth;
    const incomingY = automationYFromValue(point.leftValue, laneY, height);
    const outgoingY = automationYFromValue(point.rightValue, laneY, height);
    if (expanded) {
      ctx.strokeStyle = colors.automationLine;
      ctx.lineWidth = AUTOMATION_GUIDE_LINE_WIDTH;
      ctx.beginPath();
      ctx.moveTo(pointX, laneBottom - AUTOMATION_GUIDE_BOTTOM_OFFSET);
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
    ctx.lineWidth = AUTOMATION_LINE_WIDTH;
    if (point.kind === "split") {
      const incomingX = pointX - AUTOMATION_SPLIT_CENTER_OFFSET;
      const outgoingX = pointX + AUTOMATION_SPLIT_CENTER_OFFSET;
      ctx.fillStyle =
        hoveredAutomationKeyframe?.trackId === trackId &&
        hoveredAutomationKeyframe.macroId === macroId &&
        hoveredAutomationKeyframe.keyframeId === point.id &&
        hoveredAutomationKeyframe.side === "incoming"
          ? colors.noteHoverBorder
          : automationKeyframeSelectionKeys?.has(`${trackId}:${macroId}:${point.id}`)
            ? colors.noteHoverBorder
            : colors.automationHandle;
      drawAutomationTriangle(ctx, incomingX, incomingY, "incoming");
      ctx.fillStyle =
        hoveredAutomationKeyframe?.trackId === trackId &&
        hoveredAutomationKeyframe.macroId === macroId &&
        hoveredAutomationKeyframe.keyframeId === point.id &&
        hoveredAutomationKeyframe.side === "outgoing"
          ? colors.noteHoverBorder
          : automationKeyframeSelectionKeys?.has(`${trackId}:${macroId}:${point.id}`)
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
          hitLeft:
            pointX - AUTOMATION_SPLIT_HALF_WIDTH - AUTOMATION_SPLIT_CENTER_OFFSET - AUTOMATION_HANDLE_HIT_PADDING_X,
          hitRight: pointX + AUTOMATION_BORDER_WIDTH,
          hitTop: incomingY - AUTOMATION_SPLIT_HALF_HEIGHT - AUTOMATION_HANDLE_HIT_PADDING_Y,
          hitBottom: incomingY + AUTOMATION_SPLIT_HALF_HEIGHT + AUTOMATION_HANDLE_HIT_PADDING_Y,
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
          hitLeft: pointX - AUTOMATION_BORDER_WIDTH,
          hitRight:
            pointX + AUTOMATION_SPLIT_HALF_WIDTH + AUTOMATION_SPLIT_CENTER_OFFSET + AUTOMATION_HANDLE_HIT_PADDING_X,
          hitTop: outgoingY - AUTOMATION_SPLIT_HALF_HEIGHT - AUTOMATION_HANDLE_HIT_PADDING_Y,
          hitBottom: outgoingY + AUTOMATION_SPLIT_HALF_HEIGHT + AUTOMATION_HANDLE_HIT_PADDING_Y,
          boundary: point.boundary
        });
      }
    } else {
      ctx.fillStyle =
        hoveredAutomationKeyframe?.trackId === trackId &&
        hoveredAutomationKeyframe.macroId === macroId &&
        hoveredAutomationKeyframe.keyframeId === point.id
          ? colors.noteHoverBorder
          : automationKeyframeSelectionKeys?.has(`${trackId}:${macroId}:${point.id}`)
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
          hitLeft: pointX - AUTOMATION_SINGLE_HIT_RADIUS,
          hitRight: pointX + AUTOMATION_SINGLE_HIT_RADIUS,
          hitTop: outgoingY - AUTOMATION_SINGLE_HIT_RADIUS,
          hitBottom: outgoingY + AUTOMATION_SINGLE_HIT_RADIUS,
          boundary: point.boundary
        });
      }
    }
  }
}

export function renderFixedLane({
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
  const sliderStartX = headerWidth + FIXED_MACRO_SLIDER_START_OFFSET;
  const sliderEndX = Math.min(width - FIXED_LANE_RIGHT_PADDING, sliderStartX + FIXED_MACRO_SLIDER_WIDTH);
  const sliderCenterY = laneY + height * 0.5;
  const normalized = clamp01(value);
  const thumbX = sliderStartX + (sliderEndX - sliderStartX) * normalized;
  const defaultNormalized = clamp01(defaultValue);
  const defaultX = sliderStartX + (sliderEndX - sliderStartX) * defaultNormalized;

  ctx.fillStyle = veilTimeline ? colors.automationLaneTimelineVeil : colors.automationLaneBg;
  ctx.fillRect(headerWidth, laneY, width - headerWidth, height);
  ctx.strokeStyle = colors.automationLaneBorder;
  ctx.strokeRect(
    headerWidth + AUTOMATION_BORDER_INSET,
    laneY + AUTOMATION_BORDER_INSET,
    width - headerWidth - AUTOMATION_BORDER_WIDTH,
    height - AUTOMATION_BORDER_WIDTH
  );
  ctx.fillStyle = colors.automationLabel;
  ctx.font = AUTOMATION_LABEL_FONT;
  const labelY = laneY + height * 0.5;
  ctx.textBaseline = "middle";
  ctx.fillText(name, LANE_LABEL_X, labelY);
  const nameWidth = ctx.measureText(name).width;
  ctx.fillStyle = colors.noteHoverBorder;
  ctx.font = AUTOMATION_STATE_LABEL_FONT;
  ctx.fillText("fixed", LANE_LABEL_X + nameWidth + AUTOMATION_STATE_LABEL_GAP, labelY);
  ctx.textBaseline = "alphabetic";

  ctx.strokeStyle = colors.automationLaneBorder;
  ctx.lineWidth = AUTOMATION_LINE_WIDTH;
  ctx.beginPath();
  ctx.moveTo(sliderStartX, sliderCenterY);
  ctx.lineTo(sliderEndX, sliderCenterY);
  ctx.stroke();

  ctx.strokeStyle = colors.noteHoverBorder;
  ctx.lineWidth = AUTOMATION_LINE_WIDTH;
  ctx.beginPath();
  ctx.moveTo(defaultX, sliderCenterY - FIXED_LANE_DEFAULT_TICK_HALF_HEIGHT);
  ctx.lineTo(defaultX, sliderCenterY + FIXED_LANE_DEFAULT_TICK_HALF_HEIGHT);
  ctx.stroke();

  const fillWidth = Math.max(0, thumbX - sliderStartX);
  ctx.fillStyle = colors.automationFill;
  ctx.fillRect(sliderStartX, sliderCenterY - FIXED_LANE_FILL_HALF_HEIGHT, fillWidth, FIXED_LANE_FILL_HEIGHT);

  ctx.fillStyle = colors.automationHandle;
  ctx.strokeStyle = colors.automationHandleBorder;
  ctx.lineWidth = AUTOMATION_LINE_WIDTH;
  ctx.beginPath();
  ctx.arc(thumbX, sliderCenterY, FIXED_LANE_THUMB_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  const percent = Math.round(normalized * 100);
  ctx.fillStyle = colors.automationLabel;
  ctx.font = AUTOMATION_STATE_LABEL_FONT;
  ctx.fillText(
    `${percent}%`,
    sliderEndX + FIXED_LANE_VALUE_LABEL_GAP,
    Math.min(laneBottom - FIXED_LANE_VALUE_LABEL_BOTTOM_PADDING, sliderCenterY + FIXED_LANE_VALUE_LABEL_BASELINE_OFFSET)
  );
}

import { createId } from "@/lib/ids";
import { clamp01 } from "@/lib/numeric";
import {
  getAutomationKeyframeIncomingValue,
  getAutomationKeyframeOutgoingValue,
  getTrackAutomationPoints,
  isSplitAutomationKeyframe
} from "@/lib/macroAutomation";
import { TrackMacroAutomationKeyframe, TrackMacroAutomationLane } from "@/types/music";

const EPSILON = 1e-9;

export interface ClipboardAutomationKeyframeData {
  beat: number;
  type: "whole" | "split";
  value?: number;
  incomingValue?: number;
  outgoingValue?: number;
}

export interface ClipboardAutomationLaneData {
  macroId: string;
  startValue: number;
  endValue: number;
  keyframes: ClipboardAutomationKeyframeData[];
}

export const sortAutomationKeyframes = (keyframes: TrackMacroAutomationKeyframe[]) =>
  keyframes.slice().sort((left, right) => left.beat - right.beat || left.id.localeCompare(right.id));

const makeWholeAutomationKeyframe = (
  beat: number,
  value: number,
  id = createId("automation_keyframe")
): TrackMacroAutomationKeyframe => ({
  id,
  beat,
  type: "whole",
  value
});

const makeSplitAutomationKeyframe = (
  beat: number,
  incomingValue: number,
  outgoingValue: number,
  id = createId("automation_keyframe")
): TrackMacroAutomationKeyframe => ({
  id,
  beat,
  type: "split",
  incomingValue,
  outgoingValue
});

const makeAutomationBoundaryKeyframe = (
  beat: number,
  incomingValue: number,
  outgoingValue: number,
  id = createId("automation_keyframe")
): TrackMacroAutomationKeyframe =>
  Math.abs(incomingValue - outgoingValue) <= EPSILON
    ? makeWholeAutomationKeyframe(beat, outgoingValue, id)
    : makeSplitAutomationKeyframe(beat, incomingValue, outgoingValue, id);

export const makeClipboardAutomationKeyframe = (
  keyframe: TrackMacroAutomationKeyframe,
  startBeat: number
): ClipboardAutomationKeyframeData =>
  isSplitAutomationKeyframe(keyframe)
    ? {
        beat: keyframe.beat - startBeat,
        type: "split",
        incomingValue: getAutomationKeyframeIncomingValue(keyframe),
        outgoingValue: getAutomationKeyframeOutgoingValue(keyframe)
      }
    : {
        beat: keyframe.beat - startBeat,
        type: "whole",
        value: getAutomationKeyframeOutgoingValue(keyframe)
      };

export const makeTrackAutomationKeyframeFromClipboard = (
  keyframe: ClipboardAutomationKeyframeData,
  beat: number
): TrackMacroAutomationKeyframe =>
  keyframe.type === "split"
    ? makeSplitAutomationKeyframe(beat, keyframe.incomingValue ?? 0, keyframe.outgoingValue ?? 0)
    : makeWholeAutomationKeyframe(beat, keyframe.value ?? keyframe.outgoingValue ?? 0);

export const getAutomationLaneValueAtBeat = (
  lane: TrackMacroAutomationLane,
  beat: number,
  timelineEndBeat: number,
  side: "incoming" | "outgoing"
): number => {
  const points = getTrackAutomationPoints(lane, timelineEndBeat);
  const exact = points.find((point) => Math.abs(point.beat - beat) <= EPSILON);
  if (exact) {
    return side === "incoming" ? exact.leftValue : exact.rightValue;
  }

  let previous = points[0];
  for (const point of points) {
    if (point.beat < beat - EPSILON) {
      previous = point;
      continue;
    }
    const span = Math.max(point.beat - previous.beat, EPSILON);
    const t = clamp01((beat - previous.beat) / span);
    return previous.rightValue + (point.leftValue - previous.rightValue) * t;
  }

  return points[points.length - 1]?.rightValue ?? lane.endValue;
};

export const clipAutomationLaneToBeatRange = (
  lane: TrackMacroAutomationLane,
  startBeat: number,
  endBeat: number,
  timelineEndBeat: number
): ClipboardAutomationLaneData | null => {
  const keyframes = sortAutomationKeyframes(
    lane.keyframes.filter((keyframe) => keyframe.beat >= startBeat - EPSILON && keyframe.beat < endBeat - EPSILON)
  );
  const startValue = getAutomationLaneValueAtBeat(lane, startBeat, timelineEndBeat, "outgoing");
  const endValue = getAutomationLaneValueAtBeat(lane, endBeat, timelineEndBeat, "incoming");
  if (keyframes.length === 0 && Math.abs(startValue - endValue) <= EPSILON) {
    return null;
  }

  return {
    macroId: lane.macroId,
    startValue,
    endValue,
    keyframes: keyframes.map((keyframe) => makeClipboardAutomationKeyframe(keyframe, startBeat))
  };
};

export const replaceAutomationLaneBeatRange = (
  lane: TrackMacroAutomationLane,
  segment: ClipboardAutomationLaneData,
  startBeat: number,
  endBeat: number,
  timelineEndBeat: number
): TrackMacroAutomationLane => {
  const incomingAtStart = getAutomationLaneValueAtBeat(lane, startBeat, timelineEndBeat, "incoming");
  const outgoingAtEnd = getAutomationLaneValueAtBeat(lane, endBeat, timelineEndBeat, "outgoing");
  const nextKeyframes = lane.keyframes
    .filter((keyframe) => keyframe.beat < startBeat - EPSILON || keyframe.beat > endBeat + EPSILON)
    .concat(
      segment.keyframes.map((keyframe) => makeTrackAutomationKeyframeFromClipboard(keyframe, startBeat + keyframe.beat))
    );

  if (startBeat > EPSILON) {
    nextKeyframes.push(makeAutomationBoundaryKeyframe(startBeat, incomingAtStart, segment.startValue));
  }

  if (endBeat < timelineEndBeat - EPSILON) {
    nextKeyframes.push(makeAutomationBoundaryKeyframe(endBeat, segment.endValue, outgoingAtEnd));
  }

  return {
    ...lane,
    startValue: startBeat <= EPSILON ? segment.startValue : lane.startValue,
    endValue: endBeat >= timelineEndBeat - EPSILON ? segment.endValue : lane.endValue,
    keyframes: sortAutomationKeyframes(nextKeyframes)
  };
};

export const eraseAutomationLaneBeatRange = (
  lane: TrackMacroAutomationLane,
  startBeat: number,
  endBeat: number,
  timelineEndBeat: number
) =>
  replaceAutomationLaneBeatRange(
    lane,
    {
      macroId: lane.macroId,
      startValue: getAutomationLaneValueAtBeat(lane, startBeat, timelineEndBeat, "incoming"),
      endValue: getAutomationLaneValueAtBeat(lane, endBeat, timelineEndBeat, "outgoing"),
      keyframes: []
    },
    startBeat,
    endBeat,
    timelineEndBeat
  );

export const insertAutomationLaneGap = (
  lane: TrackMacroAutomationLane,
  atBeat: number,
  gapBeats: number,
  timelineEndBeat: number
): TrackMacroAutomationLane => {
  if (gapBeats <= 0) {
    return lane;
  }

  const shiftedLane: TrackMacroAutomationLane = {
    ...lane,
    keyframes: sortAutomationKeyframes(
      lane.keyframes.map((keyframe) =>
        keyframe.beat >= atBeat - EPSILON ? { ...keyframe, beat: keyframe.beat + gapBeats } : keyframe
      )
    )
  };

  return replaceAutomationLaneBeatRange(
    shiftedLane,
    {
      macroId: lane.macroId,
      startValue: getAutomationLaneValueAtBeat(lane, atBeat, timelineEndBeat, "incoming"),
      endValue: getAutomationLaneValueAtBeat(lane, atBeat, timelineEndBeat, "incoming"),
      keyframes: []
    },
    atBeat,
    atBeat + gapBeats,
    timelineEndBeat + gapBeats
  );
};

export const removeAutomationLaneBeatRangeAndCloseGap = (
  lane: TrackMacroAutomationLane,
  startBeat: number,
  endBeat: number,
  timelineEndBeat: number
): TrackMacroAutomationLane => {
  if (endBeat <= startBeat) {
    return lane;
  }

  const gap = endBeat - startBeat;
  const incomingAtStart = getAutomationLaneValueAtBeat(lane, startBeat, timelineEndBeat, "incoming");
  const outgoingAtEnd = getAutomationLaneValueAtBeat(lane, endBeat, timelineEndBeat, "outgoing");
  const nextKeyframes = lane.keyframes.flatMap((keyframe) => {
    if (keyframe.beat < startBeat - EPSILON) {
      return [keyframe];
    }
    if (keyframe.beat > endBeat + EPSILON) {
      return [{ ...keyframe, beat: keyframe.beat - gap }];
    }
    return [];
  });

  if (startBeat > EPSILON) {
    nextKeyframes.push(makeAutomationBoundaryKeyframe(startBeat, incomingAtStart, outgoingAtEnd));
  }

  return {
    ...lane,
    startValue: startBeat <= EPSILON ? outgoingAtEnd : lane.startValue,
    endValue: lane.endValue,
    keyframes: sortAutomationKeyframes(nextKeyframes)
  };
};

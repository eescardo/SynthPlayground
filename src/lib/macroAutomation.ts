import { createId } from "@/lib/ids";
import {
  Project,
  SplitTrackMacroAutomationKeyframe,
  Track,
  TrackMacroAutomationKeyframe,
  TrackMacroAutomationLane
} from "@/types/music";

const clampNormalized = (value: number): number => Math.max(0, Math.min(1, value));
const EPSILON = 1e-9;
const SPLIT_OFFSET = 0.1;
export const TRACK_VOLUME_AUTOMATION_ID = "__track_volume__";

export type AutomationKeyframeSide = "single" | "incoming" | "outgoing";

export interface AutomationPoint {
  id: string;
  beat: number;
  leftValue: number;
  rightValue: number;
  boundary: "start" | "end" | null;
  kind: "single" | "split";
}

const sortKeyframes = (keyframes: TrackMacroAutomationKeyframe[]): TrackMacroAutomationKeyframe[] =>
  [...keyframes].sort((left, right) => left.beat - right.beat || left.id.localeCompare(right.id));

export const isSplitAutomationKeyframe = (
  keyframe: TrackMacroAutomationKeyframe
): keyframe is SplitTrackMacroAutomationKeyframe =>
  keyframe.type === "split";

export const getAutomationKeyframeIncomingValue = (keyframe: TrackMacroAutomationKeyframe): number =>
  isSplitAutomationKeyframe(keyframe)
    ? clampNormalized(keyframe.incomingValue)
    : clampNormalized(keyframe.value);

export const getAutomationKeyframeOutgoingValue = (keyframe: TrackMacroAutomationKeyframe): number =>
  isSplitAutomationKeyframe(keyframe)
    ? clampNormalized(keyframe.outgoingValue)
    : clampNormalized(keyframe.value);

export const getAutomationKeyframeSideValue = (keyframe: TrackMacroAutomationKeyframe, side: AutomationKeyframeSide): number =>
  side === "incoming"
    ? getAutomationKeyframeIncomingValue(keyframe)
    : side === "outgoing"
      ? getAutomationKeyframeOutgoingValue(keyframe)
      : getAutomationKeyframeOutgoingValue(keyframe);

const makeSingleKeyframe = (id: string, beat: number, value: number): TrackMacroAutomationKeyframe => ({
  id,
  beat,
  type: "whole",
  value: clampNormalized(value)
});

const makeSplitKeyframe = (id: string, beat: number, incomingValue: number, outgoingValue: number): TrackMacroAutomationKeyframe => ({
  id,
  beat,
  type: "split",
  incomingValue: clampNormalized(incomingValue),
  outgoingValue: clampNormalized(outgoingValue)
});

const maybeMergeKeyframe = (keyframe: TrackMacroAutomationKeyframe): TrackMacroAutomationKeyframe => {
  const incoming = getAutomationKeyframeIncomingValue(keyframe);
  const outgoing = getAutomationKeyframeOutgoingValue(keyframe);
  if (Math.abs(incoming - outgoing) <= EPSILON) {
    return makeSingleKeyframe(keyframe.id, keyframe.beat, outgoing);
  }
  return isSplitAutomationKeyframe(keyframe) ? makeSplitKeyframe(keyframe.id, keyframe.beat, incoming, outgoing) : makeSingleKeyframe(keyframe.id, keyframe.beat, outgoing);
};

export const sanitizeMacroAutomationLane = (raw: unknown): TrackMacroAutomationLane | null => {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return null;
  }

  const lane = raw as {
    macroId?: unknown;
    expanded?: unknown;
    startValue?: unknown;
    endValue?: unknown;
    keyframes?: unknown;
  };

  if (typeof lane.macroId !== "string" || !lane.macroId) {
    return null;
  }

  const keyframes = Array.isArray(lane.keyframes)
    ? lane.keyframes.flatMap((entry, index) => {
        if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
          return [];
        }
        const keyframe = entry as {
          id?: unknown;
          beat?: unknown;
          type?: unknown;
          value?: unknown;
          incomingValue?: unknown;
          outgoingValue?: unknown;
        };
        if (typeof keyframe.beat !== "number" || !Number.isFinite(keyframe.beat)) {
          return [];
        }
        const id = typeof keyframe.id === "string" && keyframe.id ? keyframe.id : `automation_keyframe_${index}`;
        if (
          keyframe.type === "split" &&
          typeof keyframe.incomingValue === "number" &&
          Number.isFinite(keyframe.incomingValue) &&
          typeof keyframe.outgoingValue === "number" &&
          Number.isFinite(keyframe.outgoingValue)
        ) {
          return [maybeMergeKeyframe(makeSplitKeyframe(id, Math.max(0, keyframe.beat), keyframe.incomingValue, keyframe.outgoingValue))];
        }
        if (
          (keyframe.type === "whole" || typeof keyframe.type !== "string") &&
          typeof keyframe.value === "number" &&
          Number.isFinite(keyframe.value)
        ) {
          return [makeSingleKeyframe(id, Math.max(0, keyframe.beat), keyframe.value)];
        }
        if (
          typeof keyframe.incomingValue === "number" &&
          Number.isFinite(keyframe.incomingValue) &&
          typeof keyframe.outgoingValue === "number" &&
          Number.isFinite(keyframe.outgoingValue)
        ) {
          return [maybeMergeKeyframe(makeSplitKeyframe(id, Math.max(0, keyframe.beat), keyframe.incomingValue, keyframe.outgoingValue))];
        }
        return [];
      })
    : [];

  return {
    macroId: lane.macroId,
    expanded: lane.expanded !== false,
    startValue: clampNormalized(typeof lane.startValue === "number" && Number.isFinite(lane.startValue) ? lane.startValue : 0.5),
    endValue: clampNormalized(typeof lane.endValue === "number" && Number.isFinite(lane.endValue) ? lane.endValue : 0.5),
    keyframes: sortKeyframes(keyframes)
  };
};

export const sanitizeMacroAutomationMap = (raw: unknown): Record<string, TrackMacroAutomationLane> => {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return {};
  }

  const lanes: Record<string, TrackMacroAutomationLane> = {};
  for (const [macroId, value] of Object.entries(raw)) {
    const lane = sanitizeMacroAutomationLane(value);
    if (!lane) {
      continue;
    }
    lanes[macroId] = { ...lane, macroId };
  }
  return lanes;
};

export const getTrackMacroLane = (track: Track, macroId: string): TrackMacroAutomationLane | null => track.macroAutomations[macroId] ?? null;
export const getTrackVolumeLane = (track: Track): TrackMacroAutomationLane | null => track.macroAutomations[TRACK_VOLUME_AUTOMATION_ID] ?? null;

export const isTrackMacroAutomated = (track: Track, macroId: string): boolean => Boolean(getTrackMacroLane(track, macroId));
export const isTrackVolumeAutomated = (track: Track): boolean => Boolean(getTrackVolumeLane(track));

export const createTrackMacroAutomationLane = (macroId: string, initialValue: number): TrackMacroAutomationLane => ({
  macroId,
  expanded: true,
  startValue: clampNormalized(initialValue),
  endValue: clampNormalized(initialValue),
  keyframes: []
});

export const createTrackVolumeAutomationLane = (initialValue: number): TrackMacroAutomationLane =>
  createTrackMacroAutomationLane(TRACK_VOLUME_AUTOMATION_ID, initialValue);

export const getTrackAutomationPoints = (lane: TrackMacroAutomationLane, endBeat: number): AutomationPoint[] => {
  const points: AutomationPoint[] = [
    {
      id: "__start__",
      beat: 0,
      leftValue: lane.startValue,
      rightValue: lane.startValue,
      boundary: "start",
      kind: "single"
    }
  ];

  for (const keyframe of sortKeyframes(
    lane.keyframes
      .filter((entry) => entry.beat > 0 && entry.beat < endBeat)
      .map((entry) => maybeMergeKeyframe({ ...entry, beat: Math.max(0, entry.beat) }))
  )) {
    points.push({
      id: keyframe.id,
      beat: keyframe.beat,
      leftValue: getAutomationKeyframeIncomingValue(keyframe),
      rightValue: getAutomationKeyframeOutgoingValue(keyframe),
      boundary: null,
      kind: isSplitAutomationKeyframe(keyframe) ? "split" : "single"
    });
  }

  points.push({
    id: "__end__",
    beat: Math.max(0, endBeat),
    leftValue: lane.endValue,
    rightValue: lane.endValue,
    boundary: "end",
    kind: "single"
  });

  return points;
};

export const getProjectTimelineEndBeat = (project: Project): number => {
  const meterBeats = project.global.meter === "4/4" ? 4 : 3;
  const maxNoteEnd = project.tracks.flatMap((track) => track.notes).reduce((acc, note) => Math.max(acc, note.startBeat + note.durationBeats), 0);
  return Math.max(16, Math.ceil(maxNoteEnd + meterBeats));
};

export const getTrackMacroValueAtBeat = (
  track: Track,
  macroId: string,
  fallbackValue: number,
  beat: number,
  timelineEndBeat: number
): number => {
  const lane = getTrackMacroLane(track, macroId);
  if (!lane) {
    return clampNormalized(typeof track.macroValues[macroId] === "number" ? track.macroValues[macroId] : fallbackValue);
  }

  const points = getTrackAutomationPoints(lane, timelineEndBeat);
  if (points.length === 0) {
    return clampNormalized(fallbackValue);
  }

  const exact = points.find((point) => Math.abs(point.beat - beat) <= EPSILON);
  if (exact) {
    return clampNormalized(exact.rightValue);
  }

  let previous = points[0];
  for (const point of points) {
    if (point.beat < beat - EPSILON) {
      previous = point;
      continue;
    }
    const span = Math.max(point.beat - previous.beat, 0.000001);
    const t = clampNormalized((beat - previous.beat) / span);
    return clampNormalized(previous.rightValue + (point.leftValue - previous.rightValue) * t);
  }

  return clampNormalized(points[points.length - 1]?.rightValue ?? fallbackValue);
};

const replaceKeyframe = (lane: TrackMacroAutomationLane, nextKeyframe: TrackMacroAutomationKeyframe): TrackMacroAutomationLane => ({
  ...lane,
  keyframes: sortKeyframes(
    lane.keyframes
      .filter((keyframe) => keyframe.id !== nextKeyframe.id)
      .concat(maybeMergeKeyframe(nextKeyframe))
  )
});

export const upsertAutomationLaneKeyframe = (
  lane: TrackMacroAutomationLane,
  beat: number,
  value: number,
  endBeat: number,
  keyframeId?: string
): TrackMacroAutomationLane => {
  const normalizedBeat = Math.max(0, beat);
  const normalizedValue = clampNormalized(value);
  if (normalizedBeat <= 0) {
    return { ...lane, startValue: normalizedValue };
  }
  if (normalizedBeat >= endBeat) {
    return { ...lane, endValue: normalizedValue };
  }

  const existing = keyframeId ? lane.keyframes.find((keyframe) => keyframe.id === keyframeId) : undefined;
  if (existing) {
    return replaceKeyframe(lane, makeSingleKeyframe(existing.id, normalizedBeat, normalizedValue));
  }

  const nextKeyframes = sortKeyframes(
    lane.keyframes
      .filter((keyframe) => Math.abs(keyframe.beat - normalizedBeat) > EPSILON)
      .concat(makeSingleKeyframe(keyframeId ?? createId("automation_keyframe"), normalizedBeat, normalizedValue))
  );

  return {
    ...lane,
    keyframes: nextKeyframes
  };
};

export const splitAutomationLaneKeyframe = (lane: TrackMacroAutomationLane, keyframeId: string): TrackMacroAutomationLane => {
  const keyframe = lane.keyframes.find((entry) => entry.id === keyframeId);
  if (!keyframe || isSplitAutomationKeyframe(keyframe)) {
    return lane;
  }
  const value = getAutomationKeyframeOutgoingValue(keyframe);
  return replaceKeyframe(
    lane,
    makeSplitKeyframe(keyframe.id, keyframe.beat, clampNormalized(value - SPLIT_OFFSET), clampNormalized(value + SPLIT_OFFSET))
  );
};

export const updateAutomationLaneKeyframeSide = (
  lane: TrackMacroAutomationLane,
  keyframeId: string,
  side: AutomationKeyframeSide,
  value: number
): TrackMacroAutomationLane => {
  const keyframe = lane.keyframes.find((entry) => entry.id === keyframeId);
  if (!keyframe) {
    return lane;
  }
  const normalizedValue = clampNormalized(value);
  if (side === "single") {
    return replaceKeyframe(lane, makeSingleKeyframe(keyframe.id, keyframe.beat, normalizedValue));
  }
  const incoming = side === "incoming" ? normalizedValue : getAutomationKeyframeIncomingValue(keyframe);
  const outgoing = side === "outgoing" ? normalizedValue : getAutomationKeyframeOutgoingValue(keyframe);
  return replaceKeyframe(lane, makeSplitKeyframe(keyframe.id, keyframe.beat, incoming, outgoing));
};

export const removeAutomationLaneKeyframeSide = (
  lane: TrackMacroAutomationLane,
  keyframeId: string,
  side: AutomationKeyframeSide
): TrackMacroAutomationLane => {
  const keyframe = lane.keyframes.find((entry) => entry.id === keyframeId);
  if (!keyframe) {
    return lane;
  }
  if (!isSplitAutomationKeyframe(keyframe) || side === "single") {
    return {
      ...lane,
      keyframes: lane.keyframes.filter((entry) => entry.id !== keyframeId)
    };
  }
  const remainingValue = side === "incoming" ? getAutomationKeyframeOutgoingValue(keyframe) : getAutomationKeyframeIncomingValue(keyframe);
  return replaceKeyframe(lane, makeSingleKeyframe(keyframe.id, keyframe.beat, remainingValue));
};

export const cloneAutomationKeyframeAtBeat = (
  keyframe: TrackMacroAutomationKeyframe,
  beat: number,
  id: string
): TrackMacroAutomationKeyframe =>
  isSplitAutomationKeyframe(keyframe)
    ? makeSplitKeyframe(id, beat, getAutomationKeyframeIncomingValue(keyframe), getAutomationKeyframeOutgoingValue(keyframe))
    : makeSingleKeyframe(id, beat, getAutomationKeyframeOutgoingValue(keyframe));

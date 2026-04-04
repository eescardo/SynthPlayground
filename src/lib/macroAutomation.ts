import { createId } from "@/lib/ids";
import { Project, Track, TrackMacroAutomationKeyframe, TrackMacroAutomationLane } from "@/types/music";

const clampNormalized = (value: number): number => Math.max(0, Math.min(1, value));

const sortKeyframes = (keyframes: TrackMacroAutomationKeyframe[]): TrackMacroAutomationKeyframe[] =>
  [...keyframes].sort((left, right) => left.beat - right.beat || left.id.localeCompare(right.id));

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
        const keyframe = entry as { id?: unknown; beat?: unknown; value?: unknown };
        if (typeof keyframe.beat !== "number" || !Number.isFinite(keyframe.beat)) {
          return [];
        }
        if (typeof keyframe.value !== "number" || !Number.isFinite(keyframe.value)) {
          return [];
        }
        return [{
          id: typeof keyframe.id === "string" && keyframe.id ? keyframe.id : `automation_keyframe_${index}`,
          beat: Math.max(0, keyframe.beat),
          value: clampNormalized(keyframe.value)
        }];
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

export const isTrackMacroAutomated = (track: Track, macroId: string): boolean => Boolean(getTrackMacroLane(track, macroId));

export const createTrackMacroAutomationLane = (macroId: string, initialValue: number): TrackMacroAutomationLane => ({
  macroId,
  expanded: true,
  startValue: clampNormalized(initialValue),
  endValue: clampNormalized(initialValue),
  keyframes: []
});

export const getTrackAutomationPoints = (
  lane: TrackMacroAutomationLane,
  endBeat: number
): Array<{ id: string; beat: number; value: number; boundary: "start" | "end" | null }> => [
  { id: "__start__", beat: 0, value: lane.startValue, boundary: "start" },
  ...sortKeyframes(
    lane.keyframes
      .filter((keyframe) => keyframe.beat > 0 && keyframe.beat < endBeat)
      .map((keyframe) => ({ ...keyframe, value: clampNormalized(keyframe.value), beat: Math.max(0, keyframe.beat) }))
  ).map((keyframe) => ({ ...keyframe, boundary: null })),
  { id: "__end__", beat: Math.max(0, endBeat), value: lane.endValue, boundary: "end" }
];

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
  if (points.length <= 1) {
    return clampNormalized(fallbackValue);
  }
  if (beat <= 0 || points[0].beat >= beat) {
    return clampNormalized(points[0].value);
  }

  for (let index = 0; index < points.length - 1; index += 1) {
    const left = points[index];
    const right = points[index + 1];
    if (beat < left.beat) {
      return clampNormalized(left.value);
    }
    if (beat <= right.beat) {
      const span = Math.max(right.beat - left.beat, 0.000001);
      const t = clampNormalized((beat - left.beat) / span);
      return clampNormalized(left.value + (right.value - left.value) * t);
    }
  }

  return clampNormalized(points[points.length - 1]?.value ?? fallbackValue);
};

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

  const nextKeyframes = sortKeyframes(
    lane.keyframes
      .filter((keyframe) => keyframe.id !== keyframeId)
      .filter((keyframe) => Math.abs(keyframe.beat - normalizedBeat) > 1e-9)
      .concat({
        id: keyframeId ?? createId("automation_keyframe"),
        beat: normalizedBeat,
        value: normalizedValue
      })
  );

  return {
    ...lane,
    keyframes: nextKeyframes
  };
};

export const removeAutomationLaneKeyframe = (lane: TrackMacroAutomationLane, keyframeId: string): TrackMacroAutomationLane => ({
  ...lane,
  keyframes: lane.keyframes.filter((keyframe) => keyframe.id !== keyframeId)
});

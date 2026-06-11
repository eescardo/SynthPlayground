import { describe, expect, it } from "vitest";
import type { AutomationKeyframeRect } from "@/components/tracks/trackCanvasAutomationLane";
import type { LoopMarkerRect, MuteRect, PitchRect } from "@/components/tracks/trackCanvasGeometry";
import {
  isEmptyCompositionEndHit,
  type NoteRect,
  type TrackCanvasResolvedPointerTargets
} from "./trackCanvasPointerTypes";

const baseTargets = (): TrackCanvasResolvedPointerTargets => ({
  automationLaneHit: null,
  laneHit: null,
  loopMarkerRect: null,
  muteRect: null,
  noteRect: null,
  pitchRect: null
});

const noteRect: NoteRect = {
  trackId: "track-1",
  noteId: "note-1",
  x: 120,
  y: 48,
  w: 96,
  h: 28
};

const pitchRect: PitchRect = {
  trackId: "track-1",
  noteId: "note-1",
  x: 126,
  y: 54,
  w: 44,
  h: 18
};

const muteRect: MuteRect = {
  trackId: "track-1",
  x: 12,
  y: 52,
  w: 18,
  h: 18
};

const loopMarkerRect: LoopMarkerRect = {
  markerId: "loop-1",
  kind: "end",
  beat: 8,
  x: 360,
  y: 0,
  w: 18,
  h: 36
};

const automationKeyframe: AutomationKeyframeRect = {
  trackId: "track-1",
  macroId: "macro-1",
  keyframeId: "keyframe-1",
  beat: 8,
  value: 0.5,
  side: "single",
  kind: "single",
  x: 360,
  y: 110,
  hitLeft: 354,
  hitRight: 366,
  hitTop: 104,
  hitBottom: 116,
  boundary: null
};

describe("isEmptyCompositionEndHit", () => {
  it("allows the composition end hit only when no higher-priority target overlaps it", () => {
    expect(isEmptyCompositionEndHit(true, false, baseTargets(), null)).toBe(true);
  });

  it("ignores misses before checking competing targets", () => {
    expect(isEmptyCompositionEndHit(false, false, baseTargets(), null)).toBe(false);
  });

  it.each([
    ["ruler playhead", true, baseTargets(), null],
    ["note", false, { ...baseTargets(), noteRect }, null],
    ["pitch label", false, { ...baseTargets(), pitchRect }, null],
    ["mute button", false, { ...baseTargets(), muteRect }, null],
    ["loop marker", false, { ...baseTargets(), loopMarkerRect }, null],
    ["automation keyframe", false, baseTargets(), automationKeyframe],
    ["automation lane", false, { ...baseTargets(), laneHit: { lane: { automated: true } } }, null],
    ["fixed lane", false, { ...baseTargets(), laneHit: { lane: { automated: false } } }, null]
  ] satisfies Array<[string, boolean, TrackCanvasResolvedPointerTargets, AutomationKeyframeRect | null]>)(
    "does not steal the %s interaction",
    (_label, rulerPlayheadHit, targets, keyframe) => {
      expect(isEmptyCompositionEndHit(true, rulerPlayheadHit, targets, keyframe)).toBe(false);
    }
  );
});

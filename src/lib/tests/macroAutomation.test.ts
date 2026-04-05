import { describe, expect, it } from "vitest";

import {
  createTrackMacroAutomationLane,
  getTrackAutomationPoints,
  getTrackMacroValueAtBeat,
  splitAutomationLaneKeyframe,
  updateAutomationLaneKeyframeSide,
  upsertAutomationLaneKeyframe
} from "@/lib/macroAutomation";
import { Track } from "@/types/music";

const createTrack = (): Track => ({
  id: "track_1",
  name: "Track 1",
  instrumentPatchId: "preset_bass",
  notes: [],
  macroValues: {
    macro_cutoff: 0.25
  },
  macroAutomations: {},
  macroPanelExpanded: true,
  volume: 1,
  mute: false,
  solo: false,
  fx: {
    delayEnabled: false,
    reverbEnabled: false,
    saturationEnabled: false,
    compressorEnabled: false,
    delayMix: 0.2,
    reverbMix: 0.2,
    drive: 0.2,
    compression: 0.4
  }
});

describe("macroAutomation", () => {
  it("derives start, split interior, and end points", () => {
    let lane = createTrackMacroAutomationLane("macro_cutoff", 0.2);
    lane = upsertAutomationLaneKeyframe(lane, 4, 0.6, 8);
    const keyframeId = lane.keyframes[0]!.id;
    lane = splitAutomationLaneKeyframe(lane, keyframeId);

    expect(getTrackAutomationPoints(lane, 8)).toEqual([
      { id: "__start__", beat: 0, leftValue: 0.2, rightValue: 0.2, boundary: "start", kind: "single" },
      expect.objectContaining({
        id: keyframeId,
        beat: 4,
        leftValue: 0.5,
        rightValue: 0.7,
        boundary: null,
        kind: "split"
      }),
      { id: "__end__", beat: 8, leftValue: 0.2, rightValue: 0.2, boundary: "end", kind: "single" }
    ]);
  });

  it("interpolates through split keyframes with an instantaneous jump at the beat", () => {
    const track = createTrack();
    let lane = createTrackMacroAutomationLane("macro_cutoff", 0.1);
    lane = upsertAutomationLaneKeyframe(lane, 4, 0.6, 8);
    const keyframeId = lane.keyframes[0]!.id;
    lane = splitAutomationLaneKeyframe(lane, keyframeId);
    lane = updateAutomationLaneKeyframeSide(lane, keyframeId, "incoming", 0.4);
    lane = updateAutomationLaneKeyframeSide(lane, keyframeId, "outgoing", 0.9);
    lane = {
      ...lane,
      endValue: 0.5
    };
    track.macroAutomations.macro_cutoff = lane;

    expect(getTrackMacroValueAtBeat(track, "macro_cutoff", 0.25, 2, 8)).toBeCloseTo(0.25);
    expect(getTrackMacroValueAtBeat(track, "macro_cutoff", 0.25, 3.999, 8)).toBeCloseTo(0.399925, 5);
    expect(getTrackMacroValueAtBeat(track, "macro_cutoff", 0.25, 4, 8)).toBeCloseTo(0.9);
    expect(getTrackMacroValueAtBeat(track, "macro_cutoff", 0.25, 6, 8)).toBeCloseTo(0.7);
    expect(getTrackMacroValueAtBeat(track, "macro_cutoff", 0.25, 8, 8)).toBeCloseTo(0.5);
  });

  it("auto-merges a split keyframe back to a single point when both sides match", () => {
    let lane = createTrackMacroAutomationLane("macro_cutoff", 0.2);
    lane = upsertAutomationLaneKeyframe(lane, 4, 0.6, 8);
    const keyframeId = lane.keyframes[0]!.id;
    lane = splitAutomationLaneKeyframe(lane, keyframeId);
    lane = updateAutomationLaneKeyframeSide(lane, keyframeId, "incoming", 0.55);
    lane = updateAutomationLaneKeyframeSide(lane, keyframeId, "outgoing", 0.55);

    expect(lane.keyframes).toEqual([
      expect.objectContaining({
        id: keyframeId,
        beat: 4,
        value: 0.55
      })
    ]);
  });
});

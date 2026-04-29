import { describe, expect, it } from "vitest";

import {
  createTrackMacroAutomationLane,
  getTrackAutomationPoints,
  getTrackMacroValueAtBeat,
  getTrackPreviewStateAtBeat,
  isSplitAutomationKeyframe,
  TRACK_VOLUME_AUTOMATION_ID,
  removeAutomationLaneKeyframeSide,
  splitAutomationLaneKeyframe,
  updateAutomationLaneKeyframeSide,
  upsertAutomationLaneKeyframe
} from "@/lib/macroAutomation";
import { Track } from "@/types/music";
import { Patch } from "@/types/patch";

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

const createPatch = (): Patch => ({
  schemaVersion: 1,
  id: "patch_1",
  name: "Patch",
  meta: { source: "custom" },
  nodes: [],
  connections: [],
  ui: {
    macros: [
      { id: "macro_cutoff", name: "Cutoff", keyframeCount: 2, defaultNormalized: 0.5, bindings: [] },
      { id: "macro_resonance", name: "Resonance", keyframeCount: 2, defaultNormalized: 0.3, bindings: [] }
    ]
  },
  layout: { nodes: [] }
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

  it("represents a split keyframe as an explicit split variant", () => {
    let lane = createTrackMacroAutomationLane("macro_cutoff", 0.2);
    lane = upsertAutomationLaneKeyframe(lane, 4, 0.6, 8);
    const keyframeId = lane.keyframes[0]!.id;
    lane = splitAutomationLaneKeyframe(lane, keyframeId);

    expect(lane.keyframes).toEqual([
      expect.objectContaining({
        id: keyframeId,
        beat: 4,
        type: "split",
        incomingValue: 0.5,
        outgoingValue: 0.7
      })
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

  it("derives preview state for all macros at a beat while overriding the edited lane", () => {
    const track = createTrack();
    const patch = createPatch();
    track.macroValues.macro_resonance = 0.15;
    track.macroAutomations.macro_cutoff = {
      ...createTrackMacroAutomationLane("macro_cutoff", 0.2),
      endValue: 0.8
    };
    track.macroAutomations.macro_resonance = {
      ...createTrackMacroAutomationLane("macro_resonance", 0.1),
      endValue: 0.5
    };

    const preview = getTrackPreviewStateAtBeat(track, patch, 8, 8, {
      macroId: "macro_cutoff",
      normalized: 0.65
    });

    expect(preview.macroValues).toEqual({
      macro_cutoff: 0.65,
      macro_resonance: 0.5
    });
    expect(preview.volumeNormalized).toBeCloseTo(0.5);
  });

  it("overrides volume separately from patch macro preview values", () => {
    const track = createTrack();
    const patch = createPatch();
    track.macroAutomations[TRACK_VOLUME_AUTOMATION_ID] = {
      ...createTrackMacroAutomationLane(TRACK_VOLUME_AUTOMATION_ID, 0.4),
      endValue: 0.7
    };

    const preview = getTrackPreviewStateAtBeat(track, patch, 8, 8, {
      macroId: TRACK_VOLUME_AUTOMATION_ID,
      normalized: 0.2
    });

    expect(preview.macroValues).toEqual({
      macro_cutoff: 0.25,
      macro_resonance: 0.3
    });
    expect(preview.volumeNormalized).toBeCloseTo(0.2);
  });

  it("keeps the split variant while editing incoming and outgoing sides independently", () => {
    let lane = createTrackMacroAutomationLane("macro_cutoff", 0.2);
    lane = upsertAutomationLaneKeyframe(lane, 4, 0.6, 8);
    const keyframeId = lane.keyframes[0]!.id;
    lane = splitAutomationLaneKeyframe(lane, keyframeId);
    lane = updateAutomationLaneKeyframeSide(lane, keyframeId, "incoming", 0.3);
    lane = updateAutomationLaneKeyframeSide(lane, keyframeId, "outgoing", 0.85);

    expect(isSplitAutomationKeyframe(lane.keyframes[0]!)).toBe(true);
    if (!isSplitAutomationKeyframe(lane.keyframes[0]!)) {
      throw new Error("expected edited keyframe to remain split");
    }
    expect(lane.keyframes[0]).toEqual(
      expect.objectContaining({
        id: keyframeId,
        beat: 4,
        type: "split",
        incomingValue: 0.3,
        outgoingValue: 0.85
      })
    );
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
        type: "whole",
        value: 0.55
      })
    ]);
  });

  it("collapses a split keyframe back to a single point when one side is deleted", () => {
    let lane = createTrackMacroAutomationLane("macro_cutoff", 0.2);
    lane = upsertAutomationLaneKeyframe(lane, 4, 0.6, 8);
    const keyframeId = lane.keyframes[0]!.id;
    lane = splitAutomationLaneKeyframe(lane, keyframeId);
    lane = updateAutomationLaneKeyframeSide(lane, keyframeId, "incoming", 0.35);
    lane = updateAutomationLaneKeyframeSide(lane, keyframeId, "outgoing", 0.8);
    lane = removeAutomationLaneKeyframeSide(lane, keyframeId, "incoming");

    expect(lane.keyframes).toEqual([
      expect.objectContaining({
        id: keyframeId,
        beat: 4,
        type: "whole",
        value: 0.8
      })
    ]);
  });
});

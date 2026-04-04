import { describe, expect, it } from "vitest";

import {
  createTrackMacroAutomationLane,
  getTrackAutomationPoints,
  getTrackMacroValueAtBeat,
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
  it("derives synthetic start and end points around interior keyframes", () => {
    let lane = createTrackMacroAutomationLane("macro_cutoff", 0.2);
    lane = upsertAutomationLaneKeyframe(lane, 4, 0.8, 8);

    expect(getTrackAutomationPoints(lane, 8)).toEqual([
      { id: "__start__", beat: 0, value: 0.2, boundary: "start" },
      expect.objectContaining({ beat: 4, value: 0.8, boundary: null }),
      { id: "__end__", beat: 8, value: 0.2, boundary: "end" }
    ]);
  });

  it("interpolates automated macro values across the track duration", () => {
    const track = createTrack();
    let lane = createTrackMacroAutomationLane("macro_cutoff", 0.1);
    lane = upsertAutomationLaneKeyframe(lane, 4, 0.9, 8);
    lane = {
      ...lane,
      endValue: 0.5
    };
    track.macroAutomations.macro_cutoff = lane;

    expect(getTrackMacroValueAtBeat(track, "macro_cutoff", 0.25, 0, 8)).toBeCloseTo(0.1);
    expect(getTrackMacroValueAtBeat(track, "macro_cutoff", 0.25, 2, 8)).toBeCloseTo(0.5);
    expect(getTrackMacroValueAtBeat(track, "macro_cutoff", 0.25, 6, 8)).toBeCloseTo(0.7);
    expect(getTrackMacroValueAtBeat(track, "macro_cutoff", 0.25, 8, 8)).toBeCloseTo(0.5);
  });
});

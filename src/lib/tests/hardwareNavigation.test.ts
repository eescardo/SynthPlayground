import { describe, expect, it } from "vitest";
import { upsertKeyboardPlacedNote, trackHasNoteAtBeat } from "@/lib/hardwareNavigation";
import { Track } from "@/types/music";

const createTrack = (notes: Track["notes"]): Track => ({
  id: "track_1",
  name: "Track 1",
  instrumentPatchId: "patch_1",
  notes,
  macroValues: {},
  macroAutomations: {},
  macroPanelExpanded: false,
  volume: 1,
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

describe("hardware navigation note placement", () => {
  it("detects whether the playhead is sitting on a note", () => {
    const track = createTrack([{ id: "note_a", pitchStr: "C4", startBeat: 2, durationBeats: 1, velocity: 0.8 }]);

    expect(trackHasNoteAtBeat(track, 2.25)).toBe(true);
    expect(trackHasNoteAtBeat(track, 3.05)).toBe(false);
  });

  it("overwrites note content inside the held placement range while preserving the active note id", () => {
    const track = createTrack([
      { id: "left", pitchStr: "C4", startBeat: 0, durationBeats: 4, velocity: 0.8 },
      { id: "right", pitchStr: "G4", startBeat: 5, durationBeats: 2, velocity: 0.8 }
    ]);

    const next = upsertKeyboardPlacedNote(track, {
      id: "placing",
      pitchStr: "D4",
      startBeat: 1,
      durationBeats: 4
    });

    expect(next.notes).toEqual([
      expect.objectContaining({ id: "left", startBeat: 0, durationBeats: 1 }),
      expect.objectContaining({ id: "placing", pitchStr: "D4", startBeat: 1, durationBeats: 4 }),
      expect.objectContaining({ id: "right", startBeat: 5, durationBeats: 2 })
    ]);
  });
});

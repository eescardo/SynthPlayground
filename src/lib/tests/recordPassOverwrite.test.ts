import { describe, expect, it } from "vitest";
import {
  advanceRecordPassEraseBeat,
  applyActiveRecordedNoteExtensions,
  createRecordPassOverwrite,
  getRecordPassProtectedNoteIds,
  markRecordPassGridCellErased,
  registerRecordPassCreatedNote
} from "@/lib/recordPassOverwrite";

describe("record pass overwrite helpers", () => {
  it("advances erasure only after the playhead crosses a grid boundary", () => {
    const recordPass = createRecordPassOverwrite("track-1", 0);

    expect(advanceRecordPassEraseBeat(recordPass, 0.24, 0.25)).toBeNull();
    expect(advanceRecordPassEraseBeat(recordPass, 0.25, 0.25)).toEqual({ fromBeat: 0, toBeat: 0.25 });
    expect(recordPass.lastErasedBeat).toBe(0.25);
  });

  it("tracks erased grid cells once per pass", () => {
    const recordPass = createRecordPassOverwrite("track-1", 0);

    expect(markRecordPassGridCellErased(recordPass, "track-1", 0.25)).toBe(true);
    expect(markRecordPassGridCellErased(recordPass, "track-1", 0.25)).toBe(false);
    expect(markRecordPassGridCellErased(recordPass, "other-track", 0.25)).toBe(true);
  });

  it("protects active notes and notes created during the current record pass", () => {
    const recordPass = createRecordPassOverwrite("track-1", 0);
    registerRecordPassCreatedNote(recordPass, "track-1", "created-note");

    expect(getRecordPassProtectedNoteIds(recordPass, "track-1", ["active-note"])).toEqual(
      new Set(["active-note", "created-note"])
    );
    expect(getRecordPassProtectedNoteIds(recordPass, "other-track", ["active-note"])).toEqual(new Set(["active-note"]));
  });

  it("erases old timeline material touched by an extending active recorded note", () => {
    const recordPass = createRecordPassOverwrite("track-1", 0);
    registerRecordPassCreatedNote(recordPass, "track-1", "recorded-note");

    const notes = applyActiveRecordedNoteExtensions({
      activeNoteIds: ["recorded-note"],
      gridBeats: 0.25,
      notes: [
        {
          id: "recorded-note",
          pitchStr: "F3",
          startBeat: 0.25,
          durationBeats: 0.25,
          velocity: 0.9
        },
        {
          id: "old-note",
          pitchStr: "F3",
          startBeat: 0.5,
          durationBeats: 0.5,
          velocity: 0.8
        }
      ],
      recordPass,
      trackId: "track-1",
      updates: [{ noteId: "recorded-note", startBeat: 0.25, durationBeats: 0.5 }]
    });

    expect(notes).toEqual([
      {
        id: "recorded-note",
        pitchStr: "F3",
        startBeat: 0.25,
        durationBeats: 0.5,
        velocity: 0.9
      },
      expect.objectContaining({
        pitchStr: "F3",
        startBeat: 0.75,
        durationBeats: 0.25,
        velocity: 0.8
      })
    ]);
  });
});

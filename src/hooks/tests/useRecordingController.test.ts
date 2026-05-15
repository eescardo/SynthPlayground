import { describe, expect, it } from "vitest";
import { getRecordNoteStartLateSnapGraceBeats, snapRecordedNoteStartBeat } from "@/hooks/useRecordingController";

describe("recording timing helpers", () => {
  it("gives recorded note starts a small late-hit grace window after the grid line", () => {
    expect(snapRecordedNoteStartBeat(0.14, 0.25, 120)).toBe(0);
    expect(snapRecordedNoteStartBeat(0.2, 0.25, 120)).toBe(0.25);
  });

  it("still lets early notes snap forward to the intended upcoming grid line", () => {
    expect(snapRecordedNoteStartBeat(0.24, 0.25, 120)).toBe(0.25);
  });

  it("caps the grace window to a fraction of very small grids", () => {
    expect(getRecordNoteStartLateSnapGraceBeats(120, 0.0625)).toBe(0.0375);
  });
});

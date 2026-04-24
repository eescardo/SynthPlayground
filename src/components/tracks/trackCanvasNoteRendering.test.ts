import { describe, expect, it } from "vitest";

import {
  resolveTrackCanvasNoteFill,
  resolveTrackCanvasNoteLabelFill,
  shouldCenterTrackCanvasNoteLabel,
  splitTrackCanvasPitchLabel
} from "@/components/tracks/trackCanvasNoteRendering";

describe("trackCanvasNoteRendering", () => {
  it("splits pitch labels into note name and octave", () => {
    expect(splitTrackCanvasPitchLabel("F#3")).toEqual({
      noteName: "F#",
      octaveText: "3",
      offsetText: null,
      octaveNumber: 3
    });
    expect(splitTrackCanvasPitchLabel("C-1")).toEqual({
      noteName: "C",
      octaveText: "-1",
      offsetText: null,
      octaveNumber: -1
    });
    expect(splitTrackCanvasPitchLabel("D4+25")).toEqual({
      noteName: "D",
      octaveText: "4+25",
      offsetText: "+25",
      octaveNumber: 4
    });
  });

  it("falls back cleanly for unexpected pitch strings", () => {
    expect(splitTrackCanvasPitchLabel("noise")).toEqual({
      noteName: "noise",
      octaveText: null,
      offsetText: null,
      octaveNumber: null
    });
  });

  it("treats single-grid notes as centered labels", () => {
    expect(shouldCenterTrackCanvasNoteLabel(0.25, 0.25)).toBe(true);
    expect(shouldCenterTrackCanvasNoteLabel(0.2500000005, 0.25)).toBe(true);
    expect(shouldCenterTrackCanvasNoteLabel(0.5, 0.25)).toBe(false);
  });

  it("applies octave-based lightness across the full range", () => {
    expect(resolveTrackCanvasNoteFill("#2d8cff", 1)).toBe("#003a80");
    expect(resolveTrackCanvasNoteFill("#2d8cff", 4)).toBe("#0073ff");
    expect(resolveTrackCanvasNoteFill("#2d8cff", 7)).toBe("#80b9ff");
  });

  it("keeps note labels dark on very light octave fills", () => {
    expect(resolveTrackCanvasNoteLabelFill("#80bfff", "#ecf5ff")).toBe("#10263b");
    expect(resolveTrackCanvasNoteLabelFill("#0040bf", "#ecf5ff")).toBe("#ecf5ff");
  });
});

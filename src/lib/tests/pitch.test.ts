import { describe, expect, it } from "vitest";
import { keyToPitch, midiToPitch, pitchToMidi, qwertyKeyForPitch, transposePitch } from "@/lib/pitch";

describe("pitch keyboard mapping", () => {
  it("starts the hardware keyboard range at F2 and still includes middle C", () => {
    expect(keyToPitch("`")).toBe("F2");
    expect(qwertyKeyForPitch("F2")).toBe("`");
    expect(keyToPitch("o")).toBe("C4");
    expect(qwertyKeyForPitch("C4")).toBe("O");
  });

  it("excludes reserved navigation keys from the piano map", () => {
    for (const key of ["-", "_", "=", "+", "[", "{", "]", "}", ";", ":", "'", "\"", ",", "<", ".", ">", "/", "?"]) {
      expect(keyToPitch(key)).toBeUndefined();
    }
  });

  it("clamps default pitch transposition to the supported picker range", () => {
    expect(transposePitch("C4", 1)).toBe("C#4");
    expect(transposePitch("C1", -1)).toBe("C1");
    expect(transposePitch("C7", 1)).toBe("C7");
  });

  it("supports 25-cent microtonal steps in both directions", () => {
    expect(transposePitch("C4", 0.25)).toBe("C4+25");
    expect(transposePitch("C4+25", 0.25)).toBe("C4+50");
    expect(transposePitch("C4", -0.25)).toBe("B3+75");
  });

  it("parses and normalizes microtonal pitch strings", () => {
    expect(pitchToMidi("F#3+75")).toBe(54.75);
    expect(midiToPitch(54.25)).toBe("F#3+25");
    expect(midiToPitch(59.75)).toBe("B3+75");
  });
});

import { describe, expect, it } from "vitest";
import { keyToPitch, qwertyKeyForPitch, transposePitch } from "@/lib/pitch";

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
});

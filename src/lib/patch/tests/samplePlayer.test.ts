import { describe, expect, it } from "vitest";
import { resolveSamplePitchAnalysisSamples } from "@/lib/patch/samplePlayer";

describe("sample player helpers", () => {
  it("caps pitch analysis samples to a short view over the committed trim", () => {
    const samples = Float32Array.from({ length: 100 }, (_, index) => index);
    const analysisSamples = resolveSamplePitchAnalysisSamples(
      {
        name: "sample.wav",
        sampleRate: 10,
        samples
      },
      0.2,
      0.9,
      2
    );

    expect(Array.from(analysisSamples)).toEqual(Array.from({ length: 20 }, (_, index) => index + 20));
  });
});

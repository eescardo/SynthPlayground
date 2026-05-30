import { describe, expect, it } from "vitest";
import {
  createSamplePlayerAssetData,
  normalizeSamplePlayerAssetData,
  resolveSamplePitchAnalysisSamples,
  serializeSamplePlayerAssetForJson
} from "@/lib/patch/samplePlayer";

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

  it("roundtrips sample assets through binary JSON export without numeric sample arrays", () => {
    const asset = createSamplePlayerAssetData({
      name: "tone.wav",
      sampleRate: 48000,
      samples: new Float32Array([0, 0.25, -0.5])
    });

    const serialized = serializeSamplePlayerAssetForJson(asset);
    const normalized = normalizeSamplePlayerAssetData(serialized);

    expect(serialized).toMatchObject({
      version: 2,
      name: "tone.wav",
      encoding: "f32le-base64"
    });
    expect(typeof serialized.samples).toBe("string");
    expect(normalized?.samples).toEqual(new Float32Array([0, 0.25, -0.5]));
  });
});

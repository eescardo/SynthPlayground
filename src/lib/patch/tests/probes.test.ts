import { describe, expect, it } from "vitest";
import { buildSpectrumBins, normalizeProbeSamples } from "@/lib/patch/probes";

describe("probe helpers", () => {
  it("normalizes quiet sample streams so they remain visible", () => {
    expect(normalizeProbeSamples([0, 0.002, -0.001, 0.0015])).toEqual([
      0,
      1,
      -0.5,
      0.75
    ]);
  });

  it("builds spectrum bins from the current preview window instead of only the note tail", () => {
    const samples = new Array(2048).fill(0).map((_, index) =>
      index < 1024
        ? Math.sin((2 * Math.PI * index) / 32) * 0.005
        : Math.sin((2 * Math.PI * index) / 8) * 0.25
    );

    const earlyBins = buildSpectrumBins(samples, 256, 24, 0.2, samples.length, samples.length);
    const lateBins = buildSpectrumBins(samples, 256, 24, 0.9, samples.length, samples.length);

    expect(Math.max(...earlyBins)).toBeGreaterThan(0.05);
    expect(Math.max(...lateBins)).toBeGreaterThan(0.05);
    expect(earlyBins).not.toEqual(lateBins);
  });
});

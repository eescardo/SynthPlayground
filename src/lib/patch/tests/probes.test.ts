import { describe, expect, it } from "vitest";
import { buildProbeSpectrogram, buildSpectrumBins, normalizeProbeSamples } from "@/lib/patch/probes";
import {
  buildScopeRenderData,
  resolveScopeTimeMarkers,
  resolveSpectrumFrequencyMarkers
} from "@/lib/patch/probeViewMath";

describe("probe helpers", () => {
  it("normalizes quiet sample streams so they remain visible", () => {
    expect(normalizeProbeSamples([0, 0.002, -0.001, 0.0015])).toEqual([0, 1, -0.5, 0.75]);
  });

  it("builds spectrum bins from the current preview window instead of only the note tail", () => {
    const samples = new Array(2048)
      .fill(0)
      .map((_, index) =>
        index < 1024 ? Math.sin((2 * Math.PI * index) / 32) * 0.005 : Math.sin((2 * Math.PI * index) / 8) * 0.25
      );

    const earlyBins = buildSpectrumBins(samples, 256, 24, 0.2, samples.length, samples.length);
    const lateBins = buildSpectrumBins(samples, 256, 24, 0.9, samples.length, samples.length);

    expect(Math.max(...earlyBins)).toBeGreaterThan(0.05);
    expect(Math.max(...lateBins)).toBeGreaterThan(0.05);
    expect(earlyBins).not.toEqual(lateBins);
  });

  it("builds a spectrogram grid whose columns represent successive time slices", () => {
    const samples = new Array(1536)
      .fill(0)
      .map((_, index) =>
        index < 768 ? Math.sin((2 * Math.PI * index) / 32) * 0.2 : Math.sin((2 * Math.PI * index) / 8) * 0.2
      );

    const grid = buildProbeSpectrogram(samples, 256, 12, 10, samples.length, samples.length, 1536);

    expect(grid).toHaveLength(10);
    expect(grid[0]).toHaveLength(12);
    const firstColumnEnergy = grid.reduce((sum, row) => sum + row[1], 0);
    const lastColumnEnergy = grid.reduce((sum, row) => sum + row[10], 0);
    expect(firstColumnEnergy).toBeGreaterThan(0.01);
    expect(lastColumnEnergy).toBeGreaterThan(0.01);
    expect(grid.map((row) => row[1])).not.toEqual(grid.map((row) => row[10]));
  });

  it("fills the first second of a partial spectrogram left to right", () => {
    const capturedSamples = new Array(1536)
      .fill(0)
      .map((_, index) =>
        index < 768 ? Math.sin((2 * Math.PI * index) / 32) * 0.2 : Math.sin((2 * Math.PI * index) / 8) * 0.2
      );
    const backingSamples = [...capturedSamples, ...new Array(4096).fill(0)];

    const grid = buildProbeSpectrogram(
      backingSamples,
      256,
      12,
      10,
      backingSamples.length,
      capturedSamples.length,
      1536
    );

    const firstColumnEnergy = grid.reduce((sum, row) => sum + row[1], 0);
    const midpointEnergy = grid.reduce((sum, row) => sum + row[3], 0);
    const futureColumnEnergy = grid.reduce((sum, row) => sum + row[10], 0);
    expect(firstColumnEnergy).toBeGreaterThan(0.01);
    expect(midpointEnergy).toBeGreaterThan(0.01);
    expect(futureColumnEnergy).toBeCloseTo(10 * 0.02);
  });

  it("compresses spectrogram captures after the first second is populated", () => {
    const samples = new Array(3072)
      .fill(0)
      .map((_, index) =>
        index < 1536 ? Math.sin((2 * Math.PI * index) / 32) * 0.2 : Math.sin((2 * Math.PI * index) / 8) * 0.2
      );

    const grid = buildProbeSpectrogram(samples, 256, 12, 10, samples.length, samples.length, 1536);

    const firstColumnEnergy = grid.reduce((sum, row) => sum + row[1], 0);
    const lastColumnEnergy = grid.reduce((sum, row) => sum + row[10], 0);
    expect(firstColumnEnergy).toBeGreaterThan(0.01);
    expect(lastColumnEnergy).toBeGreaterThan(0.01);
    expect(grid.map((row) => row[1])).not.toEqual(grid.map((row) => row[10]));
  });

  it("reallocates spectrum detail when max frequency is narrowed", () => {
    const samples = new Array(2048).fill(0).map((_, index) => Math.sin((2 * Math.PI * index) / 12) * 0.2);

    const fullRange = buildProbeSpectrogram(samples, 256, 12, 10, samples.length, samples.length, 2048, 1024);
    const narrowedRange = buildProbeSpectrogram(samples, 256, 12, 10, samples.length, samples.length, 2048, 400);

    const fullTopHalfEnergy = fullRange.slice(5).reduce((sum, row) => sum + row[6], 0);
    const narrowedTopHalfEnergy = narrowedRange.slice(5).reduce((sum, row) => sum + row[6], 0);

    expect(narrowedTopHalfEnergy).toBeGreaterThan(fullTopHalfEnergy);
  });

  it("places spectrum markers within the selected frequency view", () => {
    const markers = resolveSpectrumFrequencyMarkers(4000);

    expect(markers).toHaveLength(3);
    expect(markers.every((marker) => marker.frequency < 4000)).toBe(true);
    expect(markers.every((marker) => marker.bottomPercent > 0 && marker.bottomPercent < 100)).toBe(true);
  });

  it("builds separate scope waveform and envelope render data", () => {
    const samples = new Array(256).fill(0).map((_, index) => Math.sin((2 * Math.PI * index) / 16) * 0.15);

    const renderData = buildScopeRenderData(
      {
        probeId: "probe_scope",
        kind: "scope",
        target: { kind: "connection", connectionId: "conn_1" },
        sampleRate: 48000,
        durationSamples: samples.length,
        capturedSamples: samples.length,
        samples
      },
      false
    );

    expect(renderData.waveformSegments.length).toBeGreaterThan(0);
    expect(renderData.envelopeLine.length).toBeGreaterThan(0);
    expect(renderData.peak).toBeGreaterThan(0);
  });

  it("fills the first second of a partial scope capture left to right", () => {
    const capturedSamples = new Array(256).fill(0).map((_, index) => Math.sin((2 * Math.PI * index) / 16) * 0.15);
    const backingSamples = [...capturedSamples, ...new Array(768).fill(0)];

    const renderData = buildScopeRenderData(
      {
        probeId: "probe_scope",
        kind: "scope",
        target: { kind: "connection", connectionId: "conn_1" },
        sampleRate: 512,
        durationSamples: backingSamples.length,
        capturedSamples: capturedSamples.length,
        samples: backingSamples
      },
      false
    );

    expect(renderData.waveformSegments.at(-1)?.x).toBeGreaterThan(52);
    expect(renderData.waveformSegments.at(-1)?.x).toBeLessThan(54);
    expect(renderData.capturedRatio).toBeCloseTo(0.5);
    expect(renderData.durationSeconds).toBe(1);
  });

  it("compresses scope captures after the first second is populated", () => {
    const samples = new Array(1024).fill(0).map((_, index) => Math.sin((2 * Math.PI * index) / 16) * 0.15);

    const renderData = buildScopeRenderData(
      {
        probeId: "probe_scope",
        kind: "scope",
        target: { kind: "connection", connectionId: "conn_1" },
        sampleRate: 512,
        durationSamples: samples.length,
        capturedSamples: samples.length,
        samples
      },
      false
    );

    expect(renderData.waveformSegments.at(-1)?.x).toBeCloseTo(98);
    expect(renderData.capturedRatio).toBe(1);
    expect(renderData.durationSeconds).toBe(2);
  });

  it("builds fixed scope time markers for full-duration rendering", () => {
    const markers = resolveScopeTimeMarkers(1.2, false);

    expect(markers).toHaveLength(3);
    expect(markers[0]?.label).toBe("0ms");
    expect(markers[1]?.label).toBe("600ms");
    expect(markers[2]?.label).toBe("1.2s");
  });
});

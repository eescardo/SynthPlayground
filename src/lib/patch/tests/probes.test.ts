import { describe, expect, it } from "vitest";
import {
  buildProbeSpectrumFrameGrid,
  normalizeProbeSamples,
  resolveProbeSpectrumCaptureFrameSize,
  resolveProbeSpectrumEffectiveMaxFrequencyHz,
  resolveProbeSpectrumMagnitudeColor
} from "@/lib/patch/probes";
import {
  buildScopeRenderData,
  resolveScopeTimeMarkers,
  resolveSpectrumFrequencyMarkers,
  resolveSpectrumTimelineFillRatio,
  resolveSpectrumTimelineFrameIndex
} from "@/lib/patch/probeViewMath";

describe("probe helpers", () => {
  it("normalizes quiet sample streams so they remain visible", () => {
    expect(normalizeProbeSamples([0, 0.002, -0.001, 0.0015])).toEqual([0, 1, -0.5, 0.75]);
  });

  it("builds immutable spectrum frame columns and one global display peak", () => {
    const frameSize = 256;
    const samples = new Array(frameSize * 3).fill(0).map((_, index) => {
      if (index < frameSize) {
        return Math.sin((2 * Math.PI * index) / 64) * 0.35;
      }
      if (index < frameSize * 2) {
        return Math.sin((2 * Math.PI * index) / 16) * 0.12;
      }
      return Math.sin((2 * Math.PI * index) / 16) * 0.7;
    });

    const grid = buildProbeSpectrumFrameGrid(samples, frameSize, 16, samples.length, 2048);

    expect(grid.frameSize).toBe(frameSize);
    expect(grid.columns).toHaveLength(3);
    const columnPeaks = grid.columns.map((column) => Math.max(...column));
    expect(grid.peak).toBe(Math.max(...columnPeaks));
    expect(columnPeaks[2]).toBeGreaterThan(columnPeaks[1] * 2);
    expect(grid.columns[0]).not.toEqual(grid.columns[1]);
  });

  it("does not fill future spectrum frames before enough samples are captured", () => {
    const frameSize = 256;
    const samples = new Array(frameSize * 2).fill(0).map((_, index) => Math.sin((2 * Math.PI * index) / 32) * 0.2);

    const partialGrid = buildProbeSpectrumFrameGrid(samples, frameSize, 12, frameSize - 1, 2048);
    const oneFrameGrid = buildProbeSpectrumFrameGrid(samples, frameSize, 12, frameSize, 2048);

    expect(partialGrid.columns).toHaveLength(0);
    expect(oneFrameGrid.columns).toHaveLength(1);
  });

  it("translates source spectrum windows into decimated capture frame sizes", () => {
    expect(resolveProbeSpectrumCaptureFrameSize(1024, 1)).toBe(1024);
    expect(resolveProbeSpectrumCaptureFrameSize(1024, 16)).toBe(64);
    expect(resolveProbeSpectrumCaptureFrameSize(1024, 256)).toBe(64);
  });

  it("clamps spectrum view frequency to the captured signal nyquist", () => {
    expect(resolveProbeSpectrumEffectiveMaxFrequencyHz(24000, 48000)).toBe(24000);
    expect(resolveProbeSpectrumEffectiveMaxFrequencyHz(24000, 3000)).toBe(1500);
    expect(resolveProbeSpectrumEffectiveMaxFrequencyHz(1000, 3000)).toBe(1000);
  });

  it("maps spectrum magnitudes onto an absolute logarithmic color scale", () => {
    expect(resolveProbeSpectrumMagnitudeColor(0)).toBe("rgb(0, 0, 0)");
    expect(resolveProbeSpectrumMagnitudeColor(0.001)).toBe("rgb(95, 57, 34)");
    expect(resolveProbeSpectrumMagnitudeColor(0.01)).toBe("rgb(196, 42, 32)");
    expect(resolveProbeSpectrumMagnitudeColor(0.1)).toBe("rgb(245, 134, 42)");
    expect(resolveProbeSpectrumMagnitudeColor(1)).toBe("rgb(255, 246, 124)");
    expect(resolveProbeSpectrumMagnitudeColor(10)).toBe("rgb(255, 246, 124)");
    expect(resolveProbeSpectrumMagnitudeColor(Math.sqrt(0.001 * 0.01))).toBe("rgb(146, 50, 33)");
  });

  it("maps partial spectrum timelines into a left-to-right fill region", () => {
    const filledRatio = resolveSpectrumTimelineFillRatio(24000, 48000, 1);

    expect(filledRatio).toBeCloseTo(0.5);
    expect(resolveSpectrumTimelineFrameIndex(0, filledRatio, 12)).toBe(0);
    expect(resolveSpectrumTimelineFrameIndex(0.25, filledRatio, 12)).toBe(6);
    expect(resolveSpectrumTimelineFrameIndex(0.5, filledRatio, 12)).toBe(11);
    expect(resolveSpectrumTimelineFrameIndex(0.75, filledRatio, 12)).toBe(-1);
  });

  it("fills the spectrum timeline after the viewport duration is populated", () => {
    const filledRatio = resolveSpectrumTimelineFillRatio(96000, 48000, 2);

    expect(filledRatio).toBe(1);
    expect(resolveSpectrumTimelineFrameIndex(0.75, filledRatio, 12)).toBe(9);
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

import { describe, expect, it } from "vitest";
import { flattenSpectrumColumns, mergeSpectrumGrid, sliceSpectrumGridValues } from "@/lib/patch/spectrumCaptureMerge";
import { PreviewProbeFinalSpectrum, PreviewProbeSpectrumFrames } from "@/types/probes";

describe("spectrum capture merge", () => {
  it("flattens column-major spectrum grids", () => {
    expect(
      flattenSpectrumColumns(
        [
          [0.1, 0.2],
          [0.3, 0.4]
        ],
        2
      )
    ).toEqual([0.1, 0.2, 0.3, 0.4]);
  });

  it("slices flattened spectrum values by column", () => {
    expect(
      sliceSpectrumGridValues(
        {
          values: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6],
          rowCount: 2,
          columnCount: 3,
          binFrequencies: [120, 240],
          frameSize: 1024,
          sampleRate: 48000,
          capturedSamples: 3072
        } satisfies PreviewProbeSpectrumFrames,
        1,
        3,
        2
      )
    ).toEqual([0.3, 0.4, 0.5, 0.6]);
  });

  it("merges flattened final spectrum chunks at their start column", () => {
    const previous = finalSpectrumChunk({
      values: [0.1, 0.2, 0.3, 0.4],
      rowCount: 2,
      columnCount: 2,
      startColumn: 0,
      binFrequencies: [120, 240],
      complete: false
    });
    const next = finalSpectrumChunk({
      values: [0.5, 0.6, 0.7, 0.8],
      rowCount: 2,
      columnCount: 2,
      startColumn: 2,
      binFrequencies: [],
      complete: true
    });

    expect(mergeSpectrumGrid(previous, next)).toMatchObject({
      values: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8],
      rowCount: 2,
      columnCount: 4,
      startColumn: 0,
      columns: undefined,
      complete: true
    });
  });
});

function finalSpectrumChunk(
  overrides: Partial<PreviewProbeFinalSpectrum> & Pick<PreviewProbeFinalSpectrum, "values" | "rowCount" | "columnCount">
): PreviewProbeFinalSpectrum {
  return {
    binFrequencies: [120, 240],
    complete: false,
    frameSize: 2048,
    sampleRate: 48000,
    capturedSamples: 2048,
    requestedTimeColumns: 512,
    requestedFrequencyBins: 1025,
    sourceColumnCount: 4,
    ...overrides
  };
}

import { clamp } from "@/lib/numeric";
import { PreviewProbeCapture, PreviewProbeSpectrumFrames } from "@/types/probes";
import {
  formatScopeTimestamp,
  resolveSpectrumTimelineFillRatio,
  resolveSpectrumTimelineFrameIndex
} from "@/lib/patch/probeViewMath";

export const SPECTRUM_MAX_DISPLAY_SECONDS = 4;
export const SPECTRUM_STREAM_ROWS = 32;
export const SPECTRUM_FINAL_FACE_ROWS = 256;
export const SPECTRUM_FINAL_COMPACT_FACE_ROWS = 64;
export const SPECTRUM_FINAL_FACE_COLUMNS = 512;
export const SPECTRUM_FINAL_COMPACT_FACE_COLUMNS = 480;
const FULL_SPECTRUM_GRID_MINOR_HZ = 2000;
const FULL_SPECTRUM_GRID_MAJOR_HZ = 8000;
const FULL_SPECTRUM_DENSE_GRID_MINOR_HZ = 500;
const FULL_SPECTRUM_DENSE_GRID_MAJOR_HZ = 2000;
const FULL_SPECTRUM_DENSE_GRID_MIN_FRAME_SIZE = 1024;

export function buildSpectrumFramesDisplay(
  spectrumFrames: PreviewProbeSpectrumFrames,
  rows: number,
  viewportColumns: number,
  viewportSeconds: number,
  maxFrequencyHz: number
) {
  const display = Array.from({ length: rows }, () => new Array(viewportColumns).fill(0));
  const spectrumColumnCount = resolveSpectrumGridColumnCount(spectrumFrames);
  const visibleFrameCount = Math.max(
    1,
    Math.min(spectrumColumnCount, Math.ceil((viewportSeconds * spectrumFrames.sampleRate) / spectrumFrames.frameSize))
  );
  const filledRatio = resolveSpectrumTimelineFillRatio(
    spectrumFrames.capturedSamples,
    spectrumFrames.sampleRate,
    viewportSeconds
  );
  const rowBinIndices = Array.from({ length: rows }, (_, rowIndex) => {
    const rowRatio = (rowIndex + 0.5) / rows;
    const targetFrequency = Math.pow(rowRatio, 2) * maxFrequencyHz;
    return resolveNearestSpectrumBinIndex(spectrumFrames.binFrequencies, targetFrequency);
  });

  for (let columnIndex = 0; columnIndex < viewportColumns; columnIndex += 1) {
    const ratio = viewportColumns <= 1 ? 0 : columnIndex / (viewportColumns - 1);
    const frameIndex = resolveSpectrumTimelineFrameIndex(ratio, filledRatio, visibleFrameCount);
    if (frameIndex < 0) {
      continue;
    }
    if (frameIndex >= spectrumColumnCount) {
      continue;
    }
    for (let rowIndex = 0; rowIndex < rows; rowIndex += 1) {
      display[rowIndex][columnIndex] = readSpectrumGridValue(spectrumFrames, frameIndex, rowBinIndices[rowIndex] ?? 0);
    }
  }

  return display;
}

export function buildFinalSpectrumDisplay(
  finalSpectrum: NonNullable<PreviewProbeCapture["finalSpectrum"]>,
  rows: number,
  viewportColumns: number,
  maxFrequencyHz: number,
  fallbackSpectrumFrames?: PreviewProbeSpectrumFrames
) {
  const display = Array.from({ length: rows }, () => new Array(viewportColumns).fill(0));
  const expectedColumnCount = resolveFinalSpectrumOutputColumnCount(finalSpectrum);
  if (expectedColumnCount <= 0 || rows <= 0 || viewportColumns <= 0) {
    return display;
  }
  const rowBinIndices = Array.from({ length: rows }, (_, rowIndex) => {
    const rowRatio = (rowIndex + 0.5) / rows;
    const targetFrequency = Math.pow(rowRatio, 2) * maxFrequencyHz;
    return resolveNearestSpectrumBinIndex(finalSpectrum.binFrequencies ?? [], targetFrequency);
  });
  const fallbackRowBinIndices = fallbackSpectrumFrames
    ? Array.from({ length: rows }, (_, rowIndex) => {
        const rowRatio = (rowIndex + 0.5) / rows;
        const targetFrequency = Math.pow(rowRatio, 2) * maxFrequencyHz;
        return resolveNearestSpectrumBinIndex(fallbackSpectrumFrames.binFrequencies, targetFrequency);
      })
    : [];

  for (let columnIndex = 0; columnIndex < viewportColumns; columnIndex += 1) {
    const ratio = viewportColumns <= 1 ? 0 : columnIndex / (viewportColumns - 1);
    const sourceColumnIndex = clamp(Math.round(ratio * (expectedColumnCount - 1)), 0, expectedColumnCount - 1);
    const hasColumn = sourceColumnIndex < resolveSpectrumGridColumnCount(finalSpectrum);
    const fallbackColumnIndex = hasColumn ? -1 : resolveFallbackSpectrumFrameColumnIndex(fallbackSpectrumFrames, ratio);
    for (let rowIndex = 0; rowIndex < rows; rowIndex += 1) {
      display[rowIndex][columnIndex] = hasColumn
        ? readSpectrumGridValue(finalSpectrum, sourceColumnIndex, rowBinIndices[rowIndex] ?? 0)
        : fallbackColumnIndex >= 0
          ? readSpectrumGridValue(fallbackSpectrumFrames, fallbackColumnIndex, fallbackRowBinIndices[rowIndex] ?? 0)
          : 0;
    }
  }

  return display;
}

export function resolveFinalSpectrumOutputColumnCount(
  finalSpectrum: NonNullable<PreviewProbeCapture["finalSpectrum"]>
) {
  const requestedColumnCount = Math.max(0, Math.floor(finalSpectrum.requestedTimeColumns || 0));
  const sourceColumnCount = Math.max(0, Math.floor(finalSpectrum.sourceColumnCount || 0));
  const expectedColumnCount =
    requestedColumnCount > 0 ? Math.min(sourceColumnCount, requestedColumnCount) : sourceColumnCount;
  return Math.max(resolveSpectrumGridColumnCount(finalSpectrum), expectedColumnCount);
}

export function resolveSpectrumGridColumnCount(
  grid: Pick<PreviewProbeSpectrumFrames, "columns" | "values" | "rowCount" | "columnCount"> | undefined
) {
  if (!grid) {
    return 0;
  }
  if (Number.isFinite(grid.columnCount)) {
    return Math.max(0, Math.floor(grid.columnCount ?? 0));
  }
  if (grid.columns?.length) {
    return grid.columns.length;
  }
  const rowCount = resolveSpectrumGridRowCount(grid);
  return rowCount > 0 ? Math.floor((grid.values?.length ?? 0) / rowCount) : 0;
}

export function resolveSpectrumGridRowCount(
  grid: Pick<PreviewProbeSpectrumFrames, "columns" | "values" | "rowCount" | "columnCount"> | undefined
) {
  if (!grid) {
    return 0;
  }
  if (Number.isFinite(grid.rowCount)) {
    return Math.max(0, Math.floor(grid.rowCount ?? 0));
  }
  return grid.columns?.[0]?.length ?? 0;
}

export function readSpectrumGridValue(
  grid: Pick<PreviewProbeSpectrumFrames, "columns" | "values" | "rowCount" | "columnCount"> | undefined,
  columnIndex: number,
  rowIndex: number
) {
  if (!grid || columnIndex < 0 || rowIndex < 0) {
    return 0;
  }
  const rowCount = resolveSpectrumGridRowCount(grid);
  if (grid.values && rowCount > 0) {
    return grid.values[columnIndex * rowCount + rowIndex] ?? 0;
  }
  return grid.columns?.[columnIndex]?.[rowIndex] ?? 0;
}

function resolveFallbackSpectrumFrameColumnIndex(
  spectrumFrames: PreviewProbeSpectrumFrames | undefined,
  ratio: number
) {
  const columnCount = resolveSpectrumGridColumnCount(spectrumFrames);
  if (columnCount <= 0) {
    return -1;
  }
  return clamp(Math.round(ratio * (columnCount - 1)), 0, columnCount - 1);
}

export function formatSpectrumTooltip(
  freqLow: number,
  freqHigh: number,
  timeStartSeconds: number,
  timeEndSeconds: number,
  value: number
) {
  return `${formatSpectrumFrequencyRange(freqLow, freqHigh)} | ${formatSpectrumTooltipTimeRange(
    timeStartSeconds,
    timeEndSeconds
  )} | ${formatSpectrumValue(value)}`;
}

export function resolveFullSpectrumFrequencyMarkers(maxFrequencyHz: number, frameSize = 512) {
  const safeMaxFrequencyHz = Math.max(1, maxFrequencyHz);
  const majorHz = resolveFullSpectrumGridSpacing(frameSize).majorHz;
  const markerCount = Math.floor(safeMaxFrequencyHz / majorHz);
  return Array.from({ length: markerCount + 1 }, (_, index) => {
    const frequency = index * majorHz;
    return {
      frequency,
      bottomPercent: (frequency / safeMaxFrequencyHz) * 100
    };
  }).filter((marker) => marker.frequency <= safeMaxFrequencyHz);
}

export function resolveFullSpectrumGridLines(maxFrequencyHz: number, frameSize = 512) {
  const safeMaxFrequencyHz = Math.max(1, maxFrequencyHz);
  const { minorHz, majorHz } = resolveFullSpectrumGridSpacing(frameSize);
  const lineCount = Math.floor(safeMaxFrequencyHz / minorHz);
  return Array.from({ length: lineCount }, (_, index) => {
    const frequency = (index + 1) * minorHz;
    return {
      frequency,
      major: frequency % majorHz === 0,
      y: 1 - frequency / safeMaxFrequencyHz
    };
  });
}

function resolveFullSpectrumGridSpacing(frameSize: number) {
  return frameSize >= FULL_SPECTRUM_DENSE_GRID_MIN_FRAME_SIZE
    ? {
        minorHz: FULL_SPECTRUM_DENSE_GRID_MINOR_HZ,
        majorHz: FULL_SPECTRUM_DENSE_GRID_MAJOR_HZ
      }
    : {
        minorHz: FULL_SPECTRUM_GRID_MINOR_HZ,
        majorHz: FULL_SPECTRUM_GRID_MAJOR_HZ
      };
}

function resolveNearestSpectrumBinIndex(binFrequencies: number[], targetFrequency: number) {
  if (binFrequencies.length <= 0) {
    return 0;
  }
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < binFrequencies.length; index += 1) {
    const distance = Math.abs((binFrequencies[index] ?? 0) - targetFrequency);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }
  return bestIndex;
}

function formatSpectrumFrequencyRange(freqLow: number, freqHigh: number) {
  const safeLow = Math.max(0, freqLow);
  const safeHigh = Math.max(safeLow, freqHigh);
  if (safeHigh < 1000) {
    return `${Math.round(safeLow)}-${Math.round(safeHigh)}Hz`;
  }
  if (safeLow >= 1000) {
    const lowKhz = safeLow / 1000;
    const highKhz = safeHigh / 1000;
    return `${formatTooltipKhz(lowKhz)}-${formatTooltipKhz(highKhz)}kHz`;
  }
  return `${Math.round(safeLow)}Hz-${formatTooltipKhz(safeHigh / 1000)}kHz`;
}

function formatTooltipKhz(value: number) {
  return value >= 10 ? value.toFixed(0) : value.toFixed(1).replace(/\.0$/, "");
}

function formatSpectrumTooltipTimeRange(startSeconds: number, endSeconds: number) {
  const safeStart = Math.max(0, startSeconds);
  const safeEnd = Math.max(safeStart, endSeconds);
  return `${formatScopeTimestamp(safeStart)}-${formatScopeTimestamp(safeEnd)}`;
}

function formatSpectrumValue(value: number) {
  if (value === 0) {
    return "0";
  }
  if (Math.abs(value) < 0.001) {
    return value.toExponential(2);
  }
  return value.toFixed(4);
}

import { PreviewProbeFinalSpectrum, PreviewProbeSpectrumFrames } from "@/types/probes";

export function mergeSpectrumGrid<T extends PreviewProbeSpectrumFrames | PreviewProbeFinalSpectrum>(
  previous: T,
  next: T
): T {
  const startColumn = next.startColumn ?? 0;
  const rowCount =
    next.rowCount ?? previous.rowCount ?? next.columns?.[0]?.length ?? previous.columns?.[0]?.length ?? 0;
  if (next.values || previous.values) {
    const previousValues = startColumn === 0 ? [] : sliceSpectrumGridValues(previous, 0, startColumn, rowCount);
    return {
      ...next,
      values: [...previousValues, ...(next.values ?? flattenSpectrumColumns(next.columns, rowCount))],
      rowCount,
      columnCount: startColumn + (next.columnCount ?? next.columns?.length ?? 0),
      columns: undefined,
      startColumn: 0
    };
  }
  return {
    ...next,
    columns: [...(startColumn === 0 ? [] : (previous.columns ?? []).slice(0, startColumn)), ...(next.columns ?? [])],
    startColumn: 0
  };
}

export function sliceSpectrumGridValues(
  grid: PreviewProbeSpectrumFrames | PreviewProbeFinalSpectrum,
  startColumn: number,
  endColumn: number,
  rowCount: number
) {
  if (rowCount <= 0) {
    return [];
  }
  return (grid.values ?? flattenSpectrumColumns(grid.columns, rowCount)).slice(
    startColumn * rowCount,
    endColumn * rowCount
  );
}

export function flattenSpectrumColumns(columns: number[][] | undefined, rowCount: number) {
  if (!columns?.length || rowCount <= 0) {
    return [];
  }
  return columns.flatMap((column) => Array.from({ length: rowCount }, (_, rowIndex) => column[rowIndex] ?? 0));
}

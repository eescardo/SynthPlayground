"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  PATCH_COLOR_FULL_SPECTRUM_GRID_MAJOR,
  PATCH_COLOR_FULL_SPECTRUM_GRID_MINOR,
  PATCH_COLOR_PROBE_GRAPH_BG,
  PATCH_FULL_SPECTRUM_COLUMN_WIDTH,
  PATCH_FULL_SPECTRUM_EMPTY_IMAGE_HEIGHT,
  PATCH_FULL_SPECTRUM_MAJOR_GRID_LINE_WIDTH,
  PATCH_FULL_SPECTRUM_MIN_IMAGE_WIDTH,
  PATCH_FULL_SPECTRUM_MINOR_GRID_DASH,
  PATCH_FULL_SPECTRUM_MINOR_GRID_LINE_WIDTH,
  PATCH_FULL_SPECTRUM_TIME_MARKER_RATIOS
} from "@/components/patch/patchCanvasConstants";
import { useDelayedSpectrumTooltip } from "@/hooks/patch/useDelayedSpectrumTooltip";
import { formatScopeTimestamp, formatSpectrumFrequency } from "@/lib/patch/probeViewMath";
import { PROBE_MAX_MAX_FREQUENCY_HZ, resolveProbeSpectrumMagnitudeColor } from "@/lib/patch/probes";
import {
  formatSpectrumTooltip,
  readSpectrumGridValue,
  resolveFullSpectrumFrequencyMarkers,
  resolveFullSpectrumGridLines,
  resolveSpectrumGridColumnCount,
  resolveSpectrumGridRowCount,
  resolveSpectrumPointerCell
} from "@/lib/patch/spectrumDisplayMath";
import { PreviewProbeCapture } from "@/types/probes";

export function FullSpectrumModal(props: { capture?: PreviewProbeCapture; probeName: string; onClose: () => void }) {
  const finalSpectrum = props.capture?.finalSpectrum;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const { clearTooltip, scheduleTooltip, tooltip } = useDelayedSpectrumTooltip();
  const binFrequencies = finalSpectrum?.binFrequencies ?? [];
  const maxFrequencyHz = binFrequencies.at(-1) ?? PROBE_MAX_MAX_FREQUENCY_HZ;
  const frameSize = finalSpectrum?.frameSize ?? 512;
  const frequencyMarkers = useMemo(
    () => resolveFullSpectrumFrequencyMarkers(maxFrequencyHz, frameSize),
    [frameSize, maxFrequencyHz]
  );
  const gridLines = useMemo(() => resolveFullSpectrumGridLines(maxFrequencyHz, frameSize), [frameSize, maxFrequencyHz]);
  const durationSeconds = finalSpectrum ? finalSpectrum.capturedSamples / Math.max(1, finalSpectrum.sampleRate) : 0;
  const timeMarkers = useMemo(
    () =>
      PATCH_FULL_SPECTRUM_TIME_MARKER_RATIOS.map((ratio) => ({
        ratio,
        label: formatScopeTimestamp(durationSeconds * ratio)
      })),
    [durationSeconds]
  );
  const rowCount = resolveSpectrumGridRowCount(finalSpectrum);
  const columnCount = resolveSpectrumGridColumnCount(finalSpectrum);
  const imageWidth = Math.max(PATCH_FULL_SPECTRUM_MIN_IMAGE_WIDTH, columnCount * PATCH_FULL_SPECTRUM_COLUMN_WIDTH);
  const imageHeight = rowCount > 0 ? rowCount : PATCH_FULL_SPECTRUM_EMPTY_IMAGE_HEIGHT;

  useEffect(() => {
    const onClose = props.onClose;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === " " || event.code === "Space") {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [props.onClose]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context || !finalSpectrum) {
      return;
    }
    const devicePixelRatio = window.devicePixelRatio || 1;
    canvas.width = Math.round(imageWidth * devicePixelRatio);
    canvas.height = Math.round(imageHeight * devicePixelRatio);
    canvas.style.width = `${imageWidth}px`;
    canvas.style.height = `${imageHeight}px`;
    context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    context.clearRect(0, 0, imageWidth, imageHeight);
    context.fillStyle = PATCH_COLOR_PROBE_GRAPH_BG;
    context.fillRect(0, 0, imageWidth, imageHeight);

    if (columnCount <= 0 || rowCount <= 0) {
      drawFullSpectrumGrid(context, gridLines, imageWidth, imageHeight, maxFrequencyHz);
      return;
    }
    const cellWidth = imageWidth / columnCount;
    const cellHeight = imageHeight / rowCount;
    const fillWidth = Math.max(cellWidth, 1);
    const fillHeight = Math.max(cellHeight, 1);
    for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
      for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
        const value = readSpectrumGridValue(finalSpectrum, columnIndex, rowIndex);
        if (value <= 0) {
          continue;
        }
        context.fillStyle = resolveProbeSpectrumMagnitudeColor(value);
        context.fillRect(columnIndex * cellWidth, imageHeight - (rowIndex + 1) * cellHeight, fillWidth, fillHeight);
      }
    }
    drawFullSpectrumGrid(context, gridLines, imageWidth, imageHeight, maxFrequencyHz);
  }, [columnCount, finalSpectrum, gridLines, imageHeight, imageWidth, maxFrequencyHz, rowCount]);

  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement || !finalSpectrum) {
      return;
    }
    scrollElement.scrollTop = scrollElement.scrollHeight;
  }, [finalSpectrum, imageHeight]);

  const handleFullSpectrumPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !finalSpectrum || rowCount <= 0 || columnCount <= 0) {
      clearTooltip();
      return;
    }
    const cell = resolveSpectrumPointerCell(
      event.clientX,
      event.clientY,
      canvas.getBoundingClientRect(),
      rowCount,
      columnCount
    );
    if (!cell) {
      clearTooltip();
      return;
    }
    const { columnIndex, rowIndex } = cell;
    const value = readSpectrumGridValue(finalSpectrum, columnIndex, rowIndex);
    const binStep =
      binFrequencies.length > 1 ? (binFrequencies.at(-1) ?? 0) / Math.max(1, binFrequencies.length - 1) : 0;
    const freqLow = binFrequencies[rowIndex] ?? rowIndex * binStep;
    const freqHigh = binFrequencies[rowIndex + 1] ?? freqLow + binStep;
    const timeStartSeconds = (columnIndex / Math.max(1, columnCount)) * durationSeconds;
    const timeEndSeconds = ((columnIndex + 1) / Math.max(1, columnCount)) * durationSeconds;
    const label = formatSpectrumTooltip(freqLow, freqHigh, timeStartSeconds, timeEndSeconds, value);
    scheduleTooltip(event.clientX, event.clientY, label);
  };

  return (
    <div
      className="patch-probe-full-spectrum-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Full spectrum"
      onClick={props.onClose}
    >
      <div className="patch-probe-full-spectrum-modal" onClick={(event) => event.stopPropagation()}>
        <div className="patch-probe-full-spectrum-header">
          <div>
            <strong>{props.probeName}</strong>
            {finalSpectrum && (
              <span>
                {finalSpectrum.frameSize} samples per frame -&gt; {finalSpectrum.requestedFrequencyBins} freq. bins |{" "}
                {formatScopeTimestamp(durationSeconds)} -&gt; {finalSpectrum.sourceColumnCount} frames
              </span>
            )}
          </div>
          <button type="button" className="patch-probe-attach-button" onClick={props.onClose}>
            Close
          </button>
        </div>
        <div ref={scrollRef} className="patch-probe-full-spectrum-scroll">
          <div className="patch-probe-full-spectrum-axis-y" style={{ height: `${imageHeight}px` }}>
            {frequencyMarkers.map((marker) => (
              <span key={marker.frequency} style={{ bottom: `${marker.bottomPercent}%` }}>
                {formatSpectrumFrequency(marker.frequency)}
              </span>
            ))}
          </div>
          <div className="patch-probe-full-spectrum-image-wrap">
            <canvas
              ref={canvasRef}
              className="patch-probe-full-spectrum-canvas"
              onPointerMove={handleFullSpectrumPointerMove}
              onPointerLeave={clearTooltip}
              onPointerDown={clearTooltip}
            />
            {tooltip && (
              <span className="patch-probe-spectrum-tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
                {tooltip.label}
              </span>
            )}
            {timeMarkers.map((marker) => (
              <span
                key={marker.ratio}
                className="patch-probe-full-spectrum-time-marker"
                style={{ left: `${marker.ratio * 100}%` }}
              >
                {marker.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function drawFullSpectrumGrid(
  context: CanvasRenderingContext2D,
  gridLines: ReturnType<typeof resolveFullSpectrumGridLines>,
  width: number,
  height: number,
  maxFrequencyHz: number
) {
  if (width <= 0 || height <= 0 || maxFrequencyHz <= 0) {
    return;
  }
  for (const line of gridLines) {
    const y = line.y * height;
    context.save();
    context.beginPath();
    context.setLineDash(line.major ? [] : [...PATCH_FULL_SPECTRUM_MINOR_GRID_DASH]);
    context.strokeStyle = line.major ? PATCH_COLOR_FULL_SPECTRUM_GRID_MAJOR : PATCH_COLOR_FULL_SPECTRUM_GRID_MINOR;
    context.lineWidth = line.major
      ? PATCH_FULL_SPECTRUM_MAJOR_GRID_LINE_WIDTH
      : PATCH_FULL_SPECTRUM_MINOR_GRID_LINE_WIDTH;
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
    context.restore();
  }
}

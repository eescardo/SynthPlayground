"use client";

import { useEffect, useMemo, useRef } from "react";
import { useDelayedSpectrumTooltip } from "@/hooks/patch/useDelayedSpectrumTooltip";
import { clamp } from "@/lib/numeric";
import {
  buildProbeSpectrumFrameGrid,
  resolveProbeSpectrumCaptureFrameSize,
  resolveProbeSpectrumEffectiveMaxFrequencyHz,
  resolveProbeSpectrumMagnitudeAlpha,
  resolveProbeSpectrumMagnitudeColor
} from "@/lib/patch/probes";
import {
  formatSpectrumFrequency,
  resolveSpectrumFrequencyMarkers,
  resolveSpectrumTimelineFillRatio,
  resolveSpectrumTimelineFrameIndex
} from "@/lib/patch/probeViewMath";
import {
  buildFinalSpectrumDisplay,
  buildSpectrumFramesDisplay,
  formatSpectrumTooltip,
  resolveSpectrumGridColumnCount,
  SPECTRUM_FINAL_COMPACT_FACE_COLUMNS,
  SPECTRUM_FINAL_COMPACT_FACE_ROWS,
  SPECTRUM_FINAL_FACE_COLUMNS,
  SPECTRUM_FINAL_FACE_ROWS,
  SPECTRUM_MAX_DISPLAY_SECONDS,
  SPECTRUM_STREAM_ROWS
} from "@/lib/patch/spectrumDisplayMath";
import { PreviewProbeCapture } from "@/types/probes";

const PROBE_SPECTRUM_WINDOWS = [256, 512, 1024, 2048];
const PROBE_SPECTRUM_FACE_BG = "rgb(0, 0, 0)";

export function SpectrumProbeGraph(props: {
  capture?: PreviewProbeCapture;
  elapsedSeconds: number;
  selectedWindowSize: number;
  maxFrequencyHz: number;
  compact?: boolean;
  onChangeWindowSize: (windowSize: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { clearTooltip, scheduleTooltip, tooltip } = useDelayedSpectrumTooltip();
  const effectiveMaxFrequencyHz = resolveProbeSpectrumEffectiveMaxFrequencyHz(
    props.maxFrequencyHz,
    props.capture?.spectrumFrames?.sampleRate ?? props.capture?.sampleRate ?? 48000
  );
  const frequencyMarkers = useMemo(
    () => resolveSpectrumFrequencyMarkers(effectiveMaxFrequencyHz),
    [effectiveMaxFrequencyHz]
  );
  const displaySpectrogram = useMemo(() => {
    const finalSpectrum = props.capture?.finalSpectrum;
    const rows = finalSpectrum
      ? props.compact
        ? SPECTRUM_FINAL_COMPACT_FACE_ROWS
        : SPECTRUM_FINAL_FACE_ROWS
      : SPECTRUM_STREAM_ROWS;
    const viewportColumns = finalSpectrum
      ? props.compact
        ? SPECTRUM_FINAL_COMPACT_FACE_COLUMNS
        : SPECTRUM_FINAL_FACE_COLUMNS
      : props.compact
        ? 240
        : 320;
    if (!props.capture) {
      return [];
    }

    if (finalSpectrum) {
      return buildFinalSpectrumDisplay(
        finalSpectrum,
        rows,
        viewportColumns,
        effectiveMaxFrequencyHz,
        props.capture.spectrumFrames
      );
    }

    const elapsedSeconds = clamp(props.elapsedSeconds, 0, SPECTRUM_MAX_DISPLAY_SECONDS);
    const viewportSeconds = clamp(Math.max(1, elapsedSeconds), 1, SPECTRUM_MAX_DISPLAY_SECONDS);
    const spectrumFrames = props.capture.spectrumFrames;
    if (resolveSpectrumGridColumnCount(spectrumFrames) > 0 && spectrumFrames) {
      return buildSpectrumFramesDisplay(
        spectrumFrames,
        rows,
        viewportColumns,
        viewportSeconds,
        effectiveMaxFrequencyHz
      );
    }

    const captureFrameSize = resolveProbeSpectrumCaptureFrameSize(
      props.selectedWindowSize,
      props.capture.sampleStride ?? 1
    );
    const grid = buildProbeSpectrumFrameGrid(
      props.capture.samples,
      captureFrameSize,
      rows,
      props.capture.capturedSamples,
      props.capture.sampleRate,
      effectiveMaxFrequencyHz
    );
    if (grid.peak <= 0 || grid.columns.length <= 0) {
      return Array.from({ length: rows }, () => new Array(viewportColumns).fill(0));
    }
    const visibleFrameCount = Math.max(
      1,
      Math.min(grid.columns.length, Math.ceil((viewportSeconds * props.capture.sampleRate) / grid.frameSize))
    );
    const filledRatio = resolveSpectrumTimelineFillRatio(
      props.capture.capturedSamples,
      props.capture.sampleRate,
      viewportSeconds
    );
    const display = Array.from({ length: rows }, () => new Array(viewportColumns).fill(0));
    for (let columnIndex = 0; columnIndex < viewportColumns; columnIndex += 1) {
      const ratio = viewportColumns <= 1 ? 0 : columnIndex / (viewportColumns - 1);
      const frameIndex = resolveSpectrumTimelineFrameIndex(ratio, filledRatio, visibleFrameCount);
      if (frameIndex < 0) {
        continue;
      }
      const column = grid.columns[frameIndex];
      if (!column) {
        continue;
      }
      for (let rowIndex = 0; rowIndex < rows; rowIndex += 1) {
        display[rowIndex][columnIndex] = column[rowIndex] ?? 0;
      }
    }
    return display;
  }, [props.capture, props.compact, props.elapsedSeconds, effectiveMaxFrequencyHz, props.selectedWindowSize]);
  const displayDurationSeconds = useMemo(() => {
    if (props.capture?.finalSpectrum) {
      return props.capture.finalSpectrum.capturedSamples / Math.max(1, props.capture.finalSpectrum.sampleRate);
    }
    return clamp(Math.max(1, props.elapsedSeconds), 1, SPECTRUM_MAX_DISPLAY_SECONDS);
  }, [props.capture?.finalSpectrum, props.elapsedSeconds]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }
    const rows = displaySpectrogram.length;
    const columns = displaySpectrogram[0]?.length ?? 0;
    const usesFinalSpectrum = Boolean(props.capture?.finalSpectrum);
    const width = usesFinalSpectrum && columns > 0 ? columns : props.compact ? 240 : 320;
    const height = usesFinalSpectrum && rows > 0 ? rows : props.compact ? 144 : 192;
    const devicePixelRatio = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * devicePixelRatio);
    canvas.height = Math.round(height * devicePixelRatio);
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    context.clearRect(0, 0, width, height);
    context.fillStyle = PROBE_SPECTRUM_FACE_BG;
    context.fillRect(0, 0, width, height);

    if (!rows || !columns) {
      return;
    }

    const cellWidth = width / columns;
    const cellHeight = height / rows;
    const fillWidth = usesFinalSpectrum ? Math.max(cellWidth, 1) : Math.ceil(cellWidth + 1);
    const fillHeight = usesFinalSpectrum ? Math.max(cellHeight, 1) : Math.ceil(cellHeight + 1);
    for (let rowIndex = 0; rowIndex < rows; rowIndex += 1) {
      const row = displaySpectrogram[rowIndex] ?? [];
      for (let columnIndex = 0; columnIndex < columns; columnIndex += 1) {
        const value = row[columnIndex] ?? 0;
        context.globalAlpha = resolveProbeSpectrumMagnitudeAlpha(value);
        context.fillStyle = resolveProbeSpectrumMagnitudeColor(value);
        context.fillRect(columnIndex * cellWidth, height - (rowIndex + 1) * cellHeight, fillWidth, fillHeight);
      }
    }
    context.globalAlpha = 1;
  }, [displaySpectrogram, props.capture?.finalSpectrum, props.compact]);

  const handleSpectrumPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const rows = displaySpectrogram.length;
    const columns = displaySpectrogram[0]?.length ?? 0;
    if (!canvas || rows <= 0 || columns <= 0) {
      clearTooltip();
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const localX = clamp(event.clientX - rect.left, 0, rect.width);
    const localY = clamp(event.clientY - rect.top, 0, rect.height);
    const columnIndex = clamp(Math.floor((localX / Math.max(1, rect.width)) * columns), 0, columns - 1);
    const rowIndex = clamp(rows - 1 - Math.floor((localY / Math.max(1, rect.height)) * rows), 0, rows - 1);
    const value = displaySpectrogram[rowIndex]?.[columnIndex] ?? 0;
    const freqLow = Math.pow(rowIndex / rows, 2) * effectiveMaxFrequencyHz;
    const freqHigh = Math.pow((rowIndex + 1) / rows, 2) * effectiveMaxFrequencyHz;
    const timeStartSeconds = (columnIndex / Math.max(1, columns)) * displayDurationSeconds;
    const timeEndSeconds = ((columnIndex + 1) / Math.max(1, columns)) * displayDurationSeconds;
    const label = formatSpectrumTooltip(freqLow, freqHigh, timeStartSeconds, timeEndSeconds, value);
    scheduleTooltip(event.clientX, event.clientY, label);
  };

  return (
    <div className="patch-probe-spectrum-shell">
      <div className="patch-probe-spectrogram-frame">
        <canvas
          ref={canvasRef}
          className="patch-probe-spectrogram-canvas"
          onPointerMove={handleSpectrumPointerMove}
          onPointerLeave={clearTooltip}
          onPointerDown={clearTooltip}
        />
        {tooltip && (
          <span className="patch-probe-spectrum-tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
            {tooltip.label}
          </span>
        )}
        {!props.compact && (
          <>
            {frequencyMarkers.map((marker) => (
              <div
                key={marker.frequency}
                className="patch-probe-spectrogram-marker"
                style={{ bottom: `${marker.bottomPercent}%` }}
              >
                <span className="patch-probe-spectrogram-marker-line" />
                <span className="patch-probe-spectrogram-marker-label">
                  {formatSpectrumFrequency(marker.frequency)}
                </span>
              </div>
            ))}
            <span className="patch-probe-spectrogram-axis patch-probe-spectrogram-axis-time">Time</span>
          </>
        )}
      </div>
      {!props.compact && (
        <label className="patch-probe-window-label">
          Analysis frame
          <select
            value={props.selectedWindowSize}
            onChange={(event) => props.onChangeWindowSize(Number(event.target.value))}
          >
            {PROBE_SPECTRUM_WINDOWS.map((windowSize) => (
              <option key={windowSize} value={windowSize}>
                {windowSize}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

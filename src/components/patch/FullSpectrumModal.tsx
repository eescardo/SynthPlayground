"use client";

import { useEffect, useMemo, useRef } from "react";
import { PATCH_COLOR_PROBE_GRAPH_BG } from "@/components/patch/patchCanvasConstants";
import { useDelayedSpectrumTooltip } from "@/hooks/patch/useDelayedSpectrumTooltip";
import { clamp } from "@/lib/numeric";
import { formatScopeTimestamp, formatSpectrumFrequency } from "@/lib/patch/probeViewMath";
import { resolveProbeSpectrumMagnitudeColor } from "@/lib/patch/probes";
import {
  formatSpectrumTooltip,
  resolveFullSpectrumFrequencyMarkers,
  resolveFullSpectrumGridLines
} from "@/lib/patch/spectrumDisplayMath";
import { PreviewProbeCapture } from "@/types/probes";

export function FullSpectrumModal(props: { capture?: PreviewProbeCapture; probeName: string; onClose: () => void }) {
  const finalSpectrum = props.capture?.finalSpectrum;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const { clearTooltip, scheduleTooltip, tooltip } = useDelayedSpectrumTooltip();
  const maxFrequencyHz = finalSpectrum?.binFrequencies.at(-1) ?? 24000;
  const frameSize = finalSpectrum?.frameSize ?? 512;
  const frequencyMarkers = useMemo(
    () => resolveFullSpectrumFrequencyMarkers(maxFrequencyHz, frameSize),
    [frameSize, maxFrequencyHz]
  );
  const gridLines = useMemo(() => resolveFullSpectrumGridLines(maxFrequencyHz, frameSize), [frameSize, maxFrequencyHz]);
  const durationSeconds = finalSpectrum ? finalSpectrum.capturedSamples / Math.max(1, finalSpectrum.sampleRate) : 0;
  const timeMarkers = useMemo(
    () => [0, 0.5, 1].map((ratio) => ({ ratio, label: formatScopeTimestamp(durationSeconds * ratio) })),
    [durationSeconds]
  );
  const rowCount = finalSpectrum?.columns[0]?.length ?? 0;
  const columnCount = finalSpectrum?.columns.length ?? 0;
  const imageWidth = Math.max(720, columnCount * 2);
  const imageHeight = rowCount > 0 ? rowCount : 320;

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
      const column = finalSpectrum.columns[columnIndex] ?? [];
      for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
        const value = column[rowIndex] ?? 0;
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
    const rect = canvas.getBoundingClientRect();
    const localX = clamp(event.clientX - rect.left, 0, rect.width);
    const localY = clamp(event.clientY - rect.top, 0, rect.height);
    const columnIndex = clamp(Math.floor((localX / Math.max(1, rect.width)) * columnCount), 0, columnCount - 1);
    const rowIndex = clamp(rowCount - 1 - Math.floor((localY / Math.max(1, rect.height)) * rowCount), 0, rowCount - 1);
    const value = finalSpectrum.columns[columnIndex]?.[rowIndex] ?? 0;
    const binStep =
      finalSpectrum.binFrequencies.length > 1
        ? (finalSpectrum.binFrequencies.at(-1) ?? 0) / Math.max(1, finalSpectrum.binFrequencies.length - 1)
        : 0;
    const freqLow = finalSpectrum.binFrequencies[rowIndex] ?? rowIndex * binStep;
    const freqHigh = finalSpectrum.binFrequencies[rowIndex + 1] ?? freqLow + binStep;
    const timeSeconds = (columnIndex / Math.max(1, columnCount - 1)) * durationSeconds;
    const label = formatSpectrumTooltip(freqLow, freqHigh, timeSeconds, value);
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
    context.setLineDash(line.major ? [] : [2, 3]);
    context.strokeStyle = line.major ? "rgba(231, 243, 255, 0.5)" : "rgba(231, 243, 255, 0.3)";
    context.lineWidth = line.major ? 1 : 0.75;
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
    context.restore();
  }
}

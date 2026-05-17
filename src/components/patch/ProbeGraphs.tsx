"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  PATCH_COLOR_PROBE_ENVELOPE_TRACE,
  PATCH_COLOR_PROBE_GRAPH_AXIS,
  PATCH_COLOR_PROBE_GRAPH_AXIS_STRONG,
  PATCH_COLOR_PROBE_GRAPH_BG,
  PATCH_COLOR_PROBE_GRAPH_FUTURE_MASK,
  PATCH_COLOR_PROBE_GRAPH_GRID,
  PATCH_COLOR_PROBE_GRAPH_REGION_A,
  PATCH_COLOR_PROBE_GRAPH_REGION_B,
  PATCH_COLOR_PROBE_PLAYHEAD,
  PATCH_COLOR_PROBE_SCOPE_TRACE
} from "@/components/patch/patchCanvasConstants";
import { clamp } from "@/lib/numeric";
import {
  buildProbeSpectrumFrameGrid,
  resolveProbeSpectrumCaptureFrameSize,
  resolveProbeSpectrumEffectiveMaxFrequencyHz,
  resolveProbeSpectrumMagnitudeColor
} from "@/lib/patch/probes";
import { detectMonophonicPitchNotes } from "@/lib/patch/pitchTracker";
import {
  buildScopeRenderData,
  formatSpectrumFrequency,
  resolveScopeTimeMarkers,
  resolveSpectrumFrequencyMarkers,
  resolveSpectrumTimelineFillRatio,
  resolveSpectrumTimelineFrameIndex
} from "@/lib/patch/probeViewMath";
import {
  buildFinalSpectrumDisplay,
  buildSpectrumFramesDisplay,
  formatSpectrumTooltip,
  SPECTRUM_FINAL_COMPACT_FACE_COLUMNS,
  SPECTRUM_FINAL_COMPACT_FACE_ROWS,
  SPECTRUM_FINAL_FACE_COLUMNS,
  SPECTRUM_FINAL_FACE_ROWS,
  SPECTRUM_MAX_DISPLAY_SECONDS,
  SPECTRUM_STREAM_ROWS
} from "@/lib/patch/spectrumDisplayMath";
import { PreviewProbeCapture } from "@/types/probes";

const PROBE_SPECTRUM_WINDOWS = [256, 512, 1024, 2048];

interface SpectrumTooltipState {
  x: number;
  y: number;
  label: string;
}

export function PitchTrackerProbeGraph(props: { capture?: PreviewProbeCapture; compact?: boolean }) {
  const notes = useMemo(() => detectMonophonicPitchNotes(props.capture, 120), [props.capture]);
  return (
    <div className={`pitch-tracker-probe${props.compact ? " compact" : ""}`}>
      <div className="pitch-tracker-probe-summary">
        {notes.length ? `${notes.length} note${notes.length === 1 ? "" : "s"} detected` : "No notes detected yet"}
      </div>
      <div className="pitch-tracker-probe-notes">
        {notes.slice(0, props.compact ? 3 : 6).map((note, index) => (
          <div key={`${note.pitchStr}_${note.startBeat}_${index}`} className="pitch-tracker-probe-note">
            <strong>{note.pitchStr}</strong>
            <span>{note.startBeat.toFixed(2)}</span>
            <span>{note.durationBeats.toFixed(2)}</span>
          </div>
        ))}
        {notes.length === 0 && <div className="pitch-tracker-probe-empty">Play a preview through this probe.</div>}
      </div>
    </div>
  );
}

export function ScopeProbeGraph(props: { capture?: PreviewProbeCapture; compact?: boolean }) {
  const graphData = useMemo(() => buildScopeRenderData(props.capture, props.compact), [props.capture, props.compact]);
  const adsrEstimate = props.compact ? undefined : props.capture?.adsrEstimate;

  const timeMarkers = useMemo(
    () => resolveScopeTimeMarkers(graphData.durationSeconds, props.compact),
    [graphData.durationSeconds, props.compact]
  );

  const plotStartX = props.compact ? 2 : 6;
  const plotWidth = props.compact ? 97 : 92;
  const waveformTopY = props.compact ? 6 : 2;
  const waveformCenterY = props.compact ? 17 : 15;
  const waveformBottomY = props.compact ? 28 : 28;
  const envelopeTopY = props.compact ? 33 : 31;
  const envelopeBottomY = props.compact ? 54 : 56;
  const futureMaskX = plotStartX + graphData.capturedRatio * plotWidth;
  const futureMaskWidth = Math.max(0, plotStartX + plotWidth - futureMaskX);
  const playheadX = plotStartX + graphData.capturedRatio * plotWidth;

  return (
    <svg viewBox="0 0 100 60" className="patch-probe-graph">
      <rect x="0" y="0" width="100" height="60" fill={PATCH_COLOR_PROBE_GRAPH_BG} rx="6" />
      <rect
        x={plotStartX}
        y={waveformTopY}
        width={plotWidth}
        height={waveformBottomY - waveformTopY}
        fill={PATCH_COLOR_PROBE_GRAPH_REGION_A}
        rx="4"
      />
      <rect
        x={plotStartX}
        y={envelopeTopY}
        width={plotWidth}
        height={envelopeBottomY - envelopeTopY}
        fill={PATCH_COLOR_PROBE_GRAPH_REGION_B}
        rx="4"
      />
      {timeMarkers.map((marker) => (
        <line
          key={marker.ratio}
          x1={marker.x}
          y1={waveformTopY}
          x2={marker.x}
          y2={envelopeBottomY}
          stroke={PATCH_COLOR_PROBE_GRAPH_GRID}
          strokeWidth="0.35"
          shapeRendering="crispEdges"
        />
      ))}
      <line
        x1={plotStartX}
        y1={waveformCenterY}
        x2={plotStartX + plotWidth}
        y2={waveformCenterY}
        stroke={PATCH_COLOR_PROBE_GRAPH_AXIS_STRONG}
        strokeWidth="0.45"
        shapeRendering="crispEdges"
      />
      <line
        x1={plotStartX}
        y1={envelopeTopY}
        x2={plotStartX + plotWidth}
        y2={envelopeTopY}
        stroke={PATCH_COLOR_PROBE_GRAPH_AXIS}
        strokeWidth="0.35"
        shapeRendering="crispEdges"
      />
      <line
        x1={plotStartX}
        y1={envelopeBottomY}
        x2={plotStartX + plotWidth}
        y2={envelopeBottomY}
        stroke={PATCH_COLOR_PROBE_GRAPH_AXIS}
        strokeWidth="0.35"
        shapeRendering="crispEdges"
      />
      {graphData.capturedRatio < 1 && (
        <rect
          x={futureMaskX}
          y={waveformTopY}
          width={futureMaskWidth}
          height={envelopeBottomY - waveformTopY}
          fill={PATCH_COLOR_PROBE_GRAPH_FUTURE_MASK}
        />
      )}
      {graphData.waveformSegments.map((segment) => (
        <line
          key={`wave_${segment.x}`}
          x1={segment.x}
          y1={segment.y1}
          x2={segment.x}
          y2={segment.y2}
          stroke={PATCH_COLOR_PROBE_SCOPE_TRACE}
          strokeWidth="0.42"
          shapeRendering="crispEdges"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {graphData.envelopeLine && (
        <polyline
          points={graphData.envelopeLine}
          fill="none"
          stroke={PATCH_COLOR_PROBE_ENVELOPE_TRACE}
          strokeWidth="0.58"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      )}
      <line
        x1={playheadX}
        y1={waveformTopY}
        x2={playheadX}
        y2={envelopeBottomY}
        stroke={PATCH_COLOR_PROBE_PLAYHEAD}
        strokeWidth="0.7"
        shapeRendering="crispEdges"
      />
      {!props.compact && graphData.peak > 0 && (
        <>
          <text x="-3.2" y="5.2" className="patch-probe-axis-label">{`+${graphData.peak.toFixed(3)}`}</text>
          <text x="-3.2" y="16.5" className="patch-probe-axis-label">
            0
          </text>
          <text x="-3.2" y="27.5" className="patch-probe-axis-label">{`-${graphData.peak.toFixed(3)}`}</text>
          <text x="-3.2" y="34.2" className="patch-probe-axis-label">
            1.0
          </text>
          <text x="-3.2" y="56.8" className="patch-probe-axis-label">
            0
          </text>
          {adsrEstimate && (
            <text x="98" y="30" textAnchor="end" className="patch-probe-axis-label patch-probe-adsr-label">
              {adsrEstimate.label}
            </text>
          )}
          {timeMarkers.map((marker) => (
            <text
              key={`time_${marker.ratio}`}
              x={marker.x}
              y="59"
              textAnchor={marker.ratio === 0 ? "start" : marker.ratio === 1 ? "end" : "middle"}
              className="patch-probe-axis-label"
            >
              {marker.label}
            </text>
          ))}
        </>
      )}
    </svg>
  );
}

export function SpectrumProbeGraph(props: {
  capture?: PreviewProbeCapture;
  elapsedSeconds: number;
  selectedWindowSize: number;
  maxFrequencyHz: number;
  compact?: boolean;
  onChangeWindowSize: (windowSize: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const tooltipTimerRef = useRef<number | null>(null);
  const [tooltip, setTooltip] = useState<SpectrumTooltipState | null>(null);
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
    if (props.capture.spectrumFrames?.columns.length) {
      return buildSpectrumFramesDisplay(
        props.capture.spectrumFrames,
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
    context.fillStyle = PATCH_COLOR_PROBE_GRAPH_BG;
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
        context.fillStyle = resolveProbeSpectrumMagnitudeColor(value);
        context.fillRect(columnIndex * cellWidth, height - (rowIndex + 1) * cellHeight, fillWidth, fillHeight);
      }
    }
  }, [displaySpectrogram, props.capture?.finalSpectrum, props.compact]);

  useEffect(() => {
    return () => {
      if (tooltipTimerRef.current !== null) {
        window.clearTimeout(tooltipTimerRef.current);
      }
    };
  }, []);

  const clearTooltip = () => {
    if (tooltipTimerRef.current !== null) {
      window.clearTimeout(tooltipTimerRef.current);
      tooltipTimerRef.current = null;
    }
    setTooltip(null);
  };

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
    const timeSeconds = (columns <= 1 ? 0 : columnIndex / (columns - 1)) * displayDurationSeconds;
    const label = formatSpectrumTooltip(freqLow, freqHigh, timeSeconds, value);
    const tooltipX = clamp(event.clientX + 12, 8, Math.max(8, window.innerWidth - 16));
    const tooltipY = clamp(event.clientY - 32, 8, Math.max(8, window.innerHeight - 16));
    if (tooltipTimerRef.current !== null) {
      window.clearTimeout(tooltipTimerRef.current);
    }
    setTooltip(null);
    tooltipTimerRef.current = window.setTimeout(() => {
      setTooltip({
        x: tooltipX,
        y: tooltipY,
        label
      });
      tooltipTimerRef.current = null;
    }, 1000);
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

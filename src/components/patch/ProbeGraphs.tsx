"use client";

import { useMemo } from "react";
import {
  PATCH_COLOR_PROBE_ENVELOPE_TRACE,
  PATCH_COLOR_PROBE_GRAPH_AXIS,
  PATCH_COLOR_PROBE_GRAPH_AXIS_STRONG,
  PATCH_COLOR_PROBE_GRAPH_BG,
  PATCH_COLOR_PROBE_GRAPH_FUTURE_MASK,
  PATCH_COLOR_PROBE_GRAPH_GRID,
  PATCH_COLOR_PROBE_GRAPH_REGION_A,
  PATCH_COLOR_PROBE_GRAPH_REGION_B,
  PATCH_COLOR_PROBE_SCOPE_ENVELOPE_REGION,
  PATCH_COLOR_PROBE_SCOPE_WAVE_REGION,
  PATCH_COLOR_PROBE_PLAYHEAD,
  PATCH_COLOR_PROBE_SCOPE_TRACE
} from "@/components/patch/patchCanvasConstants";
import { detectMonophonicPitchNotes } from "@/lib/patch/pitchTracker";
import { buildScopeRenderData, resolveScopeGraphLayout, resolveScopeTimeMarkers } from "@/lib/patch/probeViewMath";
import { formatDb, resolveSignalHealthStatus } from "@/lib/patch/signalHealth";
import { PreviewProbeCapture } from "@/types/probes";

const SIGNAL_HEALTH_STATUS_LABELS = {
  blank: "no signal",
  clean: "ok",
  hot: "hot",
  clip: "clipping",
  dc: "ok",
  rough: "ok"
} as const;

const SIGNAL_HEALTH_RISK_BINS = 18;

function resolveRiskTone(value: number): "ok" | "hot" | "clip" {
  if (value >= 0.85) {
    return "clip";
  }
  if (value >= 0.5) {
    return "hot";
  }
  return "ok";
}

function buildSignalHealthRiskSeries(samples?: ArrayLike<number>) {
  const length = samples?.length ?? 0;
  if (!samples || length <= 0) {
    return {
      crest: Array.from({ length: SIGNAL_HEALTH_RISK_BINS }, () => 0),
      rough: Array.from({ length: SIGNAL_HEALTH_RISK_BINS }, () => 0),
      dc: Array.from({ length: SIGNAL_HEALTH_RISK_BINS }, () => 0)
    };
  }

  const crest: number[] = [];
  const rough: number[] = [];
  const dc: number[] = [];
  for (let bin = 0; bin < SIGNAL_HEALTH_RISK_BINS; bin += 1) {
    const start = Math.floor((bin / SIGNAL_HEALTH_RISK_BINS) * length);
    const end = Math.max(start + 1, Math.floor(((bin + 1) / SIGNAL_HEALTH_RISK_BINS) * length));
    let peak = 0;
    let sum = 0;
    let sumSquares = 0;
    let deltaSum = 0;
    let previous = Number(samples[start] ?? 0);
    for (let index = start; index < end; index += 1) {
      const sample = Number(samples[index] ?? 0);
      if (!Number.isFinite(sample)) {
        continue;
      }
      const abs = Math.abs(sample);
      peak = Math.max(peak, abs);
      sum += sample;
      sumSquares += sample * sample;
      if (index > start) {
        deltaSum += Math.abs(sample - previous);
      }
      previous = sample;
    }
    const count = Math.max(1, end - start);
    const rms = Math.sqrt(sumSquares / count);
    const crestFactorDb = rms > 0.000001 ? 20 * Math.log10(Math.max(0.000001, peak / rms)) : 24;
    crest.push(Math.min(1, Math.max(0, (10 - crestFactorDb) / 10)));
    rough.push(Math.min(1, Math.max(0, deltaSum / Math.max(1, count - 1) / Math.max(0.000001, peak))));
    dc.push(Math.min(1, Math.abs(sum / count) / 0.25));
  }
  return { crest, rough, dc };
}

function RiskGraph(props: { label: string; values: number[]; aggregate: number; y: number }) {
  const graphX = 52;
  const graphWidth = 34;
  const rowHeight = 8;
  const thresholdY = props.y + rowHeight - 0.5 - 0.55 * (rowHeight - 2);
  const barWidth = graphWidth / Math.max(1, props.values.length);
  const tone = resolveRiskTone(props.aggregate);
  return (
    <g className={`signal-health-risk-row ${tone}`}>
      <text x="36" y={props.y + 5.5} className="signal-health-risk-label">
        {props.label}
      </text>
      <rect
        x={graphX}
        y={props.y + 0.5}
        width={graphWidth}
        height={rowHeight - 1}
        rx="2"
        className="signal-health-risk-track"
      />
      <line
        x1={graphX}
        y1={thresholdY}
        x2={graphX + graphWidth}
        y2={thresholdY}
        className="signal-health-risk-threshold"
      />
      {props.values.map((value, index) => {
        const height = Math.max(0.35, Math.min(1, value) * (rowHeight - 2));
        return (
          <rect
            key={`${props.label}_${index}`}
            x={graphX + index * barWidth + 0.25}
            y={props.y + rowHeight - 0.5 - height}
            width={Math.max(0.35, barWidth - 0.5)}
            height={height}
            rx="0.45"
            className="signal-health-risk-fill"
          />
        );
      })}
    </g>
  );
}

export function SignalHealthProbeGraph(props: { capture?: PreviewProbeCapture; compact?: boolean }) {
  const stats = props.capture?.qualityStats;
  const status = resolveSignalHealthStatus(stats);
  const peakRatio = Math.min(1, Math.max(0, stats?.peak ?? 0));
  const rmsRatio = Math.min(1, Math.max(0, stats?.rms ?? 0));
  const roughRatio = Math.min(1, Math.max(0, Math.max(stats?.roughness ?? 0, stats?.zeroCrossingRate ?? 0)));
  const dcRatio = Math.min(1, Math.abs(stats?.dcOffset ?? 0) / 0.25);
  const crestRiskRatio = stats && status !== "blank" ? Math.min(1, Math.max(0, (10 - stats.crestFactorDb) / 10)) : 0;
  const riskSeries = buildSignalHealthRiskSeries(props.capture?.samples);
  const meterFillY = 54 - peakRatio * 42;
  const rmsY = 54 - rmsRatio * 42;
  const statusClass = `signal-health-probe ${props.compact ? "compact" : ""} ${status}`;

  return (
    <svg viewBox="0 0 100 60" preserveAspectRatio="none" className={statusClass}>
      <title>
        Signal Health: peak/RMS level, near-clipping ticks, roughness, crest factor, and DC offset for the captured
        preview signal.
      </title>
      <defs>
        <linearGradient id="signal-health-level-gradient" x1="0" y1="54" x2="0" y2="10" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#7be49b" />
          <stop offset="72%" stopColor="#7be49b" />
          <stop offset="90%" stopColor="#f6c85f" />
          <stop offset="100%" stopColor="#ff4c5f" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="100" height="60" rx="6" className="signal-health-bg" />
      <g>
        <title>
          Peak meter: soft fill is peak amplitude; white line is RMS; yellow/red marks are hot and clip zones.
        </title>
        <rect x="7" y="10" width="13" height="44" rx="3" className="signal-health-rail" />
        <rect x="8.5" y={meterFillY} width="10" height={54 - meterFillY} rx="2.5" className="signal-health-peak-fill" />
        <line x1="7" y1="18" x2="20" y2="18" className="signal-health-hot-line" />
        <line x1="7" y1="12" x2="20" y2="12" className="signal-health-clip-line" />
        <line x1="6.5" y1={rmsY} x2="20.5" y2={rmsY} className="signal-health-rms-marker" />
      </g>
      <text x="7" y="8" className="signal-health-label">
        peak
      </text>
      <text x="21.5" y="13.5" className="signal-health-threshold-label clip">
        clip
      </text>
      <text x="21.5" y="19.5" className="signal-health-threshold-label">
        hot
      </text>
      <text x="21.5" y={Math.max(29, Math.min(53, rmsY + 1.5))} className="signal-health-threshold-label rms">
        rms
      </text>
      <text x="13.5" y="59" textAnchor="middle" className="signal-health-status">
        {SIGNAL_HEALTH_STATUS_LABELS[status]}
      </text>

      <g className="signal-health-risk-bars">
        <title>
          Risk graphs: each row shows how much crest, roughness, or DC offset was detected over the preview.
        </title>
        <rect x="32" y="10" width="61" height="38" rx="4" className="signal-health-risk-frame" />
        <text x="36" y="17" className="signal-health-label">
          risks
        </text>
        <RiskGraph label="crest" values={riskSeries.crest} aggregate={crestRiskRatio} y={20} />
        <RiskGraph label="rough" values={riskSeries.rough} aggregate={roughRatio} y={30} />
        <RiskGraph label="dc" values={riskSeries.dc} aggregate={dcRatio} y={40} />
      </g>

      {!props.compact && stats && (
        <text x="97" y="56" textAnchor="end" className="signal-health-readout">
          {formatDb(stats.peakDb)}
        </text>
      )}
    </svg>
  );
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

  const layout = useMemo(() => resolveScopeGraphLayout(props.compact), [props.compact]);
  const futureMaskX = layout.plotStartX + graphData.capturedRatio * layout.plotWidth;
  const futureMaskWidth = Math.max(0, layout.plotStartX + layout.plotWidth - futureMaskX);
  const playheadX = layout.plotStartX + graphData.capturedRatio * layout.plotWidth;
  const hasSignal = graphData.waveformSegments.length > 0 || Boolean(graphData.envelopeLine);
  const useFinalSignalRegions = graphData.usesFinalScope && hasSignal;

  return (
    <svg
      viewBox="0 0 100 60"
      preserveAspectRatio={props.compact ? "none" : "xMidYMid meet"}
      className="patch-probe-graph"
    >
      {hasSignal && !useFinalSignalRegions && (
        <>
          <rect x="0" y="0" width="100" height="60" fill={PATCH_COLOR_PROBE_GRAPH_BG} rx="6" />
          <rect
            x={layout.plotStartX}
            y={layout.waveformTopY}
            width={layout.plotWidth}
            height={layout.waveformBottomY - layout.waveformTopY}
            fill={PATCH_COLOR_PROBE_GRAPH_REGION_A}
            rx="4"
          />
          <rect
            x={layout.plotStartX}
            y={layout.envelopeTopY}
            width={layout.plotWidth}
            height={layout.envelopeBottomY - layout.envelopeTopY}
            fill={PATCH_COLOR_PROBE_GRAPH_REGION_B}
            rx="4"
          />
        </>
      )}
      {useFinalSignalRegions && (
        <>
          <path d={graphData.waveformRegionPath} fill={PATCH_COLOR_PROBE_SCOPE_WAVE_REGION} />
          <path d={graphData.envelopeRegionPath} fill={PATCH_COLOR_PROBE_SCOPE_ENVELOPE_REGION} />
        </>
      )}
      {timeMarkers.map((marker) => (
        <line
          key={marker.ratio}
          x1={marker.x}
          y1={layout.waveformTopY}
          x2={marker.x}
          y2={layout.envelopeBottomY}
          stroke={PATCH_COLOR_PROBE_GRAPH_GRID}
          strokeWidth="0.35"
          shapeRendering="crispEdges"
        />
      ))}
      <line
        x1={layout.plotStartX}
        y1={layout.waveformCenterY}
        x2={layout.plotStartX + layout.plotWidth}
        y2={layout.waveformCenterY}
        stroke={PATCH_COLOR_PROBE_GRAPH_AXIS_STRONG}
        strokeWidth="0.45"
        shapeRendering="crispEdges"
      />
      <line
        x1={layout.plotStartX}
        y1={layout.envelopeTopY}
        x2={layout.plotStartX + layout.plotWidth}
        y2={layout.envelopeTopY}
        stroke={PATCH_COLOR_PROBE_GRAPH_AXIS}
        strokeWidth="0.35"
        shapeRendering="crispEdges"
      />
      <line
        x1={layout.plotStartX}
        y1={layout.envelopeBottomY}
        x2={layout.plotStartX + layout.plotWidth}
        y2={layout.envelopeBottomY}
        stroke={PATCH_COLOR_PROBE_GRAPH_AXIS}
        strokeWidth="0.35"
        shapeRendering="crispEdges"
      />
      {graphData.capturedRatio < 1 && (
        <rect
          x={futureMaskX}
          y={layout.waveformTopY}
          width={futureMaskWidth}
          height={layout.envelopeBottomY - layout.waveformTopY}
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
        y1={layout.waveformTopY}
        x2={playheadX}
        y2={layout.envelopeBottomY}
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

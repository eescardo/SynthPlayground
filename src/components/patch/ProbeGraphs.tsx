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
  blank: "No signal",
  clean: "Clean",
  hot: "Hot",
  clip: "Clipping",
  dc: "DC",
  rough: "Rough"
} as const;

export function SignalHealthProbeGraph(props: { capture?: PreviewProbeCapture; compact?: boolean }) {
  const stats = props.capture?.qualityStats;
  const status = resolveSignalHealthStatus(stats);
  const peakRatio = Math.min(1, Math.max(0, stats?.peak ?? 0));
  const rmsRatio = Math.min(1, Math.max(0, stats?.rms ?? 0));
  const roughRatio = Math.min(1, Math.max(0, Math.max(stats?.roughness ?? 0, stats?.zeroCrossingRate ?? 0)));
  const dcRatio = Math.min(1, Math.abs(stats?.dcOffset ?? 0) / 0.25);
  const crestRiskRatio = stats && status !== "blank" ? Math.min(1, Math.max(0, (10 - stats.crestFactorDb) / 10)) : 0;
  const meterFillY = 54 - peakRatio * 42;
  const rmsY = 54 - rmsRatio * 42;
  const dcX = 48 + Math.max(-1, Math.min(1, (stats?.dcOffset ?? 0) / 0.18)) * 14;
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

      <g className="signal-health-risk-bars">
        <title>Risk bars: each row shows the current aggregate risk for crest factor, roughness, and DC offset.</title>
        <rect x="27" y="10" width="42" height="38" rx="4" className="signal-health-risk-frame" />
        <text x="30" y="17" className="signal-health-label">
          risks
        </text>
        <text x="31" y="27">
          crest
        </text>
        <rect x="44" y="23" width="20" height="3" rx="1.5" className="signal-health-risk-track" />
        <rect x="44" y="23" width={crestRiskRatio * 20} height="3" rx="1.5" className="signal-health-risk-fill" />
        <text x="31" y="36">
          rough
        </text>
        <rect x="44" y="32" width="20" height="3" rx="1.5" className="signal-health-risk-track" />
        <rect x="44" y="32" width={roughRatio * 20} height="3" rx="1.5" className="signal-health-risk-fill" />
        <text x="31" y="45">
          dc
        </text>
        <rect x="44" y="41" width="20" height="3" rx="1.5" className="signal-health-risk-track" />
        <rect x="44" y="41" width={dcRatio * 20} height="3" rx="1.5" className="signal-health-risk-fill" />
      </g>

      <g className="signal-health-glyphs">
        <g>
          <title>Crest factor: warns when RMS is too close to peak, which can sound flattened or crushed.</title>
          <circle cx="80" cy="16" r="7" className="ghost" opacity={crestRiskRatio * 0.7} />
          <circle cx="80" cy="16" r="5.2" className={crestRiskRatio > 0.5 ? "warn" : ""} />
          <path d="M76 16h8M80 12v8" />
          <text x="88" y="18">
            crest
          </text>
        </g>
        <g>
          <title>Roughness: warns when sample-to-sample motion or zero-crossing rate is unusually high.</title>
          <circle cx="80" cy="31" r="7" className="ghost" opacity={roughRatio * 0.7} />
          <circle cx="80" cy="31" r="5.2" className={roughRatio > 0.55 ? "warn" : ""} />
          <path d="M76 34l2-7 3 6 3-7" />
          <text x="88" y="33">
            rough
          </text>
        </g>
        <g>
          <title>DC offset: warns when the waveform is biased away from zero.</title>
          <circle cx="80" cy="46" r="7" className="ghost" opacity={dcRatio * 0.7} />
          <circle cx="80" cy="46" r="5.2" className={dcRatio > 0.2 ? "warn" : ""} />
          <path d={`M75 46h10M${dcX.toFixed(1)} 42v8`} />
          <text x="88" y="48">
            dc
          </text>
        </g>
      </g>

      <text x="25" y="56" className="signal-health-status">
        {SIGNAL_HEALTH_STATUS_LABELS[status]}
      </text>
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

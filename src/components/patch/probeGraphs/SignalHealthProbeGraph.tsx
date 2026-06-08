"use client";

import { useId } from "react";
import {
  buildSignalHealthGradientId,
  createSignalHealthGraphStatusClass,
  formatSignalHealthStatusLabel
} from "@/components/patch/probeGraphDisplay";
import { formatDb, resolveSignalHealthStatus } from "@/lib/patch/signalHealth";
import { PreviewProbeCapture } from "@/types/probes";

const SIGNAL_HEALTH_RISK_BINS = 18;
const SIGNAL_HEALTH_SILENCE_EPSILON = 0.000001;
const SIGNAL_HEALTH_DC_RISK_FULL_SCALE = 0.25;
const SIGNAL_HEALTH_AMPLITUDE_TO_DB_FACTOR = 20;
const SIGNAL_HEALTH_PEAK_RMS_RISK_REFERENCE_DB = 10;
const SIGNAL_HEALTH_PEAK_RMS_NO_SIGNAL_DB = 24;
const SIGNAL_HEALTH_HOT_LEVEL_RATIO = 0.76;
const SIGNAL_HEALTH_CLIP_LEVEL_RATIO = 0.9;
const SIGNAL_HEALTH_METER_RAIL_X = 7;
const SIGNAL_HEALTH_METER_RAIL_WIDTH = 13;
const SIGNAL_HEALTH_METER_FILL_X = 8.5;
const SIGNAL_HEALTH_METER_FILL_WIDTH = 10;
const SIGNAL_HEALTH_METER_THRESHOLD_LABEL_X = 21.5;
const SIGNAL_HEALTH_METER_THRESHOLD_LINE_START_X = 7;
const SIGNAL_HEALTH_METER_THRESHOLD_LINE_END_X = 20;
const SIGNAL_HEALTH_METER_RMS_LINE_START_X = 6.5;
const SIGNAL_HEALTH_METER_RMS_LINE_END_X = 20.5;
const SIGNAL_HEALTH_RISK_BADNESS_THRESHOLD = 0.55;
const SIGNAL_HEALTH_RISK_BAR_X_INSET = 0.25;
const SIGNAL_HEALTH_RISK_BAR_GAP = 0.5;
const SIGNAL_HEALTH_RISK_MIN_BAR_SIZE = 0.35;
const SIGNAL_HEALTH_RISK_BAR_RADIUS = 0.45;
const SIGNAL_HEALTH_RISK_TRACK_Y_OFFSET = 0.5;
const SIGNAL_HEALTH_RISK_TRACK_HEIGHT_INSET = 1;
const SIGNAL_HEALTH_RISK_GRAPH_LAYOUT = {
  compact: {
    graphX: 30,
    graphWidth: 62,
    rowHeight: 15
  },
  expanded: {
    graphX: 51,
    graphWidth: 38,
    rowHeight: 12,
    labelX: 34,
    labelYOffset: 7.5
  }
};

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

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
    const crestFactorDb =
      rms > SIGNAL_HEALTH_SILENCE_EPSILON
        ? SIGNAL_HEALTH_AMPLITUDE_TO_DB_FACTOR * Math.log10(Math.max(SIGNAL_HEALTH_SILENCE_EPSILON, peak / rms))
        : SIGNAL_HEALTH_PEAK_RMS_NO_SIGNAL_DB;
    crest.push(
      clamp01((SIGNAL_HEALTH_PEAK_RMS_RISK_REFERENCE_DB - crestFactorDb) / SIGNAL_HEALTH_PEAK_RMS_RISK_REFERENCE_DB)
    );
    rough.push(clamp01(deltaSum / Math.max(1, count - 1) / Math.max(SIGNAL_HEALTH_SILENCE_EPSILON, peak)));
    dc.push(clamp01(Math.abs(sum / count) / SIGNAL_HEALTH_DC_RISK_FULL_SCALE));
  }
  return { crest, rough, dc };
}

function RiskGraph(props: {
  label: string;
  title: string;
  values: number[];
  aggregate: number;
  y: number;
  compact?: boolean;
}) {
  const layout = props.compact ? SIGNAL_HEALTH_RISK_GRAPH_LAYOUT.compact : SIGNAL_HEALTH_RISK_GRAPH_LAYOUT.expanded;
  const graphX = layout.graphX;
  const graphWidth = layout.graphWidth;
  const trackY = props.y + SIGNAL_HEALTH_RISK_TRACK_Y_OFFSET;
  const trackHeight = layout.rowHeight - SIGNAL_HEALTH_RISK_TRACK_HEIGHT_INSET;
  const thresholdY = trackY + trackHeight - SIGNAL_HEALTH_RISK_BADNESS_THRESHOLD * trackHeight;
  const barWidth = graphWidth / Math.max(1, props.values.length);
  const tone = resolveRiskTone(props.aggregate);
  return (
    <g className={`signal-health-risk-row ${tone}`}>
      <title>{props.title}</title>
      {!props.compact && (
        <text
          x={SIGNAL_HEALTH_RISK_GRAPH_LAYOUT.expanded.labelX}
          y={props.y + SIGNAL_HEALTH_RISK_GRAPH_LAYOUT.expanded.labelYOffset}
          className="signal-health-risk-label"
        >
          {props.label}
        </text>
      )}
      <rect x={graphX} y={trackY} width={graphWidth} height={trackHeight} rx="2" className="signal-health-risk-track" />
      <rect
        x={graphX}
        y={trackY}
        width={graphWidth}
        height={Math.max(0, thresholdY - trackY)}
        rx="2"
        className="signal-health-risk-bad-zone"
      />
      <rect
        x={graphX}
        y={thresholdY}
        width={graphWidth}
        height={Math.max(0, trackY + trackHeight - thresholdY)}
        rx="2"
        className="signal-health-risk-ok-zone"
      />
      <line
        x1={graphX}
        y1={thresholdY}
        x2={graphX + graphWidth}
        y2={thresholdY}
        className="signal-health-risk-threshold"
      />
      {props.values.map((value, index) => {
        const normalizedValue = clamp01(value);
        const height = Math.max(SIGNAL_HEALTH_RISK_MIN_BAR_SIZE, normalizedValue * trackHeight);
        const barTone = resolveRiskTone(normalizedValue);
        return (
          <rect
            key={`${props.label}_${index}`}
            x={graphX + index * barWidth + SIGNAL_HEALTH_RISK_BAR_X_INSET}
            y={trackY + trackHeight - height}
            width={Math.max(SIGNAL_HEALTH_RISK_MIN_BAR_SIZE, barWidth - SIGNAL_HEALTH_RISK_BAR_GAP)}
            height={height}
            rx={SIGNAL_HEALTH_RISK_BAR_RADIUS}
            className={`signal-health-risk-fill ${barTone}`}
          />
        );
      })}
    </g>
  );
}

export function SignalHealthProbeGraph(props: { capture?: PreviewProbeCapture; compact?: boolean }) {
  const reactId = useId();
  const gradientId = buildSignalHealthGradientId(reactId);
  const stats = props.capture?.qualityStats;
  const status = resolveSignalHealthStatus(stats);
  const peakRatio = clamp01(stats?.peak ?? 0);
  const rmsRatio = clamp01(stats?.rms ?? 0);
  const roughRatio = clamp01(Math.max(stats?.roughness ?? 0, stats?.zeroCrossingRate ?? 0));
  const dcRatio = clamp01(Math.abs(stats?.dcOffset ?? 0) / SIGNAL_HEALTH_DC_RISK_FULL_SCALE);
  const crestRiskRatio =
    stats && status !== "blank"
      ? clamp01(
          (SIGNAL_HEALTH_PEAK_RMS_RISK_REFERENCE_DB - stats.crestFactorDb) / SIGNAL_HEALTH_PEAK_RMS_RISK_REFERENCE_DB
        )
      : 0;
  const riskSeries = buildSignalHealthRiskSeries(props.capture?.samples);
  const compact = Boolean(props.compact);
  const meterTop = compact ? 7 : 13;
  const meterBottom = compact ? 53 : 54;
  const meterHeight = meterBottom - meterTop;
  const meterFillY = meterBottom - peakRatio * meterHeight;
  const rmsY = meterBottom - rmsRatio * meterHeight;
  const hotY = meterBottom - meterHeight * SIGNAL_HEALTH_HOT_LEVEL_RATIO;
  const clipY = meterBottom - meterHeight * SIGNAL_HEALTH_CLIP_LEVEL_RATIO;
  const riskFrame = compact ? { x: 25, y: 4, width: 70, height: 55 } : { x: 29, y: 9, width: 66, height: 50 };
  const riskRows = compact ? [7, 25, 43] : [14, 30, 46];
  const statusClass = createSignalHealthGraphStatusClass({ compact: props.compact, status });

  return (
    <svg viewBox="0 0 100 60" preserveAspectRatio="none" className={statusClass}>
      <title>Signal level and quality-risk summary for the captured preview.</title>
      <defs>
        <linearGradient id={gradientId} x1="0" y1={meterBottom} x2="0" y2={meterTop} gradientUnits="userSpaceOnUse">
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
        <rect
          x={SIGNAL_HEALTH_METER_RAIL_X}
          y={meterTop}
          width={SIGNAL_HEALTH_METER_RAIL_WIDTH}
          height={meterHeight}
          rx="3"
          className="signal-health-rail"
        />
        <rect
          x={SIGNAL_HEALTH_METER_FILL_X}
          y={meterFillY}
          width={SIGNAL_HEALTH_METER_FILL_WIDTH}
          height={meterBottom - meterFillY}
          rx="2.5"
          className="signal-health-peak-fill"
          style={{ fill: `url(#${gradientId})` }}
        />
        <line
          x1={SIGNAL_HEALTH_METER_THRESHOLD_LINE_START_X}
          y1={hotY}
          x2={SIGNAL_HEALTH_METER_THRESHOLD_LINE_END_X}
          y2={hotY}
          className="signal-health-hot-line"
        />
        <line
          x1={SIGNAL_HEALTH_METER_THRESHOLD_LINE_START_X}
          y1={clipY}
          x2={SIGNAL_HEALTH_METER_THRESHOLD_LINE_END_X}
          y2={clipY}
          className="signal-health-clip-line"
        />
        <line
          x1={SIGNAL_HEALTH_METER_RMS_LINE_START_X}
          y1={rmsY}
          x2={SIGNAL_HEALTH_METER_RMS_LINE_END_X}
          y2={rmsY}
          className="signal-health-rms-marker"
        />
      </g>
      {!compact && (
        <>
          <text x="7" y="11" className="signal-health-label">
            peak
          </text>
          {stats && (
            <text x="13.5" y="7" textAnchor="middle" className="signal-health-readout">
              {formatDb(stats.peakDb)}
            </text>
          )}
          <text
            x={SIGNAL_HEALTH_METER_THRESHOLD_LABEL_X}
            y={clipY + 1.4}
            className="signal-health-threshold-label clip"
          >
            clip
          </text>
          <text x={SIGNAL_HEALTH_METER_THRESHOLD_LABEL_X} y={hotY + 1.4} className="signal-health-threshold-label">
            hot
          </text>
          <text
            x={SIGNAL_HEALTH_METER_THRESHOLD_LABEL_X}
            y={Math.max(29, Math.min(53, rmsY + 1.5))}
            className="signal-health-threshold-label rms"
          >
            rms
          </text>
        </>
      )}
      <text x="13.5" y="59" textAnchor="middle" className="signal-health-status">
        {formatSignalHealthStatusLabel(status)}
      </text>

      <g className="signal-health-risk-bars">
        <title>
          Risk graphs show peak/RMS spread, rough high-frequency movement, and DC offset over the captured preview.
        </title>
        <rect
          x={riskFrame.x}
          y={riskFrame.y}
          width={riskFrame.width}
          height={riskFrame.height}
          rx="4"
          className="signal-health-risk-frame"
        />
        {!compact && (
          <text x={riskFrame.x + 1} y="7" className="signal-health-label">
            risks
          </text>
        )}
        <RiskGraph
          label="peak/rms"
          title="Peak/RMS shows the gap between peak level and RMS level. High risk means peaks are not much higher than average energy, so the signal may sound dense, flattened, clipped, or over-limited."
          values={riskSeries.crest}
          aggregate={crestRiskRatio}
          y={riskRows[0]}
          compact={compact}
        />
        <RiskGraph
          label="rough"
          title="Rough tracks fast sample-to-sample movement. High risk can point to harsh distortion, zippering, or alias-like crunch."
          values={riskSeries.rough}
          aggregate={roughRatio}
          y={riskRows[1]}
          compact={compact}
        />
        <RiskGraph
          label="dc"
          title="DC shows sustained offset away from zero. High risk means the signal is biased positive or negative, reducing available level range and making downstream processors clip sooner."
          values={riskSeries.dc}
          aggregate={dcRatio}
          y={riskRows[2]}
          compact={compact}
        />
      </g>
    </svg>
  );
}

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
  PATCH_COLOR_PROBE_PLAYHEAD,
  PATCH_COLOR_PROBE_SCOPE_ENVELOPE_REGION,
  PATCH_COLOR_PROBE_SCOPE_TRACE,
  PATCH_COLOR_PROBE_SCOPE_WAVE_REGION
} from "@/components/patch/patchCanvasConstants";
import { buildScopeRenderData, resolveScopeGraphLayout, resolveScopeTimeMarkers } from "@/lib/patch/probeViewMath";
import { PreviewProbeCapture } from "@/types/probes";

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

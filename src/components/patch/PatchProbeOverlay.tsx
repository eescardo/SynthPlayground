"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  resolveNearestRectEdgePoint,
  resolvePatchConnectionAnchorPoint,
  resolvePatchConnectionMidpoint,
  resolvePatchPortAnchorPoint
} from "@/components/patch/patchCanvasGeometry";
import {
  PATCH_CANVAS_GRID,
  PATCH_COLOR_PROBE_CONNECTION,
  PATCH_COLOR_PROBE_CONNECTION_TARGET_FILL,
  PATCH_COLOR_PROBE_CONNECTION_TARGET_STROKE,
  PATCH_COLOR_PROBE_ENVELOPE_TRACE,
  PATCH_COLOR_PROBE_GRAPH_AXIS,
  PATCH_COLOR_PROBE_GRAPH_AXIS_STRONG,
  PATCH_COLOR_PROBE_GRAPH_BG,
  PATCH_COLOR_PROBE_GRAPH_FUTURE_MASK,
  PATCH_COLOR_PROBE_GRAPH_GRID,
  PATCH_COLOR_PROBE_GRAPH_REGION_A,
  PATCH_COLOR_PROBE_GRAPH_REGION_B,
  PATCH_COLOR_PROBE_PENDING_CONNECTION,
  PATCH_COLOR_PROBE_PENDING_TARGET_FILL,
  PATCH_COLOR_PROBE_PENDING_TARGET_STROKE,
  PATCH_COLOR_PROBE_PLAYHEAD,
  PATCH_COLOR_PROBE_SCOPE_TRACE
} from "@/components/patch/patchCanvasConstants";
import {
  buildProbeSpectrumFrameGrid,
  EXPANDED_PROBE_SIZE,
  resolveProbeFrequencyView,
  resolveProbeSpectrumCaptureFrameSize,
  resolveProbeSpectrumEffectiveMaxFrequencyHz,
  resolveProbeSpectrumMagnitudeColor
} from "@/lib/patch/probes";
import { clamp } from "@/lib/numeric";
import { detectMonophonicPitchNotes } from "@/lib/patch/pitchTracker";
import {
  buildScopeRenderData,
  formatSpectrumFrequency,
  formatScopeTimestamp,
  resolveScopeTimeMarkers,
  resolveSpectrumFrequencyMarkers,
  resolveSpectrumTimelineFillRatio,
  resolveSpectrumTimelineFrameIndex
} from "@/lib/patch/probeViewMath";
import { Patch, PatchLayoutNode } from "@/types/patch";
import { PatchWorkspaceProbeState, PreviewProbeCapture, PreviewProbeSpectrumFrames } from "@/types/probes";
import { PatchCanvasFocusable } from "@/lib/patch/hardwareNavigation";

interface PatchProbeOverlayProps {
  patch: Patch;
  layoutByNode: Map<string, PatchLayoutNode>;
  outputHostCanvasLeft: number;
  probes: PatchWorkspaceProbeState[];
  selectedProbeId?: string;
  previewCaptureByProbeId: Record<string, PreviewProbeCapture>;
  zoom: number;
  attachingProbeId?: string | null;
  keyboardFocus?: PatchCanvasFocusable | null;
  pendingProbePointer?: { x: number; y: number } | null;
  onSelectProbe: (probeId?: string) => void;
  onBeginProbeDrag: (probeId: string, clientX: number, clientY: number) => void;
  onStartAttachProbe: (probeId: string) => void;
  onUpdateSpectrumWindow: (probeId: string, spectrumWindowSize: number) => void;
  onToggleExpanded: (probeId: string) => void;
}

const PROBE_SPECTRUM_WINDOWS = [256, 512, 1024, 2048];
const PROBE_DRAG_THRESHOLD_PX = 6;
const SPECTRUM_MAX_DISPLAY_SECONDS = 4;
const SPECTRUM_STREAM_ROWS = 32;

function resolveNearestProbeEdgePoint(
  probe: PatchWorkspaceProbeState,
  zoom: number,
  targetPoint: { x: number; y: number }
) {
  const x = probe.x * PATCH_CANVAS_GRID;
  const y = probe.y * PATCH_CANVAS_GRID;
  const width = resolveRenderedProbeWidth(probe, zoom) / zoom;
  const height = resolveRenderedProbeHeight(probe, zoom) / zoom;
  return resolveNearestRectEdgePoint({ x, y, width, height }, targetPoint);
}

export function PatchProbeOverlay(props: PatchProbeOverlayProps) {
  const [fullSpectrumProbeId, setFullSpectrumProbeId] = useState<string | null>(null);
  const connectionLines = useMemo(
    () =>
      props.probes.flatMap((probe) => {
        if (!probe.target) {
          return [];
        }
        const renderedWidth = resolveRenderedProbeWidth(probe, props.zoom);
        const renderedHeight = resolveRenderedProbeHeight(probe, props.zoom);
        const probeReferencePoint = {
          x: probe.x * PATCH_CANVAS_GRID + renderedWidth / props.zoom,
          y: probe.y * PATCH_CANVAS_GRID + renderedHeight / props.zoom / 2
        };
        const targetPoint =
          probe.target.kind === "connection"
            ? (resolvePatchConnectionAnchorPoint(
                props.patch,
                props.layoutByNode,
                probe.target.connectionId,
                probeReferencePoint,
                props.outputHostCanvasLeft
              ) ??
              resolvePatchConnectionMidpoint(
                props.patch,
                props.layoutByNode,
                probe.target.connectionId,
                props.outputHostCanvasLeft
              ))
            : resolvePatchPortAnchorPoint(
                props.patch,
                props.layoutByNode,
                probe.target.nodeId,
                probe.target.portId,
                probe.target.portKind,
                props.outputHostCanvasLeft
              );
        if (!targetPoint) {
          return [];
        }
        const probeEdgePoint = resolveNearestProbeEdgePoint(probe, props.zoom, targetPoint);
        return [
          {
            id: probe.id,
            x1: probeEdgePoint.x * props.zoom,
            y1: probeEdgePoint.y * props.zoom,
            x2: targetPoint.x * props.zoom,
            y2: targetPoint.y * props.zoom,
            targetKind: probe.target.kind
          }
        ];
      }),
    [props.layoutByNode, props.outputHostCanvasLeft, props.patch, props.probes, props.zoom]
  );
  const pendingProbeLine = useMemo(() => {
    if (!props.attachingProbeId || !props.pendingProbePointer) {
      return null;
    }
    const probe = props.probes.find((entry) => entry.id === props.attachingProbeId);
    if (!probe) {
      return null;
    }
    const probeEdgePoint = resolveNearestProbeEdgePoint(probe, props.zoom, props.pendingProbePointer);
    return {
      x1: probeEdgePoint.x * props.zoom,
      y1: probeEdgePoint.y * props.zoom,
      x2: props.pendingProbePointer.x * props.zoom,
      y2: props.pendingProbePointer.y * props.zoom
    };
  }, [props.attachingProbeId, props.pendingProbePointer, props.probes, props.zoom]);

  return (
    <div className="patch-probe-overlay" style={{ width: "100%", height: "100%" }}>
      <svg className="patch-probe-connections" width="100%" height="100%">
        {connectionLines.map((line) => (
          <g key={line.id}>
            <line
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              stroke={PATCH_COLOR_PROBE_CONNECTION}
              strokeWidth={2}
              strokeDasharray="5 4"
            />
            <circle
              cx={line.x2}
              cy={line.y2}
              r={line.targetKind === "connection" ? 7 : 5}
              fill={PATCH_COLOR_PROBE_CONNECTION_TARGET_FILL}
              stroke={PATCH_COLOR_PROBE_CONNECTION_TARGET_STROKE}
              strokeWidth={2}
            />
          </g>
        ))}
        {pendingProbeLine && (
          <g>
            <line
              x1={pendingProbeLine.x1}
              y1={pendingProbeLine.y1}
              x2={pendingProbeLine.x2}
              y2={pendingProbeLine.y2}
              stroke={PATCH_COLOR_PROBE_PENDING_CONNECTION}
              strokeWidth={2}
              strokeDasharray="7 5"
            />
            <circle
              cx={pendingProbeLine.x2}
              cy={pendingProbeLine.y2}
              r={5}
              fill={PATCH_COLOR_PROBE_PENDING_TARGET_FILL}
              stroke={PATCH_COLOR_PROBE_PENDING_TARGET_STROKE}
              strokeWidth={1.5}
            />
          </g>
        )}
      </svg>

      {props.probes.map((probe) => {
        const capture = props.previewCaptureByProbeId[probe.id];
        return (
          <ProbeCard
            key={probe.id}
            probe={probe}
            capture={capture}
            zoom={props.zoom}
            selected={props.selectedProbeId === probe.id}
            attaching={props.attachingProbeId === probe.id}
            attachKeyboardFocused={
              props.keyboardFocus?.kind === "probe-action" &&
              props.keyboardFocus.probeId === probe.id &&
              props.keyboardFocus.actionId === "attach"
            }
            onSelectProbe={props.onSelectProbe}
            onBeginProbeDrag={props.onBeginProbeDrag}
            onStartAttachProbe={props.onStartAttachProbe}
            onUpdateSpectrumWindow={props.onUpdateSpectrumWindow}
            onToggleExpanded={props.onToggleExpanded}
            onOpenFullSpectrum={() => setFullSpectrumProbeId(probe.id)}
          />
        );
      })}
      {fullSpectrumProbeId && (
        <FullSpectrumModal
          capture={props.previewCaptureByProbeId[fullSpectrumProbeId]}
          probeName={props.probes.find((probe) => probe.id === fullSpectrumProbeId)?.name ?? "Spectrum Probe"}
          onClose={() => setFullSpectrumProbeId(null)}
        />
      )}
    </div>
  );
}

function ProbeCard(props: {
  probe: PatchWorkspaceProbeState;
  capture?: PreviewProbeCapture;
  zoom: number;
  selected: boolean;
  attaching: boolean;
  attachKeyboardFocused: boolean;
  onSelectProbe: (probeId?: string) => void;
  onBeginProbeDrag: (probeId: string, clientX: number, clientY: number) => void;
  onStartAttachProbe: (probeId: string) => void;
  onUpdateSpectrumWindow: (probeId: string, spectrumWindowSize: number) => void;
  onToggleExpanded: (probeId: string) => void;
  onOpenFullSpectrum: () => void;
}) {
  const gestureStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);
  const renderedWidth = resolveRenderedProbeWidth(props.probe, props.zoom);
  const renderedHeight = resolveRenderedProbeHeight(props.probe, props.zoom);

  useEffect(() => {
    return () => {
      gestureStateRef.current = null;
    };
  }, []);

  const beginGesture = (pointerId: number, clientX: number, clientY: number) => {
    gestureStateRef.current = { pointerId, startX: clientX, startY: clientY, moved: false };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const gesture = gestureStateRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId || gesture.moved) {
      return;
    }
    const distance = Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY);
    if (distance < PROBE_DRAG_THRESHOLD_PX) {
      return;
    }
    gesture.moved = true;
    props.onBeginProbeDrag(props.probe.id, gesture.startX, gesture.startY);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const gesture = gestureStateRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) {
      return;
    }
    gestureStateRef.current = null;
    if (!gesture.moved) {
      props.onToggleExpanded(props.probe.id);
    }
  };

  const handlePointerCancel = (event: React.PointerEvent<HTMLDivElement>) => {
    const gesture = gestureStateRef.current;
    if (gesture && gesture.pointerId === event.pointerId) {
      gestureStateRef.current = null;
    }
  };

  const spectrumElapsedSeconds =
    props.capture && props.probe.kind === "spectrum"
      ? (props.capture.sourceCapturedSamples ?? props.capture.capturedSamples * (props.capture.sampleStride ?? 1)) /
        Math.max(1, props.capture.sampleRate * (props.capture.sampleStride ?? 1))
      : 0;
  return (
    <div
      className={`patch-probe-card${props.selected ? " selected" : ""}${props.attaching ? " attaching" : ""}${props.probe.expanded ? " expanded" : ""}`}
      style={{
        left: `${props.probe.x * PATCH_CANVAS_GRID * props.zoom}px`,
        top: `${props.probe.y * PATCH_CANVAS_GRID * props.zoom}px`,
        width: `${renderedWidth}px`,
        height: `${renderedHeight}px`
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
        if ((event.target as HTMLElement | null)?.closest("button,select,label")) {
          return;
        }
        props.onSelectProbe(props.probe.id);
        beginGesture(event.pointerId, event.clientX, event.clientY);
      }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      <div className="patch-probe-card-header">
        <strong>{props.probe.name}</strong>
        <div className="patch-probe-header-actions">
          {props.probe.kind === "spectrum" && (
            <button
              type="button"
              className="patch-probe-attach-button patch-probe-full-spectrum-button"
              disabled={!props.capture?.finalSpectrum}
              hidden={!props.probe.expanded}
              onClick={(event) => {
                event.stopPropagation();
                props.onOpenFullSpectrum();
              }}
            >
              Full spectrum
            </button>
          )}
          <button
            type="button"
            className={`patch-probe-attach-button${props.attachKeyboardFocused ? " keyboard-focused" : ""}`}
            onClick={(event) => {
              event.stopPropagation();
              props.onStartAttachProbe(props.probe.id);
            }}
          >
            {props.attaching ? "Cancel" : "Attach"}
          </button>
        </div>
      </div>
      {props.attaching && (
        <div className="patch-probe-attach-tooltip" role="status">
          Click a port or wire to attach the selected probe.
        </div>
      )}
      <div className="patch-probe-card-body patch-probe-face-toggle">
        <ProbeGraphBody
          probe={props.probe}
          capture={props.capture}
          spectrumElapsedSeconds={spectrumElapsedSeconds}
          compact={!props.probe.expanded}
          onUpdateSpectrumWindow={props.onUpdateSpectrumWindow}
        />
      </div>
    </div>
  );
}

function ProbeGraphBody(props: {
  probe: PatchWorkspaceProbeState;
  capture?: PreviewProbeCapture;
  spectrumElapsedSeconds: number;
  compact?: boolean;
  onUpdateSpectrumWindow: (probeId: string, spectrumWindowSize: number) => void;
}) {
  if (props.probe.kind === "scope") {
    return <ScopeProbeGraph capture={props.capture} compact={props.compact} />;
  }
  if (props.probe.kind === "pitch_tracker") {
    return <PitchTrackerProbeGraph capture={props.capture} compact={props.compact} />;
  }
  return (
    <SpectrumProbeGraph
      capture={props.capture}
      elapsedSeconds={props.spectrumElapsedSeconds}
      selectedWindowSize={props.probe.spectrumWindowSize ?? 1024}
      maxFrequencyHz={resolveProbeFrequencyView(props.probe.frequencyView).maxHz}
      compact={props.compact}
      onChangeWindowSize={(next) => props.onUpdateSpectrumWindow(props.probe.id, next)}
    />
  );
}

function PitchTrackerProbeGraph(props: { capture?: PreviewProbeCapture; compact?: boolean }) {
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

function ScopeProbeGraph(props: { capture?: PreviewProbeCapture; compact?: boolean }) {
  const graphData = useMemo(() => buildScopeRenderData(props.capture, props.compact), [props.capture, props.compact]);

  const timeMarkers = useMemo(
    () => resolveScopeTimeMarkers(graphData.durationSeconds, props.compact),
    [graphData.durationSeconds, props.compact]
  );

  const futureMaskX = (props.compact ? 2 : 8) + graphData.capturedRatio * (props.compact ? 97 : 90);
  const futureMaskWidth = Math.max(0, (props.compact ? 99 : 98) - futureMaskX);
  const playheadX = (props.compact ? 2 : 8) + graphData.capturedRatio * (props.compact ? 97 : 90);

  return (
    <svg viewBox="0 0 100 60" className="patch-probe-graph">
      <rect x="0" y="0" width="100" height="60" fill={PATCH_COLOR_PROBE_GRAPH_BG} rx="6" />
      <rect
        x={props.compact ? 2 : 8}
        y="6"
        width={props.compact ? 97 : 90}
        height="22"
        fill={PATCH_COLOR_PROBE_GRAPH_REGION_A}
        rx="4"
      />
      <rect
        x={props.compact ? 2 : 8}
        y="33"
        width={props.compact ? 97 : 90}
        height="21"
        fill={PATCH_COLOR_PROBE_GRAPH_REGION_B}
        rx="4"
      />
      {timeMarkers.map((marker) => (
        <line
          key={marker.ratio}
          x1={marker.x}
          y1="6"
          x2={marker.x}
          y2="54"
          stroke={PATCH_COLOR_PROBE_GRAPH_GRID}
          strokeWidth="0.35"
          shapeRendering="crispEdges"
        />
      ))}
      <line
        x1={props.compact ? 2 : 8}
        y1="17"
        x2="98"
        y2="17"
        stroke={PATCH_COLOR_PROBE_GRAPH_AXIS_STRONG}
        strokeWidth="0.45"
        shapeRendering="crispEdges"
      />
      <line
        x1={props.compact ? 2 : 8}
        y1="33"
        x2="98"
        y2="33"
        stroke={PATCH_COLOR_PROBE_GRAPH_AXIS}
        strokeWidth="0.35"
        shapeRendering="crispEdges"
      />
      <line
        x1={props.compact ? 2 : 8}
        y1="54"
        x2="98"
        y2="54"
        stroke={PATCH_COLOR_PROBE_GRAPH_AXIS}
        strokeWidth="0.35"
        shapeRendering="crispEdges"
      />
      {graphData.capturedRatio < 1 && (
        <rect x={futureMaskX} y="6" width={futureMaskWidth} height="48" fill={PATCH_COLOR_PROBE_GRAPH_FUTURE_MASK} />
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
        y1="6"
        x2={playheadX}
        y2="54"
        stroke={PATCH_COLOR_PROBE_PLAYHEAD}
        strokeWidth="0.7"
        shapeRendering="crispEdges"
      />
      {!props.compact && graphData.peak > 0 && (
        <>
          <text x="0.8" y="8.5" className="patch-probe-axis-label">
            Wave
          </text>
          <text x="0.8" y="14" className="patch-probe-axis-label">{`+${graphData.peak.toFixed(3)}`}</text>
          <text x="0.8" y="18.5" className="patch-probe-axis-label">
            0
          </text>
          <text x="0.8" y="24" className="patch-probe-axis-label">{`-${graphData.peak.toFixed(3)}`}</text>
          <text x="0.8" y="36.5" className="patch-probe-axis-label">
            Env
          </text>
          <text x="0.8" y="40.5" className="patch-probe-axis-label">
            1.0
          </text>
          <text x="0.8" y="54" className="patch-probe-axis-label">
            0
          </text>
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

function SpectrumProbeGraph(props: {
  capture?: PreviewProbeCapture;
  elapsedSeconds: number;
  selectedWindowSize: number;
  maxFrequencyHz: number;
  compact?: boolean;
  onChangeWindowSize: (windowSize: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const effectiveMaxFrequencyHz = resolveProbeSpectrumEffectiveMaxFrequencyHz(
    props.maxFrequencyHz,
    props.capture?.spectrumFrames?.sampleRate ?? props.capture?.sampleRate ?? 48000
  );
  const frequencyMarkers = useMemo(
    () => resolveSpectrumFrequencyMarkers(effectiveMaxFrequencyHz),
    [effectiveMaxFrequencyHz]
  );
  const displaySpectrogram = useMemo(() => {
    const finalSpectrum = !props.compact ? props.capture?.finalSpectrum : undefined;
    const rows = finalSpectrum ? 128 : SPECTRUM_STREAM_ROWS;
    const viewportColumns = finalSpectrum ? 512 : props.compact ? 240 : 320;
    if (!props.capture) {
      return [];
    }

    if (finalSpectrum) {
      return buildFinalSpectrumDisplay(finalSpectrum, rows, viewportColumns, effectiveMaxFrequencyHz);
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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }
    const width = props.compact ? 240 : 320;
    const height = props.compact ? 144 : 192;
    const devicePixelRatio = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * devicePixelRatio);
    canvas.height = Math.round(height * devicePixelRatio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    context.clearRect(0, 0, width, height);
    context.fillStyle = PATCH_COLOR_PROBE_GRAPH_BG;
    context.fillRect(0, 0, width, height);

    const rows = displaySpectrogram.length;
    const columns = displaySpectrogram[0]?.length ?? 0;
    if (!rows || !columns) {
      return;
    }

    const cellWidth = width / columns;
    const cellHeight = height / rows;
    for (let rowIndex = 0; rowIndex < rows; rowIndex += 1) {
      const row = displaySpectrogram[rowIndex] ?? [];
      for (let columnIndex = 0; columnIndex < columns; columnIndex += 1) {
        const value = row[columnIndex] ?? 0;
        context.fillStyle = resolveProbeSpectrumMagnitudeColor(value);
        context.fillRect(
          columnIndex * cellWidth,
          height - (rowIndex + 1) * cellHeight,
          Math.ceil(cellWidth + 1),
          Math.ceil(cellHeight + 1)
        );
      }
    }
  }, [displaySpectrogram, props.compact]);

  return (
    <div className="patch-probe-spectrum-shell">
      <div className="patch-probe-spectrogram-frame">
        <canvas ref={canvasRef} className="patch-probe-spectrogram-canvas" />
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
            <span className="patch-probe-spectrogram-axis patch-probe-spectrogram-axis-high">High</span>
            <span className="patch-probe-spectrogram-axis patch-probe-spectrogram-axis-low">Low</span>
            <span className="patch-probe-spectrogram-axis patch-probe-spectrogram-axis-time">Time</span>
          </>
        )}
      </div>
      {!props.compact && (
        <label className="patch-probe-window-label">
          Window
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

function FullSpectrumModal(props: { capture?: PreviewProbeCapture; probeName: string; onClose: () => void }) {
  const finalSpectrum = props.capture?.finalSpectrum;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const maxFrequencyHz = resolveProbeSpectrumEffectiveMaxFrequencyHz(
    finalSpectrum?.binFrequencies.at(-1) ?? 24000,
    finalSpectrum?.sampleRate ?? 48000
  );
  const frequencyMarkers = useMemo(() => resolveSpectrumFrequencyMarkers(maxFrequencyHz), [maxFrequencyHz]);
  const durationSeconds = finalSpectrum ? finalSpectrum.capturedSamples / Math.max(1, finalSpectrum.sampleRate) : 0;
  const timeMarkers = useMemo(
    () => [0, 0.5, 1].map((ratio) => ({ ratio, label: formatScopeTimestamp(durationSeconds * ratio) })),
    [durationSeconds]
  );
  const rowCount = finalSpectrum?.columns[0]?.length ?? 0;
  const columnCount = finalSpectrum?.columns.length ?? 0;
  const imageWidth = Math.max(720, columnCount * 2);
  const imageHeight = Math.max(320, rowCount * 3);

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
      return;
    }
    const cellWidth = imageWidth / columnCount;
    const cellHeight = imageHeight / rowCount;
    for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
      const column = finalSpectrum.columns[columnIndex] ?? [];
      for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
        const value = column[rowIndex] ?? 0;
        context.fillStyle = resolveProbeSpectrumMagnitudeColor(value);
        context.fillRect(
          columnIndex * cellWidth,
          imageHeight - (rowIndex + 1) * cellHeight,
          Math.ceil(cellWidth + 1),
          Math.ceil(cellHeight + 1)
        );
      }
    }
  }, [columnCount, finalSpectrum, imageHeight, imageWidth, rowCount]);

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
                {finalSpectrum.columns.length} x {finalSpectrum.requestedFrequencyBins} /{" "}
                {formatScopeTimestamp(durationSeconds)}
              </span>
            )}
          </div>
          <button type="button" className="patch-probe-attach-button" onClick={props.onClose}>
            Close
          </button>
        </div>
        <div className="patch-probe-full-spectrum-scroll">
          <div className="patch-probe-full-spectrum-axis-y">
            {frequencyMarkers.map((marker) => (
              <span key={marker.frequency} style={{ bottom: `${marker.bottomPercent}%` }}>
                {formatSpectrumFrequency(marker.frequency)}
              </span>
            ))}
          </div>
          <div className="patch-probe-full-spectrum-image-wrap">
            <canvas ref={canvasRef} className="patch-probe-full-spectrum-canvas" />
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

function buildSpectrumFramesDisplay(
  spectrumFrames: PreviewProbeSpectrumFrames,
  rows: number,
  viewportColumns: number,
  viewportSeconds: number,
  maxFrequencyHz: number
) {
  const display = Array.from({ length: rows }, () => new Array(viewportColumns).fill(0));
  const visibleFrameCount = Math.max(
    1,
    Math.min(
      spectrumFrames.columns.length,
      Math.ceil((viewportSeconds * spectrumFrames.sampleRate) / spectrumFrames.frameSize)
    )
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
    const column = spectrumFrames.columns[frameIndex];
    if (!column) {
      continue;
    }
    for (let rowIndex = 0; rowIndex < rows; rowIndex += 1) {
      display[rowIndex][columnIndex] = column[rowBinIndices[rowIndex] ?? 0] ?? 0;
    }
  }

  return display;
}

function buildFinalSpectrumDisplay(
  finalSpectrum: NonNullable<PreviewProbeCapture["finalSpectrum"]>,
  rows: number,
  viewportColumns: number,
  maxFrequencyHz: number
) {
  const display = Array.from({ length: rows }, () => new Array(viewportColumns).fill(0));
  if (finalSpectrum.columns.length <= 0 || rows <= 0 || viewportColumns <= 0) {
    return display;
  }
  const rowBinIndices = Array.from({ length: rows }, (_, rowIndex) => {
    const rowRatio = (rowIndex + 0.5) / rows;
    const targetFrequency = Math.pow(rowRatio, 2) * maxFrequencyHz;
    return resolveNearestSpectrumBinIndex(finalSpectrum.binFrequencies, targetFrequency);
  });

  for (let columnIndex = 0; columnIndex < viewportColumns; columnIndex += 1) {
    const ratio = viewportColumns <= 1 ? 0 : columnIndex / (viewportColumns - 1);
    const sourceColumnIndex = clamp(
      Math.round(ratio * (finalSpectrum.columns.length - 1)),
      0,
      finalSpectrum.columns.length - 1
    );
    const column = finalSpectrum.columns[sourceColumnIndex];
    if (!column) {
      continue;
    }
    for (let rowIndex = 0; rowIndex < rows; rowIndex += 1) {
      display[rowIndex][columnIndex] = column[rowBinIndices[rowIndex] ?? 0] ?? 0;
    }
  }

  return display;
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

function resolveRenderedProbeWidth(probe: PatchWorkspaceProbeState, zoom: number) {
  return probe.expanded ? EXPANDED_PROBE_SIZE.width : probe.width * PATCH_CANVAS_GRID * zoom;
}

function resolveRenderedProbeHeight(probe: PatchWorkspaceProbeState, zoom: number) {
  return probe.expanded ? EXPANDED_PROBE_SIZE.height : probe.height * PATCH_CANVAS_GRID * zoom;
}

"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  resolvePatchConnectionMidpoint,
  resolvePatchPortAnchorPoint
} from "@/components/patch/patchCanvasGeometry";
import { PATCH_CANVAS_GRID } from "@/components/patch/patchCanvasConstants";
import {
  buildProbeSpectrogram,
  EXPANDED_PROBE_SIZE,
  resolveProbeFrequencyView,
} from "@/lib/patch/probes";
import { detectMonophonicPitchNotes } from "@/lib/patch/pitchTracker";
import {
  buildScopeRenderData,
  formatSpectrumFrequency,
  resolveScopeTimeMarkers,
  resolveSpectrumFrequencyMarkers
} from "@/lib/patch/probeViewMath";
import { Patch, PatchLayoutNode } from "@/types/patch";
import { PatchWorkspaceProbeState, PreviewProbeCapture } from "@/types/probes";

interface PatchProbeOverlayProps {
  patch: Patch;
  layoutByNode: Map<string, PatchLayoutNode>;
  probes: PatchWorkspaceProbeState[];
  selectedProbeId?: string;
  previewCaptureByProbeId: Record<string, PreviewProbeCapture>;
  previewProgress: number;
  zoom: number;
  attachingProbeId?: string | null;
  onSelectProbe: (probeId?: string) => void;
  onBeginProbeDrag: (probeId: string, clientX: number, clientY: number) => void;
  onStartAttachProbe: (probeId: string) => void;
  onUpdateSpectrumWindow: (probeId: string, spectrumWindowSize: number) => void;
  onToggleExpanded: (probeId: string) => void;
}

const PROBE_SPECTRUM_WINDOWS = [256, 512, 1024, 2048];
const PROBE_DRAG_THRESHOLD_PX = 6;

export function PatchProbeOverlay(props: PatchProbeOverlayProps) {
  const connectionLines = useMemo(
    () =>
      props.probes.flatMap((probe) => {
        if (!probe.target) {
          return [];
        }
        const targetPoint =
          probe.target.kind === "connection"
            ? resolvePatchConnectionMidpoint(props.patch, props.layoutByNode, probe.target.connectionId)
            : resolvePatchPortAnchorPoint(
                props.patch,
                props.layoutByNode,
                probe.target.nodeId,
                probe.target.portId,
                probe.target.portKind
              );
        if (!targetPoint) {
          return [];
        }
        const renderedWidth = resolveRenderedProbeWidth(probe, props.zoom);
        const renderedHeight = resolveRenderedProbeHeight(probe, props.zoom);
        return [{
          id: probe.id,
          x1: probe.x * PATCH_CANVAS_GRID * props.zoom + renderedWidth,
          y1: probe.y * PATCH_CANVAS_GRID * props.zoom + renderedHeight * 0.5,
          x2: targetPoint.x * props.zoom,
          y2: targetPoint.y * props.zoom,
          targetKind: probe.target.kind
        }];
      }),
    [props.layoutByNode, props.patch, props.probes, props.zoom]
  );

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
              stroke="rgba(200, 255, 57, 0.85)"
              strokeWidth={2}
              strokeDasharray="5 4"
            />
            <circle
              cx={line.x2}
              cy={line.y2}
              r={line.targetKind === "connection" ? 7 : 5}
              fill="rgba(200, 255, 57, 0.22)"
              stroke="rgba(200, 255, 57, 0.95)"
              strokeWidth={2}
            />
          </g>
        ))}
      </svg>

      {props.probes.map((probe) => {
        const capture = props.previewCaptureByProbeId[probe.id];
        return (
          <ProbeCard
            key={probe.id}
            probe={probe}
            capture={capture}
            previewProgress={props.previewProgress}
            zoom={props.zoom}
            selected={props.selectedProbeId === probe.id}
            attaching={props.attachingProbeId === probe.id}
            onSelectProbe={props.onSelectProbe}
            onBeginProbeDrag={props.onBeginProbeDrag}
            onStartAttachProbe={props.onStartAttachProbe}
            onUpdateSpectrumWindow={props.onUpdateSpectrumWindow}
            onToggleExpanded={props.onToggleExpanded}
          />
        );
      })}
    </div>
  );
}

function ProbeCard(props: {
  probe: PatchWorkspaceProbeState;
  capture?: PreviewProbeCapture;
  previewProgress: number;
  zoom: number;
  selected: boolean;
  attaching: boolean;
  onSelectProbe: (probeId?: string) => void;
  onBeginProbeDrag: (probeId: string, clientX: number, clientY: number) => void;
  onStartAttachProbe: (probeId: string) => void;
  onUpdateSpectrumWindow: (probeId: string, spectrumWindowSize: number) => void;
  onToggleExpanded: (probeId: string) => void;
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

  const spectrogram = useMemo(
    () =>
      props.capture && props.probe.kind === "spectrum"
        ? buildProbeSpectrogram(
            props.capture.samples,
            props.probe.spectrumWindowSize ?? 1024,
            props.probe.expanded ? 54 : 28,
            props.probe.expanded ? 30 : 18,
            props.capture.durationSamples,
            props.capture.capturedSamples,
            props.capture.sampleRate,
            resolveProbeFrequencyView(props.probe.frequencyView).maxHz
          )
        : [],
    [
      props.capture,
      props.probe.kind,
      props.probe.spectrumWindowSize,
      props.probe.frequencyView,
      props.probe.expanded
    ]
  );

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
        <button
          type="button"
          className="patch-probe-attach-button"
          onClick={(event) => {
            event.stopPropagation();
            props.onStartAttachProbe(props.probe.id);
          }}
        >
          {props.attaching ? "Cancel" : "Attach"}
        </button>
      </div>
      <div className="patch-probe-card-body patch-probe-face-toggle">
        <ProbeGraphBody
          probe={props.probe}
          capture={props.capture}
          previewProgress={props.previewProgress}
          spectrogram={spectrogram}
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
  previewProgress: number;
  spectrogram: number[][];
  compact?: boolean;
  onUpdateSpectrumWindow: (probeId: string, spectrumWindowSize: number) => void;
}) {
  if (props.probe.kind === "scope") {
    return <ScopeProbeGraph capture={props.capture} progress={props.previewProgress} compact={props.compact} />;
  }
  if (props.probe.kind === "pitch_tracker") {
    return <PitchTrackerProbeGraph capture={props.capture} compact={props.compact} />;
  }
  return (
    <SpectrumProbeGraph
      spectrogram={props.spectrogram}
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

function ScopeProbeGraph(props: { capture?: PreviewProbeCapture; progress: number; compact?: boolean }) {
  const graphData = useMemo(() => buildScopeRenderData(props.capture, props.compact), [props.capture, props.compact]);

  const timeMarkers = useMemo(
    () => resolveScopeTimeMarkers(graphData.durationSeconds, props.compact),
    [graphData.durationSeconds, props.compact]
  );

  const futureMaskX = (props.compact ? 2 : 8) + graphData.capturedRatio * (props.compact ? 97 : 90);
  const futureMaskWidth = Math.max(0, (props.compact ? 99 : 98) - futureMaskX);
  const playheadX = (props.compact ? 2 : 8) + props.progress * (props.compact ? 97 : 90);

  return (
    <svg viewBox="0 0 100 60" className="patch-probe-graph">
      <rect x="0" y="0" width="100" height="60" fill="rgba(10, 18, 28, 0.9)" rx="6" />
      <rect x={props.compact ? 2 : 8} y="6" width={props.compact ? 97 : 90} height="22" fill="rgba(255, 255, 255, 0.015)" rx="4" />
      <rect x={props.compact ? 2 : 8} y="33" width={props.compact ? 97 : 90} height="21" fill="rgba(255, 255, 255, 0.012)" rx="4" />
      {timeMarkers.map((marker) => (
        <line
          key={marker.ratio}
          x1={marker.x}
          y1="6"
          x2={marker.x}
          y2="54"
          stroke="rgba(140, 179, 213, 0.1)"
          strokeWidth="0.35"
          shapeRendering="crispEdges"
        />
      ))}
      <line x1={props.compact ? 2 : 8} y1="17" x2="98" y2="17" stroke="rgba(140, 179, 213, 0.22)" strokeWidth="0.45" shapeRendering="crispEdges" />
      <line x1={props.compact ? 2 : 8} y1="33" x2="98" y2="33" stroke="rgba(140, 179, 213, 0.18)" strokeWidth="0.35" shapeRendering="crispEdges" />
      <line x1={props.compact ? 2 : 8} y1="54" x2="98" y2="54" stroke="rgba(140, 179, 213, 0.18)" strokeWidth="0.35" shapeRendering="crispEdges" />
      {graphData.capturedRatio < 1 && (
        <rect
          x={futureMaskX}
          y="6"
          width={futureMaskWidth}
          height="48"
          fill="rgba(6, 12, 18, 0.42)"
        />
      )}
      {graphData.waveformSegments.map((segment) => (
        <line
          key={`wave_${segment.x}`}
          x1={segment.x}
          y1={segment.y1}
          x2={segment.x}
          y2={segment.y2}
          stroke="rgba(163, 219, 255, 0.95)"
          strokeWidth="0.42"
          shapeRendering="crispEdges"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {graphData.envelopeLine && (
        <polyline
          points={graphData.envelopeLine}
          fill="none"
          stroke="rgba(200, 255, 57, 0.96)"
          strokeWidth="0.58"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      )}
      <line x1={playheadX} y1="6" x2={playheadX} y2="54" stroke="rgba(200, 255, 57, 0.85)" strokeWidth="0.7" shapeRendering="crispEdges" />
      {!props.compact && graphData.peak > 0 && (
        <>
          <text x="0.8" y="8.5" className="patch-probe-axis-label">Wave</text>
          <text x="0.8" y="14" className="patch-probe-axis-label">{`+${graphData.peak.toFixed(3)}`}</text>
          <text x="0.8" y="18.5" className="patch-probe-axis-label">0</text>
          <text x="0.8" y="24" className="patch-probe-axis-label">{`-${graphData.peak.toFixed(3)}`}</text>
          <text x="0.8" y="36.5" className="patch-probe-axis-label">Env</text>
          <text x="0.8" y="40.5" className="patch-probe-axis-label">1.0</text>
          <text x="0.8" y="54" className="patch-probe-axis-label">0</text>
          {timeMarkers.map((marker) => (
            <text key={`time_${marker.ratio}`} x={marker.x} y="59" textAnchor={marker.ratio === 0 ? "start" : marker.ratio === 1 ? "end" : "middle"} className="patch-probe-axis-label">
              {marker.label}
            </text>
          ))}
        </>
      )}
    </svg>
  );
}

function SpectrumProbeGraph(props: {
  spectrogram: number[][];
  selectedWindowSize: number;
  maxFrequencyHz: number;
  compact?: boolean;
  onChangeWindowSize: (windowSize: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frequencyMarkers = useMemo(
    () => resolveSpectrumFrequencyMarkers(props.maxFrequencyHz),
    [props.maxFrequencyHz]
  );

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
    context.fillStyle = "rgba(10, 18, 28, 0.9)";
    context.fillRect(0, 0, width, height);

    const rows = props.spectrogram.length;
    const columns = props.spectrogram[0]?.length ?? 0;
    if (!rows || !columns) {
      return;
    }

    const cellWidth = width / columns;
    const cellHeight = height / rows;
    for (let rowIndex = 0; rowIndex < rows; rowIndex += 1) {
      const row = props.spectrogram[rowIndex] ?? [];
      for (let columnIndex = 0; columnIndex < columns; columnIndex += 1) {
        const value = row[columnIndex] ?? 0;
        const alpha = Math.max(0.03, Math.min(0.96, value * 0.95));
        context.fillStyle = `rgba(255, 214, 145, ${alpha})`;
        context.fillRect(
          columnIndex * cellWidth,
          height - (rowIndex + 1) * cellHeight,
          Math.ceil(cellWidth + 1),
          Math.ceil(cellHeight + 1)
        );
      }
    }
  }, [props.compact, props.spectrogram]);

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

function resolveRenderedProbeWidth(probe: PatchWorkspaceProbeState, zoom: number) {
  return probe.expanded ? EXPANDED_PROBE_SIZE.width : probe.width * PATCH_CANVAS_GRID * zoom;
}

function resolveRenderedProbeHeight(probe: PatchWorkspaceProbeState, zoom: number) {
  return probe.expanded ? EXPANDED_PROBE_SIZE.height : probe.height * PATCH_CANVAS_GRID * zoom;
}

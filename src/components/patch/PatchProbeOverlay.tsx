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
  normalizeProbeSamples,
  resolveProbePeakAmplitude
} from "@/lib/patch/probes";
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
            props.capture.capturedSamples
          )
        : [],
    [
      props.capture,
      props.probe.kind,
      props.probe.spectrumWindowSize,
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
  return (
    <SpectrumProbeGraph
      spectrogram={props.spectrogram}
      selectedWindowSize={props.probe.spectrumWindowSize ?? 1024}
      compact={props.compact}
      onChangeWindowSize={(next) => props.onUpdateSpectrumWindow(props.probe.id, next)}
    />
  );
}

function ScopeProbeGraph(props: { capture?: PreviewProbeCapture; progress: number; compact?: boolean }) {
  const graphData = useMemo(() => {
    const durationSamples = props.capture?.durationSamples ?? 0;
    const capturedSamples = props.capture?.capturedSamples ?? 0;
    if (!props.capture?.samples?.length || durationSamples <= 0) {
      return { centerLine: "", envelopePath: "", peak: 0, capturedRatio: 0 };
    }
    const visibleSamples = props.capture.samples.slice(0, capturedSamples);
    const normalized = normalizeProbeSamples(visibleSamples);
    const bucketCount = props.compact ? 72 : 120;
    const centerPoints: string[] = [];
    const upperPoints: string[] = [];
    const lowerPoints: string[] = [];
    for (let bucket = 0; bucket < bucketCount; bucket += 1) {
      const bucketStart = Math.floor((bucket / bucketCount) * durationSamples);
      const bucketEnd = Math.max(bucketStart + 1, Math.floor(((bucket + 1) / bucketCount) * durationSamples));
      const x = (bucket / Math.max(1, bucketCount - 1)) * 100;
      if (bucketStart >= capturedSamples) {
        continue;
      }
      const normalizedStart = Math.floor((bucketStart / Math.max(1, capturedSamples)) * normalized.length);
      const normalizedEnd = Math.max(
        normalizedStart + 1,
        Math.floor((Math.min(bucketEnd, capturedSamples) / Math.max(1, capturedSamples)) * normalized.length)
      );
      let min = 1;
      let max = -1;
      for (let index = normalizedStart; index < normalizedEnd; index += 1) {
        const sample = normalized[index] ?? 0;
        min = Math.min(min, sample);
        max = Math.max(max, sample);
      }
      centerPoints.push(`${x},${50 - ((min + max) * 0.5) * 22}`);
      upperPoints.push(`${x},${50 - max * 24}`);
      lowerPoints.push(`${x},${50 - min * 24}`);
    }
    return {
      centerLine: centerPoints.join(" "),
      envelopePath: upperPoints.length > 1 ? `${upperPoints.join(" ")} ${[...lowerPoints].reverse().join(" ")}` : "",
      peak: resolveProbePeakAmplitude(visibleSamples),
      capturedRatio: capturedSamples / Math.max(1, durationSamples)
    };
  }, [props.capture, props.compact]);

  return (
    <svg viewBox="0 0 100 60" className="patch-probe-graph">
      <rect x="0" y="0" width="100" height="60" fill="rgba(10, 18, 28, 0.9)" rx="6" />
      <line x1="0" y1="6" x2="100" y2="6" stroke="rgba(140, 179, 213, 0.16)" strokeWidth="0.8" />
      <line x1="0" y1="30" x2="100" y2="30" stroke="rgba(140, 179, 213, 0.22)" strokeWidth="1" />
      <line x1="0" y1="54" x2="100" y2="54" stroke="rgba(140, 179, 213, 0.16)" strokeWidth="0.8" />
      {graphData.capturedRatio < 1 && (
        <rect
          x={Math.max(0, graphData.capturedRatio * 100)}
          y="0"
          width={Math.max(0, 100 - graphData.capturedRatio * 100)}
          height="60"
          fill="rgba(6, 12, 18, 0.3)"
        />
      )}
      {graphData.envelopePath && <polygon points={graphData.envelopePath} fill="rgba(151, 214, 255, 0.16)" />}
      {graphData.centerLine && (
        <polyline points={graphData.centerLine} fill="none" stroke="rgba(151, 214, 255, 0.95)" strokeWidth="1.6" />
      )}
      <rect x={Math.max(0, Math.min(98, props.progress * 100 - 1))} y="0" width="2" height="60" fill="rgba(200, 255, 57, 0.9)" />
      {!props.compact && graphData.peak > 0 && (
        <>
          <text x="2" y="7.5" className="patch-probe-axis-label">{`+${graphData.peak.toFixed(3)}`}</text>
          <text x="2" y="31.5" className="patch-probe-axis-label">0</text>
          <text x="2" y="55.5" className="patch-probe-axis-label">{`-${graphData.peak.toFixed(3)}`}</text>
        </>
      )}
    </svg>
  );
}

function SpectrumProbeGraph(props: {
  spectrogram: number[][];
  selectedWindowSize: number;
  compact?: boolean;
  onChangeWindowSize: (windowSize: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

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

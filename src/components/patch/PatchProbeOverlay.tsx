"use client";

import { useMemo } from "react";
import {
  resolvePatchConnectionMidpoint,
  resolvePatchPortAnchorPoint
} from "@/components/patch/patchCanvasGeometry";
import { PATCH_CANVAS_GRID } from "@/components/patch/patchCanvasConstants";
import {
  buildSpectrumBins,
  EXPANDED_PROBE_SIZE,
  normalizeProbeSamples
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
  canvasSize: { width: number; height: number };
  attachingProbeId?: string | null;
  onSelectProbe: (probeId?: string) => void;
  onBeginProbeDrag: (probeId: string, clientX: number, clientY: number) => void;
  onStartAttachProbe: (probeId: string) => void;
  onUpdateSpectrumWindow: (probeId: string, spectrumWindowSize: number) => void;
  onToggleExpanded: (probeId: string) => void;
}

const PROBE_SPECTRUM_WINDOWS = [256, 512, 1024, 2048];
const PROBE_EXPANDED_MARGIN = 16;

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
        return [{
          id: probe.id,
          x1: (probe.x * PATCH_CANVAS_GRID + probe.width * PATCH_CANVAS_GRID) * props.zoom,
          y1: (probe.y * PATCH_CANVAS_GRID + probe.height * PATCH_CANVAS_GRID * 0.5) * props.zoom,
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
            canvasSize={props.canvasSize}
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
  canvasSize: { width: number; height: number };
  selected: boolean;
  attaching: boolean;
  onSelectProbe: (probeId?: string) => void;
  onBeginProbeDrag: (probeId: string, clientX: number, clientY: number) => void;
  onStartAttachProbe: (probeId: string) => void;
  onUpdateSpectrumWindow: (probeId: string, spectrumWindowSize: number) => void;
  onToggleExpanded: (probeId: string) => void;
}) {
  const spectrumBins = props.capture && props.probe.kind === "spectrum"
    ? buildSpectrumBins(
        props.capture.samples,
        props.probe.spectrumWindowSize ?? 1024,
        32,
        props.previewProgress,
        props.capture.durationSamples,
        props.capture.capturedSamples
      )
    : [];
  const expandedRect = resolveExpandedProbeRect(props.probe, props.zoom, props.canvasSize);

  return (
    <>
      <div
        className={`patch-probe-card${props.selected ? " selected" : ""}${props.attaching ? " attaching" : ""}`}
        style={{
          left: `${props.probe.x * PATCH_CANVAS_GRID * props.zoom}px`,
          top: `${props.probe.y * PATCH_CANVAS_GRID * props.zoom}px`,
          width: `${props.probe.width * PATCH_CANVAS_GRID * props.zoom}px`,
          height: `${props.probe.height * PATCH_CANVAS_GRID * props.zoom}px`
        }}
        onPointerDown={(event) => {
          event.stopPropagation();
          props.onSelectProbe(props.probe.id);
          props.onBeginProbeDrag(props.probe.id, event.clientX, event.clientY);
        }}
      >
        <div className="patch-probe-card-header">
          <strong>{props.probe.name}</strong>
          <div className="patch-probe-card-actions">
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
            <button
              type="button"
              className="patch-probe-expand-button"
              onClick={(event) => {
                event.stopPropagation();
                props.onToggleExpanded(props.probe.id);
              }}
            >
              {props.probe.expanded ? "Collapse" : "Expand"}
            </button>
          </div>
        </div>
        <div className="patch-probe-card-body">
          <ProbeGraphBody
            probe={props.probe}
            capture={props.capture}
            previewProgress={props.previewProgress}
            spectrumBins={spectrumBins}
            compact
            onUpdateSpectrumWindow={props.onUpdateSpectrumWindow}
          />
        </div>
      </div>

      {props.probe.expanded && (
        <div
          className={`patch-probe-popover${props.selected ? " selected" : ""}`}
          style={{
            left: `${expandedRect.x}px`,
            top: `${expandedRect.y}px`,
            width: `${expandedRect.width}px`,
            height: `${expandedRect.height}px`
          }}
          onPointerDown={(event) => {
            event.stopPropagation();
            props.onSelectProbe(props.probe.id);
          }}
        >
          <div className="patch-probe-popover-header">
            <strong>{props.probe.name}</strong>
            <div className="patch-probe-card-actions">
              <button type="button" onClick={() => props.onStartAttachProbe(props.probe.id)}>
                {props.attaching ? "Cancel Attach" : "Attach"}
              </button>
              <button type="button" onClick={() => props.onToggleExpanded(props.probe.id)}>
                Collapse
              </button>
            </div>
          </div>
          <div className="patch-probe-popover-body">
            <ProbeGraphBody
              probe={props.probe}
              capture={props.capture}
              previewProgress={props.previewProgress}
              spectrumBins={spectrumBins}
              onUpdateSpectrumWindow={props.onUpdateSpectrumWindow}
            />
          </div>
        </div>
      )}
    </>
  );
}

function ProbeGraphBody(props: {
  probe: PatchWorkspaceProbeState;
  capture?: PreviewProbeCapture;
  previewProgress: number;
  spectrumBins: number[];
  compact?: boolean;
  onUpdateSpectrumWindow: (probeId: string, spectrumWindowSize: number) => void;
}) {
  if (props.probe.kind === "scope") {
    return <ScopeProbeGraph capture={props.capture} progress={props.previewProgress} />;
  }
  return (
    <SpectrumProbeGraph
      bins={props.spectrumBins}
      selectedWindowSize={props.probe.spectrumWindowSize ?? 1024}
      compact={props.compact}
      onChangeWindowSize={(next) => props.onUpdateSpectrumWindow(props.probe.id, next)}
    />
  );
}

function ScopeProbeGraph(props: { capture?: PreviewProbeCapture; progress: number }) {
  const graphData = useMemo(() => {
    const sampleCount = props.capture?.capturedSamples ?? props.capture?.samples.length ?? 0;
    if (!props.capture?.samples?.length || sampleCount <= 0) {
      return { centerLine: "", envelopePath: "" };
    }
    const normalized = normalizeProbeSamples(props.capture.samples.slice(0, sampleCount));
    const bucketCount = 96;
    const centerPoints = [];
    const upperPoints = [];
    const lowerPoints = [];
    for (let bucket = 0; bucket < bucketCount; bucket += 1) {
      const start = Math.floor((bucket / bucketCount) * normalized.length);
      const end = Math.max(start + 1, Math.floor(((bucket + 1) / bucketCount) * normalized.length));
      let min = 1;
      let max = -1;
      for (let index = start; index < end; index += 1) {
        const sample = normalized[index] ?? 0;
        min = Math.min(min, sample);
        max = Math.max(max, sample);
      }
      const x = (bucket / Math.max(1, bucketCount - 1)) * 100;
      centerPoints.push(`${x},${50 - ((min + max) * 0.5) * 22}`);
      upperPoints.push(`${x},${50 - max * 24}`);
      lowerPoints.push(`${x},${50 - min * 24}`);
    }
    return {
      centerLine: centerPoints.join(" "),
      envelopePath: `${upperPoints.join(" ")} ${[...lowerPoints].reverse().join(" ")}`
    };
  }, [props.capture]);

  return (
    <svg viewBox="0 0 100 60" className="patch-probe-graph">
      <rect x="0" y="0" width="100" height="60" fill="rgba(10, 18, 28, 0.9)" rx="6" />
      <line x1="0" y1="30" x2="100" y2="30" stroke="rgba(140, 179, 213, 0.18)" strokeWidth="1" />
      {graphData.envelopePath && <polygon points={graphData.envelopePath} fill="rgba(151, 214, 255, 0.16)" />}
      {graphData.centerLine && (
        <polyline points={graphData.centerLine} fill="none" stroke="rgba(151, 214, 255, 0.95)" strokeWidth="1.8" />
      )}
      <rect x={Math.max(0, Math.min(98, props.progress * 100 - 1))} y="0" width="2" height="60" fill="rgba(200, 255, 57, 0.9)" />
    </svg>
  );
}

function SpectrumProbeGraph(props: {
  bins: number[];
  selectedWindowSize: number;
  compact?: boolean;
  onChangeWindowSize: (windowSize: number) => void;
}) {
  return (
    <div className="patch-probe-spectrum-shell">
      <svg viewBox="0 0 100 60" className="patch-probe-graph">
        <rect x="0" y="0" width="100" height="60" fill="rgba(10, 18, 28, 0.9)" rx="6" />
        {props.bins.map((value, index) => {
          const width = 100 / Math.max(1, props.bins.length);
          const height = Math.max(2, value * 54);
          return (
            <rect
              key={index}
              x={index * width + 0.6}
              y={58 - height}
              width={Math.max(1, width - 1.2)}
              height={height}
              fill="rgba(255, 214, 145, 0.92)"
            />
          );
        })}
      </svg>
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

function resolveExpandedProbeRect(
  probe: PatchWorkspaceProbeState,
  zoom: number,
  canvasSize: { width: number; height: number }
) {
  const cardLeft = probe.x * PATCH_CANVAS_GRID * zoom;
  const cardTop = probe.y * PATCH_CANVAS_GRID * zoom;
  const cardWidth = probe.width * PATCH_CANVAS_GRID * zoom;
  const cardHeight = probe.height * PATCH_CANVAS_GRID * zoom;
  const width = Math.min(EXPANDED_PROBE_SIZE.width, canvasSize.width * zoom - PROBE_EXPANDED_MARGIN * 2);
  const height = Math.min(EXPANDED_PROBE_SIZE.height, canvasSize.height * zoom - PROBE_EXPANDED_MARGIN * 2);
  const centeredX = cardLeft + cardWidth * 0.5 - width * 0.5;
  const preferredTop = cardTop - height - 12;
  const fallbackTop = cardTop + cardHeight + 12;
  return {
    x: Math.max(PROBE_EXPANDED_MARGIN, Math.min(canvasSize.width * zoom - width - PROBE_EXPANDED_MARGIN, centeredX)),
    y: Math.max(
      PROBE_EXPANDED_MARGIN,
      Math.min(
        canvasSize.height * zoom - height - PROBE_EXPANDED_MARGIN,
        preferredTop >= PROBE_EXPANDED_MARGIN ? preferredTop : fallbackTop
      )
    ),
    width,
    height
  };
}

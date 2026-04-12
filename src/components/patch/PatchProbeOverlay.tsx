"use client";

import { useMemo } from "react";
import {
  resolvePatchConnectionMidpoint,
  resolvePatchPortAnchorPoint
} from "@/components/patch/patchCanvasGeometry";
import { PATCH_CANVAS_GRID } from "@/components/patch/patchCanvasConstants";
import { buildSpectrumBins } from "@/lib/patch/probes";
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
  onSelectProbe: (probeId?: string) => void;
  onBeginProbeDrag: (probeId: string, clientX: number, clientY: number) => void;
  onStartAttachProbe: (probeId: string) => void;
  onUpdateSpectrumWindow: (probeId: string, spectrumWindowSize: number) => void;
}

const PROBE_SPECTRUM_WINDOWS = [256, 512, 1024, 2048];

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
            <circle cx={line.x2} cy={line.y2} r={line.targetKind === "connection" ? 7 : 5} fill="rgba(200, 255, 57, 0.22)" stroke="rgba(200, 255, 57, 0.95)" strokeWidth={2} />
          </g>
        ))}
      </svg>

      {props.probes.map((probe) => {
        const capture = props.previewCaptureByProbeId[probe.id];
        const spectrumBins = capture && probe.kind === "spectrum"
          ? buildSpectrumBins(capture.samples, probe.spectrumWindowSize ?? 1024)
          : [];
        return (
          <div
            key={probe.id}
            className={`patch-probe-card${props.selectedProbeId === probe.id ? " selected" : ""}`}
            style={{
              left: `${probe.x * PATCH_CANVAS_GRID * props.zoom}px`,
              top: `${probe.y * PATCH_CANVAS_GRID * props.zoom}px`,
              width: `${probe.width * PATCH_CANVAS_GRID * props.zoom}px`,
              height: `${probe.height * PATCH_CANVAS_GRID * props.zoom}px`
            }}
            onPointerDown={(event) => {
              event.stopPropagation();
              props.onSelectProbe(probe.id);
              props.onBeginProbeDrag(probe.id, event.clientX, event.clientY);
            }}
          >
            <div className="patch-probe-card-header">
              <strong>{probe.name}</strong>
              <button
                type="button"
                className="patch-probe-attach-button"
                onClick={(event) => {
                  event.stopPropagation();
                  props.onStartAttachProbe(probe.id);
                }}
              >
                Attach
              </button>
            </div>
            <div className="patch-probe-card-body">
              {probe.kind === "scope" ? (
                <ScopeProbeGraph capture={capture} progress={props.previewProgress} />
              ) : (
                <SpectrumProbeGraph
                  bins={spectrumBins}
                  selectedWindowSize={probe.spectrumWindowSize ?? 1024}
                  onChangeWindowSize={(next) => props.onUpdateSpectrumWindow(probe.id, next)}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ScopeProbeGraph(props: { capture?: PreviewProbeCapture; progress: number }) {
  const points = useMemo(() => {
    if (!props.capture?.samples?.length) {
      return "";
    }
    const bucketCount = 72;
    const pointsRaw = [];
    for (let bucket = 0; bucket < bucketCount; bucket += 1) {
      const start = Math.floor((bucket / bucketCount) * props.capture.samples.length);
      const end = Math.max(start + 1, Math.floor(((bucket + 1) / bucketCount) * props.capture.samples.length));
      let min = 1;
      let max = -1;
      for (let index = start; index < end; index += 1) {
        const sample = props.capture.samples[index] ?? 0;
        min = Math.min(min, sample);
        max = Math.max(max, sample);
      }
      pointsRaw.push({
        x: (bucket / Math.max(1, bucketCount - 1)) * 100,
        y: 50 - ((min + max) * 0.5) * 38
      });
    }
    return pointsRaw.map((point) => `${point.x},${point.y}`).join(" ");
  }, [props.capture]);

  return (
    <svg viewBox="0 0 100 60" className="patch-probe-graph">
      <rect x="0" y="0" width="100" height="60" fill="rgba(10, 18, 28, 0.9)" rx="6" />
      <line x1="0" y1="30" x2="100" y2="30" stroke="rgba(140, 179, 213, 0.18)" strokeWidth="1" />
      {points && <polyline points={points} fill="none" stroke="rgba(151, 214, 255, 0.95)" strokeWidth="1.8" />}
      <rect x={Math.max(0, Math.min(98, props.progress * 100 - 1))} y="0" width="2" height="60" fill="rgba(200, 255, 57, 0.9)" />
    </svg>
  );
}

function SpectrumProbeGraph(props: {
  bins: number[];
  selectedWindowSize: number;
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
    </div>
  );
}

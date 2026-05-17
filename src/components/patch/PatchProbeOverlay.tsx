"use client";

import { useMemo, useState } from "react";
import { FullSpectrumModal } from "@/components/patch/FullSpectrumModal";
import { ProbeCard } from "@/components/patch/ProbeCard";
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
  PATCH_COLOR_PROBE_PENDING_CONNECTION,
  PATCH_COLOR_PROBE_PENDING_TARGET_FILL,
  PATCH_COLOR_PROBE_PENDING_TARGET_STROKE
} from "@/components/patch/patchCanvasConstants";
import { resolveRenderedProbeHeight, resolveRenderedProbeWidth } from "@/components/patch/patchProbeLayout";
import { PatchCanvasFocusable } from "@/lib/patch/hardwareNavigation";
import { Patch, PatchLayoutNode } from "@/types/patch";
import { PatchWorkspaceProbeState, PreviewProbeCapture } from "@/types/probes";

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

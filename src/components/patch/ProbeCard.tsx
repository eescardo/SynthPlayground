"use client";

import { useEffect, useRef } from "react";
import { PATCH_CANVAS_GRID } from "@/components/patch/patchCanvasConstants";
import { PitchTrackerProbeGraph, ScopeProbeGraph } from "@/components/patch/ProbeGraphs";
import { SpectrumProbeGraph } from "@/components/patch/SpectrumProbeGraph";
import { resolveRenderedProbeHeight, resolveRenderedProbeWidth } from "@/components/patch/patchProbeLayout";
import { resolveProbeFrequencyView } from "@/lib/patch/probes";
import { PatchWorkspaceProbeState, PreviewProbeCapture } from "@/types/probes";

const PROBE_DRAG_THRESHOLD_PX = 6;

export function ProbeCard(props: {
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
      className={`patch-probe-card ${props.probe.kind}${props.selected ? " selected" : ""}${props.attaching ? " attaching" : ""}${props.probe.expanded ? " expanded" : ""}`}
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
              disabled={!props.capture?.finalSpectrum?.complete}
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

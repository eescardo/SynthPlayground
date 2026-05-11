"use client";

import { CSSProperties, useMemo } from "react";
import { PATCH_HOST_STRIP_X } from "@/components/patch/patchCanvasConstants";
import {
  HitPort,
  resolveHostPatchPortLabel,
  resolveHostPatchPortRect,
  resolveHostPatchPortTint,
  resolveOutputHostPatchPortRect
} from "@/components/patch/patchCanvasGeometry";
import { HOST_PORT_IDS, HostPatchPortId, SOURCE_HOST_PORT_IDS } from "@/lib/patch/constants";
import { getPatchOutputInputPortId, getPatchOutputPort } from "@/lib/patch/ports";
import { Patch } from "@/types/patch";

interface HostOverlayPort {
  nodeId: HostPatchPortId;
  label: string;
  hitPort: HitPort;
  pointer: { x: number; y: number };
  style: CSSProperties;
}

interface PatchHostPortOverlayProps {
  outputHostCanvasLeft: number;
  outputHostScreenLeft: number;
  patch: Patch;
  pendingFromPort: HitPort | null;
  pendingProbeId?: string | null;
  scrollLeft: number;
  scrollTop: number;
  structureLocked?: boolean;
  zoom: number;
  onPortSelection: (hitPort: HitPort, pointer: { x: number; y: number }) => void;
  onPortHover: (hitPort: HitPort | null, pointer: { x: number; y: number } | null) => void;
  onSelectOutput: () => void;
}

function resolveOverlayPorts(
  patch: Patch,
  outputHostCanvasLeft: number,
  outputHostScreenLeft: number,
  scrollLeft: number,
  scrollTop: number,
  zoom: number
): HostOverlayPort[] {
  const sourcePorts: HostOverlayPort[] = SOURCE_HOST_PORT_IDS.map((nodeId): HostOverlayPort | null => {
    const rect = resolveHostPatchPortRect(nodeId);
    if (!rect) {
      return null;
    }
    const hitPort: HitPort = {
      nodeId,
      portId: "out",
      kind: "out",
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height
    };
    const tint = resolveHostPatchPortTint(nodeId);
    return {
      nodeId,
      label: resolveHostPatchPortLabel(nodeId),
      hitPort,
      pointer: {
        x: (scrollLeft + PATCH_HOST_STRIP_X) / zoom,
        y: rect.y
      },
      style: {
        "--patch-host-port-bg": tint.fill,
        "--patch-host-port-border": tint.stroke,
        "--patch-host-port-text": tint.text,
        left: `${PATCH_HOST_STRIP_X - rect.width}px`,
        top: `${rect.y * zoom - scrollTop - rect.height / 2}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`
      } as CSSProperties
    };
  }).filter((entry): entry is HostOverlayPort => entry !== null);
  const outputPort = getPatchOutputPort(patch);
  if (!outputPort) {
    return sourcePorts;
  }
  const outputRect = resolveOutputHostPatchPortRect(outputHostCanvasLeft);
  const outputTint = resolveHostPatchPortTint(HOST_PORT_IDS.output);
  return [
    ...sourcePorts,
    {
      nodeId: HOST_PORT_IDS.output,
      label: resolveHostPatchPortLabel(HOST_PORT_IDS.output),
      hitPort: {
        nodeId: outputPort.id,
        portId: getPatchOutputInputPortId(patch),
        kind: "in",
        x: outputRect.x,
        y: outputRect.y,
        width: outputRect.width,
        height: outputRect.height
      },
      pointer: {
        x: (scrollLeft + outputHostScreenLeft) / zoom,
        y: outputRect.y
      },
      style: {
        "--patch-host-port-bg": outputTint.fill,
        "--patch-host-port-border": outputTint.stroke,
        "--patch-host-port-text": outputTint.text,
        left: `${outputHostScreenLeft}px`,
        top: `${outputRect.y * zoom - scrollTop - outputRect.height / 2}px`,
        width: `${outputRect.width}px`,
        height: `${outputRect.height}px`
      } as CSSProperties
    }
  ];
}

export function PatchHostPortOverlay(props: PatchHostPortOverlayProps) {
  const ports = useMemo(
    () =>
      resolveOverlayPorts(
        props.patch,
        props.outputHostCanvasLeft,
        props.outputHostScreenLeft,
        props.scrollLeft,
        props.scrollTop,
        props.zoom
      ),
    [props.outputHostCanvasLeft, props.outputHostScreenLeft, props.patch, props.scrollLeft, props.scrollTop, props.zoom]
  );

  return (
    <div className="patch-host-port-layer">
      {ports.map((port) => (
        <button
          key={port.nodeId}
          type="button"
          className={`patch-host-port${props.pendingFromPort?.nodeId === port.nodeId ? " pending" : ""}${
            props.structureLocked ? " locked" : ""
          }`}
          style={port.style}
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (props.pendingProbeId) {
              props.onPortSelection(port.hitPort, port.pointer);
              return;
            }
            if (props.structureLocked) {
              return;
            }
            if (port.hitPort.kind === "in" && !props.pendingFromPort && !props.pendingProbeId) {
              props.onSelectOutput();
              return;
            }
            props.onPortSelection(port.hitPort, port.pointer);
          }}
          onPointerEnter={() => props.onPortHover(port.hitPort, port.pointer)}
          onPointerMove={() => props.onPortHover(port.hitPort, port.pointer)}
          onPointerLeave={() => props.onPortHover(null, null)}
        >
          {port.label}
        </button>
      ))}
    </div>
  );
}

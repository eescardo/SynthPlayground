"use client";

import { CSSProperties, useMemo } from "react";
import { PATCH_HOST_STRIP_X } from "@/components/patch/patchCanvasConstants";
import {
  HitPort,
  resolveHostPatchPortLabel,
  resolveHostPatchPortRect,
  resolveHostPatchPortTint
} from "@/components/patch/patchCanvasGeometry";
import { HostNodeId, SOURCE_HOST_NODE_IDS } from "@/lib/patch/constants";

interface HostOverlayPort {
  nodeId: HostNodeId;
  label: string;
  hitPort: HitPort;
  style: CSSProperties;
}

interface PatchHostPortOverlayProps {
  pendingFromPort: HitPort | null;
  scrollTop: number;
  zoom: number;
  onPortSelection: (hitPort: HitPort, pointer: { x: number; y: number }) => void;
  onPortHover: (hitPort: HitPort | null, pointer: { x: number; y: number } | null) => void;
}

function resolveOverlayPorts(scrollTop: number, zoom: number): HostOverlayPort[] {
  return SOURCE_HOST_NODE_IDS.map((nodeId) => {
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
}

function resolveHostPortPointer(hitPort: HitPort) {
  return {
    x: hitPort.x + hitPort.width,
    y: hitPort.y
  };
}

export function PatchHostPortOverlay(props: PatchHostPortOverlayProps) {
  const ports = useMemo(() => resolveOverlayPorts(props.scrollTop, props.zoom), [props.scrollTop, props.zoom]);

  return (
    <div className="patch-host-port-layer">
      {ports.map((port) => (
        <button
          key={port.nodeId}
          type="button"
          className={`patch-host-port${props.pendingFromPort?.nodeId === port.nodeId ? " pending" : ""}`}
          style={port.style}
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            props.onPortSelection(port.hitPort, resolveHostPortPointer(port.hitPort));
          }}
          onPointerEnter={() => props.onPortHover(port.hitPort, resolveHostPortPointer(port.hitPort))}
          onPointerMove={() => props.onPortHover(port.hitPort, resolveHostPortPointer(port.hitPort))}
          onPointerLeave={() => props.onPortHover(null, null)}
        >
          {port.label}
        </button>
      ))}
    </div>
  );
}

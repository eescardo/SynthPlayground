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
import { SOURCE_HOST_NODE_IDS } from "@/lib/patch/constants";
import { Patch } from "@/types/patch";

interface HostOverlayPort {
  nodeId: string;
  label: string;
  hitPort: HitPort;
  style: CSSProperties;
}

interface PatchHostPortOverlayProps {
  outputHostRightEdge: number;
  patch: Patch;
  pendingFromPort: HitPort | null;
  scrollLeft: number;
  scrollTop: number;
  zoom: number;
  onPortSelection: (hitPort: HitPort, pointer: { x: number; y: number }) => void;
  onPortHover: (hitPort: HitPort | null, pointer: { x: number; y: number } | null) => void;
  onSelectOutput: () => void;
}

function resolveOverlayPorts(patch: Patch, outputHostRightEdge: number, scrollLeft: number, scrollTop: number, zoom: number): HostOverlayPort[] {
  const sourcePorts: HostOverlayPort[] = SOURCE_HOST_NODE_IDS.map((nodeId): HostOverlayPort | null => {
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
  const outputNode = patch.nodes.find((node) => node.id === patch.io.audioOutNodeId);
  if (!outputNode) {
    return sourcePorts;
  }
  const outputRect = resolveOutputHostPatchPortRect(outputHostRightEdge);
  const outputTint = resolveHostPatchPortTint("$host.output");
  return [
    ...sourcePorts,
    {
      nodeId: "$host.output",
      label: resolveHostPatchPortLabel("$host.output"),
      hitPort: {
        nodeId: outputNode.id,
        portId: patch.io.audioOutPortId,
        kind: "in",
        x: outputRect.x,
        y: outputRect.y,
        width: outputRect.width,
        height: outputRect.height
      },
      style: {
        "--patch-host-port-bg": outputTint.fill,
        "--patch-host-port-border": outputTint.stroke,
        "--patch-host-port-text": outputTint.text,
        left: `${outputRect.x * zoom - scrollLeft - outputRect.width}px`,
        top: `${outputRect.y * zoom - scrollTop - outputRect.height / 2}px`,
        width: `${outputRect.width}px`,
        height: `${outputRect.height}px`
      } as CSSProperties
    }
  ];
}

function resolveHostPortPointer(hitPort: HitPort) {
  return {
    x: hitPort.kind === "in" ? hitPort.x : hitPort.x + hitPort.width,
    y: hitPort.y
  };
}

export function PatchHostPortOverlay(props: PatchHostPortOverlayProps) {
  const ports = useMemo(
    () => resolveOverlayPorts(props.patch, props.outputHostRightEdge, props.scrollLeft, props.scrollTop, props.zoom),
    [props.outputHostRightEdge, props.patch, props.scrollLeft, props.scrollTop, props.zoom]
  );

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
            if (port.hitPort.kind === "in" && !props.pendingFromPort) {
              props.onSelectOutput();
              return;
            }
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

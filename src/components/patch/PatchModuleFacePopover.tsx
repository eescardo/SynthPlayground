"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PatchEditorToolbar } from "@/components/patch/PatchEditorToolbar";
import { PatchProbeOverlay } from "@/components/patch/PatchProbeOverlay";
import {
  PATCH_ATTACH_CURSOR_CLOSED,
  PATCH_ATTACH_CURSOR_OPEN,
  PATCH_CANVAS_GRID,
  PATCH_MOVE_CURSOR,
  PATCH_MOVE_CURSOR_ACTIVE
} from "@/components/patch/patchCanvasConstants";
import {
  resolvePatchConnectionMidpoint,
  resolvePatchCanvasSize,
  resolvePatchDiagramSize,
  resolvePatchFacePopoverRect,
  resolvePatchPortAnchorPoint
} from "@/components/patch/patchCanvasGeometry";
import { createId } from "@/lib/ids";
import { resolveAutoLayoutNodes } from "@/lib/patch/autoLayout";
import { makeConnectOp } from "@/lib/patch/ops";
import { usePatchCanvasInteractions } from "@/hooks/patch/usePatchCanvasInteractions";
import { usePatchCanvasZoom } from "@/hooks/patch/usePatchCanvasZoom";
import { usePatchModuleFacePopover } from "@/hooks/patch/usePatchModuleFacePopover";
import { Patch, PatchLayoutNode } from "@/types/patch";
import { PatchOp } from "@/types/ops";
import { PatchProbeTarget, PatchWorkspaceProbeState, PreviewProbeCapture } from "@/types/probes";

interface PatchModuleFacePopoverProps {
  patch: Patch;
  probes: PatchWorkspaceProbeState[];
  selectedProbeId?: string;
  previewCaptureByProbeId: Record<string, PreviewProbeCapture>;
  previewProgress: number;
  selectedNodeId?: string;
  selectedMacroNodeIds: Set<string>;
  structureLocked?: boolean;
  onApplyOp: (op: PatchOp) => void;
  onAddProbe: (kind: PatchWorkspaceProbeState["kind"]) => void;
  onMoveProbe: (probeId: string, x: number, y: number) => void;
  onSelectProbe: (probeId?: string) => void;
  onUpdateProbeTarget: (probeId: string, target?: PatchProbeTarget) => void;
  onUpdateProbeSpectrumWindow: (probeId: string, spectrumWindowSize: number) => void;
  onToggleProbeExpanded: (probeId: string) => void;
  onDeleteSelectedProbe: () => void;
  onSelectNode: (nodeId?: string) => void;
  attachingProbeId?: string | null;
  onToggleAttachProbe: (probeId: string) => void;
  onCancelAttachProbe: () => void;
}

export function PatchModuleFacePopover(props: PatchModuleFacePopoverProps) {
  const {
    onAddProbe,
    onApplyOp,
    onDeleteSelectedProbe,
    onMoveProbe,
    onSelectNode,
    onSelectProbe,
    onToggleAttachProbe,
    onCancelAttachProbe,
    onToggleProbeExpanded,
    onUpdateProbeSpectrumWindow,
    onUpdateProbeTarget,
    patch,
    previewCaptureByProbeId,
    previewProgress,
    probes,
    selectedMacroNodeIds,
    selectedNodeId,
    selectedProbeId,
    structureLocked,
    attachingProbeId
  } = props;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [newNodeType, setNewNodeType] = useState("VCO");
  const [dragProbe, setDragProbe] = useState<{ probeId: string; offsetX: number; offsetY: number } | null>(null);
  const layoutByNode = useMemo(() => {
    return new Map(patch.layout.nodes.map((node) => [node.nodeId, node] as const));
  }, [patch.layout.nodes]);
  const nodeById = useMemo(() => new Map(patch.nodes.map((node) => [node.id, node] as const)), [patch.nodes]);
  const canvasSize = useMemo(() => resolvePatchCanvasSize(patch.layout.nodes), [patch.layout.nodes]);
  const diagramSize = useMemo(() => resolvePatchDiagramSize(patch.layout.nodes), [patch.layout.nodes]);

  const handleZoomChange = useCallback((zoom: number) => {
    onApplyOp({ type: "setCanvasZoom", zoom });
  }, [onApplyOp]);

  const { zoom } = usePatchCanvasZoom({
    canvasSize,
    fitSize: diagramSize,
    onZoomChange: handleZoomChange,
    patchId: patch.id,
    rootRef,
    savedZoom: patch.ui.canvasZoom,
    scrollRef
  });

  const getFacePopoverRect = useCallback((nodeId: string) => resolvePatchFacePopoverRect(nodeId, layoutByNode, canvasSize), [canvasSize, layoutByNode]);
  const nodeExists = useCallback((nodeId: string) => nodeById.has(nodeId), [nodeById]);
  const {
    handleCanvasPointerDown,
    popoverNodeId,
    togglePopoverForNode
  } = usePatchModuleFacePopover({
    getPopoverRect: getFacePopoverRect,
    nodeExists
  });

  const {
    dragNodeId,
    hoveredNodeId,
    pendingFromPort,
    hoveredAttachTarget,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    setHoveredNodeId
  } = usePatchCanvasInteractions({
    canvasRef,
    canvasSize,
    facePopoverNodeId: popoverNodeId,
    getFacePopoverRect,
    layoutByNode,
    nodeById,
    patch,
    selectedMacroNodeIds,
    selectedNodeId,
    pendingProbeId: attachingProbeId,
    structureLocked,
    onApplyOp,
    onSelectNode,
    onAttachProbeTarget: (target) => {
      if (attachingProbeId) {
        onUpdateProbeTarget(attachingProbeId, target);
        onCancelAttachProbe();
      }
    },
    onCancelProbeAttach: onCancelAttachProbe,
    makeConnectOp,
    handleFacePopoverPointerDown: handleCanvasPointerDown,
    togglePopoverForNode
  });

  useEffect(() => {
    if (!dragProbe) {
      return;
    }
    const handlePointerMove = (event: PointerEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
      const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
      const rawX = (event.clientX - rect.left) * scaleX;
      const rawY = (event.clientY - rect.top) * scaleY;
      onMoveProbe(
        dragProbe.probeId,
        Math.max(0, Math.round((rawX - dragProbe.offsetX) / PATCH_CANVAS_GRID)),
        Math.max(0, Math.round((rawY - dragProbe.offsetY) / PATCH_CANVAS_GRID))
      );
    };
    const handlePointerUp = () => setDragProbe(null);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [dragProbe, onMoveProbe]);

  const beginProbeDrag = useCallback((probeId: string, clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    const probe = probes.find((entry) => entry.id === probeId);
    if (!canvas || !probe) {
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
    const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
    const rawX = (clientX - rect.left) * scaleX;
    const rawY = (clientY - rect.top) * scaleY;
    setDragProbe({
      probeId,
      offsetX: rawX - probe.x * PATCH_CANVAS_GRID,
      offsetY: rawY - probe.y * PATCH_CANVAS_GRID
    });
  }, [probes]);

  return (
    <div className="patch-canvas-stage" ref={rootRef}>
      <PatchEditorToolbar
        newNodeType={newNodeType}
        structureLocked={structureLocked}
        patchNodeCount={patch.nodes.length}
        selectedNodeId={selectedNodeId}
        selectedProbeId={selectedProbeId}
        pendingFromPort={Boolean(pendingFromPort)}
        pendingProbeId={attachingProbeId}
        zoom={zoom}
        onChangeNewNodeType={setNewNodeType}
        onAddNode={() => {
          if (structureLocked) {
            return;
          }
          const nodeId = createId("node");
          onApplyOp({
            type: "addNode",
            typeId: newNodeType,
            nodeId,
            layoutPos: { x: 3, y: 3 }
          });
          onSelectNode(nodeId);
        }}
        onAddProbe={onAddProbe}
        onDeleteSelected={() =>
          selectedNodeId && !structureLocked && onApplyOp({ type: "removeNode", nodeId: selectedNodeId })
        }
        onDeleteSelectedProbe={onDeleteSelectedProbe}
        onAutoLayout={() => {
          const nextNodeLayout = resolveAutoLayoutNodes(patch);
          onApplyOp({
            type: "setNodeLayout",
            nodes: nextNodeLayout
          });
          const nextLayoutByNode = new Map(nextNodeLayout.map((node) => [node.nodeId, node] as const));
          resolveAutoLayoutProbePositions(patch, probes, nextLayoutByNode).forEach((probe) => {
            onMoveProbe(probe.id, probe.x, probe.y);
          });
        }}
      />

      <div className="patch-canvas-shell">
        <div className="patch-canvas-scroll" ref={scrollRef}>
          <div className="patch-canvas-overlay-shell" style={{ width: `${canvasSize.width * zoom}px`, height: `${canvasSize.height * zoom}px` }}>
            <canvas
              ref={canvasRef}
              width={canvasSize.width}
              height={canvasSize.height}
              style={{
                width: `${canvasSize.width * zoom}px`,
                height: `${canvasSize.height * zoom}px`,
                cursor:
                  attachingProbeId
                    ? hoveredAttachTarget
                      ? PATCH_ATTACH_CURSOR_CLOSED
                      : PATCH_ATTACH_CURSOR_OPEN
                    : dragNodeId
                      ? PATCH_MOVE_CURSOR_ACTIVE
                      : hoveredNodeId
                        ? PATCH_MOVE_CURSOR
                        : "default"
              }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={(event) => {
                onPointerUp(event);
                setHoveredNodeId(null);
              }}
            />
            <PatchProbeOverlay
              patch={patch}
              layoutByNode={layoutByNode}
              probes={probes}
              selectedProbeId={selectedProbeId}
              previewCaptureByProbeId={previewCaptureByProbeId}
              previewProgress={previewProgress}
              zoom={zoom}
              attachingProbeId={attachingProbeId}
              onSelectProbe={onSelectProbe}
              onBeginProbeDrag={beginProbeDrag}
              onStartAttachProbe={onToggleAttachProbe}
              onUpdateSpectrumWindow={onUpdateProbeSpectrumWindow}
              onToggleExpanded={onToggleProbeExpanded}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function resolveAutoLayoutProbePositions(
  patch: Patch,
  probes: PatchWorkspaceProbeState[],
  layoutByNode: Map<string, PatchLayoutNode>
) {
  const occupied = patch.nodes.map((node) => {
    const layout = layoutByNode.get(node.id);
    return layout ? { x: layout.x, y: layout.y, width: 9, height: 6 } : null;
  }).filter((entry): entry is { x: number; y: number; width: number; height: number } => Boolean(entry));
  const resolved: PatchWorkspaceProbeState[] = [];

  const overlaps = (candidate: { x: number; y: number; width: number; height: number }) =>
    [...occupied, ...resolved].some((entry) =>
      candidate.x < entry.x + entry.width + 1 &&
      entry.x < candidate.x + candidate.width + 1 &&
      candidate.y < entry.y + entry.height + 1 &&
      entry.y < candidate.y + candidate.height + 1
    );

  for (const probe of probes) {
    const preferredPoint =
      probe.target?.kind === "connection"
        ? resolvePatchConnectionMidpoint(patch, layoutByNode, probe.target.connectionId)
        : probe.target
          ? resolvePatchPortAnchorPoint(patch, layoutByNode, probe.target.nodeId, probe.target.portId, probe.target.portKind)
          : null;
    const preferredX = preferredPoint ? Math.max(0, Math.round(preferredPoint.x / PATCH_CANVAS_GRID) + 2) : 3;
    const preferredY = preferredPoint ? Math.max(0, Math.round(preferredPoint.y / PATCH_CANVAS_GRID) - Math.floor(probe.height / 2)) : 3;
    let placed = { ...probe, x: preferredX, y: preferredY };
    if (overlaps({ x: placed.x, y: placed.y, width: probe.width, height: probe.height })) {
      let found = false;
      for (let ring = 0; ring < 40 && !found; ring += 1) {
        for (let dx = -ring; dx <= ring && !found; dx += 1) {
          for (let dy = -ring; dy <= ring && !found; dy += 1) {
            const candidate = {
              ...probe,
              x: Math.max(0, preferredX + dx),
              y: Math.max(0, preferredY + dy)
            };
            if (!overlaps({ x: candidate.x, y: candidate.y, width: probe.width, height: probe.height })) {
              placed = candidate;
              found = true;
            }
          }
        }
      }
    }
    resolved.push(placed);
  }

  return resolved;
}

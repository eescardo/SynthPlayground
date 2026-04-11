"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { PatchEditorToolbar } from "@/components/patch/PatchEditorToolbar";
import {
  PATCH_MOVE_CURSOR,
  PATCH_MOVE_CURSOR_ACTIVE
} from "@/components/patch/patchCanvasConstants";
import {
  resolvePatchCanvasSize,
  resolvePatchDiagramSize,
  resolvePatchFacePopoverRect
} from "@/components/patch/patchCanvasGeometry";
import { createId } from "@/lib/ids";
import { resolveAutoLayoutNodes } from "@/lib/patch/autoLayout";
import { makeConnectOp } from "@/lib/patch/ops";
import { usePatchCanvasInteractions } from "@/hooks/patch/usePatchCanvasInteractions";
import { usePatchCanvasZoom } from "@/hooks/patch/usePatchCanvasZoom";
import { usePatchModuleFacePopover } from "@/hooks/patch/usePatchModuleFacePopover";
import { Patch } from "@/types/patch";
import { PatchOp } from "@/types/ops";

interface PatchModuleFacePopoverProps {
  patch: Patch;
  selectedNodeId?: string;
  selectedMacroNodeIds: Set<string>;
  structureLocked?: boolean;
  onApplyOp: (op: PatchOp) => void;
  onSelectNode: (nodeId?: string) => void;
}

export function PatchModuleFacePopover(props: PatchModuleFacePopoverProps) {
  const {
    onApplyOp,
    onSelectNode,
    patch,
    selectedMacroNodeIds,
    selectedNodeId,
    structureLocked
  } = props;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [newNodeType, setNewNodeType] = useState("VCO");
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
    structureLocked,
    onApplyOp,
    onSelectNode,
    makeConnectOp,
    handleFacePopoverPointerDown: handleCanvasPointerDown,
    togglePopoverForNode
  });

  return (
    <div className="patch-canvas-stage" ref={rootRef}>
      <PatchEditorToolbar
        newNodeType={newNodeType}
        structureLocked={structureLocked}
        patchNodeCount={patch.nodes.length}
        selectedNodeId={selectedNodeId}
        pendingFromPort={Boolean(pendingFromPort)}
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
        onDeleteSelected={() =>
          selectedNodeId && !structureLocked && onApplyOp({ type: "removeNode", nodeId: selectedNodeId })
        }
        onAutoLayout={() =>
          onApplyOp({
            type: "setNodeLayout",
            nodes: resolveAutoLayoutNodes(patch)
          })
        }
      />

      <div className="patch-canvas-shell">
        <div className="patch-canvas-scroll" ref={scrollRef}>
          <canvas
            ref={canvasRef}
            width={canvasSize.width}
            height={canvasSize.height}
            style={{
              width: `${canvasSize.width * zoom}px`,
              height: `${canvasSize.height * zoom}px`,
              cursor: dragNodeId ? PATCH_MOVE_CURSOR_ACTIVE : hoveredNodeId ? PATCH_MOVE_CURSOR : "default"
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={(event) => {
              onPointerUp(event);
              setHoveredNodeId(null);
            }}
          />
        </div>
      </div>
    </div>
  );
}

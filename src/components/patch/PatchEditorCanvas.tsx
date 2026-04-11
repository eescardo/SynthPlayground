"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PatchInspector } from "@/components/patch/PatchInspector";
import { PatchMacroPanel } from "@/components/patch/PatchMacroPanel";
import {
  PATCH_CANVAS_GRID,
  PATCH_MOVE_CURSOR,
  PATCH_MOVE_CURSOR_ACTIVE
} from "@/components/patch/patchCanvasConstants";
import { drawPatchCanvas } from "@/components/patch/patchCanvasDrawing";
import {
  findPatchNodeAtPoint,
  findPatchPortAtPoint,
  HitPort,
  pointerEventToPatchCanvasPoint,
  resolvePatchCanvasSize,
  resolvePatchDiagramSize,
  resolvePatchFacePopoverRect
} from "@/components/patch/patchCanvasGeometry";
import { createId } from "@/lib/ids";
import { resolveAutoLayoutNodes } from "@/lib/patch/autoLayout";
import { getModuleSchema, modulePalette } from "@/lib/patch/moduleRegistry";
import { makeConnectOp } from "@/lib/patch/ops";
import { usePatchCanvasZoom } from "@/hooks/patch/usePatchCanvasZoom";
import { usePatchModuleFacePopover } from "@/hooks/patch/usePatchModuleFacePopover";
import { PatchValidationIssue, Patch } from "@/types/patch";
import { PatchOp } from "@/types/ops";

interface PatchEditorCanvasProps {
  patch: Patch;
  macroValues: Record<string, number>;
  selectedNodeId?: string;
  validationIssues: PatchValidationIssue[];
  structureLocked?: boolean;
  onSelectNode: (nodeId?: string) => void;
  onApplyOp: (op: PatchOp) => void;
  onExposeMacro: (nodeId: string, paramId: string, suggestedName: string) => void;
  onAddMacro: () => void;
  onRemoveMacro: (macroId: string) => void;
  onRenameMacro: (macroId: string, name: string) => void;
  onSetMacroKeyframeCount: (macroId: string, keyframeCount: number) => void;
  onChangeMacroValue: (macroId: string, normalized: number, options?: { commit?: boolean }) => void;
}

export function PatchEditorCanvas(props: PatchEditorCanvasProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const hitPortsRef = useRef<HitPort[]>([]);
  const dragLastLayoutRef = useRef<{ x: number; y: number } | null>(null);
  const dragPointerOffsetRef = useRef<{ x: number; y: number } | null>(null);
  const pointerDownNodeIdRef = useRef<string | null>(null);
  const pointerMovedRef = useRef(false);
  const [newNodeType, setNewNodeType] = useState(modulePalette[0]?.typeId ?? "VCO");
  const [pendingFromPort, setPendingFromPort] = useState<HitPort | null>(null);
  const [dragNodeId, setDragNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const macroVisibleRows = Math.max(1, Math.min(5, props.patch.ui.macros.length || 1));
  const macroDockHeightRemByRowCount: Record<number, number> = {
    1: 1.58,
    2: 2.8,
    3: 3.78,
    4: 4.98,
    5: 6.18
  };
  const macroDockHeightRem = macroDockHeightRemByRowCount[macroVisibleRows] ?? macroDockHeightRemByRowCount[5];

  const layoutByNode = useMemo(() => {
    return new Map(props.patch.layout.nodes.map((node) => [node.nodeId, node] as const));
  }, [props.patch.layout.nodes]);
  const nodeById = useMemo(() => new Map(props.patch.nodes.map((node) => [node.id, node] as const)), [props.patch.nodes]);
  const canvasSize = useMemo(() => resolvePatchCanvasSize(props.patch.layout.nodes), [props.patch.layout.nodes]);
  const diagramSize = useMemo(() => resolvePatchDiagramSize(props.patch.layout.nodes), [props.patch.layout.nodes]);
  const onApplyOp = props.onApplyOp;
  const handleZoomChange = useCallback((zoom: number) => {
    onApplyOp({ type: "setCanvasZoom", zoom });
  }, [onApplyOp]);
  const { zoom } = usePatchCanvasZoom({
    canvasSize,
    fitSize: diagramSize,
    onZoomChange: handleZoomChange,
    patchId: props.patch.id,
    rootRef,
    savedZoom: props.patch.ui.canvasZoom,
    scrollRef
  });

  const getFacePopoverRect = useCallback((nodeId: string) => {
    return resolvePatchFacePopoverRect(nodeId, layoutByNode, canvasSize);
  }, [canvasSize, layoutByNode]);
  const nodeExists = useCallback((nodeId: string) => nodeById.has(nodeId), [nodeById]);
  const {
    handleCanvasPointerDown: handleFacePopoverPointerDown,
    openPopoverForNode: openFacePopoverForNode,
    popoverNodeId: facePopoverNodeId
  } = usePatchModuleFacePopover({
    getPopoverRect: getFacePopoverRect,
    nodeExists
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    hitPortsRef.current = drawPatchCanvas({
      canvas,
      canvasSize,
      facePopoverNodeId,
      getFacePopoverRect,
      hoveredNodeId,
      layoutByNode,
      nodeById,
      patch: props.patch,
      pendingFromPort,
      selectedNodeId: props.selectedNodeId
    });
  }, [
    canvasSize,
    facePopoverNodeId,
    getFacePopoverRect,
    hoveredNodeId,
    layoutByNode,
    nodeById,
    pendingFromPort,
    props.patch,
    props.selectedNodeId
  ]);

  const getNodeAtPointer = useCallback((rawX: number, rawY: number) => {
    return findPatchNodeAtPoint(props.patch, layoutByNode, rawX, rawY);
  }, [layoutByNode, props.patch]);

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const pos = pointerEventToPatchCanvasPoint(canvasRef.current, event);
    pointerDownNodeIdRef.current = null;
    pointerMovedRef.current = false;
    if (handleFacePopoverPointerDown(pos.rawX, pos.rawY) === "inside-popover") {
      return;
    }

    const hitPort = findPatchPortAtPoint(hitPortsRef.current, pos.rawX, pos.rawY);
    if (hitPort) {
      if (props.structureLocked) {
        return;
      }
      if (hitPort.kind === "out") {
        setPendingFromPort(hitPort);
      } else if (hitPort.kind === "in" && pendingFromPort) {
        props.onApplyOp(makeConnectOp(pendingFromPort.nodeId, pendingFromPort.portId, hitPort.nodeId, hitPort.portId));
        setPendingFromPort(null);
      }
      return;
    }

    const hitNodeId = getNodeAtPointer(pos.rawX, pos.rawY);
    if (hitNodeId) {
      props.onSelectNode(hitNodeId);
      setDragNodeId(hitNodeId);
      pointerDownNodeIdRef.current = hitNodeId;
      pointerMovedRef.current = false;
      const layout = layoutByNode.get(hitNodeId);
      dragLastLayoutRef.current = layout ? { x: layout.x, y: layout.y } : null;
      dragPointerOffsetRef.current = layout
        ? {
            x: pos.rawX - layout.x * PATCH_CANVAS_GRID,
            y: pos.rawY - layout.y * PATCH_CANVAS_GRID
          }
        : null;
      event.currentTarget.setPointerCapture(event.pointerId);
    } else {
      props.onSelectNode(undefined);
      setPendingFromPort(null);
      pointerDownNodeIdRef.current = null;
      pointerMovedRef.current = false;
    }
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const pos = pointerEventToPatchCanvasPoint(canvasRef.current, event);
    const hoverPort = findPatchPortAtPoint(hitPortsRef.current, pos.rawX, pos.rawY);
    const hoverNodeId = hoverPort ? null : getNodeAtPointer(pos.rawX, pos.rawY);
    setHoveredNodeId((prev) => (prev === hoverNodeId ? prev : hoverNodeId));

    if (!dragNodeId) return;
    const pointerOffset = dragPointerOffsetRef.current;
    if (!pointerOffset) return;
    const nextLayout = {
      x: Math.max(0, Math.round((pos.rawX - pointerOffset.x) / PATCH_CANVAS_GRID)),
      y: Math.max(0, Math.round((pos.rawY - pointerOffset.y) / PATCH_CANVAS_GRID))
    };
    if (dragLastLayoutRef.current?.x === nextLayout.x && dragLastLayoutRef.current?.y === nextLayout.y) {
      return;
    }
    dragLastLayoutRef.current = nextLayout;
    pointerMovedRef.current = true;
    props.onApplyOp({
      type: "moveNode",
      nodeId: dragNodeId,
      newLayoutPos: nextLayout
    });
  };

  const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const clickedNodeId = pointerDownNodeIdRef.current;
    const moved = pointerMovedRef.current;
    if (dragNodeId) {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // ignore
      }
    }
    dragLastLayoutRef.current = null;
    dragPointerOffsetRef.current = null;
    pointerDownNodeIdRef.current = null;
    pointerMovedRef.current = false;
    setDragNodeId(null);
    if (clickedNodeId && !moved) {
      openFacePopoverForNode(clickedNodeId);
    }
  };

  const selectedNode = props.selectedNodeId ? nodeById.get(props.selectedNodeId) : undefined;
  const selectedSchema = selectedNode ? getModuleSchema(selectedNode.typeId) : undefined;

  return (
    <div
      className="patch-editor"
      ref={rootRef}
      style={
        {
          "--patch-macro-visible-rows": macroVisibleRows,
          "--patch-macro-dock-height": `${macroDockHeightRem}rem`
        } as React.CSSProperties
      }
    >
      <div className="patch-toolbar">
        <select value={newNodeType} disabled={props.structureLocked} onChange={(e) => setNewNodeType(e.target.value)}>
          {modulePalette.map((module) => (
            <option key={module.typeId} value={module.typeId}>
              {module.typeId}
            </option>
          ))}
        </select>
        <button
          disabled={props.structureLocked}
          onClick={() => {
            if (props.structureLocked) return;
            const nodeId = createId("node");
            props.onApplyOp({
              type: "addNode",
              typeId: newNodeType,
              nodeId,
              layoutPos: { x: 3, y: 3 }
            });
            props.onSelectNode(nodeId);
          }}
        >
          Add Module
        </button>
        <button
          disabled={!props.selectedNodeId || props.structureLocked}
          onClick={() =>
            props.selectedNodeId && !props.structureLocked && props.onApplyOp({ type: "removeNode", nodeId: props.selectedNodeId })
          }
        >
          Delete Selected
        </button>
        <button
          disabled={props.patch.nodes.length === 0}
          onClick={() =>
            props.onApplyOp({
              type: "setNodeLayout",
              nodes: resolveAutoLayoutNodes(props.patch)
            })
          }
        >
          Auto-layout
        </button>
        {props.structureLocked && <span className="muted">Preset structure is locked. Move nodes for clarity or edit macros.</span>}
        {pendingFromPort && <span className="muted">Select input port to complete connection.</span>}
        <span className="patch-zoom-readout">Zoom {Math.round(zoom * 100)}%</span>
      </div>

      <div className="patch-layout">
        <div className="patch-editor-main-column">
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

          <PatchMacroPanel
            patch={props.patch}
            macroValues={props.macroValues}
            structureLocked={props.structureLocked}
            onAddMacro={props.onAddMacro}
            onRemoveMacro={props.onRemoveMacro}
            onRenameMacro={props.onRenameMacro}
            onSetMacroKeyframeCount={props.onSetMacroKeyframeCount}
            onChangeMacroValue={props.onChangeMacroValue}
          />
        </div>

        <PatchInspector
          patch={props.patch}
          selectedNode={selectedNode}
          selectedSchema={selectedSchema}
          structureLocked={props.structureLocked}
          validationIssues={props.validationIssues}
          onApplyOp={props.onApplyOp}
          onExposeMacro={props.onExposeMacro}
        />
      </div>
    </div>
  );
}

"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { PatchHostPortOverlay } from "@/components/patch/PatchHostPortOverlay";
import { PatchEditorToolbar } from "@/components/patch/PatchEditorToolbar";
import { PatchProbeOverlay } from "@/components/patch/PatchProbeOverlay";
import {
  PATCH_ATTACH_CURSOR_CLOSED,
  PATCH_ATTACH_CURSOR_OPEN,
  PATCH_MOVE_CURSOR,
  PATCH_MOVE_CURSOR_ACTIVE
} from "@/components/patch/patchCanvasConstants";
import {
  resolvePatchCanvasSize,
  resolvePatchDiagramSize,
  resolvePatchFacePopoverRect
} from "@/components/patch/patchCanvasGeometry";
import { createId } from "@/lib/ids";
import { PatchDiff } from "@/lib/patch/diff";
import { resolveAutoLayoutNodes } from "@/lib/patch/autoLayout";
import { makeConnectOp } from "@/lib/patch/ops";
import { resolveAutoLayoutProbePositions } from "@/lib/patch/probeAutoLayout";
import { usePatchCanvasInteractions } from "@/hooks/patch/usePatchCanvasInteractions";
import { usePatchProbeDrag } from "@/hooks/patch/usePatchProbeDrag";
import { usePatchCanvasZoom } from "@/hooks/patch/usePatchCanvasZoom";
import { usePatchModuleFacePopover } from "@/hooks/patch/usePatchModuleFacePopover";
import { Patch, PatchValidationIssue } from "@/types/patch";
import { PatchOp } from "@/types/ops";
import { PatchProbeEditorActions, PatchProbeEditorState } from "@/types/probes";

interface PatchEditorStageProps {
  patch: Patch;
  baselinePatch?: Patch;
  patchDiff: PatchDiff;
  patches: Patch[];
  validationIssues: PatchValidationIssue[];
  probeState: PatchProbeEditorState;
  selectedNodeId?: string;
  selectedMacroNodeIds: Set<string>;
  structureLocked?: boolean;
  onClearPatch: () => void;
  onSelectBaselinePatch: (patchId: string) => void;
  onClearBaselinePatch: () => void;
  onApplyOp: (op: PatchOp) => void;
  probeActions: PatchProbeEditorActions;
  onSelectNode: (nodeId?: string) => void;
  onToggleAttachProbe: (probeId: string) => void;
  onCancelAttachProbe: () => void;
}

export function PatchEditorStage(props: PatchEditorStageProps) {
  const {
    onApplyOp,
    onSelectBaselinePatch,
    onClearBaselinePatch,
    onSelectNode,
    onToggleAttachProbe,
    onCancelAttachProbe,
    patch,
    patchDiff,
    probeActions,
    probeState,
    selectedMacroNodeIds,
    selectedNodeId,
    structureLocked
  } = props;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [deletePreviewNodeId, setDeletePreviewNodeId] = useState<string | null>(null);
  const [clearPreviewActive, setClearPreviewActive] = useState(false);
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
    handlePortHover,
    handlePortSelection,
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
    patchDiff,
    validationIssues: props.validationIssues,
    selectedMacroNodeIds,
    selectedNodeId,
    deletePreviewNodeId,
    clearPreviewActive,
    pendingProbeId: probeState.attachingProbeId,
    structureLocked,
    onApplyOp,
    onSelectNode,
    onAttachProbeTarget: (target) => {
      if (probeState.attachingProbeId) {
        probeActions.updateTarget(probeState.attachingProbeId, target);
        onCancelAttachProbe();
      }
    },
    onCancelProbeAttach: onCancelAttachProbe,
    makeConnectOp,
    handleFacePopoverPointerDown: handleCanvasPointerDown,
    togglePopoverForNode
  });

  const { beginProbeDrag } = usePatchProbeDrag({
    canvasRef,
    probes: probeState.probes,
    probeActions
  });

  return (
    <div className="patch-canvas-stage" ref={rootRef}>
      <PatchEditorToolbar
        structureLocked={structureLocked}
        canClearPatch={patch.nodes.length > 1 || patch.connections.length > 0 || patch.ui.macros.length > 0}
        patchNodeCount={patch.nodes.length}
        currentPatchId={patch.id}
        baselinePatch={props.baselinePatch}
        hasPatchDiff={patchDiff.hasChanges}
        patches={props.patches}
        selectedNodeId={selectedNodeId}
        selectedProbeId={probeState.selectedProbeId}
        pendingFromPort={Boolean(pendingFromPort)}
        pendingProbeId={probeState.attachingProbeId}
        zoom={zoom}
        onAddNode={(typeId) => {
          if (structureLocked) {
            return;
          }
          const nodeId = createId("node");
          onApplyOp({
            type: "addNode",
            typeId,
            nodeId,
            layoutPos: { x: 3, y: 3 }
          });
          onSelectNode(nodeId);
        }}
        onAddProbe={probeActions.addProbe}
        onDeleteSelected={() =>
          probeState.selectedProbeId
            ? (onCancelAttachProbe(), probeActions.deleteSelected())
            : selectedNodeId && !structureLocked && onApplyOp({ type: "removeNode", nodeId: selectedNodeId })
        }
        onDeletePreviewChange={(previewing) => {
          setDeletePreviewNodeId(previewing && selectedNodeId && !structureLocked ? selectedNodeId : null);
        }}
        onClearPatch={props.onClearPatch}
        onClearPreviewChange={setClearPreviewActive}
        onSelectBaselinePatch={onSelectBaselinePatch}
        onClearBaselinePatch={onClearBaselinePatch}
        onAutoLayout={() => {
          const nextNodeLayout = resolveAutoLayoutNodes(patch);
          onApplyOp({
            type: "setNodeLayout",
            nodes: nextNodeLayout
          });
          const nextLayoutByNode = new Map(nextNodeLayout.map((node) => [node.nodeId, node] as const));
          resolveAutoLayoutProbePositions(patch, probeState.probes, nextLayoutByNode).forEach((probe) => {
            probeActions.moveProbe(probe.id, probe.x, probe.y);
          });
        }}
      />

      <div className="patch-canvas-shell">
        <div
          className="patch-canvas-scroll"
          ref={scrollRef}
          onScroll={(event) => {
            setScrollTop(event.currentTarget.scrollTop);
          }}
        >
          <div className="patch-canvas-overlay-shell" style={{ width: `${canvasSize.width * zoom}px`, height: `${canvasSize.height * zoom}px` }}>
            <canvas
              ref={canvasRef}
              width={canvasSize.width}
              height={canvasSize.height}
              style={{
                width: `${canvasSize.width * zoom}px`,
                height: `${canvasSize.height * zoom}px`,
                cursor: resolveCanvasCursor({
                  attachingProbeId: probeState.attachingProbeId,
                  pendingFromPort: Boolean(pendingFromPort),
                  hoveredAttachTarget: Boolean(hoveredAttachTarget),
                  dragNodeId: Boolean(dragNodeId),
                  hoveredNodeId: Boolean(hoveredNodeId)
                })
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
              probes={probeState.probes}
              selectedProbeId={probeState.selectedProbeId}
              previewCaptureByProbeId={probeState.previewCaptureByProbeId}
              previewProgress={probeState.previewProgress}
              zoom={zoom}
              attachingProbeId={probeState.attachingProbeId}
              onSelectProbe={probeActions.selectProbe}
              onBeginProbeDrag={beginProbeDrag}
              onStartAttachProbe={onToggleAttachProbe}
              onUpdateSpectrumWindow={probeActions.updateSpectrumWindow}
              onToggleExpanded={probeActions.toggleExpanded}
            />
          </div>
        </div>
        <PatchHostPortOverlay
          pendingFromPort={pendingFromPort}
          scrollTop={scrollTop}
          zoom={zoom}
          onPortSelection={handlePortSelection}
          onPortHover={handlePortHover}
        />
      </div>
    </div>
  );
}

function resolveCanvasCursor(args: {
  attachingProbeId: string | null | undefined;
  pendingFromPort: boolean;
  hoveredAttachTarget: boolean;
  dragNodeId: boolean;
  hoveredNodeId: boolean;
}) {
  if (args.attachingProbeId || args.pendingFromPort) {
    return args.hoveredAttachTarget ? PATCH_ATTACH_CURSOR_CLOSED : PATCH_ATTACH_CURSOR_OPEN;
  }
  if (args.dragNodeId) {
    return PATCH_MOVE_CURSOR_ACTIVE;
  }
  if (args.hoveredNodeId) {
    return PATCH_MOVE_CURSOR;
  }
  return "default";
}

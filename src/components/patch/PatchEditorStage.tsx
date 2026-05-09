"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PatchHostPortOverlay } from "@/components/patch/PatchHostPortOverlay";
import { PatchEditorToolbar } from "@/components/patch/PatchEditorToolbar";
import { PatchProbeOverlay } from "@/components/patch/PatchProbeOverlay";
import { PatchBaselineDiffState } from "@/components/patch/patchBaselineDiffState";
import {
  PATCH_OUTPUT_HOST_PORT_OVERHANG,
  PATCH_ATTACH_CURSOR_CLOSED,
  PATCH_ATTACH_CURSOR_OPEN,
  PATCH_MOVE_CURSOR,
  PATCH_MOVE_CURSOR_ACTIVE
} from "@/components/patch/patchCanvasConstants";
import {
  resolvePatchCanvasSize,
  resolvePatchDiagramSize,
  resolvePatchFacePopoverRect,
  resolveOutputHostPlacement
} from "@/components/patch/patchCanvasGeometry";
import { createId } from "@/lib/ids";
import { resolveAutoLayoutNodes } from "@/lib/patch/autoLayout";
import { makeConnectOp } from "@/lib/patch/ops";
import { getPatchOutputPort } from "@/lib/patch/ports";
import { resolveAutoLayoutProbePositions } from "@/lib/patch/probeAutoLayout";
import { usePatchCanvasInteractions } from "@/hooks/patch/usePatchCanvasInteractions";
import { usePatchProbeDrag } from "@/hooks/patch/usePatchProbeDrag";
import { usePatchCanvasZoom } from "@/hooks/patch/usePatchCanvasZoom";
import { usePatchModuleFacePopover } from "@/hooks/patch/usePatchModuleFacePopover";
import {
  resolveVisibleAddModulePosition,
  resolveVisibleAddProbePosition
} from "@/components/patch/patchVisiblePlacement";
import { Patch, PatchValidationIssue } from "@/types/patch";
import { PatchOp } from "@/types/ops";
import { PatchProbeEditorActions, PatchProbeEditorState } from "@/types/probes";

interface PatchEditorStageProps {
  patch: Patch;
  baselineDiff: PatchBaselineDiffState;
  validationIssues: PatchValidationIssue[];
  probeState: PatchProbeEditorState;
  selectedNodeId?: string;
  selectedMacroNodeIds: Set<string>;
  structureLocked?: boolean;
  onClearPatch: () => void;
  onApplyOp: (op: PatchOp) => void;
  probeActions: PatchProbeEditorActions;
  onSelectNode: (nodeId?: string) => void;
  onToggleAttachProbe: (probeId: string) => void;
  onCancelAttachProbe: () => void;
}

export function PatchEditorStage(props: PatchEditorStageProps) {
  const {
    onApplyOp,
    onSelectNode,
    onToggleAttachProbe,
    onCancelAttachProbe,
    patch,
    baselineDiff,
    probeActions,
    probeState,
    selectedMacroNodeIds,
    selectedNodeId,
    structureLocked
  } = props;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollViewport, setScrollViewport] = useState({ left: 0, top: 0, width: 0, height: 0 });
  const [deletePreviewNodeId, setDeletePreviewNodeId] = useState<string | null>(null);
  const [clearPreviewActive, setClearPreviewActive] = useState(false);
  const layoutByNode = useMemo(() => {
    return new Map(patch.layout.nodes.map((node) => [node.nodeId, node] as const));
  }, [patch.layout.nodes]);
  const nodeById = useMemo(
    () => new Map([...patch.nodes, ...(patch.ports ?? [])].map((node) => [node.id, node] as const)),
    [patch.nodes, patch.ports]
  );
  const outputNodeId = getPatchOutputPort(patch)?.id;
  const visibleNodeCount = useMemo(
    () => patch.nodes.filter((node) => node.id !== outputNodeId).length,
    [outputNodeId, patch.nodes]
  );
  const visibleLayoutNodes = useMemo(
    () => patch.layout.nodes.filter((node) => node.nodeId !== outputNodeId),
    [outputNodeId, patch.layout.nodes]
  );
  const contentCanvasSize = useMemo(() => resolvePatchCanvasSize(visibleLayoutNodes), [visibleLayoutNodes]);
  const diagramSize = useMemo(() => resolvePatchDiagramSize(visibleLayoutNodes), [visibleLayoutNodes]);
  const updateScrollViewport = useCallback((element: HTMLDivElement) => {
    setScrollViewport({
      left: element.scrollLeft,
      top: element.scrollTop,
      width: element.clientWidth,
      height: element.clientHeight
    });
  }, []);

  const handleZoomChange = useCallback(
    (zoom: number) => {
      onApplyOp({ type: "setCanvasZoom", zoom });
    },
    [onApplyOp]
  );

  const { zoom } = usePatchCanvasZoom({
    canvasSize: contentCanvasSize,
    fitSize: diagramSize,
    onZoomChange: handleZoomChange,
    patchId: patch.id,
    rootRef,
    savedZoom: patch.ui.canvasZoom,
    scrollRef
  });
  const canvasSize = useMemo(
    () => ({
      width: Math.max(
        contentCanvasSize.width,
        scrollViewport.width > 0
          ? Math.ceil((scrollViewport.left + scrollViewport.width + PATCH_OUTPUT_HOST_PORT_OVERHANG) / zoom)
          : 0
      ),
      height: contentCanvasSize.height
    }),
    [contentCanvasSize.height, contentCanvasSize.width, scrollViewport.left, scrollViewport.width, zoom]
  );
  const outputHostPlacement = useMemo(
    () =>
      resolveOutputHostPlacement({
        canvasWidth: canvasSize.width,
        overhang: PATCH_OUTPUT_HOST_PORT_OVERHANG,
        scrollLeft: scrollViewport.left,
        viewportWidth: scrollViewport.width,
        zoom
      }),
    [canvasSize.width, scrollViewport.left, scrollViewport.width, zoom]
  );
  const outputHostCanvasLeft = outputHostPlacement.canvasLeft;
  const outputHostScreenLeft = outputHostPlacement.screenLeft;

  useEffect(() => {
    if (scrollRef.current) {
      updateScrollViewport(scrollRef.current);
    }
  }, [canvasSize.width, updateScrollViewport, zoom]);

  const getFacePopoverRect = useCallback(
    (nodeId: string) => resolvePatchFacePopoverRect(nodeId, layoutByNode, canvasSize),
    [canvasSize, layoutByNode]
  );
  const nodeExists = useCallback((nodeId: string) => nodeById.has(nodeId), [nodeById]);
  const { handleCanvasPointerDown, popoverNodeId, togglePopoverForNode } = usePatchModuleFacePopover({
    getPopoverRect: getFacePopoverRect,
    nodeExists
  });

  const {
    dragNodeId,
    hoveredNodeId,
    pendingFromPort,
    pendingProbePointer,
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
    outputHostCanvasLeft,
    zoom,
    patchDiff: baselineDiff.patchDiff,
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
        canClearPatch={visibleNodeCount > 0 || patch.connections.length > 0 || patch.ui.macros.length > 0}
        patchNodeCount={visibleNodeCount}
        baselineControl={{ ...baselineDiff, currentPatchId: patch.id }}
        selectedNodeId={selectedNodeId}
        protectedNodeId={outputNodeId}
        selectedProbeId={probeState.selectedProbeId}
        pendingFromPort={Boolean(pendingFromPort)}
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
            layoutPos: resolveVisibleAddModulePosition(visibleLayoutNodes, scrollViewport, zoom)
          });
          onSelectNode(nodeId);
        }}
        onAddProbe={(kind) => {
          probeActions.addProbe(
            kind,
            resolveVisibleAddProbePosition(probeState.probes, visibleLayoutNodes, kind, scrollViewport, zoom)
          );
        }}
        onDeleteSelected={() =>
          probeState.selectedProbeId
            ? (onCancelAttachProbe(), probeActions.deleteSelected())
            : selectedNodeId &&
              selectedNodeId !== outputNodeId &&
              !structureLocked &&
              onApplyOp({ type: "removeNode", nodeId: selectedNodeId })
        }
        onDeletePreviewChange={(previewing) => {
          setDeletePreviewNodeId(
            previewing && selectedNodeId && selectedNodeId !== outputNodeId && !structureLocked ? selectedNodeId : null
          );
        }}
        onClearPatch={props.onClearPatch}
        onClearPreviewChange={setClearPreviewActive}
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
            updateScrollViewport(event.currentTarget);
          }}
        >
          <div
            className="patch-canvas-overlay-shell"
            style={{ width: `${canvasSize.width * zoom}px`, height: `${canvasSize.height * zoom}px` }}
          >
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
              outputHostCanvasLeft={outputHostCanvasLeft}
              probes={probeState.probes}
              selectedProbeId={probeState.selectedProbeId}
              previewCaptureByProbeId={probeState.previewCaptureByProbeId}
              previewProgress={probeState.previewProgress}
              zoom={zoom}
              attachingProbeId={probeState.attachingProbeId}
              pendingProbePointer={pendingProbePointer}
              onSelectProbe={probeActions.selectProbe}
              onBeginProbeDrag={beginProbeDrag}
              onStartAttachProbe={onToggleAttachProbe}
              onUpdateSpectrumWindow={probeActions.updateSpectrumWindow}
              onToggleExpanded={probeActions.toggleExpanded}
            />
          </div>
        </div>
        <PatchHostPortOverlay
          outputHostCanvasLeft={outputHostCanvasLeft}
          outputHostScreenLeft={outputHostScreenLeft}
          patch={patch}
          pendingFromPort={pendingFromPort}
          pendingProbeId={probeState.attachingProbeId}
          scrollTop={scrollViewport.top}
          zoom={zoom}
          onPortSelection={handlePortSelection}
          onPortHover={handlePortHover}
          onSelectOutput={() => onSelectNode(outputNodeId)}
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

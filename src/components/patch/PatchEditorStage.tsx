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
import { isShortcutBlockedTarget } from "@/hooks/patch/patchWorkspaceStateUtils";
import {
  resolveVisibleAddModulePosition,
  resolveVisibleAddProbePosition
} from "@/components/patch/patchVisiblePlacement";
import { Patch, PatchValidationIssue } from "@/types/patch";
import { PatchOp } from "@/types/ops";
import { PatchProbeEditorActions, PatchProbeEditorState } from "@/types/probes";
import { PatchWireCommitFeedback } from "@/components/patch/patchWireFeedback";

interface PatchEditorStageProps {
  patch: Patch;
  baselineDiff: PatchBaselineDiffState;
  validationIssues: PatchValidationIssue[];
  probeState: PatchProbeEditorState;
  selectedNodeId?: string;
  selectedConnectionId?: string;
  selectedMacroNodeIds: Set<string>;
  structureLocked?: boolean;
  onClearPatch: () => void;
  onApplyOp: (op: PatchOp) => void;
  probeActions: PatchProbeEditorActions;
  onSelectNode: (nodeId?: string) => void;
  onSelectConnection: (connectionId?: string) => void;
  onToggleAttachProbe: (probeId: string) => void;
  onCancelAttachProbe: () => void;
  onWireCommitFeedback?: (feedback: PatchWireCommitFeedback) => void;
}

export function PatchEditorStage(props: PatchEditorStageProps) {
  const {
    onApplyOp,
    onSelectNode,
    onSelectConnection,
    onToggleAttachProbe,
    onCancelAttachProbe,
    onWireCommitFeedback,
    patch,
    baselineDiff,
    probeActions,
    probeState,
    selectedMacroNodeIds,
    selectedConnectionId,
    selectedNodeId,
    structureLocked
  } = props;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollViewport, setScrollViewport] = useState({ left: 0, top: 0, width: 0, height: 0 });
  const [deletePreviewNodeId, setDeletePreviewNodeId] = useState<string | null>(null);
  const [deletePreviewConnectionId, setDeletePreviewConnectionId] = useState<string | null>(null);
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
  const canDeleteNode = Boolean(selectedNodeId && selectedNodeId !== outputNodeId && !structureLocked);
  const canDeleteConnection = Boolean(selectedConnectionId && !structureLocked);
  const canDeleteProbe = Boolean(probeState.selectedProbeId);
  const visibleCanvasBounds = useMemo(() => {
    if (scrollViewport.width <= 0 || scrollViewport.height <= 0) {
      return {
        x: 0,
        y: 0,
        width: canvasSize.width,
        height: canvasSize.height
      };
    }
    const x = scrollViewport.left / zoom;
    const y = scrollViewport.top / zoom;
    return {
      x,
      y,
      width: Math.min(canvasSize.width - x, scrollViewport.width / zoom),
      height: Math.min(canvasSize.height - y, scrollViewport.height / zoom)
    };
  }, [
    canvasSize.height,
    canvasSize.width,
    scrollViewport.height,
    scrollViewport.left,
    scrollViewport.top,
    scrollViewport.width,
    zoom
  ]);

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

  const deleteSelectedCanvasObject = useCallback(() => {
    if (probeState.selectedProbeId) {
      onCancelAttachProbe();
      probeActions.deleteSelected();
      return;
    }
    if (selectedConnectionId && !structureLocked) {
      onApplyOp({ type: "disconnect", connectionId: selectedConnectionId });
      onSelectConnection(undefined);
      setDeletePreviewConnectionId(null);
      return;
    }
    if (selectedNodeId && selectedNodeId !== outputNodeId && !structureLocked) {
      onApplyOp({ type: "removeNode", nodeId: selectedNodeId });
      setDeletePreviewNodeId(null);
    }
  }, [
    onApplyOp,
    onCancelAttachProbe,
    onSelectConnection,
    outputNodeId,
    probeActions,
    probeState.selectedProbeId,
    selectedConnectionId,
    selectedNodeId,
    structureLocked
  ]);

  const {
    dragNodeId,
    hoveredNodeId,
    pendingFromPort,
    pendingProbePointer,
    wireCandidate,
    hoveredAttachTarget,
    lockedPortHovered,
    handlePortHover,
    handlePortSelection,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    setHoveredNodeId
  } = usePatchCanvasInteractions({
    canvasRef,
    viewport: {
      canvasSize,
      visibleCanvasBounds,
      outputHostCanvasLeft,
      zoom
    },
    facePopoverNodeId: popoverNodeId,
    getFacePopoverRect,
    layoutByNode,
    nodeById,
    patch,
    patchDiff: baselineDiff.patchDiff,
    validationIssues: props.validationIssues,
    selection: {
      selectedMacroNodeIds,
      selectedNodeId,
      selectedConnectionId,
      deletePreviewNodeId,
      deletePreviewConnectionId,
      clearPreviewActive
    },
    mode: {
      pendingProbeId: probeState.attachingProbeId,
      structureLocked
    },
    onApplyOp,
    onSelectNode,
    onSelectConnection,
    onAttachProbeTarget: (target) => {
      if (probeState.attachingProbeId) {
        probeActions.updateTarget(probeState.attachingProbeId, target);
        onCancelAttachProbe();
      }
    },
    onCancelProbeAttach: onCancelAttachProbe,
    makeConnectOp,
    handleFacePopoverPointerDown: handleCanvasPointerDown,
    togglePopoverForNode,
    onWireCommitFeedback
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        isShortcutBlockedTarget(event.target) ||
        (event.key !== "Delete" && event.key !== "Backspace")
      ) {
        return;
      }
      if (pendingFromPort) {
        event.preventDefault();
        return;
      }
      if (!canDeleteProbe && !canDeleteConnection && !canDeleteNode) {
        return;
      }
      event.preventDefault();
      deleteSelectedCanvasObject();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canDeleteConnection, canDeleteNode, canDeleteProbe, deleteSelectedCanvasObject, pendingFromPort]);

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
        selectedConnectionId={selectedConnectionId}
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
        onDeleteSelected={deleteSelectedCanvasObject}
        onDeletePreviewChange={(previewing) => {
          setDeletePreviewConnectionId(previewing && canDeleteConnection ? (selectedConnectionId ?? null) : null);
          setDeletePreviewNodeId(previewing && canDeleteNode ? (selectedNodeId ?? null) : null);
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
                  wireCandidateStatus: wireCandidate?.status,
                  lockedPortHovered,
                  hoveredAttachTarget: Boolean(hoveredAttachTarget),
                  hoveredConnection: hoveredAttachTarget?.kind === "connection",
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
          scrollLeft={scrollViewport.left}
          scrollTop={scrollViewport.top}
          structureLocked={structureLocked}
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
  wireCandidateStatus?: string;
  lockedPortHovered: boolean;
  hoveredAttachTarget: boolean;
  hoveredConnection: boolean;
  dragNodeId: boolean;
  hoveredNodeId: boolean;
}) {
  if (args.wireCandidateStatus === "invalid" || args.lockedPortHovered) {
    return "not-allowed";
  }
  if (args.attachingProbeId || args.pendingFromPort) {
    return args.hoveredAttachTarget ? PATCH_ATTACH_CURSOR_CLOSED : PATCH_ATTACH_CURSOR_OPEN;
  }
  if (args.dragNodeId) {
    return PATCH_MOVE_CURSOR_ACTIVE;
  }
  if (args.hoveredConnection) {
    return "pointer";
  }
  if (args.hoveredNodeId) {
    return PATCH_MOVE_CURSOR;
  }
  return "default";
}

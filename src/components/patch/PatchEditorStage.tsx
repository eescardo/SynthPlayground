"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { PatchHostPortOverlay } from "@/components/patch/PatchHostPortOverlay";
import { PatchEditorToolbar } from "@/components/patch/PatchEditorToolbar";
import { PatchKeyboardFocusOverlay } from "@/components/patch/PatchKeyboardFocusOverlay";
import { PatchProbeOverlay } from "@/components/patch/PatchProbeOverlay";
import { PatchEditorStageActions, PatchEditorStageModel } from "@/components/patch/patchEditorSession";
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
import { resolveConnectionIdsForPatchPort } from "@/lib/patch/portConnections";
import { getPatchOutputPort } from "@/lib/patch/ports";
import { resolveAutoLayoutProbePositions } from "@/lib/patch/probeAutoLayout";
import { usePatchCanvasInteractions } from "@/hooks/patch/usePatchCanvasInteractions";
import { usePatchProbeDrag } from "@/hooks/patch/usePatchProbeDrag";
import { usePatchCanvasZoom } from "@/hooks/patch/usePatchCanvasZoom";
import { usePatchCanvasKeyboardNavigation } from "@/hooks/patch/usePatchCanvasKeyboardNavigation";
import { usePatchModuleFacePopover } from "@/hooks/patch/usePatchModuleFacePopover";
import { isShortcutBlockedTarget, isTextEditingTarget } from "@/hooks/patch/patchWorkspaceStateUtils";
import { isModifierChord } from "@/hooks/hardwareNavigationUtils";
import {
  resolveVisibleAddModulePosition,
  resolveVisibleAddProbePosition
} from "@/components/patch/patchVisiblePlacement";
import { PatchHardwareArrowKey } from "@/lib/patch/hardwareNavigation";
import styles from "./PatchEditorStage.module.css";

interface PatchEditorStageProps {
  model: PatchEditorStageModel;
  actions: PatchEditorStageActions;
}

export function PatchEditorStage(props: PatchEditorStageProps) {
  const {
    onApplyOp,
    onSelectNode,
    onSelectConnection,
    onToggleAttachProbe,
    onCancelAttachProbe,
    onWireCommitFeedback
  } = props.actions;
  const {
    baselineDiff,
    patch,
    probeState,
    selectedMacroNodeIds,
    selectedConnectionId,
    selectedNodeId,
    structureLocked,
    validationIssues
  } = props.model;
  const { probeActions } = props.actions;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pointerCanvasFocusRef = useRef(false);
  const popoverOpenedByPointerRef = useRef(false);
  const clearKeyboardFocusAfterPointerPopoverToggleRef = useRef(false);
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
  const { closePopover, handleCanvasPointerDown, popoverNodeId, togglePopoverForNode } = usePatchModuleFacePopover({
    getPopoverRect: getFacePopoverRect,
    nodeExists
  });
  const togglePopoverForNodeFromPointer = useCallback(
    (nodeId: string) => {
      popoverOpenedByPointerRef.current = true;
      clearKeyboardFocusAfterPointerPopoverToggleRef.current = true;
      togglePopoverForNode(nodeId);
    },
    [togglePopoverForNode]
  );
  const togglePopoverForNodeFromKeyboard = useCallback(
    (nodeId: string) => {
      popoverOpenedByPointerRef.current = false;
      togglePopoverForNode(nodeId);
    },
    [togglePopoverForNode]
  );

  const {
    dragNodeId,
    hoveredNodeId,
    pendingFromPort,
    pendingProbePointer,
    wireCandidate,
    hoveredAttachTarget,
    lockedPortHovered,
    handleModuleHoverWhileWiring,
    handlePortHover,
    handlePortSelection,
    handleReplaceCandidateKeyDown,
    clearPendingConnection,
    hitPorts,
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
    validationIssues,
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
    togglePopoverForNode: togglePopoverForNodeFromPointer,
    onWireCommitFeedback
  });
  const {
    enterCanvasKeyboardFocus,
    ensureKeyboardFocus,
    handleCanvasScroll,
    handlePatchCanvasKeyDown,
    keyboardFocus,
    keyboardNavigationModel,
    keyboardPorts,
    markExplicitCanvasScrollIntent,
    setKeyboardFocus,
    setWirePreviewOwnerFromMouse
  } = usePatchCanvasKeyboardNavigation({
    closePopover,
    clearPendingConnection,
    handleModuleHoverWhileWiring,
    handlePortHover,
    handlePortSelection,
    handleReplaceCandidateKeyDown,
    hitPorts,
    layoutByNode,
    onSelectConnection,
    onSelectNode,
    onSelectProbe: probeActions.selectProbe,
    onToggleAttachProbe,
    onToggleProbeExpanded: probeActions.toggleExpanded,
    outputHostCanvasLeft,
    outputNodeId,
    patch,
    attachingProbeId: probeState.attachingProbeId,
    pendingFromPort,
    popoverNodeId,
    popoverOpenedByPointer: popoverOpenedByPointerRef.current,
    probes: probeState.probes,
    scrollRef,
    selectedNodeId,
    selectedProbeId: probeState.selectedProbeId,
    structureLocked,
    togglePopoverForNode: togglePopoverForNodeFromKeyboard,
    zoom
  });

  useEffect(() => {
    if (!clearKeyboardFocusAfterPointerPopoverToggleRef.current) {
      return;
    }
    clearKeyboardFocusAfterPointerPopoverToggleRef.current = false;
    setKeyboardFocus(null);
  }, [popoverNodeId, setKeyboardFocus]);

  const deleteSelectedCanvasObject = useCallback(() => {
    if (
      keyboardFocus?.kind === "port" &&
      selectedNodeId === keyboardFocus.nodeId &&
      selectedNodeId !== outputNodeId &&
      !structureLocked
    ) {
      const connectionIds = resolveConnectionIdsForPatchPort(patch, {
        nodeId: keyboardFocus.nodeId,
        portId: keyboardFocus.portId,
        portKind: keyboardFocus.portKind
      });
      if (connectionIds.length > 0) {
        connectionIds.forEach((connectionId) => onApplyOp({ type: "disconnect", connectionId }));
        onSelectConnection(undefined);
        setDeletePreviewConnectionId(null);
        return;
      }
    }
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
    keyboardFocus,
    onApplyOp,
    onCancelAttachProbe,
    onSelectConnection,
    outputNodeId,
    patch,
    probeActions,
    probeState.selectedProbeId,
    selectedConnectionId,
    selectedNodeId,
    structureLocked
  ]);

  const handleCanvasPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (pendingFromPort) {
        setWirePreviewOwnerFromMouse();
      }
      onPointerMove(event);
    },
    [onPointerMove, pendingFromPort, setWirePreviewOwnerFromMouse]
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isModifierChord(event)) {
        return;
      }
      const key = event.key as PatchHardwareArrowKey;
      if (key !== "ArrowUp" && key !== "ArrowRight" && key !== "ArrowDown" && key !== "ArrowLeft") {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (!target || scrollRef.current?.contains(target)) {
        return;
      }
      const isStageTarget = Boolean(rootRef.current?.contains(target));
      const isInstrumentToolbarActionTarget = Boolean(target.closest(".instrument-toolbar-actions"));
      if (!isStageTarget && !isInstrumentToolbarActionTarget) {
        return;
      }
      if (isPatchCanvasArrowEntryBlockedTarget(target)) {
        return;
      }
      if (enterCanvasKeyboardFocus()) {
        event.preventDefault();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enterCanvasKeyboardFocus]);

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
    <div className={styles.stage} ref={rootRef}>
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
        onClearPatch={props.actions.onClearPatch}
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

      <div className={styles.shell}>
        <div
          className={styles.scroll}
          ref={scrollRef}
          tabIndex={0}
          aria-label="Patch canvas"
          onFocus={(event) => {
            if (event.currentTarget === event.target) {
              if (pointerCanvasFocusRef.current) {
                pointerCanvasFocusRef.current = false;
                setKeyboardFocus(null);
                return;
              }
              ensureKeyboardFocus();
            }
          }}
          onKeyDown={handlePatchCanvasKeyDown}
          onPointerDownCapture={(event) => {
            pointerCanvasFocusRef.current = true;
            if (event.currentTarget === event.target) {
              markExplicitCanvasScrollIntent();
            }
          }}
          onPointerUpCapture={() => {
            pointerCanvasFocusRef.current = false;
          }}
          onPointerCancelCapture={() => {
            pointerCanvasFocusRef.current = false;
          }}
          onScroll={(event) => {
            handleCanvasScroll(event.currentTarget, updateScrollViewport);
          }}
          onWheelCapture={markExplicitCanvasScrollIntent}
        >
          <div
            className={styles.overlayShell}
            style={{ width: `${canvasSize.width * zoom}px`, height: `${canvasSize.height * zoom}px` }}
          >
            <canvas
              className={styles.canvas}
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
              onPointerMove={handleCanvasPointerMove}
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
              keyboardFocus={keyboardFocus}
              pendingProbePointer={pendingProbePointer}
              onSelectProbe={probeActions.selectProbe}
              onBeginProbeDrag={beginProbeDrag}
              onStartAttachProbe={onToggleAttachProbe}
              onUpdateSpectrumWindow={probeActions.updateSpectrumWindow}
              onToggleExpanded={probeActions.toggleExpanded}
            />
            {!popoverNodeId && (
              <PatchKeyboardFocusOverlay
                focus={keyboardFocus}
                model={keyboardNavigationModel}
                ports={keyboardPorts}
                probes={probeState.probes}
                selectedNodeId={selectedNodeId}
                selectedProbeId={probeState.selectedProbeId}
                zoom={zoom}
              />
            )}
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
          onKeyboardFocus={(focus) => setKeyboardFocus(focus)}
          onKeyboardKeyDown={handlePatchCanvasKeyDown}
        />
      </div>
    </div>
  );
}

function isPatchCanvasArrowEntryBlockedTarget(target: HTMLElement) {
  if (isTextEditingTarget(target) || target.closest("[role='dialog']")) {
    return true;
  }
  if (target instanceof HTMLInputElement) {
    return true;
  }
  return target.getAttribute("role") === "slider" || Boolean(target.closest("[role='slider']"));
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

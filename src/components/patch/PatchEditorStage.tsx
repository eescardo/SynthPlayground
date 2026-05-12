"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { PatchHostPortOverlay } from "@/components/patch/PatchHostPortOverlay";
import { PatchEditorToolbar } from "@/components/patch/PatchEditorToolbar";
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
  resolveOutputHostPlacement,
  HitPort
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
import { isShortcutBlockedTarget, isTextEditingTarget } from "@/hooks/patch/patchWorkspaceStateUtils";
import { isModifierChord } from "@/hooks/hardwareNavigationUtils";
import {
  resolveVisibleAddModulePosition,
  resolveVisibleAddProbePosition
} from "@/components/patch/patchVisiblePlacement";
import {
  buildPatchCanvasNavigationModel,
  buildPatchFocusableId,
  PatchCanvasFocusable,
  PatchHardwareArrowKey,
  resolveDefaultPatchCanvasFocus,
  resolveNextPatchCanvasFocus,
  resolveNextPatchPortFocus,
  resolvePatchFocusablePorts
} from "@/lib/patch/hardwareNavigation";
import { resolvePatchWireCandidate } from "@/lib/patch/wireCandidate";
import styles from "./PatchEditorStage.module.css";

const PATCH_PORT_FOCUS_PAD_X = 2;
const PATCH_PORT_FOCUS_PAD_Y = 2;

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
  const [scrollViewport, setScrollViewport] = useState({ left: 0, top: 0, width: 0, height: 0 });
  const [deletePreviewNodeId, setDeletePreviewNodeId] = useState<string | null>(null);
  const [deletePreviewConnectionId, setDeletePreviewConnectionId] = useState<string | null>(null);
  const [clearPreviewActive, setClearPreviewActive] = useState(false);
  const [keyboardFocus, setKeyboardFocus] = useState<PatchCanvasFocusable | null>(null);
  const [wirePreviewOwner, setWirePreviewOwner] = useState<"keyboard" | "mouse" | null>(null);
  const keyboardWirePreviewKeyRef = useRef("");
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
  const keyboardNavigationModel = useMemo(
    () =>
      buildPatchCanvasNavigationModel({
        patch,
        layoutByNode,
        probes: probeState.probes
      }),
    [layoutByNode, patch, probeState.probes]
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
    handleModuleHoverWhileWiring,
    handlePortHover,
    handlePortSelection,
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
    togglePopoverForNode,
    onWireCommitFeedback
  });
  const keyboardPorts = useMemo(() => {
    if (keyboardFocus?.kind !== "module" && keyboardFocus?.kind !== "port") {
      return [];
    }
    const nodeId = keyboardFocus.kind === "module" ? keyboardFocus.nodeId : keyboardFocus.nodeId;
    return resolvePatchFocusablePorts({
      patch,
      layoutByNode,
      nodeId,
      outputHostCanvasLeft,
      hitPorts
    });
  }, [hitPorts, keyboardFocus, layoutByNode, outputHostCanvasLeft, patch]);
  const keyboardWireTargetPort = useMemo(() => {
    if (!pendingFromPort || keyboardFocus?.kind !== "module") {
      return null;
    }
    return resolveKeyboardWireTargetPort({
      patch,
      pendingFromPort,
      ports: keyboardPorts,
      structureLocked
    });
  }, [keyboardFocus, keyboardPorts, patch, pendingFromPort, structureLocked]);

  useEffect(() => {
    if (!keyboardFocus) {
      return;
    }
    const focusId = buildPatchFocusableId(keyboardFocus);
    if (keyboardFocus.kind === "port") {
      const portExists = keyboardPorts.some(
        (port) =>
          port.nodeId === keyboardFocus.nodeId &&
          port.portId === keyboardFocus.portId &&
          port.portKind === keyboardFocus.portKind
      );
      if (!portExists) {
        setKeyboardFocus({ kind: "module", nodeId: keyboardFocus.nodeId });
      }
      return;
    }
    if (!keyboardNavigationModel.itemById.has(focusId)) {
      setKeyboardFocus(
        resolveDefaultPatchCanvasFocus({
          model: keyboardNavigationModel,
          selectedNodeId,
          selectedProbeId: probeState.selectedProbeId
        })
      );
    }
  }, [keyboardFocus, keyboardNavigationModel, keyboardPorts, probeState.selectedProbeId, selectedNodeId]);

  useEffect(() => {
    if (!popoverNodeId) {
      return;
    }
    setKeyboardFocus({ kind: "module", nodeId: popoverNodeId });
    if (selectedNodeId !== popoverNodeId) {
      onSelectNode(popoverNodeId);
      onSelectConnection(undefined);
    }
  }, [onSelectConnection, onSelectNode, popoverNodeId, selectedNodeId]);

  const ensureKeyboardFocus = useCallback(() => {
    if (popoverNodeId) {
      const expandedFocus: PatchCanvasFocusable = { kind: "module", nodeId: popoverNodeId };
      setKeyboardFocus(expandedFocus);
      return expandedFocus;
    }
    const nextFocus =
      keyboardFocus ??
      resolveDefaultPatchCanvasFocus({
        model: keyboardNavigationModel,
        selectedNodeId,
        selectedProbeId: probeState.selectedProbeId
      });
    setKeyboardFocus(nextFocus);
    return nextFocus;
  }, [keyboardFocus, keyboardNavigationModel, popoverNodeId, probeState.selectedProbeId, selectedNodeId]);

  const enterCanvasKeyboardFocus = useCallback(() => {
    const nextFocus = resolveDefaultPatchCanvasFocus({
      model: keyboardNavigationModel,
      selectedNodeId,
      selectedProbeId: probeState.selectedProbeId
    });
    setKeyboardFocus(nextFocus);
    scrollCanvasFocusIntoView(nextFocus, keyboardNavigationModel, scrollRef.current, zoom);
    scrollRef.current?.focus();
    return Boolean(nextFocus);
  }, [keyboardNavigationModel, probeState.selectedProbeId, selectedNodeId, zoom]);

  const handlePatchCanvasKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      if (isShortcutBlockedTarget(event.target) && event.currentTarget === event.target) {
        return;
      }
      const key = event.key as PatchHardwareArrowKey;
      const isArrow = key === "ArrowUp" || key === "ArrowRight" || key === "ArrowDown" || key === "ArrowLeft";
      if (!isArrow && event.key !== "Enter" && event.key !== "Escape") {
        return;
      }
      const currentFocus = ensureKeyboardFocus();
      if (!currentFocus) {
        return;
      }
      if (event.key === "Escape") {
        if (popoverNodeId) {
          event.preventDefault();
          closePopover();
          return;
        }
        if (currentFocus.kind === "port") {
          event.preventDefault();
          setKeyboardFocus({ kind: "module", nodeId: currentFocus.nodeId });
        }
        return;
      }
      if (event.key === "Enter") {
        if (currentFocus.kind === "module") {
          event.preventDefault();
          if (popoverNodeId === currentFocus.nodeId) {
            closePopover();
            return;
          }
          if (selectedNodeId === currentFocus.nodeId) {
            togglePopoverForNode(currentFocus.nodeId);
            return;
          }
          onSelectNode(currentFocus.nodeId);
          onSelectConnection(undefined);
          return;
        }
        if (currentFocus.kind === "probe") {
          event.preventDefault();
          onSelectNode(undefined);
          onSelectConnection(undefined);
          probeActions.selectProbe(currentFocus.probeId);
          return;
        }
        const port = keyboardPorts.find(
          (entry) =>
            entry.nodeId === currentFocus.nodeId &&
            entry.portId === currentFocus.portId &&
            entry.portKind === currentFocus.portKind
        );
        if (port) {
          event.preventDefault();
          if (port.nodeId === outputNodeId && port.portKind === "in" && !pendingFromPort) {
            onSelectNode(outputNodeId);
            onSelectConnection(undefined);
            return;
          }
          if (pendingFromPort) {
            setWirePreviewOwner("keyboard");
          }
          handlePortSelection(
            {
              nodeId: port.nodeId,
              portId: port.portId,
              kind: port.portKind,
              x: port.x,
              y: port.y,
              width: port.width,
              height: port.height
            },
            { x: port.x + port.width / 2, y: port.y + port.height / 2 }
          );
        }
        return;
      }
      if (popoverNodeId) {
        event.preventDefault();
        setKeyboardFocus({ kind: "module", nodeId: popoverNodeId });
        return;
      }
      if (currentFocus.kind === "port") {
        event.preventDefault();
        if (pendingFromPort) {
          setWirePreviewOwner("keyboard");
        }
        const nextPortFocus = resolveNextPatchPortFocus({
          current: currentFocus,
          ports: keyboardPorts,
          key
        });
        if (nextPortFocus.kind === "port") {
          setKeyboardFocus(nextPortFocus.focus);
          return;
        }
        if (nextPortFocus.kind === "exitToModule") {
          setKeyboardFocus({ kind: "module", nodeId: currentFocus.nodeId });
          return;
        }
        const nextFocus = resolveNextPatchCanvasFocus(
          keyboardNavigationModel,
          { kind: "module", nodeId: currentFocus.nodeId },
          key
        );
        setKeyboardFocus(nextFocus);
        scrollCanvasFocusIntoView(nextFocus, keyboardNavigationModel, scrollRef.current, zoom);
        return;
      }
      if (currentFocus.kind === "module" && selectedNodeId === currentFocus.nodeId && keyboardPorts.length > 0) {
        if (key === "ArrowLeft" || key === "ArrowRight") {
          event.preventDefault();
          if (pendingFromPort) {
            setWirePreviewOwner("keyboard");
          }
          const nextPort = resolveBottomMostPort(keyboardPorts, key === "ArrowLeft" ? "in" : "out");
          if (nextPort) {
            setKeyboardFocus({
              kind: "port",
              nodeId: nextPort.nodeId,
              portId: nextPort.portId,
              portKind: nextPort.portKind
            });
            return;
          }
        }
      }
      event.preventDefault();
      if (pendingFromPort) {
        setWirePreviewOwner("keyboard");
      }
      const nextFocus = resolveNextPatchCanvasFocus(keyboardNavigationModel, currentFocus, key);
      setKeyboardFocus(nextFocus);
      scrollCanvasFocusIntoView(nextFocus, keyboardNavigationModel, scrollRef.current, zoom);
    },
    [
      closePopover,
      ensureKeyboardFocus,
      handlePortSelection,
      keyboardNavigationModel,
      keyboardPorts,
      onSelectConnection,
      onSelectNode,
      outputNodeId,
      popoverNodeId,
      probeActions,
      pendingFromPort,
      selectedNodeId,
      togglePopoverForNode,
      zoom
    ]
  );

  useEffect(() => {
    if (!pendingFromPort) {
      setWirePreviewOwner(null);
    }
  }, [pendingFromPort]);

  useEffect(() => {
    if (!pendingFromPort || wirePreviewOwner !== "keyboard") {
      keyboardWirePreviewKeyRef.current = "";
      return;
    }
    const previewKey = resolveKeyboardWirePreviewKey({
      focus: keyboardFocus,
      pendingFromPort,
      targetPort: keyboardWireTargetPort
    });
    if (keyboardWirePreviewKeyRef.current === previewKey) {
      return;
    }
    keyboardWirePreviewKeyRef.current = previewKey;

    if (keyboardFocus?.kind === "port") {
      const port = keyboardPorts.find(
        (entry) =>
          entry.nodeId === keyboardFocus.nodeId &&
          entry.portId === keyboardFocus.portId &&
          entry.portKind === keyboardFocus.portKind
      );
      if (!port) {
        return;
      }
      const hitPort = toHitPort(port);
      handlePortHover(hitPort, resolvePortFocusPointer(hitPort));
      return;
    }
    if (keyboardFocus?.kind === "module") {
      const hitPort = keyboardWireTargetPort ? toHitPort(keyboardWireTargetPort) : null;
      handleModuleHoverWhileWiring({
        enabled: true,
        nodeId: keyboardFocus.nodeId,
        nearestPort: hitPort,
        pointer: hitPort
          ? resolvePortFocusPointer(hitPort)
          : resolveModuleFocusPointer(keyboardNavigationModel, keyboardFocus.nodeId)
      });
      return;
    }
    handlePortHover(null, null);
    handleModuleHoverWhileWiring({
      enabled: false,
      nodeId: null,
      nearestPort: null,
      pointer: { x: 0, y: 0 }
    });
  }, [
    handleModuleHoverWhileWiring,
    handlePortHover,
    keyboardFocus,
    keyboardNavigationModel,
    keyboardPorts,
    keyboardWireTargetPort,
    pendingFromPort,
    wirePreviewOwner
  ]);

  const handleCanvasPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (pendingFromPort) {
        setWirePreviewOwner("mouse");
      }
      onPointerMove(event);
    },
    [onPointerMove, pendingFromPort]
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
              ensureKeyboardFocus();
            }
          }}
          onKeyDown={handlePatchCanvasKeyDown}
          onScroll={(event) => {
            updateScrollViewport(event.currentTarget);
          }}
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

function PatchKeyboardFocusOverlay(props: {
  focus: PatchCanvasFocusable | null;
  model: ReturnType<typeof buildPatchCanvasNavigationModel>;
  ports: ReturnType<typeof resolvePatchFocusablePorts>;
  selectedNodeId?: string;
  selectedProbeId?: string;
  zoom: number;
}) {
  if (!props.focus) {
    return null;
  }
  const rect = resolveKeyboardFocusRect(props.focus, props.model, props.ports);
  if (!rect) {
    return null;
  }
  const selected =
    (props.focus.kind === "module" && props.selectedNodeId === props.focus.nodeId) ||
    (props.focus.kind === "probe" && props.selectedProbeId === props.focus.probeId);
  return (
    <div
      className={`patch-keyboard-focus-ring${selected ? " selected" : ""}`}
      style={{
        left: `${rect.x * props.zoom}px`,
        top: `${rect.y * props.zoom}px`,
        width: `${rect.width * props.zoom}px`,
        height: `${rect.height * props.zoom}px`
      }}
    />
  );
}

function resolveKeyboardFocusRect(
  focus: PatchCanvasFocusable,
  model: ReturnType<typeof buildPatchCanvasNavigationModel>,
  ports: ReturnType<typeof resolvePatchFocusablePorts>
) {
  if (focus.kind === "port") {
    const port = ports.find(
      (entry) => entry.nodeId === focus.nodeId && entry.portId === focus.portId && entry.portKind === focus.portKind
    );
    return port
      ? {
          x: port.x - PATCH_PORT_FOCUS_PAD_X,
          y: port.y - port.height / 2 - PATCH_PORT_FOCUS_PAD_Y,
          width: port.width + PATCH_PORT_FOCUS_PAD_X * 2,
          height: port.height + PATCH_PORT_FOCUS_PAD_Y * 2
        }
      : null;
  }
  return model.itemById.get(buildPatchFocusableId(focus))?.rect ?? null;
}

function resolveKeyboardWireTargetPort(args: {
  patch: PatchEditorStageModel["patch"];
  pendingFromPort: HitPort;
  ports: ReturnType<typeof resolvePatchFocusablePorts>;
  structureLocked?: boolean;
}) {
  const candidates = args.ports
    .filter(
      (port) =>
        !(
          port.nodeId === args.pendingFromPort.nodeId &&
          port.portId === args.pendingFromPort.portId &&
          port.portKind === args.pendingFromPort.kind
        )
    )
    .map((port) => {
      const hitPort = toHitPort(port);
      return {
        port,
        result: resolvePatchWireCandidate(args.patch, args.pendingFromPort, hitPort, {
          structureLocked: args.structureLocked
        })
      };
    });
  return (
    candidates.find((candidate) => candidate.result.status === "valid")?.port ??
    candidates.find((candidate) => candidate.result.status === "replace")?.port ??
    candidates.find((candidate) => candidate.result.status === "invalid")?.port ??
    candidates.find((candidate) => candidate.result.status !== "new-source")?.port ??
    candidates[0]?.port ??
    null
  );
}

function resolveBottomMostPort(ports: ReturnType<typeof resolvePatchFocusablePorts>, portKind: "in" | "out") {
  return ports
    .filter((port) => port.portKind === portKind)
    .sort((a, b) => b.y - a.y || b.portId.localeCompare(a.portId))[0];
}

function resolveKeyboardWirePreviewKey(args: {
  focus: PatchCanvasFocusable | null;
  pendingFromPort: HitPort;
  targetPort: ReturnType<typeof resolvePatchFocusablePorts>[number] | null;
}) {
  const sourceKey = `${args.pendingFromPort.nodeId}:${args.pendingFromPort.portId}:${args.pendingFromPort.kind}`;
  if (args.focus?.kind === "port") {
    return `${sourceKey}->port:${args.focus.nodeId}:${args.focus.portId}:${args.focus.portKind}`;
  }
  if (args.focus?.kind === "module") {
    const targetKey = args.targetPort
      ? `${args.targetPort.nodeId}:${args.targetPort.portId}:${args.targetPort.portKind}`
      : "none";
    return `${sourceKey}->module:${args.focus.nodeId}:${targetKey}`;
  }
  return `${sourceKey}->none`;
}

function toHitPort(port: ReturnType<typeof resolvePatchFocusablePorts>[number]): HitPort {
  return {
    nodeId: port.nodeId,
    portId: port.portId,
    kind: port.portKind,
    x: port.x,
    y: port.y,
    width: port.width,
    height: port.height
  };
}

function resolvePortFocusPointer(port: HitPort) {
  return {
    x: port.x + port.width / 2,
    y: port.y
  };
}

function resolveModuleFocusPointer(model: ReturnType<typeof buildPatchCanvasNavigationModel>, nodeId: string) {
  const rect = model.itemById.get(buildPatchFocusableId({ kind: "module", nodeId }))?.rect;
  if (!rect) {
    return { x: 0, y: 0 };
  }
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2
  };
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

function scrollCanvasFocusIntoView(
  focus: PatchCanvasFocusable | null,
  model: ReturnType<typeof buildPatchCanvasNavigationModel>,
  scroll: HTMLDivElement | null,
  zoom: number
) {
  if (!focus || focus.kind === "port" || !scroll) {
    return;
  }
  const rect = model.itemById.get(buildPatchFocusableId(focus))?.rect;
  if (!rect) {
    return;
  }
  const left = rect.x * zoom;
  const top = rect.y * zoom;
  scrollRectIntoView(scroll, {
    left,
    top,
    right: left + rect.width * zoom,
    bottom: top + rect.height * zoom
  });
}

function scrollRectIntoView(
  scroll: HTMLDivElement,
  rect: { left: number; top: number; right: number; bottom: number }
) {
  if (rect.left < scroll.scrollLeft) {
    scroll.scrollLeft = rect.left;
  } else if (rect.right > scroll.scrollLeft + scroll.clientWidth) {
    scroll.scrollLeft = rect.right - scroll.clientWidth;
  }
  if (rect.top < scroll.scrollTop) {
    scroll.scrollTop = rect.top;
  } else if (rect.bottom > scroll.scrollTop + scroll.clientHeight) {
    scroll.scrollTop = rect.bottom - scroll.clientHeight;
  }
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

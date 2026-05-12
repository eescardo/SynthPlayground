import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from "react";
import { HitPort } from "@/components/patch/patchCanvasGeometry";
import { isShortcutBlockedTarget } from "@/hooks/patch/patchWorkspaceStateUtils";
import {
  buildPatchCanvasNavigationModel,
  buildPatchFocusableId,
  PatchCanvasFocusable,
  PatchFocusablePort,
  PatchHardwareArrowKey,
  resolveDefaultPatchCanvasFocus,
  resolveNextPatchCanvasFocus,
  resolveNextPatchPortFocus,
  resolvePatchFocusablePorts,
  resolvePatchHostFocusablePorts
} from "@/lib/patch/hardwareNavigation";
import { resolvePatchWireCandidate } from "@/lib/patch/wireCandidate";
import { Patch, PatchLayoutNode } from "@/types/patch";
import { PatchWorkspaceProbeState } from "@/types/probes";

type PortSelectionHandler = (port: HitPort, pointer: { x: number; y: number }) => void;
type PortHoverHandler = (port: HitPort | null, pointer: { x: number; y: number } | null) => void;
type ModuleHoverHandler = (args: {
  nodeId: string | null;
  nearestPort: HitPort | null;
  pointer: { x: number; y: number };
  enabled: boolean;
  cancelActionActive?: boolean;
}) => void;

export function usePatchCanvasKeyboardNavigation(args: {
  closePopover: () => void;
  clearPendingConnection: () => void;
  handleModuleHoverWhileWiring: ModuleHoverHandler;
  handlePortHover: PortHoverHandler;
  handlePortSelection: PortSelectionHandler;
  handleReplaceCandidateKeyDown: (key: string) => boolean;
  hitPorts: HitPort[];
  layoutByNode: Map<string, PatchLayoutNode>;
  onSelectConnection: (connectionId?: string) => void;
  onSelectNode: (nodeId?: string) => void;
  onSelectProbe: (probeId: string) => void;
  onToggleAttachProbe: (probeId: string) => void;
  onToggleProbeExpanded: (probeId: string) => void;
  outputHostCanvasLeft: number;
  outputNodeId?: string;
  patch: Patch;
  pendingFromPort: HitPort | null;
  popoverNodeId: string | null;
  probes: PatchWorkspaceProbeState[];
  scrollRef: RefObject<HTMLDivElement | null>;
  selectedNodeId?: string;
  selectedProbeId?: string;
  structureLocked?: boolean;
  togglePopoverForNode: (nodeId: string) => void;
  zoom: number;
}) {
  const {
    clearPendingConnection,
    closePopover,
    handleModuleHoverWhileWiring,
    handlePortHover,
    handlePortSelection,
    handleReplaceCandidateKeyDown,
    onSelectConnection,
    onSelectNode,
    onSelectProbe,
    onToggleAttachProbe,
    onToggleProbeExpanded,
    outputNodeId,
    pendingFromPort,
    popoverNodeId,
    selectedProbeId,
    selectedNodeId,
    togglePopoverForNode
  } = args;
  const explicitScrollIntentRef = useRef(false);
  const keyboardScrollIntoViewRef = useRef(false);
  const keyboardWirePreviewKeyRef = useRef("");
  const [keyboardFocus, setKeyboardFocus] = useState<PatchCanvasFocusable | null>(null);
  const [wirePreviewOwner, setWirePreviewOwner] = useState<"keyboard" | "mouse" | null>(null);

  const keyboardHostPorts = useMemo(
    () => resolvePatchHostFocusablePorts({ patch: args.patch, outputHostCanvasLeft: args.outputHostCanvasLeft }),
    [args.outputHostCanvasLeft, args.patch]
  );
  const keyboardNavigationPorts = useMemo(
    () => filterWireDestinationPorts(keyboardHostPorts, pendingFromPort),
    [keyboardHostPorts, pendingFromPort]
  );
  const keyboardNavigationModel = useMemo(
    () =>
      buildPatchCanvasNavigationModel({
        patch: args.patch,
        layoutByNode: args.layoutByNode,
        probes: args.probes,
        ports: keyboardNavigationPorts
      }),
    [args.layoutByNode, args.patch, args.probes, keyboardNavigationPorts]
  );
  const keyboardPorts = useMemo(() => {
    if (keyboardFocus?.kind !== "module" && keyboardFocus?.kind !== "port") {
      return [];
    }
    if (keyboardFocus.kind === "port" && containsFocusablePort(keyboardHostPorts, keyboardFocus)) {
      return filterWireDestinationPorts(keyboardHostPorts, pendingFromPort);
    }
    const ports = resolvePatchFocusablePorts({
      patch: args.patch,
      layoutByNode: args.layoutByNode,
      nodeId: keyboardFocus.nodeId,
      outputHostCanvasLeft: args.outputHostCanvasLeft,
      hitPorts: args.hitPorts
    });
    return filterWireDestinationPorts(ports, pendingFromPort);
  }, [
    args.hitPorts,
    args.layoutByNode,
    args.outputHostCanvasLeft,
    args.patch,
    pendingFromPort,
    keyboardFocus,
    keyboardHostPorts
  ]);
  const keyboardWireTargetPort = useMemo(() => {
    if (!pendingFromPort || keyboardFocus?.kind !== "module") {
      return null;
    }
    return resolveKeyboardWireTargetPort({
      patch: args.patch,
      pendingFromPort: pendingFromPort,
      ports: keyboardPorts,
      structureLocked: args.structureLocked
    });
  }, [args.patch, pendingFromPort, args.structureLocked, keyboardFocus, keyboardPorts]);

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
        setKeyboardFocus(
          resolveFilteredPortReplacementFocus({
            focus: keyboardFocus,
            hostPorts: keyboardHostPorts,
            model: keyboardNavigationModel,
            selectedNodeId: selectedNodeId,
            selectedProbeId
          })
        );
      }
      return;
    }
    if (keyboardFocus.kind === "probe-action") {
      const probeExists = args.probes.some((probe) => probe.id === keyboardFocus.probeId);
      if (!probeExists || selectedProbeId !== keyboardFocus.probeId) {
        setKeyboardFocus(
          resolveDefaultPatchCanvasFocus({
            model: keyboardNavigationModel,
            selectedNodeId: selectedNodeId,
            selectedProbeId
          })
        );
      }
      return;
    }
    if (!keyboardNavigationModel.itemById.has(focusId)) {
      setKeyboardFocus(
        resolveDefaultPatchCanvasFocus({
          model: keyboardNavigationModel,
          selectedNodeId: selectedNodeId,
          selectedProbeId
        })
      );
    }
  }, [
    args.probes,
    selectedNodeId,
    selectedProbeId,
    keyboardFocus,
    keyboardHostPorts,
    keyboardNavigationModel,
    keyboardPorts
  ]);

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
        selectedNodeId: selectedNodeId,
        selectedProbeId
      });
    setKeyboardFocus(nextFocus);
    return nextFocus;
  }, [popoverNodeId, selectedNodeId, selectedProbeId, keyboardFocus, keyboardNavigationModel]);

  const scrollKeyboardFocusIntoView = useCallback(
    (focus: PatchCanvasFocusable | null) => {
      const didScroll = scrollCanvasFocusIntoView(focus, keyboardNavigationModel, args.scrollRef.current, args.zoom);
      if (didScroll) {
        explicitScrollIntentRef.current = false;
        keyboardScrollIntoViewRef.current = true;
      }
    },
    [args.scrollRef, args.zoom, keyboardNavigationModel]
  );

  useLayoutEffect(() => {
    scrollKeyboardFocusIntoView(keyboardFocus);
  }, [keyboardFocus, scrollKeyboardFocusIntoView]);

  const enterCanvasKeyboardFocus = useCallback(() => {
    const nextFocus = resolveDefaultPatchCanvasFocus({
      model: keyboardNavigationModel,
      selectedNodeId: selectedNodeId,
      selectedProbeId
    });
    setKeyboardFocus(nextFocus);
    scrollKeyboardFocusIntoView(nextFocus);
    args.scrollRef.current?.focus();
    return Boolean(nextFocus);
  }, [args.scrollRef, selectedNodeId, selectedProbeId, keyboardNavigationModel, scrollKeyboardFocusIntoView]);

  const markExplicitCanvasScrollIntent = useCallback(() => {
    explicitScrollIntentRef.current = true;
  }, []);

  const setWirePreviewOwnerFromMouse = useCallback(() => {
    setWirePreviewOwner("mouse");
  }, []);

  const handleCanvasScroll = useCallback(
    (element: HTMLDivElement, updateScrollViewport: (element: HTMLDivElement) => void) => {
      updateScrollViewport(element);
      if (keyboardScrollIntoViewRef.current) {
        keyboardScrollIntoViewRef.current = false;
        return;
      }
      if (explicitScrollIntentRef.current) {
        explicitScrollIntentRef.current = false;
        setKeyboardFocus(null);
        if (pendingFromPort) {
          setWirePreviewOwner("mouse");
        }
      }
    },
    [pendingFromPort]
  );

  const handlePatchCanvasKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      if (
        isShortcutBlockedTarget(event.target) &&
        event.currentTarget === event.target &&
        !isPatchCanvasKeyboardDelegateTarget(event.currentTarget)
      ) {
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
      if (handleReplaceCandidateKeyDown(event.key)) {
        event.preventDefault();
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
        if (currentFocus.kind === "probe-action") {
          event.preventDefault();
          setKeyboardFocus({ kind: "probe", probeId: currentFocus.probeId });
        }
        return;
      }
      if (event.key === "Enter") {
        if (currentFocus.kind === "module") {
          event.preventDefault();
          if (pendingFromPort) {
            clearPendingConnection();
            return;
          }
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
          onSelectProbe(currentFocus.probeId);
          if (selectedProbeId === currentFocus.probeId) {
            onToggleProbeExpanded(currentFocus.probeId);
          }
          return;
        }
        if (currentFocus.kind === "probe-action") {
          event.preventDefault();
          onSelectNode(undefined);
          onSelectConnection(undefined);
          onSelectProbe(currentFocus.probeId);
          onToggleAttachProbe(currentFocus.probeId);
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
          handlePortSelection(toHitPort(port), { x: port.x + port.width / 2, y: port.y + port.height / 2 });
        }
        return;
      }
      if (popoverNodeId) {
        event.preventDefault();
        setKeyboardFocus({ kind: "module", nodeId: popoverNodeId });
        return;
      }
      if (currentFocus.kind === "probe-action") {
        event.preventDefault();
        if (key === "ArrowLeft") {
          setKeyboardFocus({ kind: "probe", probeId: currentFocus.probeId });
          return;
        }
        const nextFocus = resolveNextPatchCanvasFocus(
          keyboardNavigationModel,
          { kind: "probe", probeId: currentFocus.probeId },
          key
        );
        setKeyboardFocus(nextFocus);
        scrollKeyboardFocusIntoView(nextFocus);
        return;
      }
      if (currentFocus.kind === "probe" && key === "ArrowRight") {
        event.preventDefault();
        onSelectNode(undefined);
        onSelectConnection(undefined);
        onSelectProbe(currentFocus.probeId);
        setKeyboardFocus({ kind: "probe-action", probeId: currentFocus.probeId, actionId: "attach" });
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
        const graphFocus = keyboardNavigationModel.itemById.has(buildPatchFocusableId(currentFocus))
          ? currentFocus
          : { kind: "module" as const, nodeId: currentFocus.nodeId };
        const nextFocus = resolveNextPatchCanvasFocus(keyboardNavigationModel, graphFocus, key);
        setKeyboardFocus(nextFocus);
        scrollKeyboardFocusIntoView(nextFocus);
        return;
      }
      if (
        currentFocus.kind === "module" &&
        keyboardPorts.length > 0 &&
        (selectedNodeId === currentFocus.nodeId || pendingFromPort)
      ) {
        const entryPortKind = resolveKeyboardModulePortEntryKind({ key, pendingFromPort: pendingFromPort });
        if (entryPortKind) {
          event.preventDefault();
          if (pendingFromPort) {
            setWirePreviewOwner("keyboard");
          }
          const nextPort = resolveEntryPort(keyboardPorts, entryPortKind, key);
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
      scrollKeyboardFocusIntoView(nextFocus);
    },
    [
      clearPendingConnection,
      closePopover,
      handlePortSelection,
      handleReplaceCandidateKeyDown,
      onSelectConnection,
      onSelectNode,
      onSelectProbe,
      onToggleAttachProbe,
      onToggleProbeExpanded,
      outputNodeId,
      pendingFromPort,
      popoverNodeId,
      selectedNodeId,
      selectedProbeId,
      togglePopoverForNode,
      ensureKeyboardFocus,
      keyboardNavigationModel,
      keyboardPorts,
      scrollKeyboardFocusIntoView
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
      pendingFromPort: pendingFromPort,
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
      handleModuleHoverWhileWiring({
        enabled: false,
        nodeId: null,
        nearestPort: null,
        cancelActionActive: false,
        pointer: resolvePortFocusPointer(hitPort)
      });
      handlePortHover(hitPort, resolvePortFocusPointer(hitPort));
      return;
    }
    if (keyboardFocus?.kind === "module") {
      const hitPort = keyboardWireTargetPort ? toHitPort(keyboardWireTargetPort) : null;
      handleModuleHoverWhileWiring({
        enabled: true,
        nodeId: keyboardFocus.nodeId,
        nearestPort: hitPort,
        cancelActionActive: true,
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
      cancelActionActive: false,
      pointer: { x: 0, y: 0 }
    });
  }, [
    handleModuleHoverWhileWiring,
    handlePortHover,
    pendingFromPort,
    keyboardFocus,
    keyboardNavigationModel,
    keyboardPorts,
    keyboardWireTargetPort,
    wirePreviewOwner
  ]);

  return {
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
  };
}

function resolveKeyboardWireTargetPort(args: {
  patch: Patch;
  pendingFromPort: HitPort;
  ports: PatchFocusablePort[];
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

function resolveEntryPort(ports: PatchFocusablePort[], portKind: "in" | "out", key: PatchHardwareArrowKey) {
  const sortedPorts = ports
    .filter((port) => port.portKind === portKind)
    .sort((a, b) => a.y - b.y || a.portId.localeCompare(b.portId));
  return key === "ArrowDown" ? sortedPorts[0] : sortedPorts.at(-1);
}

function resolveKeyboardModulePortEntryKind(args: {
  key: PatchHardwareArrowKey;
  pendingFromPort: HitPort | null;
}): "in" | "out" | null {
  if (args.pendingFromPort) {
    if (args.pendingFromPort.kind === "out") {
      return args.key === "ArrowLeft" || args.key === "ArrowUp" || args.key === "ArrowDown" ? "in" : null;
    }
    return args.key === "ArrowRight" || args.key === "ArrowUp" || args.key === "ArrowDown" ? "out" : null;
  }
  if (args.key === "ArrowLeft") {
    return "in";
  }
  if (args.key === "ArrowRight") {
    return "out";
  }
  return null;
}

function filterWireDestinationPorts(ports: PatchFocusablePort[], pendingFromPort: HitPort | null) {
  if (!pendingFromPort) {
    return ports;
  }
  return ports.filter(
    (port) =>
      port.portKind !== pendingFromPort.kind &&
      !(port.nodeId === pendingFromPort.nodeId && port.portId === pendingFromPort.portId)
  );
}

function containsFocusablePort(ports: PatchFocusablePort[], focus: Extract<PatchCanvasFocusable, { kind: "port" }>) {
  return ports.some(
    (port) => port.nodeId === focus.nodeId && port.portId === focus.portId && port.portKind === focus.portKind
  );
}

function resolveFilteredPortReplacementFocus(args: {
  focus: Extract<PatchCanvasFocusable, { kind: "port" }>;
  hostPorts: PatchFocusablePort[];
  model: ReturnType<typeof buildPatchCanvasNavigationModel>;
  selectedNodeId?: string;
  selectedProbeId?: string;
}): PatchCanvasFocusable | null {
  const moduleFocus: PatchCanvasFocusable = { kind: "module", nodeId: args.focus.nodeId };
  if (args.model.itemById.has(buildPatchFocusableId(moduleFocus))) {
    return moduleFocus;
  }
  if (containsFocusablePort(args.hostPorts, args.focus)) {
    return args.model.items[0]?.focus ?? null;
  }
  return resolveDefaultPatchCanvasFocus({
    model: args.model,
    selectedNodeId: args.selectedNodeId,
    selectedProbeId: args.selectedProbeId
  });
}

function resolveKeyboardWirePreviewKey(args: {
  focus: PatchCanvasFocusable | null;
  pendingFromPort: HitPort;
  targetPort: PatchFocusablePort | null;
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

function toHitPort(port: PatchFocusablePort): HitPort {
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

function isPatchCanvasKeyboardDelegateTarget(target: HTMLElement) {
  return target.dataset.patchCanvasKeyNav === "true";
}

function scrollCanvasFocusIntoView(
  focus: PatchCanvasFocusable | null,
  model: ReturnType<typeof buildPatchCanvasNavigationModel>,
  scroll: HTMLDivElement | null,
  zoom: number
) {
  if (!focus || !scroll) {
    return false;
  }
  const rect = model.itemById.get(buildPatchFocusableId(focus))?.rect;
  if (!rect) {
    return false;
  }
  const left = rect.x * zoom;
  const top = rect.y * zoom;
  return scrollRectIntoView(scroll, {
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
  let didScroll = false;
  if (rect.left < scroll.scrollLeft) {
    scroll.scrollLeft = rect.left;
    didScroll = true;
  } else if (rect.right > scroll.scrollLeft + scroll.clientWidth) {
    scroll.scrollLeft = rect.right - scroll.clientWidth;
    didScroll = true;
  }
  if (rect.top < scroll.scrollTop) {
    scroll.scrollTop = rect.top;
    didScroll = true;
  } else if (rect.bottom > scroll.scrollTop + scroll.clientHeight) {
    scroll.scrollTop = rect.bottom - scroll.clientHeight;
    didScroll = true;
  }
  return didScroll;
}

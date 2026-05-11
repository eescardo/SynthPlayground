import {
  PATCH_CANVAS_GRID,
  PATCH_NODE_HEIGHT,
  PATCH_NODE_WIDTH,
  PATCH_OUTPUT_HOST_STRIP_Y,
  PATCH_PORT_LABEL_HEIGHT,
  PATCH_PORT_ROW_GAP,
  PATCH_PORT_START_Y
} from "@/components/patch/patchCanvasConstants";
import { CanvasRect, HitPort } from "@/components/patch/patchCanvasGeometry";
import { getModuleSchema } from "@/lib/patch/moduleRegistry";
import { getPatchOutputInputPortId, getPatchOutputPort, isPatchOutputPortId } from "@/lib/patch/ports";
import { Patch, PatchLayoutNode } from "@/types/patch";
import { PatchWorkspaceProbeState } from "@/types/probes";

export type PatchHardwareArrowKey = "ArrowUp" | "ArrowRight" | "ArrowDown" | "ArrowLeft";

export type PatchCanvasFocusable =
  | { kind: "module"; nodeId: string }
  | { kind: "probe"; probeId: string }
  | { kind: "port"; nodeId: string; portId: string; portKind: "in" | "out" };

export type PatchCanvasFocusableThingKind = PatchCanvasFocusable["kind"];

export type PatchWorkspaceFocusableThing =
  | PatchCanvasFocusable
  | { kind: "wire"; connectionId: string }
  | { kind: "macro-row"; macroId: string }
  | { kind: "inspector-param"; nodeId: string; paramId: string }
  | { kind: "chat-inspector-toggle"; panel: "chat" | "inspector" }
  | { kind: "toolbar-action"; actionId: string }
  | { kind: "tab"; tabId: string };

export interface PatchNavigationItem {
  id: string;
  focus: PatchCanvasFocusable;
  rect: CanvasRect;
}

export interface PatchNavigationModel {
  items: PatchNavigationItem[];
  itemById: Map<string, PatchNavigationItem>;
  edgesByItemId: Map<string, Partial<Record<PatchHardwareArrowKey, string>>>;
}

export function getPatchFocusableThingKinds(): Array<PatchWorkspaceFocusableThing["kind"]> {
  return [
    "module",
    "probe",
    "port",
    "wire",
    "macro-row",
    "inspector-param",
    "chat-inspector-toggle",
    "toolbar-action",
    "tab"
  ];
}

export function buildPatchCanvasNavigationModel(args: {
  patch: Patch;
  layoutByNode: Map<string, PatchLayoutNode>;
  probes: PatchWorkspaceProbeState[];
}): PatchNavigationModel {
  const moduleItems = args.patch.nodes
    .filter((node) => !isPatchOutputPortId(args.patch, node.id))
    .flatMap((node): PatchNavigationItem[] => {
      const layout = args.layoutByNode.get(node.id);
      if (!layout) {
        return [];
      }
      return [
        {
          id: buildPatchFocusableId({ kind: "module", nodeId: node.id }),
          focus: { kind: "module", nodeId: node.id },
          rect: {
            x: layout.x * PATCH_CANVAS_GRID,
            y: layout.y * PATCH_CANVAS_GRID,
            width: PATCH_NODE_WIDTH,
            height: PATCH_NODE_HEIGHT
          }
        }
      ];
    });
  const probeItems = args.probes.map(
    (probe): PatchNavigationItem => ({
      id: buildPatchFocusableId({ kind: "probe", probeId: probe.id }),
      focus: { kind: "probe", probeId: probe.id },
      rect: {
        x: probe.x * PATCH_CANVAS_GRID,
        y: probe.y * PATCH_CANVAS_GRID,
        width: probe.width * PATCH_CANVAS_GRID,
        height: probe.height * PATCH_CANVAS_GRID
      }
    })
  );
  const items = [...moduleItems, ...probeItems];
  return buildNavigationGraph(items);
}

export function resolvePatchFocusablePorts(args: {
  patch: Patch;
  layoutByNode: Map<string, PatchLayoutNode>;
  nodeId: string;
  outputHostCanvasLeft: number;
  hitPorts: HitPort[];
}) {
  const outputPort = getPatchOutputPort(args.patch);
  if (outputPort?.id === args.nodeId) {
    return [
      {
        nodeId: outputPort.id,
        portId: getPatchOutputInputPortId(args.patch),
        portKind: "in" as const,
        x: args.outputHostCanvasLeft,
        y: PATCH_OUTPUT_HOST_STRIP_Y,
        width: 42,
        height: 14
      }
    ];
  }
  const fromHitPorts = args.hitPorts.filter((port) => port.nodeId === args.nodeId);
  if (fromHitPorts.length > 0) {
    return fromHitPorts
      .map((port) => ({
        nodeId: port.nodeId,
        portId: port.portId,
        portKind: port.kind,
        x: port.x,
        y: port.y,
        width: port.width,
        height: port.height
      }))
      .sort(comparePortsForKeyboard);
  }
  const layout = args.layoutByNode.get(args.nodeId);
  const schema = getModuleSchema(args.patch.nodes.find((node) => node.id === args.nodeId)?.typeId ?? "");
  if (!layout || !schema) {
    return [];
  }
  const x = layout.x * PATCH_CANVAS_GRID;
  const y = layout.y * PATCH_CANVAS_GRID;
  return [
    ...schema.portsIn.map((port, index) => ({
      nodeId: args.nodeId,
      portId: port.id,
      portKind: "in" as const,
      x,
      y: y + PATCH_PORT_START_Y + index * PATCH_PORT_ROW_GAP,
      width: 44,
      height: PATCH_PORT_LABEL_HEIGHT
    })),
    ...schema.portsOut.map((port, index) => ({
      nodeId: args.nodeId,
      portId: port.id,
      portKind: "out" as const,
      x: x + PATCH_NODE_WIDTH - 44,
      y: y + PATCH_PORT_START_Y + index * PATCH_PORT_ROW_GAP,
      width: 44,
      height: PATCH_PORT_LABEL_HEIGHT
    }))
  ].sort(comparePortsForKeyboard);
}

export function buildPatchFocusableId(focus: PatchCanvasFocusable) {
  switch (focus.kind) {
    case "module":
      return `module:${focus.nodeId}`;
    case "probe":
      return `probe:${focus.probeId}`;
    case "port":
      return `port:${focus.nodeId}:${focus.portKind}:${focus.portId}`;
  }
}

export function resolveDefaultPatchCanvasFocus(args: {
  model: PatchNavigationModel;
  selectedNodeId?: string;
  selectedProbeId?: string;
}): PatchCanvasFocusable | null {
  if (args.selectedNodeId) {
    const selectedId = buildPatchFocusableId({ kind: "module", nodeId: args.selectedNodeId });
    if (args.model.itemById.has(selectedId)) {
      return { kind: "module", nodeId: args.selectedNodeId };
    }
  }
  if (args.selectedProbeId) {
    const selectedId = buildPatchFocusableId({ kind: "probe", probeId: args.selectedProbeId });
    if (args.model.itemById.has(selectedId)) {
      return { kind: "probe", probeId: args.selectedProbeId };
    }
  }
  return args.model.items[0]?.focus ?? null;
}

export function resolveNextPatchCanvasFocus(
  model: PatchNavigationModel,
  current: PatchCanvasFocusable | null,
  key: PatchHardwareArrowKey
) {
  const currentId = current ? buildPatchFocusableId(current) : null;
  const fallback = model.items[0]?.focus ?? null;
  if (!currentId || !model.itemById.has(currentId)) {
    return fallback;
  }
  const nextId = model.edgesByItemId.get(currentId)?.[key];
  return nextId ? (model.itemById.get(nextId)?.focus ?? fallback) : fallback;
}

export function resolveNextPatchPortFocus(args: {
  current: Extract<PatchCanvasFocusable, { kind: "port" }>;
  ports: ReturnType<typeof resolvePatchFocusablePorts>;
  key: PatchHardwareArrowKey;
}) {
  const currentIndex = args.ports.findIndex(
    (port) =>
      port.nodeId === args.current.nodeId &&
      port.portId === args.current.portId &&
      port.portKind === args.current.portKind
  );
  if (currentIndex < 0 || args.ports.length === 0) {
    return { kind: "exit" as const };
  }
  const currentPort = args.ports[currentIndex];
  const shouldExit =
    (args.key === "ArrowLeft" && currentPort.portKind === "in") ||
    (args.key === "ArrowRight" && currentPort.portKind === "out") ||
    (args.key === "ArrowUp" && currentIndex === 0) ||
    (args.key === "ArrowDown" && currentIndex === args.ports.length - 1);
  if (shouldExit) {
    return { kind: "exit" as const };
  }
  const delta = args.key === "ArrowUp" || args.key === "ArrowLeft" ? -1 : 1;
  const nextPort = args.ports[currentIndex + delta];
  return nextPort
    ? {
        kind: "port" as const,
        focus: {
          kind: "port" as const,
          nodeId: nextPort.nodeId,
          portId: nextPort.portId,
          portKind: nextPort.portKind
        }
      }
    : { kind: "exit" as const };
}

function buildNavigationGraph(items: PatchNavigationItem[]): PatchNavigationModel {
  const itemById = new Map(items.map((item) => [item.id, item] as const));
  const edgesByItemId = new Map<string, Partial<Record<PatchHardwareArrowKey, string>>>();
  for (const item of items) {
    edgesByItemId.set(item.id, {
      ArrowUp: resolveBestDirectionalNeighbor(item, items, "ArrowUp")?.id,
      ArrowRight: resolveBestDirectionalNeighbor(item, items, "ArrowRight")?.id,
      ArrowDown: resolveBestDirectionalNeighbor(item, items, "ArrowDown")?.id,
      ArrowLeft: resolveBestDirectionalNeighbor(item, items, "ArrowLeft")?.id
    });
  }
  return { items, itemById, edgesByItemId };
}

function resolveBestDirectionalNeighbor(
  from: PatchNavigationItem,
  items: PatchNavigationItem[],
  key: PatchHardwareArrowKey
) {
  const candidates = items.filter((item) => item.id !== from.id);
  const directional = candidates
    .map((item) => ({ item, score: scoreDirectionalNeighbor(from.rect, item.rect, key, false) }))
    .filter((entry) => Number.isFinite(entry.score));
  const scored =
    directional.length > 0
      ? directional
      : candidates.map((item) => ({ item, score: scoreDirectionalNeighbor(from.rect, item.rect, key, true) }));
  return scored.sort((a, b) => a.score - b.score || a.item.id.localeCompare(b.item.id))[0]?.item ?? null;
}

function scoreDirectionalNeighbor(from: CanvasRect, to: CanvasRect, key: PatchHardwareArrowKey, wrap: boolean) {
  const fromCenter = getRectCenter(from);
  const toCenter = getRectCenter(to);
  const dx = toCenter.x - fromCenter.x;
  const dy = toCenter.y - fromCenter.y;
  switch (key) {
    case "ArrowUp":
      if (!wrap && dy >= 0) {
        return Number.POSITIVE_INFINITY;
      }
      return Math.abs(dy) + Math.abs(dx) * 1.8;
    case "ArrowRight":
      if (!wrap && dx <= 0) {
        return Number.POSITIVE_INFINITY;
      }
      return Math.abs(dx) + Math.abs(dy) * 1.8;
    case "ArrowDown":
      if (!wrap && dy <= 0) {
        return Number.POSITIVE_INFINITY;
      }
      return Math.abs(dy) + Math.abs(dx) * 1.8;
    case "ArrowLeft":
      if (!wrap && dx >= 0) {
        return Number.POSITIVE_INFINITY;
      }
      return Math.abs(dx) + Math.abs(dy) * 1.8;
  }
}

function getRectCenter(rect: CanvasRect) {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2
  };
}

function comparePortsForKeyboard(
  a: { portKind: "in" | "out"; y: number; portId: string },
  b: { portKind: "in" | "out"; y: number; portId: string }
) {
  if (a.portKind !== b.portKind) {
    return a.portKind === "in" ? -1 : 1;
  }
  return a.y - b.y || a.portId.localeCompare(b.portId);
}

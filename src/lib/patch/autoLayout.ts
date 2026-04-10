import { getModuleSchema } from "@/lib/patch/moduleRegistry";
import { Patch, PatchLayoutNode, PatchNode, SignalCapability } from "@/types/patch";

const AUTO_LAYOUT_X_GAP_GRID = 12;
const AUTO_LAYOUT_Y_GAP_GRID = 6;
const AUTO_LAYOUT_NODE_WIDTH_GRID = 9;
const AUTO_LAYOUT_NODE_HEIGHT_GRID = 6;
const AUTO_LAYOUT_MARGIN_GRID = 1;

const getModuleSortPriority = (node: PatchNode): number => {
  const schema = getModuleSchema(node.typeId);
  if (schema?.categories.includes("source")) {
    return 0;
  }
  if (schema?.categories.includes("mix")) {
    return 1;
  }
  if (schema?.categories.includes("processor")) {
    return 2;
  }
  if (schema?.categories.includes("cv")) {
    return 3;
  }
  if (schema?.categories.includes("envelope")) {
    return 4;
  }
  if (node.typeId === "Output") {
    return 5;
  }
  return 6;
};

const getConnectionCapability = (patch: Pick<Patch, "nodes">, connection: Patch["connections"][number]): SignalCapability | undefined => {
  const sourceType = patch.nodes.find((node) => node.id === connection.from.nodeId)?.typeId;
  const destType = patch.nodes.find((node) => node.id === connection.to.nodeId)?.typeId;
  const sourcePort = sourceType ? getModuleSchema(sourceType)?.portsOut.find((port) => port.id === connection.from.portId) : undefined;
  const destPort = destType ? getModuleSchema(destType)?.portsIn.find((port) => port.id === connection.to.portId) : undefined;
  return sourcePort?.capabilities.find((capability) => destPort?.capabilities.includes(capability)) ?? sourcePort?.capabilities[0];
};

export function resolveAutoLayoutNodes(patch: Pick<Patch, "nodes" | "connections">): PatchLayoutNode[] {
  const rankByNodeId = new Map<string, number>(patch.nodes.map((node) => [node.id, 0]));
  for (let pass = 0; pass < patch.nodes.length; pass += 1) {
    let changed = false;
    for (const connection of patch.connections) {
      if (!rankByNodeId.has(connection.from.nodeId) || !rankByNodeId.has(connection.to.nodeId)) {
        continue;
      }
      const nextRank = (rankByNodeId.get(connection.from.nodeId) ?? 0) + 1;
      if (nextRank > (rankByNodeId.get(connection.to.nodeId) ?? 0)) {
        rankByNodeId.set(connection.to.nodeId, nextRank);
        changed = true;
      }
    }
    if (!changed) {
      break;
    }
  }

  const nodesByRank = new Map<number, PatchNode[]>();
  for (const node of patch.nodes) {
    const rank = rankByNodeId.get(node.id) ?? 0;
    const siblings = nodesByRank.get(rank) ?? [];
    siblings.push(node);
    nodesByRank.set(rank, siblings);
  }

  const ySlotByNodeId = new Map<string, number>();
  const layout: PatchLayoutNode[] = [];
  for (const [rank, nodes] of [...nodesByRank.entries()].sort(([left], [right]) => left - right)) {
    const usedSlots = new Set<number>();
    nodes
      .sort((left, right) => {
        const leftTarget = getTargetYSlot(patch, left.id, ySlotByNodeId);
        const rightTarget = getTargetYSlot(patch, right.id, ySlotByNodeId);
        return (
          leftTarget - rightTarget ||
          getModuleSortPriority(left) - getModuleSortPriority(right) ||
          left.id.localeCompare(right.id)
        );
      })
      .forEach((node, index) => {
        const preferredSlot = rank === 0 ? index : getTargetYSlot(patch, node.id, ySlotByNodeId);
        const slot = claimNearestFreeSlot(preferredSlot, usedSlots);
        ySlotByNodeId.set(node.id, slot);
        layout.push({
          nodeId: node.id,
          x: 2 + rank * AUTO_LAYOUT_X_GAP_GRID,
          y: 2 + slot * AUTO_LAYOUT_Y_GAP_GRID
        });
      });
  }
  return layout;
}

function getTargetYSlot(
  patch: Pick<Patch, "nodes" | "connections">,
  nodeId: string,
  ySlotByNodeId: Map<string, number>
): number {
  let weightedSum = 0;
  let weightSum = 0;
  for (const connection of patch.connections) {
    if (connection.to.nodeId !== nodeId) {
      continue;
    }
    const sourceSlot = ySlotByNodeId.get(connection.from.nodeId);
    if (sourceSlot === undefined) {
      continue;
    }
    const capability = getConnectionCapability(patch, connection);
    const weight = capability === "AUDIO" ? 5 : 1;
    weightedSum += sourceSlot * weight;
    weightSum += weight;
  }
  return weightSum > 0 ? Math.round(weightedSum / weightSum) : 0;
}

function claimNearestFreeSlot(preferredSlot: number, usedSlots: Set<number>): number {
  for (let distance = 0; distance < 64; distance += 1) {
    const down = preferredSlot + distance;
    if (!usedSlots.has(down)) {
      usedSlots.add(down);
      return down;
    }
    const up = preferredSlot - distance;
    if (up >= 0 && !usedSlots.has(up)) {
      usedSlots.add(up);
      return up;
    }
  }
  const fallback = usedSlots.size;
  usedSlots.add(fallback);
  return fallback;
}

export function ensurePatchLayout(patch: Patch): Patch {
  const nodeIds = new Set(patch.nodes.map((node) => node.id));
  const savedLayout = patch.layout.nodes.filter((node) => nodeIds.has(node.nodeId));
  if (savedLayout.length === patch.nodes.length && !hasLayoutOverlap(savedLayout)) {
    return patch;
  }

  const autoLayoutByNodeId = new Map(resolveAutoLayoutNodes(patch).map((node) => [node.nodeId, node] as const));
  const savedLayoutByNodeId = hasLayoutOverlap(savedLayout)
    ? new Map<string, PatchLayoutNode>()
    : new Map(savedLayout.map((node) => [node.nodeId, node] as const));
  return {
    ...patch,
    layout: {
      nodes: patch.nodes.map((node) => savedLayoutByNodeId.get(node.id) ?? autoLayoutByNodeId.get(node.id) ?? { nodeId: node.id, x: 0, y: 0 })
    }
  };
}

function hasLayoutOverlap(layoutNodes: PatchLayoutNode[]): boolean {
  for (let leftIndex = 0; leftIndex < layoutNodes.length; leftIndex += 1) {
    const left = layoutNodes[leftIndex];
    for (let rightIndex = leftIndex + 1; rightIndex < layoutNodes.length; rightIndex += 1) {
      const right = layoutNodes[rightIndex];
      const xOverlaps =
        left.x < right.x + AUTO_LAYOUT_NODE_WIDTH_GRID + AUTO_LAYOUT_MARGIN_GRID &&
        right.x < left.x + AUTO_LAYOUT_NODE_WIDTH_GRID + AUTO_LAYOUT_MARGIN_GRID;
      const yOverlaps =
        left.y < right.y + AUTO_LAYOUT_NODE_HEIGHT_GRID + AUTO_LAYOUT_MARGIN_GRID &&
        right.y < left.y + AUTO_LAYOUT_NODE_HEIGHT_GRID + AUTO_LAYOUT_MARGIN_GRID;
      if (xOverlaps && yOverlaps) {
        return true;
      }
    }
  }
  return false;
}

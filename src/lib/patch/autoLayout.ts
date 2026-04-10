import { getModuleSchema } from "@/lib/patch/moduleRegistry";
import { Patch, PatchLayoutNode, PatchModuleCategory, PatchNode, SignalCapability } from "@/types/patch";

const AUTO_LAYOUT_X_GAP_GRID = 12;
const AUTO_LAYOUT_Y_GAP_GRID = 7;
const AUTO_LAYOUT_NODE_WIDTH_GRID = 9;
const AUTO_LAYOUT_NODE_HEIGHT_GRID = 6;
const AUTO_LAYOUT_MARGIN_GRID = 1;
const CROSSING_REDUCTION_PASSES = 4;
const AUTO_LAYOUT_CATEGORY_SEED_ORDER: PatchModuleCategory[] = ["source", "mix", "processor", "cv", "envelope", "host"];

const getAutoLayoutSeedPriority = (node: PatchNode): number => {
  // Used only as a deterministic fallback before barycenter crossing reduction has
  // enough graph-neighbor information to order modules within a column.
  if (node.typeId === "Output") {
    return AUTO_LAYOUT_CATEGORY_SEED_ORDER.length;
  }
  const schema = getModuleSchema(node.typeId);
  const categoryIndex = AUTO_LAYOUT_CATEGORY_SEED_ORDER.findIndex((category) => schema?.categories.includes(category));
  return categoryIndex === -1 ? AUTO_LAYOUT_CATEGORY_SEED_ORDER.length + 1 : categoryIndex;
};

const getConnectionCapability = (patch: Pick<Patch, "nodes">, connection: Patch["connections"][number]): SignalCapability | undefined => {
  const sourceType = patch.nodes.find((node) => node.id === connection.from.nodeId)?.typeId;
  const destType = patch.nodes.find((node) => node.id === connection.to.nodeId)?.typeId;
  const sourcePort = sourceType ? getModuleSchema(sourceType)?.portsOut.find((port) => port.id === connection.from.portId) : undefined;
  const destPort = destType ? getModuleSchema(destType)?.portsIn.find((port) => port.id === connection.to.portId) : undefined;
  return sourcePort?.capabilities.find((capability) => destPort?.capabilities.includes(capability)) ?? sourcePort?.capabilities[0];
};

export function resolveAutoLayoutNodes(patch: Pick<Patch, "nodes" | "connections">): PatchLayoutNode[] {
  const rankByNodeId = resolveOutputBackedRanks(patch);

  const nodesByRank = new Map<number, PatchNode[]>();
  for (const node of patch.nodes) {
    const rank = rankByNodeId.get(node.id) ?? 0;
    const siblings = nodesByRank.get(rank) ?? [];
    siblings.push(node);
    nodesByRank.set(rank, siblings);
  }
  const orderedColumns = reduceColumnCrossings(patch, nodesByRank);

  const ySlotByNodeId = new Map<string, number>();
  const layout: PatchLayoutNode[] = [];
  const columnIndexByNodeId = new Map(
    orderedColumns.flatMap(([, nodes], columnIndex) => nodes.map((node) => [node.id, columnIndex] as const))
  );
  for (let columnIndex = 0; columnIndex < orderedColumns.length; columnIndex += 1) {
    const [rank, nodes] = orderedColumns[columnIndex];
    let lastSlot = -1;
    nodes.forEach((node, index) => {
      const preferredSlot = getPlacementTargetSlot(
        patch,
        node.id,
        index,
        ySlotByNodeId,
        orderedColumns,
        columnIndex,
        columnIndexByNodeId
      );
      const slot = Math.max(lastSlot + 1, preferredSlot);
      lastSlot = slot;
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

function getPlacementTargetSlot(
  patch: Pick<Patch, "nodes" | "connections">,
  nodeId: string,
  fallbackIndex: number,
  ySlotByNodeId: Map<string, number>,
  columns: Array<[number, PatchNode[]]>,
  columnIndex: number,
  columnIndexByNodeId: Map<string, number>
): number {
  const predecessorTarget = getTargetYSlot(patch, nodeId, ySlotByNodeId);
  if (columnIndex > 0 && Number.isFinite(predecessorTarget)) {
    return hasAudioPredecessor(patch, nodeId) ? predecessorTarget : Math.round((fallbackIndex + predecessorTarget) / 2);
  }

  const nextColumn = columns[columnIndex + 1]?.[1];
  if (nextColumn) {
    const nextColumnOrder = new Map(nextColumn.map((node, index) => [node.id, index] as const));
    const downstreamTarget = getNeighborBarycenter(patch, nodeId, nextColumnOrder);
    if (Number.isFinite(downstreamTarget)) {
      return Math.round(downstreamTarget + getLongOutgoingEdgeBias(patch, nodeId, columnIndex, columnIndexByNodeId));
    }
  }

  return fallbackIndex;
}

function hasAudioPredecessor(patch: Pick<Patch, "nodes" | "connections">, nodeId: string): boolean {
  return patch.connections.some(
    (connection) => connection.to.nodeId === nodeId && getConnectionCapability(patch, connection) === "AUDIO"
  );
}

function getLongOutgoingEdgeBias(
  patch: Pick<Patch, "connections">,
  nodeId: string,
  columnIndex: number,
  columnIndexByNodeId: Map<string, number>
): number {
  let maxSkippedColumns = 0;
  for (const connection of patch.connections) {
    if (connection.from.nodeId !== nodeId) {
      continue;
    }
    const targetColumnIndex = columnIndexByNodeId.get(connection.to.nodeId);
    if (targetColumnIndex === undefined) {
      continue;
    }
    maxSkippedColumns = Math.max(maxSkippedColumns, targetColumnIndex - columnIndex - 1);
  }
  return Math.max(0, maxSkippedColumns * 0.85);
}

function resolveOutputBackedRanks(patch: Pick<Patch, "nodes" | "connections">): Map<string, number> {
  const nodeIds = new Set(patch.nodes.map((node) => node.id));
  const predecessorsByNodeId = new Map<string, string[]>();
  const outgoingCountByNodeId = new Map<string, number>(patch.nodes.map((node) => [node.id, 0]));
  for (const connection of patch.connections) {
    if (!nodeIds.has(connection.from.nodeId) || !nodeIds.has(connection.to.nodeId)) {
      continue;
    }
    predecessorsByNodeId.set(connection.to.nodeId, [
      ...(predecessorsByNodeId.get(connection.to.nodeId) ?? []),
      connection.from.nodeId
    ]);
    outgoingCountByNodeId.set(connection.from.nodeId, (outgoingCountByNodeId.get(connection.from.nodeId) ?? 0) + 1);
  }

  const sinks = patch.nodes.filter((node) => node.typeId === "Output");
  const outputNodes = sinks.length > 0 ? sinks : patch.nodes.filter((node) => (outgoingCountByNodeId.get(node.id) ?? 0) === 0);
  const distanceToSinkByNodeId = new Map<string, number>();
  const queue = outputNodes.map((node) => {
    distanceToSinkByNodeId.set(node.id, 0);
    return node.id;
  });

  for (let index = 0; index < queue.length; index += 1) {
    const nodeId = queue[index];
    const nextDistance = (distanceToSinkByNodeId.get(nodeId) ?? 0) + 1;
    for (const predecessorId of predecessorsByNodeId.get(nodeId) ?? []) {
      if ((distanceToSinkByNodeId.get(predecessorId) ?? -1) >= nextDistance) {
        continue;
      }
      distanceToSinkByNodeId.set(predecessorId, nextDistance);
      queue.push(predecessorId);
    }
  }

  const maxDistance = Math.max(0, ...distanceToSinkByNodeId.values());
  return new Map(
    patch.nodes.map((node) => [
      node.id,
      distanceToSinkByNodeId.has(node.id) ? maxDistance - (distanceToSinkByNodeId.get(node.id) ?? maxDistance) : 0
    ])
  );
}

function reduceColumnCrossings(
  patch: Pick<Patch, "nodes" | "connections">,
  nodesByRank: Map<number, PatchNode[]>
): Array<[number, PatchNode[]]> {
  const columns = [...nodesByRank.entries()]
    .sort(([left], [right]) => left - right)
    .map(([rank, nodes]) => [
      rank,
      [...nodes].sort((left, right) => getAutoLayoutSeedPriority(left) - getAutoLayoutSeedPriority(right) || left.id.localeCompare(right.id))
    ] as [number, PatchNode[]]);

  for (let pass = 0; pass < CROSSING_REDUCTION_PASSES; pass += 1) {
    for (let columnIndex = 1; columnIndex < columns.length; columnIndex += 1) {
      sortColumnByNeighborBarycenter(patch, columns, columnIndex, columnIndex - 1);
    }
    for (let columnIndex = columns.length - 2; columnIndex >= 0; columnIndex -= 1) {
      sortColumnByNeighborBarycenter(patch, columns, columnIndex, columnIndex + 1);
    }
  }

  return columns;
}

function sortColumnByNeighborBarycenter(
  patch: Pick<Patch, "nodes" | "connections">,
  columns: Array<[number, PatchNode[]]>,
  columnIndex: number,
  neighborColumnIndex: number
) {
  const neighborOrder = new Map(columns[neighborColumnIndex][1].map((node, index) => [node.id, index] as const));
  columns[columnIndex][1].sort((left, right) => {
    const leftTarget = getNeighborBarycenter(patch, left.id, neighborOrder);
    const rightTarget = getNeighborBarycenter(patch, right.id, neighborOrder);
    return (
      compareBarycenters(leftTarget, rightTarget) ||
      getAutoLayoutSeedPriority(left) - getAutoLayoutSeedPriority(right) ||
      left.id.localeCompare(right.id)
    );
  });
}

function compareBarycenters(left: number, right: number): number {
  if (!Number.isFinite(left) && !Number.isFinite(right)) {
    return 0;
  }
  if (!Number.isFinite(left)) {
    return 1;
  }
  if (!Number.isFinite(right)) {
    return -1;
  }
  return left - right;
}

function getNeighborBarycenter(
  patch: Pick<Patch, "nodes" | "connections">,
  nodeId: string,
  neighborOrder: Map<string, number>
): number {
  let weightedSum = 0;
  let weightSum = 0;
  for (const connection of patch.connections) {
    const neighborNodeId =
      connection.to.nodeId === nodeId
        ? connection.from.nodeId
        : connection.from.nodeId === nodeId
          ? connection.to.nodeId
          : null;
    if (!neighborNodeId) {
      continue;
    }
    const neighborIndex = neighborOrder.get(neighborNodeId);
    if (neighborIndex === undefined) {
      continue;
    }
    const capability = getConnectionCapability(patch, connection);
    const weight = capability === "AUDIO" ? 5 : 1;
    weightedSum += (neighborIndex + getNeighborPortOffset(patch, connection, nodeId)) * weight;
    weightSum += weight;
  }
  return weightSum > 0 ? weightedSum / weightSum : Number.POSITIVE_INFINITY;
}

function getNeighborPortOffset(
  patch: Pick<Patch, "nodes">,
  connection: Patch["connections"][number],
  nodeId: string
): number {
  if (connection.from.nodeId === nodeId) {
    return getPortOrderOffset(patch, connection.to.nodeId, "in", connection.to.portId);
  }
  if (connection.to.nodeId === nodeId) {
    return getPortOrderOffset(patch, connection.from.nodeId, "out", connection.from.portId);
  }
  return 0;
}

function getPortOrderOffset(
  patch: Pick<Patch, "nodes">,
  nodeId: string,
  kind: "in" | "out",
  portId: string
): number {
  const typeId = patch.nodes.find((node) => node.id === nodeId)?.typeId;
  const schema = typeId ? getModuleSchema(typeId) : undefined;
  const ports = kind === "in" ? schema?.portsIn : schema?.portsOut;
  const index = ports?.findIndex((port) => port.id === portId) ?? -1;
  return index >= 0 ? index * 0.08 : 0;
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

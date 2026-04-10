import { Patch, PatchLayoutNode, PatchNode } from "@/types/patch";

const AUTO_LAYOUT_X_GAP_GRID = 12;
const AUTO_LAYOUT_Y_GAP_GRID = 7;

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

  const layout: PatchLayoutNode[] = [];
  for (const [rank, nodes] of [...nodesByRank.entries()].sort(([left], [right]) => left - right)) {
    nodes
      .sort((left, right) => left.id.localeCompare(right.id))
      .forEach((node, index) => {
        layout.push({
          nodeId: node.id,
          x: 2 + rank * AUTO_LAYOUT_X_GAP_GRID,
          y: 2 + index * AUTO_LAYOUT_Y_GAP_GRID
        });
      });
  }
  return layout;
}

export function ensurePatchLayout(patch: Patch): Patch {
  const nodeIds = new Set(patch.nodes.map((node) => node.id));
  const savedLayout = patch.layout.nodes.filter((node) => nodeIds.has(node.nodeId));
  if (savedLayout.length === patch.nodes.length) {
    return patch;
  }

  const autoLayoutByNodeId = new Map(resolveAutoLayoutNodes(patch).map((node) => [node.nodeId, node] as const));
  const savedLayoutByNodeId = new Map(savedLayout.map((node) => [node.nodeId, node] as const));
  return {
    ...patch,
    layout: {
      nodes: patch.nodes.map((node) => savedLayoutByNodeId.get(node.id) ?? autoLayoutByNodeId.get(node.id) ?? { nodeId: node.id, x: 0, y: 0 })
    }
  };
}

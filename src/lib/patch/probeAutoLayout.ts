import { resolvePatchConnectionMidpoint, resolvePatchPortAnchorPoint } from "@/components/patch/patchCanvasGeometry";
import { PATCH_CANVAS_GRID } from "@/components/patch/patchCanvasConstants";
import { Patch, PatchLayoutNode } from "@/types/patch";
import { PatchWorkspaceProbeState } from "@/types/probes";

interface ProbeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function overlaps(candidate: ProbeRect, occupied: ProbeRect[]) {
  return occupied.some(
    (entry) =>
      candidate.x < entry.x + entry.width + 1 &&
      entry.x < candidate.x + candidate.width + 1 &&
      candidate.y < entry.y + entry.height + 1 &&
      entry.y < candidate.y + candidate.height + 1
  );
}

export function resolveAutoLayoutProbePositions(
  patch: Patch,
  probes: PatchWorkspaceProbeState[],
  layoutByNode: Map<string, PatchLayoutNode>
) {
  const occupied = patch.nodes
    .map((node) => {
      const layout = layoutByNode.get(node.id);
      return layout ? { x: layout.x, y: layout.y, width: 9, height: 6 } : null;
    })
    .filter((entry): entry is ProbeRect => Boolean(entry));
  const resolved: PatchWorkspaceProbeState[] = [];

  for (const probe of probes) {
    const preferredPoint =
      probe.target?.kind === "connection"
        ? resolvePatchConnectionMidpoint(patch, layoutByNode, probe.target.connectionId)
        : probe.target
          ? resolvePatchPortAnchorPoint(
              patch,
              layoutByNode,
              probe.target.nodeId,
              probe.target.portId,
              probe.target.portKind
            )
          : null;
    const preferredX = preferredPoint ? Math.max(0, Math.round(preferredPoint.x / PATCH_CANVAS_GRID) + 2) : 3;
    const preferredY = preferredPoint
      ? Math.max(0, Math.round(preferredPoint.y / PATCH_CANVAS_GRID) - Math.floor(probe.height / 2))
      : 3;
    let placed = { ...probe, x: preferredX, y: preferredY };
    if (overlaps({ x: placed.x, y: placed.y, width: probe.width, height: probe.height }, [...occupied, ...resolved])) {
      let found = false;
      for (let ring = 0; ring < 40 && !found; ring += 1) {
        for (let dx = -ring; dx <= ring && !found; dx += 1) {
          for (let dy = -ring; dy <= ring && !found; dy += 1) {
            const candidate = {
              ...probe,
              x: Math.max(0, preferredX + dx),
              y: Math.max(0, preferredY + dy)
            };
            if (
              !overlaps({ x: candidate.x, y: candidate.y, width: probe.width, height: probe.height }, [
                ...occupied,
                ...resolved
              ])
            ) {
              placed = candidate;
              found = true;
            }
          }
        }
      }
    }
    resolved.push(placed);
  }

  return resolved;
}

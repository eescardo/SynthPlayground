import { Patch } from "@/types/patch";

export interface PatchPortConnectionTarget {
  nodeId: string;
  portId: string;
  portKind: "in" | "out";
}

export function resolveConnectionIdsForPatchPort(patch: Pick<Patch, "connections">, target: PatchPortConnectionTarget) {
  return patch.connections
    .filter((connection) =>
      target.portKind === "in"
        ? connection.to.nodeId === target.nodeId && connection.to.portId === target.portId
        : connection.from.nodeId === target.nodeId && connection.from.portId === target.portId
    )
    .map((connection) => connection.id);
}

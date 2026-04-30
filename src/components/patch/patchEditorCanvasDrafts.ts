import { ParamValue, Patch } from "@/types/patch";

export function buildParamDraftKey(nodeId: string, paramId: string) {
  return `${nodeId}:${paramId}`;
}

export function applyDraftParamValues(patch: Patch, draftValues: Record<string, ParamValue>): Patch {
  if (Object.keys(draftValues).length === 0) {
    return patch;
  }
  const nextNodes = patch.nodes.map((node) => {
    const nextParams = { ...node.params };
    let changed = false;
    for (const [key, value] of Object.entries(draftValues)) {
      const [nodeId, paramId] = key.split(":");
      if (nodeId === node.id && paramId) {
        nextParams[paramId] = value;
        changed = true;
      }
    }
    return changed ? { ...node, params: nextParams } : node;
  });
  const nextPorts = patch.ports?.map((port) => {
    const nextParams = { ...port.params };
    let changed = false;
    for (const [key, value] of Object.entries(draftValues)) {
      const [nodeId, paramId] = key.split(":");
      if (nodeId === port.id && paramId) {
        nextParams[paramId] = value;
        changed = true;
      }
    }
    return changed ? { ...port, params: nextParams } : port;
  });
  return { ...patch, nodes: nextNodes, ports: nextPorts };
}

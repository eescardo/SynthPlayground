import { resolveHostPatchPortLabel } from "@/components/patch/patchCanvasGeometry";
import { HOST_PORT_IDS } from "@/lib/patch/constants";
import { Patch, PatchNode } from "@/types/patch";

export interface InspectablePatchPort {
  kind: "host-output";
  label: string;
  nodeId: string;
  portId: string;
}

export function resolveInspectablePortForNode(patch: Patch, node: PatchNode | undefined): InspectablePatchPort | null {
  if (!node || node.id !== patch.io.audioOutNodeId) {
    return null;
  }
  return {
    kind: "host-output",
    label: resolveHostPatchPortLabel(HOST_PORT_IDS.output),
    nodeId: node.id,
    portId: patch.io.audioOutPortId
  };
}

export function formatPatchEndpointLabel(patch: Patch, endpoint: { nodeId: string; portId: string }) {
  if (endpoint.nodeId === patch.io.audioOutNodeId && endpoint.portId === patch.io.audioOutPortId) {
    return resolveHostPatchPortLabel(HOST_PORT_IDS.output);
  }
  return `${endpoint.nodeId}.${endpoint.portId}`;
}

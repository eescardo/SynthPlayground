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
    return `${resolveHostPatchPortLabel(HOST_PORT_IDS.output)}.${endpoint.portId}`;
  }
  return `${endpoint.nodeId}.${endpoint.portId}`;
}

export function formatPatchParamTargetLabel(patch: Patch, target: { nodeId: string; paramId: string }) {
  if (target.nodeId === patch.io.audioOutNodeId) {
    return `${resolveHostPatchPortLabel(HOST_PORT_IDS.output)}.${target.paramId}`;
  }
  return `${target.nodeId}.${target.paramId}`;
}

export function isPatchOutputEndpoint(patch: Patch, endpoint: { nodeId?: string; portId?: string }) {
  return endpoint.nodeId === patch.io.audioOutNodeId && endpoint.portId === patch.io.audioOutPortId;
}

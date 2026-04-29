import { resolveHostPatchPortLabel } from "@/components/patch/patchCanvasGeometry";
import { HOST_PORT_IDS } from "@/lib/patch/constants";
import { getPatchOutputInputPortId, getPatchOutputPort, isPatchOutputPortId } from "@/lib/patch/ports";
import { Patch, PatchNode } from "@/types/patch";

export interface InspectablePatchPort {
  kind: "host-output";
  label: string;
  nodeId: string;
  portId: string;
}

export function resolveInspectablePortForNode(patch: Patch, node: PatchNode | undefined): InspectablePatchPort | null {
  if (!node || !isPatchOutputPortId(patch, node.id)) {
    return null;
  }
  return {
    kind: "host-output",
    label: resolveHostPatchPortLabel(HOST_PORT_IDS.output),
    nodeId: node.id,
    portId: getPatchOutputInputPortId(patch)
  };
}

export function formatPatchEndpointLabel(patch: Patch, endpoint: { nodeId: string; portId: string }) {
  if (isPatchOutputEndpoint(patch, endpoint)) {
    return `${resolveHostPatchPortLabel(HOST_PORT_IDS.output)}.${endpoint.portId}`;
  }
  return `${endpoint.nodeId}.${endpoint.portId}`;
}

export function formatPatchParamTargetLabel(patch: Patch, target: { nodeId: string; paramId: string }) {
  if (isPatchOutputPortId(patch, target.nodeId)) {
    return `${resolveHostPatchPortLabel(HOST_PORT_IDS.output)}.${target.paramId}`;
  }
  return `${target.nodeId}.${target.paramId}`;
}

export function isPatchOutputEndpoint(patch: Patch, endpoint: { nodeId?: string; portId?: string }) {
  const outputPort = getPatchOutputPort(patch);
  return endpoint.nodeId === outputPort?.id && endpoint.portId === getPatchOutputInputPortId(patch);
}

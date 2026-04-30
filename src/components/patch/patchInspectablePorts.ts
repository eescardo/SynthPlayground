import { resolveHostPatchPortLabel } from "@/components/patch/patchCanvasGeometry";
import { HOST_PORT_IDS } from "@/lib/patch/constants";
import { getPatchOutputInputPortId, getPatchOutputPort, isPatchOutputPortId } from "@/lib/patch/ports";
import { Patch, PatchPort } from "@/types/patch";

export function formatPatchPortLabel(_patch: Patch, port: PatchPort) {
  if (port.typeId === "Output") {
    return resolveHostPatchPortLabel(HOST_PORT_IDS.output);
  }
  return port.label || port.id;
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

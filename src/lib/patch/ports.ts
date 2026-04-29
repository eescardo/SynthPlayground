import { createDefaultParamsForType, getModuleSchema } from "@/lib/patch/moduleRegistry";
import {
  HOST_PATCH_PORT_DIRECTION_BY_ID,
  HOST_PATCH_PORT_IDS,
  HOST_PATCH_PORT_TYPE_BY_ID,
  HOST_PORT_IDS,
  SOURCE_HOST_NODE_IDS
} from "@/lib/patch/constants";
import { Patch, PatchNode, PatchPort } from "@/types/patch";

export const PATCH_OUTPUT_PORT_ID = "output";
export const AUDIO_OUTPUT_PORT_TYPE_ID = "Output";

export function createPatchOutputPort(params?: PatchNode["params"]): PatchPort {
  return {
    id: PATCH_OUTPUT_PORT_ID,
    typeId: AUDIO_OUTPUT_PORT_TYPE_ID,
    label: "output",
    direction: "sink",
    params: {
      ...createDefaultParamsForType(AUDIO_OUTPUT_PORT_TYPE_ID),
      ...(params ?? {})
    }
  };
}

const HOST_SOURCE_PORT_LABEL_BY_ID: Record<(typeof SOURCE_HOST_NODE_IDS)[number], string> = {
  [HOST_PORT_IDS.pitch]: "pitch",
  [HOST_PORT_IDS.gate]: "gate",
  [HOST_PORT_IDS.velocity]: "velocity",
  [HOST_PORT_IDS.modWheel]: "modwheel"
};

export function isHostPatchPortId(id: string): id is (typeof HOST_PATCH_PORT_IDS)[number] {
  return HOST_PATCH_PORT_IDS.includes(id as (typeof HOST_PATCH_PORT_IDS)[number]);
}

export function createHostSourcePatchPort(id: (typeof SOURCE_HOST_NODE_IDS)[number]): PatchPort {
  return {
    id,
    typeId: HOST_PATCH_PORT_TYPE_BY_ID[id],
    label: HOST_SOURCE_PORT_LABEL_BY_ID[id],
    direction: HOST_PATCH_PORT_DIRECTION_BY_ID[id],
    params: {}
  };
}

export function getHostSourcePatchPorts(): PatchPort[] {
  return SOURCE_HOST_NODE_IDS.map((id) => createHostSourcePatchPort(id));
}

export function getPatchPorts(patch: Pick<Patch, "ports">): PatchPort[] {
  return patch.ports ?? [];
}

export function isPatchPortId(patch: Pick<Patch, "ports">, id: string) {
  return getPatchPorts(patch).some((port) => port.id === id);
}

export function getPatchPortSchema(port: PatchPort) {
  return getModuleSchema(port.typeId);
}

export function getPatchOutputPort(patch: Pick<Patch, "io" | "nodes" | "ports">): PatchPort | undefined {
  const ports = getPatchPorts(patch);
  // TODO(output-port-legacy): Once every patch is normalized to `io.audioOutNodeId === "output"`,
  // remove the type-based fallback and require the canonical output port id.
  const port = ports.find((entry) => entry.id === patch.io.audioOutNodeId) ?? ports.find((entry) => entry.typeId === AUDIO_OUTPUT_PORT_TYPE_ID);
  if (port) {
    return { ...port, direction: "sink" };
  }
  return undefined;
}

export function getPatchBoundaryPorts(patch: Pick<Patch, "io" | "nodes" | "ports">): PatchPort[] {
  const outputPort = getPatchOutputPort(patch);
  return outputPort ? [...getHostSourcePatchPorts(), outputPort] : getHostSourcePatchPorts();
}

export function getPatchParameterTargets(patch: Pick<Patch, "nodes" | "ports">): PatchNode[] {
  return [...patch.nodes, ...getPatchPorts(patch)];
}

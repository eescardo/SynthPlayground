import { createDefaultParamsForType, getModuleSchema } from "@/lib/patch/moduleRegistry";
import {
  HOST_PATCH_PORT_DIRECTION_BY_ID,
  HOST_PATCH_PORT_IDS,
  HOST_PATCH_PORT_TYPE_BY_ID,
  HOST_PORT_IDS,
  SOURCE_HOST_PORT_IDS
} from "@/lib/patch/constants";
import { Patch, PatchNode, PatchPort } from "@/types/patch";

export const PATCH_OUTPUT_PORT_ID = "output";
export const AUDIO_OUTPUT_PORT_TYPE_ID = "Output";
export const RESERVED_PATCH_MODULE_IDS = new Set<string>([
  PATCH_OUTPUT_PORT_ID,
  ...HOST_PATCH_PORT_IDS,
  "pitch",
  "gate",
  "velocity",
  "modwheel"
]);

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

const HOST_SOURCE_PORT_LABEL_BY_ID: Record<(typeof SOURCE_HOST_PORT_IDS)[number], string> = {
  [HOST_PORT_IDS.pitch]: "pitch",
  [HOST_PORT_IDS.gate]: "gate",
  [HOST_PORT_IDS.velocity]: "velocity",
  [HOST_PORT_IDS.modWheel]: "modwheel"
};

export function isHostPatchPortId(id: string): id is (typeof HOST_PATCH_PORT_IDS)[number] {
  return HOST_PATCH_PORT_IDS.includes(id as (typeof HOST_PATCH_PORT_IDS)[number]);
}

export function createHostSourcePatchPort(id: (typeof SOURCE_HOST_PORT_IDS)[number]): PatchPort {
  return {
    id,
    typeId: HOST_PATCH_PORT_TYPE_BY_ID[id],
    label: HOST_SOURCE_PORT_LABEL_BY_ID[id],
    direction: HOST_PATCH_PORT_DIRECTION_BY_ID[id],
    params: {}
  };
}

export function getHostSourcePatchPorts(): PatchPort[] {
  return SOURCE_HOST_PORT_IDS.map((id) => createHostSourcePatchPort(id));
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

export function getPatchOutputPort(patch: Pick<Patch, "ports">): PatchPort | undefined {
  const ports = getPatchPorts(patch);
  // TODO(output-port-legacy): Once every imported/saved patch has been re-saved
  // with the canonical output id, remove the type-based fallback.
  const port = ports.find((entry) => entry.id === PATCH_OUTPUT_PORT_ID) ?? ports.find((entry) => entry.typeId === AUDIO_OUTPUT_PORT_TYPE_ID);
  if (port) {
    return { ...port, direction: "sink" };
  }
  return undefined;
}

export function getPatchOutputInputPortId(patch: Pick<Patch, "ports">) {
  const outputPort = getPatchOutputPort(patch);
  const schema = outputPort ? getModuleSchema(outputPort.typeId) : undefined;
  return schema?.requiredPortIds?.in?.[0] ?? schema?.portsIn[0]?.id ?? "in";
}

export function isPatchOutputPortId(patch: Pick<Patch, "ports">, id: string) {
  return getPatchOutputPort(patch)?.id === id;
}

export function getPatchBoundaryPorts(patch: Pick<Patch, "ports">): PatchPort[] {
  const outputPort = getPatchOutputPort(patch);
  return outputPort ? [...getHostSourcePatchPorts(), outputPort] : getHostSourcePatchPorts();
}

export function getPatchParameterTargets(patch: Pick<Patch, "nodes" | "ports">): PatchNode[] {
  return [...patch.nodes, ...getPatchPorts(patch)];
}

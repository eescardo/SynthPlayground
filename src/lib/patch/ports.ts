import { createDefaultParamsForType, getModuleSchema } from "@/lib/patch/moduleRegistry";
import { Patch, PatchNode, PatchPort } from "@/types/patch";

export const DEFAULT_AUDIO_OUTPUT_PORT_ID = "out1";
export const AUDIO_OUTPUT_PORT_TYPE_ID = "Output";

export function createDefaultAudioOutputPort(id = DEFAULT_AUDIO_OUTPUT_PORT_ID, params?: PatchNode["params"]): PatchPort {
  return {
    id,
    typeId: AUDIO_OUTPUT_PORT_TYPE_ID,
    label: "output",
    params: {
      ...createDefaultParamsForType(AUDIO_OUTPUT_PORT_TYPE_ID),
      ...(params ?? {})
    }
  };
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
  const port = ports.find((entry) => entry.id === patch.io.audioOutNodeId) ?? ports.find((entry) => entry.typeId === AUDIO_OUTPUT_PORT_TYPE_ID);
  if (port) {
    return port;
  }
  const legacyOutputNode =
    patch.nodes.find((node) => node.id === patch.io.audioOutNodeId && node.typeId === AUDIO_OUTPUT_PORT_TYPE_ID) ??
    patch.nodes.find((node) => node.typeId === AUDIO_OUTPUT_PORT_TYPE_ID);
  return legacyOutputNode ? createDefaultAudioOutputPort(legacyOutputNode.id, legacyOutputNode.params) : undefined;
}

export function getPatchParameterTargets(patch: Pick<Patch, "nodes" | "ports">): PatchNode[] {
  return [...patch.nodes, ...getPatchPorts(patch)];
}

export function migrateLegacyOutputNodeToPort<T extends Patch>(patch: T): T {
  const explicitOutputId = patch.io.audioOutNodeId;
  const legacyOutputNode =
    patch.nodes.find((node) => node.id === explicitOutputId && node.typeId === AUDIO_OUTPUT_PORT_TYPE_ID) ??
    patch.nodes.find((node) => node.typeId === AUDIO_OUTPUT_PORT_TYPE_ID);
  const existingOutputPort =
    getPatchPorts(patch).find((port) => port.id === explicitOutputId && port.typeId === AUDIO_OUTPUT_PORT_TYPE_ID) ??
    getPatchPorts(patch).find((port) => port.typeId === AUDIO_OUTPUT_PORT_TYPE_ID);
  const outputPort = existingOutputPort ?? createDefaultAudioOutputPort((legacyOutputNode?.id ?? explicitOutputId) || DEFAULT_AUDIO_OUTPUT_PORT_ID, legacyOutputNode?.params);
  const outputPortById = new Map(getPatchPorts(patch).map((port) => [port.id, port] as const));
  outputPortById.set(outputPort.id, outputPort);

  return {
    ...patch,
    nodes: patch.nodes.filter((node) => node.typeId !== AUDIO_OUTPUT_PORT_TYPE_ID),
    ports: [...outputPortById.values()],
    layout: {
      nodes: patch.layout.nodes.filter((node) => node.nodeId !== outputPort.id)
    },
    io: {
      audioOutNodeId: outputPort.id,
      audioOutPortId: "in"
    }
  };
}

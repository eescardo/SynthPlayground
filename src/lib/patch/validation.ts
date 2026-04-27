import { getModuleSchema, moduleRegistryById } from "@/lib/patch/moduleRegistry";
import { SOURCE_HOST_NODE_IDS, SOURCE_HOST_NODE_TYPE_BY_ID } from "@/lib/patch/constants";
import { getMacroBindingKeyframeCount } from "@/lib/patch/macroKeyframes";
import { getPatchPorts, migrateLegacyOutputNodeToPort } from "@/lib/patch/ports";
import { CompiledNode, CompiledOp, CompiledPlan, Patch, PatchValidationIssue, PatchValidationResult, ParamValue, PatchNode } from "@/types/patch";

const pushError = (
  issues: PatchValidationIssue[],
  message: string,
  context?: Record<string, string>,
  code?: string
): void => {
  issues.push({ level: "error", message, context, code });
};

export const patchHasNode = (patch: Patch, nodeId: string): boolean => patch.nodes.some((node) => node.id === nodeId);
const patchHasEndpointNode = (patch: Patch, nodeId: string): boolean =>
  patch.nodes.some((node) => node.id === nodeId) || getPatchPorts(patch).some((port) => port.id === nodeId);

const resolveAllNodeTypes = (patch: Patch): Map<string, string> => {
  const allNodeTypes = new Map<string, string>();
  for (const node of patch.nodes) {
    allNodeTypes.set(node.id, node.typeId);
  }
  for (const port of getPatchPorts(patch)) {
    allNodeTypes.set(port.id, port.typeId);
  }
  for (const hostId of SOURCE_HOST_NODE_IDS) {
    allNodeTypes.set(hostId, SOURCE_HOST_NODE_TYPE_BY_ID[hostId]);
  }
  return allNodeTypes;
};

interface ResolvedConnectionValidation {
  fromPort: NonNullable<ReturnType<typeof getModuleSchema>>["portsOut"][number];
  toPort: NonNullable<ReturnType<typeof getModuleSchema>>["portsIn"][number];
}

const resolveConnectionValidation = (
  issues: PatchValidationIssue[],
  allNodeTypes: Map<string, string>,
  fromNodeId: string,
  fromPortId: string,
  toNodeId: string,
  toPortId: string,
  context?: Record<string, string>
): ResolvedConnectionValidation | null => {
  const fromType = allNodeTypes.get(fromNodeId);
  const toType = allNodeTypes.get(toNodeId);

  if (!fromType) {
    pushError(issues, `Connection source node does not exist`, { ...context, nodeId: fromNodeId }, "connection-missing-source");
    return null;
  }
  if (!toType) {
    pushError(issues, `Connection destination node does not exist`, { ...context, nodeId: toNodeId }, "connection-missing-destination");
    return null;
  }

  const fromSchema = getModuleSchema(fromType);
  const toSchema = getModuleSchema(toType);
  if (!fromSchema || !toSchema) {
    pushError(issues, `Connection references unknown module schema`, context, "connection-unknown-schema");
    return null;
  }

  const fromPort = fromSchema.portsOut.find((port) => port.id === fromPortId);
  const toPort = toSchema.portsIn.find((port) => port.id === toPortId);
  if (!fromPort) {
    pushError(issues, `Invalid source port`, { ...context, nodeId: fromNodeId, portId: fromPortId }, "connection-invalid-source-port");
    return null;
  }
  if (!toPort) {
    pushError(issues, `Invalid destination port`, { ...context, nodeId: toNodeId, portId: toPortId }, "connection-invalid-destination-port");
    return null;
  }
  if (fromPort.kind !== toPort.kind) {
    pushError(issues, `Port kind mismatch`, context, "connection-kind-mismatch");
    return null;
  }

  const isCompatible = fromPort.capabilities.some((capability) => toPort.capabilities.includes(capability));
  if (!isCompatible) {
    pushError(
      issues,
      `Port capability mismatch`,
      { ...context, from: fromPort.capabilities.join(","), to: toPort.capabilities.join(",") },
      "connection-capability-mismatch"
    );
    return null;
  }

  return { fromPort, toPort };
};

const wouldCreateCycle = (patch: Patch, fromNodeId: string, toNodeId: string) => {
  if (fromNodeId === toNodeId) {
    return true;
  }
  if (!patchHasEndpointNode(patch, fromNodeId) || !patchHasEndpointNode(patch, toNodeId)) {
    return false;
  }

  const adjacency = new Map<string, string[]>();
  for (const node of patch.nodes) {
    adjacency.set(node.id, []);
  }
  for (const port of getPatchPorts(patch)) {
    adjacency.set(port.id, []);
  }
  for (const connection of patch.connections) {
    if (!patchHasEndpointNode(patch, connection.from.nodeId) || !patchHasEndpointNode(patch, connection.to.nodeId)) {
      continue;
    }
    adjacency.get(connection.from.nodeId)?.push(connection.to.nodeId);
  }

  const stack = [toNodeId];
  const visited = new Set<string>();
  while (stack.length > 0) {
    const nodeId = stack.pop()!;
    if (nodeId === fromNodeId) {
      return true;
    }
    if (visited.has(nodeId)) {
      continue;
    }
    visited.add(nodeId);
    for (const nextId of adjacency.get(nodeId) ?? []) {
      stack.push(nextId);
    }
  }
  return false;
};

export const validatePatchConnectionCandidate = (
  inputPatch: Patch,
  fromNodeId: string,
  fromPortId: string,
  toNodeId: string,
  toPortId: string
): PatchValidationIssue[] => {
  const patch = migrateLegacyOutputNodeToPort(inputPatch);
  const issues: PatchValidationIssue[] = [];
  const allNodeTypes = resolveAllNodeTypes(patch);
  const resolved = resolveConnectionValidation(issues, allNodeTypes, fromNodeId, fromPortId, toNodeId, toPortId);
  if (!resolved) {
    return issues;
  }
  if (!resolved.toPort.multiIn && patch.connections.some((connection) => connection.to.nodeId === toNodeId && connection.to.portId === toPortId)) {
    pushError(
      issues,
      `Multiple inputs connected to single-input port`,
      { targetPort: `${toNodeId}:${toPortId}` },
      "connection-target-occupied"
    );
    return issues;
  }
  if (wouldCreateCycle(patch, fromNodeId, toNodeId)) {
    pushError(
      issues,
      `Cycle detected in patch graph`,
      { atNode: toNodeId, path: `${fromNodeId} -> ${toNodeId}` },
      "connection-cycle"
    );
  }

  return issues;
};

export const validatePatch = (inputPatch: Patch): PatchValidationResult => {
  const patch = migrateLegacyOutputNodeToPort(inputPatch);
  const issues: PatchValidationIssue[] = [];
  const macroIds = new Set<string>();
  const macroBindingIds = new Set<string>();
  const macroTargetToMacroId = new Map<string, string>();

  const uniqueNodeIds = new Set<string>();
  for (const node of patch.nodes) {
    if (uniqueNodeIds.has(node.id)) {
      pushError(issues, `Duplicate node id: ${node.id}`, { nodeId: node.id });
    }
    uniqueNodeIds.add(node.id);

    if (!moduleRegistryById.has(node.typeId)) {
      pushError(issues, `Unknown node type: ${node.typeId}`, { nodeId: node.id, typeId: node.typeId });
    }
  }

  const allNodeTypes = resolveAllNodeTypes(patch);

  for (const macro of patch.ui.macros) {
    if (macroIds.has(macro.id)) {
      pushError(issues, `Duplicate macro id: ${macro.id}`, { macroId: macro.id });
    }
    macroIds.add(macro.id);

    if (!Number.isInteger(macro.keyframeCount) || macro.keyframeCount < 2) {
      pushError(issues, `Macro keyframe count must be an integer >= 2`, {
        macroId: macro.id,
        keyframeCount: String(macro.keyframeCount)
      });
    }

    for (const binding of macro.bindings) {
      if (macroBindingIds.has(binding.id)) {
        pushError(issues, `Duplicate macro binding id: ${binding.id}`, { bindingId: binding.id, macroId: macro.id });
      }
      macroBindingIds.add(binding.id);

      const node = [...patch.nodes, ...getPatchPorts(patch)].find((entry) => entry.id === binding.nodeId);
      if (!node) {
        pushError(issues, `Macro binding references missing node`, {
          macroId: macro.id,
          bindingId: binding.id,
          nodeId: binding.nodeId,
          paramId: binding.paramId
        });
        continue;
      }

      const schema = getModuleSchema(node.typeId);
      const paramSchema = schema?.params.find((param) => param.id === binding.paramId);
      if (!schema || !paramSchema) {
        pushError(issues, `Macro binding references invalid parameter`, {
          macroId: macro.id,
          bindingId: binding.id,
          nodeId: binding.nodeId,
          paramId: binding.paramId
        });
        continue;
      }

      if (getMacroBindingKeyframeCount(binding) !== macro.keyframeCount) {
        pushError(issues, `Macro binding keyframe count does not match macro`, {
          macroId: macro.id,
          bindingId: binding.id,
          keyframeCount: String(macro.keyframeCount),
          bindingKeyframeCount: String(getMacroBindingKeyframeCount(binding))
        });
      }

      const targetKey = `${binding.nodeId}:${binding.paramId}`;
      const existingMacroId = macroTargetToMacroId.get(targetKey);
      if (existingMacroId && existingMacroId !== macro.id) {
        pushError(issues, `Conflicting macro bindings target the same parameter`, {
          nodeId: binding.nodeId,
          paramId: binding.paramId,
          macroId: macro.id,
          conflictingMacroId: existingMacroId
        });
      } else if (existingMacroId === macro.id) {
        pushError(issues, `Macro binds the same parameter more than once`, {
          nodeId: binding.nodeId,
          paramId: binding.paramId,
          macroId: macro.id
        });
      } else {
        macroTargetToMacroId.set(targetKey, macro.id);
      }
    }
  }

  const incomingByPort = new Map<string, number>();
  const uniqueConnectionIds = new Set<string>();
  const connectedInputPorts = new Set<string>();
  const connectedOutputPorts = new Set<string>();

  for (const connection of patch.connections) {
    if (uniqueConnectionIds.has(connection.id)) {
      pushError(issues, `Duplicate connection id: ${connection.id}`, { connectionId: connection.id });
    }
    uniqueConnectionIds.add(connection.id);

    const resolved = resolveConnectionValidation(
      issues,
      allNodeTypes,
      connection.from.nodeId,
      connection.from.portId,
      connection.to.nodeId,
      connection.to.portId,
      { connectionId: connection.id }
    );
    if (!resolved) {
      continue;
    }

    const incomingKey = `${connection.to.nodeId}:${connection.to.portId}`;
    incomingByPort.set(incomingKey, (incomingByPort.get(incomingKey) ?? 0) + 1);
    if (connection.from.nodeId !== connection.to.nodeId) {
      connectedOutputPorts.add(`${connection.from.nodeId}:${connection.from.portId}`);
      connectedInputPorts.add(incomingKey);
    }

    if ((incomingByPort.get(incomingKey) ?? 0) > 1 && !resolved.toPort.multiIn) {
      pushError(issues, `Multiple inputs connected to single-input port`, {
        connectionId: connection.id,
        targetPort: incomingKey
      });
    }
  }

  for (const node of [...patch.nodes, ...getPatchPorts(patch)]) {
    const schema = getModuleSchema(node.typeId);
    if (!schema) {
      continue;
    }

    for (const portId of schema.requiredPortIds?.in ?? []) {
      const portExists = schema.portsIn.some((port) => port.id === portId);
      if (!portExists) {
        pushError(
          issues,
          `Module schema declares unknown required input port`,
          { nodeId: node.id, typeId: node.typeId, portId, direction: "in" },
          "required-port-schema-mismatch"
        );
        continue;
      }

      const connectionKey = `${node.id}:${portId}`;
      if (!connectedInputPorts.has(connectionKey)) {
        pushError(
          issues,
          `Required input port is unconnected`,
          { nodeId: node.id, typeId: node.typeId, portId, direction: "in" },
          "required-port-unconnected"
        );
      }
    }

    for (const portId of schema.requiredPortIds?.out ?? []) {
      const portExists = schema.portsOut.some((port) => port.id === portId);
      if (!portExists) {
        pushError(
          issues,
          `Module schema declares unknown required output port`,
          { nodeId: node.id, typeId: node.typeId, portId, direction: "out" },
          "required-port-schema-mismatch"
        );
        continue;
      }

      const connectionKey = `${node.id}:${portId}`;
      if (!connectedOutputPorts.has(connectionKey)) {
        pushError(
          issues,
          `Required output port is unconnected`,
          { nodeId: node.id, typeId: node.typeId, portId, direction: "out" },
          "required-port-unconnected"
        );
      }
    }
  }

  const graphNodes = [...patch.nodes, ...getPatchPorts(patch)];
  const nodeById = new Set(graphNodes.map((node) => node.id));
  const adjacency = new Map<string, string[]>();
  for (const node of graphNodes) {
    adjacency.set(node.id, []);
  }

  for (const connection of patch.connections) {
    if (!nodeById.has(connection.from.nodeId) || !nodeById.has(connection.to.nodeId)) {
      continue;
    }
    adjacency.get(connection.from.nodeId)?.push(connection.to.nodeId);
  }

  const visitState = new Map<string, number>();
  const stack: string[] = [];
  const detectCycle = (nodeId: string): boolean => {
    visitState.set(nodeId, 1);
    stack.push(nodeId);

    for (const nextId of adjacency.get(nodeId) ?? []) {
      const state = visitState.get(nextId) ?? 0;
      if (state === 1) {
        pushError(issues, `Cycle detected in patch graph`, { atNode: nextId, path: [...stack, nextId].join(" -> ") });
        return true;
      }
      if (state === 0 && detectCycle(nextId)) {
        return true;
      }
    }

    stack.pop();
    visitState.set(nodeId, 2);
    return false;
  };

  for (const node of graphNodes) {
    if ((visitState.get(node.id) ?? 0) === 0 && detectCycle(node.id)) {
      break;
    }
  }

  const outputNodes = patch.nodes.filter((node) => node.typeId === "Output");
  if (outputNodes.length > 0) {
    pushError(issues, `Output must be declared as a patch port`, { outputCount: String(outputNodes.length) }, "output-node-not-allowed");
  }
  const outputPorts = getPatchPorts(patch).filter((port) => port.typeId === "Output");
  if (outputPorts.length !== 1) {
    pushError(issues, `Patch must include exactly one Output port`, { outputCount: String(outputPorts.length) }, "output-port-count");
  }

  if (!patch.io.audioOutNodeId || !patch.io.audioOutPortId) {
    pushError(issues, "Patch io.audioOutNodeId/io.audioOutPortId must be set");
  } else {
    const outPort = getPatchPorts(patch).find((port) => port.id === patch.io.audioOutNodeId);
    if (!outPort) {
      pushError(issues, "io.audioOutNodeId does not reference an output port", { nodeId: patch.io.audioOutNodeId });
    }
  }

  return {
    ok: !issues.some((issue) => issue.level === "error"),
    issues
  };
};

const cloneParamValue = (value: ParamValue): ParamValue => {
  if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  throw new Error("Unsupported parameter value type");
};

const defaultBufferId = (nodeId: string, portId: string): string => `${nodeId}:${portId}`;

const topologicalSort = (nodes: string[], edges: Array<{ from: string; to: string }>): string[] => {
  const indegree = new Map<string, number>(nodes.map((id) => [id, 0]));
  const outgoing = new Map<string, string[]>(nodes.map((id) => [id, []]));

  for (const edge of edges) {
    if (!indegree.has(edge.to) || !indegree.has(edge.from)) {
      continue;
    }
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
    outgoing.get(edge.from)?.push(edge.to);
  }

  const queue: string[] = [];
  for (const [id, degree] of indegree) {
    if (degree === 0) {
      queue.push(id);
    }
  }

  const ordered: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    ordered.push(current);
    for (const next of outgoing.get(current) ?? []) {
      const nextDeg = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, nextDeg);
      if (nextDeg === 0) {
        queue.push(next);
      }
    }
  }

  if (ordered.length !== nodes.length) {
    throw new Error("Topological sort failed due to cycle");
  }

  return ordered;
};

export const compilePatchPlan = (inputPatch: Patch, sampleRate = 48000, blockSize = 128): CompiledPlan => {
  const patch = migrateLegacyOutputNodeToPort(inputPatch);
  const validation = validatePatch(patch);
  if (!validation.ok) {
    throw new Error(`Patch validation failed: ${validation.issues.map((issue) => issue.message).join("; ")}`);
  }

  const compileNodes: PatchNode[] = [...patch.nodes, ...getPatchPorts(patch)];
  const nodeIds = compileNodes.map((node) => node.id);
  const edges = patch.connections
    .filter((connection) => nodeIds.includes(connection.from.nodeId) && nodeIds.includes(connection.to.nodeId))
    .map((connection) => ({ from: connection.from.nodeId, to: connection.to.nodeId }));

  const orderedNodeIds = topologicalSort(nodeIds, edges);

  const buffers: Record<string, Float32Array> = {};
  const nodes: CompiledNode[] = [];
  const ops: CompiledOp[] = [];

  for (const nodeId of orderedNodeIds) {
    const node = compileNodes.find((entry) => entry.id === nodeId)!;
    const schema = getModuleSchema(node.typeId);
    if (!schema) {
      throw new Error(`Unknown schema during compile: ${node.typeId}`);
    }

    const params = Object.fromEntries(
      schema.params.map((param) => {
        const resolvedValue = node.params[param.id] ?? param.default;
        const smoother =
          param.type === "float" && param.smoothing
            ? {
                current: Number(resolvedValue),
                target: Number(resolvedValue),
                alpha: Math.exp(-1 / Math.max((param.smoothing.timeMs / 1000) * sampleRate, 1))
              }
            : undefined;
        return [
          param.id,
          {
            schema: param,
            value: cloneParamValue(resolvedValue),
            smoother
          }
        ];
      })
    );

    for (const outPort of schema.portsOut) {
      const id = defaultBufferId(node.id, outPort.id);
      buffers[id] = new Float32Array(blockSize);
    }

    const compiledNode: CompiledNode = {
      id: node.id,
      typeId: node.typeId,
      params,
      inputPorts: schema.portsIn.map((port) => port.id),
      outputPorts: schema.portsOut.map((port) => port.id)
    };

    const nodeIndex = nodes.length;
    nodes.push(compiledNode);

    const nodeConnections = patch.connections.filter((connection) => connection.to.nodeId === node.id);

    const inputs = compiledNode.inputPorts.map((portId) => {
      const connection = nodeConnections.find((entry) => entry.to.portId === portId);
      return {
        portId,
        sourceBufferId: connection ? defaultBufferId(connection.from.nodeId, connection.from.portId) : undefined
      };
    });

    const outputs = compiledNode.outputPorts.map((portId) => ({
      portId,
      bufferId: defaultBufferId(node.id, portId)
    }));

    ops.push({
      nodeIndex,
      typeTag: node.typeId,
      inputs,
      outputs
    });
  }

  return {
    patchId: patch.id,
    nodeOrder: orderedNodeIds,
    nodes,
    ops,
    buffers,
    sampleRate,
    blockSize
  };
};

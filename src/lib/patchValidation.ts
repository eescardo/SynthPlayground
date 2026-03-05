import { getModuleSchema, moduleRegistryById } from "@/lib/registry";
import { CompiledNode, CompiledOp, CompiledPlan, Patch, PatchValidationIssue, PatchValidationResult, ParamValue } from "@/types/patch";

const SOURCE_HOST_NODE_IDS = ["$host.pitch", "$host.gate", "$host.velocity", "$host.modwheel"] as const;
const SOURCE_HOST_NODE_TYPE_BY_ID: Record<(typeof SOURCE_HOST_NODE_IDS)[number], string> = {
  "$host.pitch": "NotePitch",
  "$host.gate": "NoteGate",
  "$host.velocity": "NoteVelocity",
  "$host.modwheel": "ModWheel"
};

const pushError = (issues: PatchValidationIssue[], message: string, context?: Record<string, string>): void => {
  issues.push({ level: "error", message, context });
};

export const patchHasNode = (patch: Patch, nodeId: string): boolean => patch.nodes.some((node) => node.id === nodeId);

export const validatePatch = (patch: Patch): PatchValidationResult => {
  const issues: PatchValidationIssue[] = [];

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

  const allNodeTypes = new Map<string, string>();
  for (const node of patch.nodes) {
    allNodeTypes.set(node.id, node.typeId);
  }
  for (const hostId of SOURCE_HOST_NODE_IDS) {
    allNodeTypes.set(hostId, SOURCE_HOST_NODE_TYPE_BY_ID[hostId]);
  }

  const incomingByPort = new Map<string, number>();
  const uniqueConnectionIds = new Set<string>();

  for (const connection of patch.connections) {
    if (uniqueConnectionIds.has(connection.id)) {
      pushError(issues, `Duplicate connection id: ${connection.id}`, { connectionId: connection.id });
    }
    uniqueConnectionIds.add(connection.id);

    const fromType = allNodeTypes.get(connection.from.nodeId);
    const toType = allNodeTypes.get(connection.to.nodeId);

    if (!fromType) {
      pushError(issues, `Connection source node does not exist`, { connectionId: connection.id, nodeId: connection.from.nodeId });
      continue;
    }
    if (!toType) {
      pushError(issues, `Connection destination node does not exist`, {
        connectionId: connection.id,
        nodeId: connection.to.nodeId
      });
      continue;
    }

    const fromSchema = getModuleSchema(fromType);
    const toSchema = getModuleSchema(toType);
    if (!fromSchema || !toSchema) {
      pushError(issues, `Connection references unknown module schema`, { connectionId: connection.id });
      continue;
    }

    const fromPort = fromSchema.portsOut.find((port) => port.id === connection.from.portId);
    const toPort = toSchema.portsIn.find((port) => port.id === connection.to.portId);

    if (!fromPort) {
      pushError(issues, `Invalid source port`, {
        connectionId: connection.id,
        nodeId: connection.from.nodeId,
        portId: connection.from.portId
      });
      continue;
    }
    if (!toPort) {
      pushError(issues, `Invalid destination port`, {
        connectionId: connection.id,
        nodeId: connection.to.nodeId,
        portId: connection.to.portId
      });
      continue;
    }

    if (fromPort.kind !== toPort.kind) {
      pushError(issues, `Port kind mismatch`, { connectionId: connection.id });
      continue;
    }

    const isCompatible = fromPort.capabilities.some((capability) => toPort.capabilities.includes(capability));
    if (!isCompatible) {
      pushError(issues, `Port capability mismatch`, {
        connectionId: connection.id,
        from: fromPort.capabilities.join(","),
        to: toPort.capabilities.join(",")
      });
      continue;
    }

    const incomingKey = `${connection.to.nodeId}:${connection.to.portId}`;
    incomingByPort.set(incomingKey, (incomingByPort.get(incomingKey) ?? 0) + 1);

    if ((incomingByPort.get(incomingKey) ?? 0) > 1 && !toPort.multiIn) {
      pushError(issues, `Multiple inputs connected to single-input port`, {
        connectionId: connection.id,
        targetPort: incomingKey
      });
    }
  }

  const nodeById = new Set(patch.nodes.map((node) => node.id));
  const adjacency = new Map<string, string[]>();
  for (const node of patch.nodes) {
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

  for (const node of patch.nodes) {
    if ((visitState.get(node.id) ?? 0) === 0 && detectCycle(node.id)) {
      break;
    }
  }

  const outputNodes = patch.nodes.filter((node) => node.typeId === "Output");
  if (outputNodes.length !== 1) {
    pushError(issues, `Patch must include exactly one Output node`, { outputCount: String(outputNodes.length) });
  }

  if (!patch.io.audioOutNodeId || !patch.io.audioOutPortId) {
    pushError(issues, "Patch io.audioOutNodeId/io.audioOutPortId must be set");
  } else {
    const outNode = patch.nodes.find((node) => node.id === patch.io.audioOutNodeId);
    if (!outNode) {
      pushError(issues, "io.audioOutNodeId does not exist", { nodeId: patch.io.audioOutNodeId });
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

export const compilePatchPlan = (patch: Patch, sampleRate = 48000, blockSize = 128): CompiledPlan => {
  const validation = validatePatch(patch);
  if (!validation.ok) {
    throw new Error(`Patch validation failed: ${validation.issues.map((issue) => issue.message).join("; ")}`);
  }

  const nodeIds = patch.nodes.map((node) => node.id);
  const edges = patch.connections
    .filter((connection) => nodeIds.includes(connection.from.nodeId) && nodeIds.includes(connection.to.nodeId))
    .map((connection) => ({ from: connection.from.nodeId, to: connection.to.nodeId }));

  const orderedNodeIds = topologicalSort(nodeIds, edges);

  const buffers: Record<string, Float32Array> = {};
  const nodes: CompiledNode[] = [];
  const ops: CompiledOp[] = [];

  for (const nodeId of orderedNodeIds) {
    const node = patch.nodes.find((entry) => entry.id === nodeId)!;
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

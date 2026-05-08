import { getModuleSchema, moduleRegistryById } from "@/lib/patch/moduleRegistry";
import { createPatchMacroBindingKey } from "@/lib/patch/macroBindings";
import { getMacroBindingKeyframeCount } from "@/lib/patch/macroKeyframes";
import {
  getHostSourcePatchPorts,
  getPatchBoundaryPorts,
  getPatchPorts,
  RESERVED_PATCH_MODULE_IDS
} from "@/lib/patch/ports";
import { normalizePatchOutputPort } from "@/lib/patch/normalize";
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
  patch.nodes.some((node) => node.id === nodeId) || getPatchBoundaryPorts(patch).some((port) => port.id === nodeId);

const formatParamTarget = (nodeId: string, paramId: string): string => `${nodeId}.${paramId}`;

const isFloatParamValueInRange = (value: number, range: { min: number; max: number }): boolean =>
  Number.isFinite(value) && value >= range.min && value <= range.max;

const resolveAllNodeTypes = (patch: Patch): Map<string, string> => {
  const allNodeTypes = new Map<string, string>();
  for (const node of patch.nodes) {
    allNodeTypes.set(node.id, node.typeId);
  }
  for (const port of getPatchBoundaryPorts(patch)) {
    allNodeTypes.set(port.id, port.typeId);
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
  for (const port of getHostSourcePatchPorts()) {
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
  // TODO(output-port-legacy): Drop this defensive normalization when callers only
  // pass patches that have already gone through normalizePatch.
  const patch = normalizePatchOutputPort(inputPatch);
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
  // TODO(output-port-legacy): Drop this defensive normalization when callers only
  // pass patches that have already gone through normalizePatch.
  const patch = normalizePatchOutputPort(inputPatch);
  const issues: PatchValidationIssue[] = [];
  const macroIds = new Set<string>();
  const macroBindingIds = new Set<string>();
  const macroBindingTargetKeys = new Set<string>();
  const macroTargetToMacroId = new Map<string, string>();

  const uniqueNodeIds = new Set<string>();
  for (const node of patch.nodes) {
    if (uniqueNodeIds.has(node.id)) {
      pushError(issues, `Duplicate node id: ${node.id}`, { nodeId: node.id });
    }
    uniqueNodeIds.add(node.id);
    if (RESERVED_PATCH_MODULE_IDS.has(node.id)) {
      pushError(issues, `Node id is reserved for a patch boundary port: ${node.id}`, { nodeId: node.id }, "reserved-node-id");
    }

    if (!moduleRegistryById.has(node.typeId)) {
      pushError(issues, `Unknown node type: ${node.typeId}`, { nodeId: node.id, typeId: node.typeId });
    }
  }

  const allNodeTypes = resolveAllNodeTypes(patch);
  const graphNodes = [...patch.nodes, ...getPatchBoundaryPorts(patch)];

  for (const node of graphNodes) {
    const schema = getModuleSchema(node.typeId);
    if (!schema) {
      continue;
    }
    const paramsById = new Map(schema.params.map((param) => [param.id, param] as const));

    for (const param of schema.params) {
      if (!(param.id in node.params)) {
        pushError(
          issues,
          `Module ${node.id} is missing current parameter ${param.id}`,
          { nodeId: node.id, typeId: node.typeId, paramId: param.id },
          "node-param-missing"
        );
      }
    }

    for (const [paramId, value] of Object.entries(node.params)) {
      const paramSchema = paramsById.get(paramId);
      if (!paramSchema) {
        pushError(
          issues,
          `Module ${node.id} has stale or unknown parameter ${paramId}`,
          { nodeId: node.id, typeId: node.typeId, paramId },
          "node-param-unknown"
        );
        continue;
      }

      if (paramSchema.type === "float") {
        if (typeof value !== "number" || !Number.isFinite(value)) {
          pushError(
            issues,
            `Module ${node.id} parameter ${paramId} must be a number`,
            { nodeId: node.id, typeId: node.typeId, paramId },
            "node-param-type-mismatch"
          );
        } else if (node.typeId === "Reverb" && !isFloatParamValueInRange(value, paramSchema.range)) {
          pushError(
            issues,
            `Module ${node.id} parameter ${paramId} is outside ${paramSchema.range.min}..${paramSchema.range.max}`,
            { nodeId: node.id, typeId: node.typeId, paramId, value: String(value) },
            "node-param-out-of-range"
          );
        }
      } else if (paramSchema.type === "enum") {
        if (typeof value !== "string" || !paramSchema.options.includes(value)) {
          pushError(
            issues,
            `Module ${node.id} parameter ${paramId} must be one of ${paramSchema.options.join(", ")}`,
            { nodeId: node.id, typeId: node.typeId, paramId, value: String(value) },
            "node-param-invalid-option"
          );
        }
      } else if (typeof value !== "boolean") {
        pushError(
          issues,
          `Module ${node.id} parameter ${paramId} must be boolean`,
          { nodeId: node.id, typeId: node.typeId, paramId },
          "node-param-type-mismatch"
        );
      }
    }
  }

  for (const [rangeKey, range] of Object.entries(patch.ui.paramRanges ?? {})) {
    const separatorIndex = rangeKey.indexOf(":");
    const nodeId = separatorIndex >= 0 ? rangeKey.slice(0, separatorIndex) : "";
    const paramId = separatorIndex >= 0 ? rangeKey.slice(separatorIndex + 1) : rangeKey;
    const node = graphNodes.find((entry) => entry.id === nodeId);
    if (!node) {
      pushError(
        issues,
        `Slider range targets missing node ${formatParamTarget(nodeId, paramId)}`,
        { nodeId, paramId, rangeKey },
        "param-range-missing-node"
      );
      continue;
    }
    const schema = getModuleSchema(node.typeId);
    const paramSchema = schema?.params.find((param) => param.id === paramId);
    if (!schema || !paramSchema) {
      pushError(
        issues,
        `Slider range targets missing parameter ${formatParamTarget(nodeId, paramId)}`,
        { nodeId, typeId: node.typeId, paramId, rangeKey },
        "param-range-invalid-param"
      );
      continue;
    }
    if (paramSchema.type !== "float") {
      pushError(
        issues,
        `Slider range targets non-numeric parameter ${formatParamTarget(nodeId, paramId)}`,
        { nodeId, typeId: node.typeId, paramId, rangeKey },
        "param-range-non-float-param"
      );
      continue;
    }
    if (!isFloatParamValueInRange(range.min, paramSchema.range) || !isFloatParamValueInRange(range.max, paramSchema.range)) {
      pushError(
        issues,
        `Slider range for ${formatParamTarget(nodeId, paramId)} is outside ${paramSchema.range.min}..${paramSchema.range.max}`,
        { nodeId, typeId: node.typeId, paramId, rangeKey, min: String(range.min), max: String(range.max) },
        "param-range-out-of-range"
      );
    }
  }

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
      const bindingIdentityKey = createPatchMacroBindingKey(patch, macro.id, binding);
      if (macroBindingTargetKeys.has(bindingIdentityKey)) {
        pushError(issues, `Duplicate macro binding target`, {
          macroId: macro.id,
          nodeId: binding.nodeId,
          paramId: binding.paramId
        });
      }
      macroBindingTargetKeys.add(bindingIdentityKey);

      const node = [...patch.nodes, ...getPatchBoundaryPorts(patch)].find((entry) => entry.id === binding.nodeId);
      if (!node) {
        pushError(
          issues,
          `Macro "${macro.name}" binding targets missing node ${binding.nodeId}.${binding.paramId}`,
          {
            macroId: macro.id,
            bindingId: binding.id,
            nodeId: binding.nodeId,
            paramId: binding.paramId
          },
          "macro-binding-missing-node"
        );
        continue;
      }

      const schema = getModuleSchema(node.typeId);
      const paramSchema = schema?.params.find((param) => param.id === binding.paramId);
      if (!schema || !paramSchema) {
        pushError(
          issues,
          `Macro "${macro.name}" binding targets missing parameter ${binding.nodeId}.${binding.paramId}`,
          {
            macroId: macro.id,
            bindingId: binding.id,
            nodeId: binding.nodeId,
            paramId: binding.paramId,
            typeId: node.typeId
          },
          "macro-binding-invalid-param"
        );
        continue;
      }
      if (paramSchema.type !== "float") {
        pushError(
          issues,
          `Macro "${macro.name}" binding targets non-numeric parameter ${binding.nodeId}.${binding.paramId}`,
          {
            macroId: macro.id,
            bindingId: binding.id,
            nodeId: binding.nodeId,
            paramId: binding.paramId,
            typeId: node.typeId
          },
          "macro-binding-non-float-param"
        );
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

      const targetKey = createPatchMacroBindingKey(patch, "", binding);
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

      const bindingMin = binding.min;
      const bindingMax = binding.max;
      const shouldValidateBindingRange = node.typeId === "Reverb";
      if (
        shouldValidateBindingRange &&
        ((bindingMin !== undefined && !isFloatParamValueInRange(bindingMin, paramSchema.range)) ||
          (bindingMax !== undefined && !isFloatParamValueInRange(bindingMax, paramSchema.range)))
      ) {
        pushError(
          issues,
          `Macro "${macro.name}" binding range for ${binding.nodeId}.${binding.paramId} is outside ${paramSchema.range.min}..${paramSchema.range.max}`,
          {
            macroId: macro.id,
            bindingId: binding.id,
            nodeId: binding.nodeId,
            paramId: binding.paramId,
            typeId: node.typeId
          },
          "macro-binding-range-out-of-range"
        );
      }
      const outOfRangePoint =
        shouldValidateBindingRange
          ? binding.points?.find((point) => !isFloatParamValueInRange(point.y, paramSchema.range))
          : undefined;
      if (outOfRangePoint) {
        pushError(
          issues,
          `Macro "${macro.name}" binding point for ${binding.nodeId}.${binding.paramId} is outside ${paramSchema.range.min}..${paramSchema.range.max}`,
          {
            macroId: macro.id,
            bindingId: binding.id,
            nodeId: binding.nodeId,
            paramId: binding.paramId,
            typeId: node.typeId,
            value: String(outOfRangePoint.y)
          },
          "macro-binding-point-out-of-range"
        );
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

  for (const node of [...patch.nodes, ...getPatchBoundaryPorts(patch)]) {
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

  const outputPorts = getPatchPorts(patch).filter((port) => port.typeId === "Output");
  if (outputPorts.length !== 1) {
    pushError(issues, `Patch must include exactly one Output port`, { outputCount: String(outputPorts.length) }, "output-port-count");
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
  // TODO(output-port-legacy): Drop this defensive normalization when callers only
  // pass patches that have already gone through normalizePatch.
  const patch = normalizePatchOutputPort(inputPatch);
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

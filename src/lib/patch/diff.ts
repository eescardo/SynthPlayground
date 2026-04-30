import { getModuleSchema } from "@/lib/patch/moduleRegistry";
import { createPatchMacroBindingKey } from "@/lib/patch/macroBindings";
import { getPatchParameterTargets, isPatchOutputPortId, PATCH_OUTPUT_PORT_ID } from "@/lib/patch/ports";
import {
  MacroBinding,
  Patch,
  PatchConnection,
  PatchMacro,
  PatchNode,
  PatchParamSliderRange,
  ParamSchema,
  ParamValue
} from "@/types/patch";

export type PatchDiffStatus = "unchanged" | "added" | "removed" | "modified";

export interface PatchBindingDiff {
  key: string;
  macroId: string;
  macroName: string;
  bindingId: string;
  nodeId: string;
  paramId: string;
  status: Exclude<PatchDiffStatus, "unchanged">;
  currentBinding?: MacroBinding;
  baselineBinding?: MacroBinding;
}

export interface PatchNodeDiff {
  nodeId: string;
  typeId: string;
  status: Exclude<PatchDiffStatus, "removed">;
  changedParamIds: Set<string>;
  changedParamRangeIds: Set<string>;
  addedBindingKeys: Set<string>;
  changedBindingKeys: Set<string>;
  removedBindingKeys: Set<string>;
  hasConnectionChanges: boolean;
}

export interface PatchMacroDiff {
  macroId: string;
  name: string;
  status: Exclude<PatchDiffStatus, "removed">;
  nameChanged: boolean;
  keyframeCountChanged: boolean;
  addedBindingKeys: Set<string>;
  changedBindingKeys: Set<string>;
  removedBindingKeys: Set<string>;
}

export interface PatchDiffSummary {
  addedNodeCount: number;
  modifiedNodeCount: number;
  removedNodeCount: number;
  addedMacroCount: number;
  modifiedMacroCount: number;
  removedMacroCount: number;
  addedConnectionCount: number;
  removedConnectionCount: number;
  addedBindingCount: number;
  changedBindingCount: number;
  removedBindingCount: number;
}

export interface PatchDiff {
  hasBaseline: boolean;
  hasChanges: boolean;
  nodeDiffById: Map<string, PatchNodeDiff>;
  removedNodes: PatchNode[];
  macroDiffById: Map<string, PatchMacroDiff>;
  removedMacros: PatchMacro[];
  currentBindingDiffByKey: Map<string, PatchBindingDiff>;
  removedBindingDiffs: PatchBindingDiff[];
  removedBindingDiffsByNodeParamKey: Map<string, PatchBindingDiff[]>;
  addedConnections: PatchConnection[];
  removedConnections: PatchConnection[];
  currentConnectionStatusById: Map<string, "unchanged" | "added">;
  summary: PatchDiffSummary;
}

function createEmptySummary(): PatchDiffSummary {
  return {
    addedNodeCount: 0,
    modifiedNodeCount: 0,
    removedNodeCount: 0,
    addedMacroCount: 0,
    modifiedMacroCount: 0,
    removedMacroCount: 0,
    addedConnectionCount: 0,
    removedConnectionCount: 0,
    addedBindingCount: 0,
    changedBindingCount: 0,
    removedBindingCount: 0
  };
}

function createEmptyDiff(): PatchDiff {
  return {
    hasBaseline: false,
    hasChanges: false,
    nodeDiffById: new Map(),
    removedNodes: [],
    macroDiffById: new Map(),
    removedMacros: [],
    currentBindingDiffByKey: new Map(),
    removedBindingDiffs: [],
    removedBindingDiffsByNodeParamKey: new Map(),
    addedConnections: [],
    removedConnections: [],
    currentConnectionStatusById: new Map(),
    summary: createEmptySummary()
  };
}

function getParamValue(node: PatchNode, param: ParamSchema): ParamValue {
  return node.params[param.id] ?? param.default;
}

function isSameParamValue(left: ParamValue, right: ParamValue): boolean {
  return left === right;
}

function normalizeBindingNodeIdForDiff(patch: Patch, nodeId: string) {
  return isPatchOutputPortId(patch, nodeId) ? PATCH_OUTPUT_PORT_ID : nodeId;
}

function normalizeConnectionEndpointForDiff(
  patch: Patch,
  endpoint: PatchConnection["from"] | PatchConnection["to"]
) {
  return {
    nodeId: normalizeBindingNodeIdForDiff(patch, endpoint.nodeId),
    portId: endpoint.portId
  };
}

function createConnectionDiffKey(patch: Patch, connection: PatchConnection) {
  const from = normalizeConnectionEndpointForDiff(patch, connection.from);
  const to = normalizeConnectionEndpointForDiff(patch, connection.to);
  return `${from.nodeId}:${from.portId}->${to.nodeId}:${to.portId}`;
}

function serializeBinding(patch: Patch, binding: MacroBinding): string {
  return JSON.stringify({
    nodeId: normalizeBindingNodeIdForDiff(patch, binding.nodeId),
    paramId: binding.paramId,
    map: binding.map,
    min: binding.min,
    max: binding.max,
    points: binding.points ?? []
  });
}

function buildNodeParamKey(nodeId: string, paramId: string) {
  return `${nodeId}:${paramId}`;
}

function parseNodeParamKey(key: string): { nodeId: string; paramId: string } | undefined {
  const separatorIndex = key.indexOf(":");
  if (separatorIndex <= 0 || separatorIndex === key.length - 1) {
    return undefined;
  }
  return {
    nodeId: key.slice(0, separatorIndex),
    paramId: key.slice(separatorIndex + 1)
  };
}

function isSameParamRange(left?: PatchParamSliderRange, right?: PatchParamSliderRange): boolean {
  return left?.min === right?.min && left?.max === right?.max;
}

function addSetEntry(map: Map<string, Set<string>>, key: string, value: string) {
  const entries = map.get(key) ?? new Set<string>();
  entries.add(value);
  map.set(key, entries);
}

function buildBindingIndexes(patch: Patch) {
  const byKey = new Map<string, { macro: PatchMacro; binding: MacroBinding }>();
  const keysByMacroId = new Map<string, Set<string>>();
  const keysByNodeId = new Map<string, Set<string>>();
  const keysByNodeParamKey = new Map<string, Set<string>>();

  patch.ui.macros.forEach((macro) => {
    macro.bindings.forEach((binding) => {
      const key = createPatchMacroBindingKey(patch, macro.id, binding);
      byKey.set(key, { macro, binding });
      addSetEntry(keysByMacroId, macro.id, key);
      addSetEntry(keysByNodeId, binding.nodeId, key);
      addSetEntry(keysByNodeParamKey, buildNodeParamKey(binding.nodeId, binding.paramId), key);
    });
  });

  return { byKey, keysByMacroId, keysByNodeId, keysByNodeParamKey };
}

function buildConnectionKeysByNodeId(patch: Patch) {
  const keysByNodeId = new Map<string, Set<string>>();
  patch.connections.forEach((connection) => {
    const key = createConnectionDiffKey(patch, connection);
    addSetEntry(keysByNodeId, connection.from.nodeId, key);
    addSetEntry(keysByNodeId, connection.to.nodeId, key);
  });
  return keysByNodeId;
}

function hasConnectionMissingFrom(
  connectionKeys: Set<string> | undefined,
  comparisonConnectionsByKey: Map<string, PatchConnection>
) {
  if (!connectionKeys) {
    return false;
  }
  for (const connectionKey of connectionKeys) {
    if (!comparisonConnectionsByKey.has(connectionKey)) {
      return true;
    }
  }
  return false;
}

function collectParamIds(currentNode: PatchNode, baselineNode: PatchNode): Set<string> {
  const paramIds = new Set<string>();
  const currentSchema = getModuleSchema(currentNode.typeId);
  const baselineSchema = getModuleSchema(baselineNode.typeId);

  currentSchema?.params.forEach((param) => paramIds.add(param.id));
  baselineSchema?.params.forEach((param) => paramIds.add(param.id));
  Object.keys(currentNode.params).forEach((paramId) => paramIds.add(paramId));
  Object.keys(baselineNode.params).forEach((paramId) => paramIds.add(paramId));

  return paramIds;
}

function buildParamRangeIdsByNodeId(patch: Patch): Map<string, Set<string>> {
  const paramIdsByNodeId = new Map<string, Set<string>>();
  Object.keys(patch.ui.paramRanges ?? {}).forEach((key) => {
    const parsed = parseNodeParamKey(key);
    if (parsed) {
      addSetEntry(paramIdsByNodeId, parsed.nodeId, parsed.paramId);
    }
  });
  return paramIdsByNodeId;
}

function resolveParam(currentNode: PatchNode, baselineNode: PatchNode, paramId: string): {
  currentSchema?: ParamSchema;
  baselineSchema?: ParamSchema;
} {
  const currentSchema = getModuleSchema(currentNode.typeId)?.params.find((param) => param.id === paramId);
  const baselineSchema = getModuleSchema(baselineNode.typeId)?.params.find((param) => param.id === paramId);
  return { currentSchema, baselineSchema };
}

function addRemovedBindingDiff(
  map: Map<string, PatchBindingDiff[]>,
  diff: PatchBindingDiff
) {
  const nodeParamKey = buildNodeParamKey(diff.nodeId, diff.paramId);
  const current = map.get(nodeParamKey) ?? [];
  current.push(diff);
  map.set(nodeParamKey, current);
}

function hasUnchangedMacroBindingForParam(
  bindingKeys: Set<string> | undefined,
  currentPatch: Patch,
  baselinePatch: Patch,
  currentBindingsByKey: Map<string, { macro: PatchMacro; binding: MacroBinding }>,
  baselineBindingsByKey: Map<string, { macro: PatchMacro; binding: MacroBinding }>
) {
  if (!bindingKeys) {
    return false;
  }
  for (const key of bindingKeys) {
    const currentEntry = currentBindingsByKey.get(key);
    const baselineEntry = baselineBindingsByKey.get(key);
    if (!currentEntry || !baselineEntry) {
      continue;
    }
    if (serializeBinding(currentPatch, currentEntry.binding) === serializeBinding(baselinePatch, baselineEntry.binding)) {
      return true;
    }
  }
  return false;
}

export function buildPatchDiff(currentPatch?: Patch, baselinePatch?: Patch): PatchDiff {
  if (!currentPatch || !baselinePatch) {
    return createEmptyDiff();
  }

  const summary = createEmptySummary();
  const nodeDiffById = new Map<string, PatchNodeDiff>();
  const removedNodes: PatchNode[] = [];
  const macroDiffById = new Map<string, PatchMacroDiff>();
  const removedMacros: PatchMacro[] = [];
  const currentBindingDiffByKey = new Map<string, PatchBindingDiff>();
  const removedBindingDiffs: PatchBindingDiff[] = [];
  const removedBindingDiffsByNodeParamKey = new Map<string, PatchBindingDiff[]>();
  const currentConnectionStatusById = new Map<string, "unchanged" | "added">();

  const currentNodes = getPatchParameterTargets(currentPatch);
  const baselineNodes = getPatchParameterTargets(baselinePatch);
  const baselineNodesById = new Map(baselineNodes.map((node) => [node.id, node] as const));
  const currentNodesById = new Map(currentNodes.map((node) => [node.id, node] as const));
  const baselineMacrosById = new Map(baselinePatch.ui.macros.map((macro) => [macro.id, macro] as const));
  const currentBindingIndexes = buildBindingIndexes(currentPatch);
  const baselineBindingIndexes = buildBindingIndexes(baselinePatch);
  const currentBindingsByKey = currentBindingIndexes.byKey;
  const baselineBindingsByKey = baselineBindingIndexes.byKey;
  const currentConnectionsByKey = new Map(currentPatch.connections.map((connection) => [createConnectionDiffKey(currentPatch, connection), connection] as const));
  const baselineConnectionsByKey = new Map(baselinePatch.connections.map((connection) => [createConnectionDiffKey(baselinePatch, connection), connection] as const));
  const currentConnectionKeysByNodeId = buildConnectionKeysByNodeId(currentPatch);
  const baselineConnectionKeysByNodeId = buildConnectionKeysByNodeId(baselinePatch);
  const currentParamRangeIdsByNodeId = buildParamRangeIdsByNodeId(currentPatch);
  const baselineParamRangeIdsByNodeId = buildParamRangeIdsByNodeId(baselinePatch);

  currentNodes.forEach((node) => {
    const baselineNode = baselineNodesById.get(node.id);
    if (!baselineNode) {
      summary.addedNodeCount += 1;
      nodeDiffById.set(node.id, {
        nodeId: node.id,
        typeId: node.typeId,
        status: "added",
        changedParamIds: new Set(Object.keys(node.params)),
        changedParamRangeIds: new Set(currentParamRangeIdsByNodeId.get(node.id)),
        addedBindingKeys: new Set(currentBindingIndexes.keysByNodeId.get(node.id)),
        changedBindingKeys: new Set(),
        removedBindingKeys: new Set(),
        hasConnectionChanges: (currentConnectionKeysByNodeId.get(node.id)?.size ?? 0) > 0
      });
      return;
    }

    const changedParamIds = new Set<string>();
    const changedParamRangeIds = new Set<string>();
    const paramIds = collectParamIds(node, baselineNode);
    currentParamRangeIdsByNodeId.get(node.id)?.forEach((paramId) => paramIds.add(paramId));
    baselineParamRangeIdsByNodeId.get(node.id)?.forEach((paramId) => paramIds.add(paramId));
    paramIds.forEach((paramId) => {
      const paramRangeKey = buildNodeParamKey(node.id, paramId);
      if (!isSameParamRange(currentPatch.ui.paramRanges?.[paramRangeKey], baselinePatch.ui.paramRanges?.[paramRangeKey])) {
        changedParamIds.add(paramId);
        changedParamRangeIds.add(paramId);
        return;
      }

      const { currentSchema, baselineSchema } = resolveParam(node, baselineNode, paramId);
      if (!currentSchema || !baselineSchema) {
        changedParamIds.add(paramId);
        return;
      }
      if (!isSameParamValue(getParamValue(node, currentSchema), getParamValue(baselineNode, baselineSchema))) {
        const currentBindingKeys = currentBindingIndexes.keysByNodeParamKey.get(paramRangeKey);
        const baselineBindingKeys = baselineBindingIndexes.keysByNodeParamKey.get(paramRangeKey);
        if (hasUnchangedMacroBindingForParam(currentBindingKeys, currentPatch, baselinePatch, currentBindingsByKey, baselineBindingsByKey)) {
          return;
        }
        if (hasUnchangedMacroBindingForParam(baselineBindingKeys, currentPatch, baselinePatch, currentBindingsByKey, baselineBindingsByKey)) {
          return;
        }
        changedParamIds.add(paramId);
      }
    });

    const addedBindingKeys = new Set<string>();
    const changedBindingKeys = new Set<string>();
    const removedBindingKeys = new Set<string>();
    currentBindingIndexes.keysByNodeId.get(node.id)?.forEach((key) => {
      const entry = currentBindingsByKey.get(key);
      if (!entry) {
        return;
      }
      const baselineEntry = baselineBindingsByKey.get(key);
      if (!baselineEntry) {
        addedBindingKeys.add(key);
        return;
      }
      if (serializeBinding(currentPatch, entry.binding) !== serializeBinding(baselinePatch, baselineEntry.binding)) {
        changedBindingKeys.add(key);
      }
    });
    baselineBindingIndexes.keysByNodeId.get(node.id)?.forEach((key) => {
      if (!currentBindingsByKey.has(key)) {
        removedBindingKeys.add(key);
      }
    });

    const hasConnectionChanges =
      hasConnectionMissingFrom(currentConnectionKeysByNodeId.get(node.id), baselineConnectionsByKey) ||
      hasConnectionMissingFrom(baselineConnectionKeysByNodeId.get(node.id), currentConnectionsByKey);

    const modified =
      node.typeId !== baselineNode.typeId ||
      changedParamIds.size > 0 ||
      addedBindingKeys.size > 0 ||
      changedBindingKeys.size > 0 ||
      removedBindingKeys.size > 0 ||
      hasConnectionChanges;

    if (modified) {
      summary.modifiedNodeCount += 1;
    }

    nodeDiffById.set(node.id, {
      nodeId: node.id,
      typeId: node.typeId,
      status: modified ? "modified" : "unchanged",
      changedParamIds,
      changedParamRangeIds,
      addedBindingKeys,
      changedBindingKeys,
      removedBindingKeys,
      hasConnectionChanges
    });
  });

  baselineNodes.forEach((node) => {
    if (!currentNodesById.has(node.id)) {
      summary.removedNodeCount += 1;
      removedNodes.push(node);
    }
  });

  currentPatch.ui.macros.forEach((macro) => {
    const baselineMacro = baselineMacrosById.get(macro.id);
    if (!baselineMacro) {
      summary.addedMacroCount += 1;
      macroDiffById.set(macro.id, {
        macroId: macro.id,
        name: macro.name,
        status: "added",
        nameChanged: false,
        keyframeCountChanged: false,
        addedBindingKeys: new Set(currentBindingIndexes.keysByMacroId.get(macro.id)),
        changedBindingKeys: new Set(),
        removedBindingKeys: new Set()
      });
      return;
    }

    const addedBindingKeys = new Set<string>();
    const changedBindingKeys = new Set<string>();
    const removedBindingKeys = new Set<string>();
    currentBindingIndexes.keysByMacroId.get(macro.id)?.forEach((key) => {
      const entry = currentBindingsByKey.get(key);
      if (!entry) {
        return;
      }
      const baselineEntry = baselineBindingsByKey.get(key);
      if (!baselineEntry) {
        addedBindingKeys.add(key);
        return;
      }
      if (serializeBinding(currentPatch, entry.binding) !== serializeBinding(baselinePatch, baselineEntry.binding)) {
        changedBindingKeys.add(key);
      }
    });
    baselineBindingIndexes.keysByMacroId.get(baselineMacro.id)?.forEach((key) => {
      if (!currentBindingsByKey.has(key)) {
        removedBindingKeys.add(key);
      }
    });

    const nameChanged = macro.name !== baselineMacro.name;
    const keyframeCountChanged = macro.keyframeCount !== baselineMacro.keyframeCount;
    const modified = nameChanged || keyframeCountChanged || addedBindingKeys.size > 0 || changedBindingKeys.size > 0 || removedBindingKeys.size > 0;

    if (modified) {
      summary.modifiedMacroCount += 1;
    }

    macroDiffById.set(macro.id, {
      macroId: macro.id,
      name: macro.name,
      status: modified ? "modified" : "unchanged",
      nameChanged,
      keyframeCountChanged,
      addedBindingKeys,
      changedBindingKeys,
      removedBindingKeys
    });
  });

  baselinePatch.ui.macros.forEach((macro) => {
    if (!macroDiffById.has(macro.id)) {
      summary.removedMacroCount += 1;
      removedMacros.push(macro);
    }
  });

  currentBindingsByKey.forEach((entry, key) => {
    const baselineEntry = baselineBindingsByKey.get(key);
    if (!baselineEntry) {
      summary.addedBindingCount += 1;
      currentBindingDiffByKey.set(key, {
        key,
        macroId: entry.macro.id,
        macroName: entry.macro.name,
        bindingId: entry.binding.id,
        nodeId: entry.binding.nodeId,
        paramId: entry.binding.paramId,
        status: "added",
        currentBinding: entry.binding
      });
      return;
    }
    if (serializeBinding(currentPatch, entry.binding) !== serializeBinding(baselinePatch, baselineEntry.binding)) {
      summary.changedBindingCount += 1;
      currentBindingDiffByKey.set(key, {
        key,
        macroId: entry.macro.id,
        macroName: entry.macro.name,
        bindingId: entry.binding.id,
        nodeId: entry.binding.nodeId,
        paramId: entry.binding.paramId,
        status: "modified",
        currentBinding: entry.binding,
        baselineBinding: baselineEntry.binding
      });
    }
  });

  baselineBindingsByKey.forEach((entry, key) => {
    if (currentBindingsByKey.has(key)) {
      return;
    }
    const diff: PatchBindingDiff = {
      key,
      macroId: entry.macro.id,
      macroName: entry.macro.name,
      bindingId: entry.binding.id,
      nodeId: entry.binding.nodeId,
      paramId: entry.binding.paramId,
      status: "removed",
      baselineBinding: entry.binding
    };
    summary.removedBindingCount += 1;
    removedBindingDiffs.push(diff);
    addRemovedBindingDiff(removedBindingDiffsByNodeParamKey, diff);
  });

  currentPatch.connections.forEach((connection) => {
    const key = createConnectionDiffKey(currentPatch, connection);
    if (baselineConnectionsByKey.has(key)) {
      currentConnectionStatusById.set(connection.id, "unchanged");
      return;
    }
    summary.addedConnectionCount += 1;
    currentConnectionStatusById.set(connection.id, "added");
  });

  const addedConnections = currentPatch.connections.filter((connection) => currentConnectionStatusById.get(connection.id) === "added");
  const currentConnectionKeys = new Set(currentPatch.connections.map((connection) => createConnectionDiffKey(currentPatch, connection)));
  const removedConnections = baselinePatch.connections.filter((connection) => !currentConnectionKeys.has(createConnectionDiffKey(baselinePatch, connection)));
  summary.removedConnectionCount = removedConnections.length;

  const hasChanges =
    Object.values(summary).some((count) => count > 0);

  return {
    hasBaseline: true,
    hasChanges,
    nodeDiffById,
    removedNodes,
    macroDiffById,
    removedMacros,
    currentBindingDiffByKey,
    removedBindingDiffs,
    removedBindingDiffsByNodeParamKey,
    addedConnections,
    removedConnections,
    currentConnectionStatusById,
    summary
  };
}

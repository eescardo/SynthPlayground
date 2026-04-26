import { getModuleSchema } from "@/lib/patch/moduleRegistry";
import { MacroBinding, Patch, PatchConnection, PatchMacro, PatchNode, ParamSchema, ParamValue } from "@/types/patch";

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

function serializeBinding(binding: MacroBinding): string {
  return JSON.stringify({
    nodeId: binding.nodeId,
    paramId: binding.paramId,
    map: binding.map,
    min: binding.min,
    max: binding.max,
    points: binding.points ?? []
  });
}

function buildBindingKey(macroId: string, bindingId: string) {
  return `${macroId}:${bindingId}`;
}

function buildNodeParamKey(nodeId: string, paramId: string) {
  return `${nodeId}:${paramId}`;
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

  const baselineNodesById = new Map(baselinePatch.nodes.map((node) => [node.id, node] as const));
  const currentNodesById = new Map(currentPatch.nodes.map((node) => [node.id, node] as const));
  const baselineMacrosById = new Map(baselinePatch.ui.macros.map((macro) => [macro.id, macro] as const));

  const currentBindingsByKey = new Map<string, { macro: PatchMacro; binding: MacroBinding }>();
  currentPatch.ui.macros.forEach((macro) => {
    macro.bindings.forEach((binding) => {
      currentBindingsByKey.set(buildBindingKey(macro.id, binding.id), { macro, binding });
    });
  });

  const baselineBindingsByKey = new Map<string, { macro: PatchMacro; binding: MacroBinding }>();
  baselinePatch.ui.macros.forEach((macro) => {
    macro.bindings.forEach((binding) => {
      baselineBindingsByKey.set(buildBindingKey(macro.id, binding.id), { macro, binding });
    });
  });

  currentPatch.nodes.forEach((node) => {
    const baselineNode = baselineNodesById.get(node.id);
    if (!baselineNode) {
      summary.addedNodeCount += 1;
      nodeDiffById.set(node.id, {
        nodeId: node.id,
        typeId: node.typeId,
        status: "added",
        changedParamIds: new Set(Object.keys(node.params)),
        addedBindingKeys: new Set(
          Array.from(currentBindingsByKey.entries())
            .filter(([, entry]) => entry.binding.nodeId === node.id)
            .map(([key]) => key)
        ),
        changedBindingKeys: new Set(),
        removedBindingKeys: new Set(),
        hasConnectionChanges: currentPatch.connections.some(
          (connection) => connection.from.nodeId === node.id || connection.to.nodeId === node.id
        )
      });
      return;
    }

    const changedParamIds = new Set<string>();
    collectParamIds(node, baselineNode).forEach((paramId) => {
      const { currentSchema, baselineSchema } = resolveParam(node, baselineNode, paramId);
      if (!currentSchema || !baselineSchema) {
        changedParamIds.add(paramId);
        return;
      }
      if (!isSameParamValue(getParamValue(node, currentSchema), getParamValue(baselineNode, baselineSchema))) {
        changedParamIds.add(paramId);
      }
    });

    const addedBindingKeys = new Set<string>();
    const changedBindingKeys = new Set<string>();
    const removedBindingKeys = new Set<string>();
    currentBindingsByKey.forEach((entry, key) => {
      if (entry.binding.nodeId !== node.id) {
        return;
      }
      const baselineEntry = baselineBindingsByKey.get(key);
      if (!baselineEntry) {
        addedBindingKeys.add(key);
        return;
      }
      if (serializeBinding(entry.binding) !== serializeBinding(baselineEntry.binding)) {
        changedBindingKeys.add(key);
      }
    });
    baselineBindingsByKey.forEach((entry, key) => {
      if (entry.binding.nodeId === node.id && !currentBindingsByKey.has(key)) {
        removedBindingKeys.add(key);
      }
    });

    const hasConnectionChanges =
      currentPatch.connections.some(
        (connection) =>
          (connection.from.nodeId === node.id || connection.to.nodeId === node.id) &&
          !baselinePatch.connections.some((baselineConnection) => baselineConnection.id === connection.id)
      ) ||
      baselinePatch.connections.some(
        (connection) =>
          (connection.from.nodeId === node.id || connection.to.nodeId === node.id) &&
          !currentPatch.connections.some((currentConnection) => currentConnection.id === connection.id)
      );

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
      addedBindingKeys,
      changedBindingKeys,
      removedBindingKeys,
      hasConnectionChanges
    });
  });

  baselinePatch.nodes.forEach((node) => {
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
        addedBindingKeys: new Set(macro.bindings.map((binding) => buildBindingKey(macro.id, binding.id))),
        changedBindingKeys: new Set(),
        removedBindingKeys: new Set()
      });
      return;
    }

    const addedBindingKeys = new Set<string>();
    const changedBindingKeys = new Set<string>();
    const removedBindingKeys = new Set<string>();
    macro.bindings.forEach((binding) => {
      const key = buildBindingKey(macro.id, binding.id);
      const baselineBinding = baselineMacro.bindings.find((entry) => entry.id === binding.id);
      if (!baselineBinding) {
        addedBindingKeys.add(key);
        return;
      }
      if (serializeBinding(binding) !== serializeBinding(baselineBinding)) {
        changedBindingKeys.add(key);
      }
    });
    baselineMacro.bindings.forEach((binding) => {
      if (!macro.bindings.some((entry) => entry.id === binding.id)) {
        removedBindingKeys.add(buildBindingKey(macro.id, binding.id));
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
    if (serializeBinding(entry.binding) !== serializeBinding(baselineEntry.binding)) {
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

  const baselineConnectionsById = new Map(baselinePatch.connections.map((connection) => [connection.id, connection] as const));
  currentPatch.connections.forEach((connection) => {
    if (baselineConnectionsById.has(connection.id)) {
      currentConnectionStatusById.set(connection.id, "unchanged");
      return;
    }
    summary.addedConnectionCount += 1;
    currentConnectionStatusById.set(connection.id, "added");
  });

  const addedConnections = currentPatch.connections.filter((connection) => currentConnectionStatusById.get(connection.id) === "added");
  const removedConnections = baselinePatch.connections.filter((connection) => !currentConnectionStatusById.has(connection.id));
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

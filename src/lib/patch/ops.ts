import { createDefaultParamsForType, getModuleSchema } from "@/lib/patch/moduleRegistry";
import { createId } from "@/lib/ids";
import { Patch } from "@/types/patch";
import { PatchHistoryState, PatchOp } from "@/types/ops";

const clonePatch = (patch: Patch): Patch => structuredClone(patch);

const findLayoutNode = (patch: Patch, nodeId: string): number => patch.layout.nodes.findIndex((node) => node.nodeId === nodeId);

const applySingleOp = (patch: Patch, op: PatchOp): Patch => {
  const next = clonePatch(patch);

  switch (op.type) {
    case "addNode": {
      if (next.nodes.some((node) => node.id === op.nodeId)) {
        throw new Error(`Node already exists: ${op.nodeId}`);
      }
      getModuleSchema(op.typeId);
      next.nodes.push({
        id: op.nodeId,
        typeId: op.typeId,
        params: {
          ...createDefaultParamsForType(op.typeId),
          ...(op.initialParams ?? {})
        }
      });
      next.layout.nodes.push({ nodeId: op.nodeId, x: op.layoutPos.x, y: op.layoutPos.y });
      return next;
    }

    case "removeNode": {
      next.nodes = next.nodes.filter((node) => node.id !== op.nodeId);
      next.connections = next.connections.filter(
        (connection) => connection.from.nodeId !== op.nodeId && connection.to.nodeId !== op.nodeId
      );
      next.layout.nodes = next.layout.nodes.filter((node) => node.nodeId !== op.nodeId);
      for (const macro of next.ui.macros) {
        macro.bindings = macro.bindings.filter((binding) => binding.nodeId !== op.nodeId);
      }
      if (next.io.audioOutNodeId === op.nodeId) {
        const outputNode = next.nodes.find((node) => node.typeId === "Output");
        if (outputNode) {
          next.io.audioOutNodeId = outputNode.id;
          next.io.audioOutPortId = "in";
        }
      }
      return next;
    }

    case "moveNode": {
      const idx = findLayoutNode(next, op.nodeId);
      if (idx === -1) {
        throw new Error(`Cannot move node, layout missing: ${op.nodeId}`);
      }
      next.layout.nodes[idx] = {
        nodeId: op.nodeId,
        x: op.newLayoutPos.x,
        y: op.newLayoutPos.y
      };
      return next;
    }

    case "setParam": {
      const node = next.nodes.find((entry) => entry.id === op.nodeId);
      if (!node) {
        throw new Error(`Unknown node in setParam: ${op.nodeId}`);
      }
      node.params[op.paramId] = op.value;
      return next;
    }

    case "connect": {
      if (next.connections.some((connection) => connection.id === op.connectionId)) {
        throw new Error(`Connection already exists: ${op.connectionId}`);
      }
      next.connections.push({
        id: op.connectionId,
        from: { nodeId: op.fromNodeId, portId: op.fromPortId },
        to: { nodeId: op.toNodeId, portId: op.toPortId }
      });
      return next;
    }

    case "disconnect": {
      next.connections = next.connections.filter((connection) => connection.id !== op.connectionId);
      return next;
    }

    case "addMacro": {
      if (next.ui.macros.some((macro) => macro.id === op.macroId)) {
        throw new Error(`Macro already exists: ${op.macroId}`);
      }
      next.ui.macros.push({ id: op.macroId, name: op.name, bindings: [] });
      return next;
    }

    case "removeMacro": {
      next.ui.macros = next.ui.macros.filter((macro) => macro.id !== op.macroId);
      return next;
    }

    case "bindMacro": {
      const macro = next.ui.macros.find((entry) => entry.id === op.macroId);
      if (!macro) {
        throw new Error(`Unknown macro: ${op.macroId}`);
      }
      if (macro.bindings.some((binding) => binding.id === op.bindingId)) {
        throw new Error(`Binding already exists: ${op.bindingId}`);
      }
      macro.bindings.push({
        id: op.bindingId,
        nodeId: op.nodeId,
        paramId: op.paramId,
        map: op.map,
        min: op.min,
        max: op.max
      });
      return next;
    }

    case "unbindMacro": {
      const macro = next.ui.macros.find((entry) => entry.id === op.macroId);
      if (!macro) {
        throw new Error(`Unknown macro: ${op.macroId}`);
      }
      macro.bindings = macro.bindings.filter((binding) => binding.id !== op.bindingId);
      return next;
    }

    case "renameMacro": {
      const macro = next.ui.macros.find((entry) => entry.id === op.macroId);
      if (!macro) {
        throw new Error(`Unknown macro: ${op.macroId}`);
      }
      macro.name = op.name;
      return next;
    }

    default: {
      const exhaustiveness: never = op;
      throw new Error(`Unknown op ${(exhaustiveness as { type: string }).type}`);
    }
  }
};

export const createPatchHistory = <T>(initial: T): PatchHistoryState<T> => ({
  current: structuredClone(initial),
  past: [],
  future: [],
  ops: []
});

export const applyPatchOpWithHistory = (state: PatchHistoryState<Patch>, op: PatchOp): PatchHistoryState<Patch> => {
  const lastOp = state.ops[state.ops.length - 1];
  if (op.type === "moveNode" && lastOp?.type === "moveNode" && lastOp.nodeId === op.nodeId) {
    const nextPatch = applySingleOp(state.current, op);
    return {
      current: nextPatch,
      past: state.past,
      future: [],
      ops: [...state.ops.slice(0, -1), op]
    };
  }

  const nextPatch = applySingleOp(state.current, op);
  return {
    current: nextPatch,
    past: [...state.past, state.current],
    future: [],
    ops: [...state.ops, op]
  };
};

export const undoPatchOp = (state: PatchHistoryState<Patch>): PatchHistoryState<Patch> => {
  if (state.past.length === 0) {
    return state;
  }
  const previous = state.past[state.past.length - 1];
  return {
    current: previous,
    past: state.past.slice(0, -1),
    future: [state.current, ...state.future],
    ops: state.ops.slice(0, -1)
  };
};

export const redoPatchOp = (state: PatchHistoryState<Patch>): PatchHistoryState<Patch> => {
  if (state.future.length === 0) {
    return state;
  }
  const restored = state.future[0];
  return {
    current: restored,
    past: [...state.past, state.current],
    future: state.future.slice(1),
    ops: state.ops
  };
};

export const applyMacroValue = (patch: Patch, macroId: string, normalized: number): Patch => {
  const macro = patch.ui.macros.find((entry) => entry.id === macroId);
  if (!macro) {
    return patch;
  }

  const next = clonePatch(patch);
  const norm = Math.max(0, Math.min(1, normalized));

  for (const binding of macro.bindings) {
    const node = next.nodes.find((entry) => entry.id === binding.nodeId);
    if (!node) {
      continue;
    }

    const resolved =
      binding.map === "exp" ? binding.min * Math.pow(binding.max / Math.max(binding.min, 0.000001), norm) : binding.min + (binding.max - binding.min) * norm;

    node.params[binding.paramId] = resolved;
  }

  return next;
};

export const makeConnectOp = (
  fromNodeId: string,
  fromPortId: string,
  toNodeId: string,
  toPortId: string
): PatchOp => ({
  type: "connect",
  connectionId: createId("conn"),
  fromNodeId,
  fromPortId,
  toNodeId,
  toPortId
});

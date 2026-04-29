import { HOST_PORT_IDS } from "@/lib/patch/constants";
import { isPatchOutputPortId } from "@/lib/patch/ports";
import { MacroBinding, Patch } from "@/types/patch";

export function createMacroBindingId(macroId: string, nodeId: string, paramId: string) {
  return `${macroId}:${nodeId}:${paramId}`;
}

export function createMacroBindingKey(macroId: string, binding: Pick<MacroBinding, "nodeId" | "paramId">) {
  return createMacroBindingId(macroId, binding.nodeId, binding.paramId);
}

export function createPatchMacroBindingKey(
  patch: Pick<Patch, "ports">,
  macroId: string,
  binding: Pick<MacroBinding, "nodeId" | "paramId">
) {
  const nodeId = isPatchOutputPortId(patch, binding.nodeId) || binding.nodeId === HOST_PORT_IDS.output ? "$patch.output" : binding.nodeId;
  return createMacroBindingId(macroId, nodeId, binding.paramId);
}

export function normalizeMacroBindingIds<T extends Pick<Patch, "ui">>(patch: T): T {
  return {
    ...patch,
    ui: {
      ...patch.ui,
      macros: patch.ui.macros.map((macro) => ({
        ...macro,
        bindings: macro.bindings.map((binding) => ({
          ...binding,
          id: createMacroBindingId(macro.id, binding.nodeId, binding.paramId)
        }))
      }))
    }
  };
}

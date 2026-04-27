import { MacroBinding, Patch } from "@/types/patch";

export function createMacroBindingId(macroId: string, nodeId: string, paramId: string) {
  return `${macroId}:${nodeId}:${paramId}`;
}

export function createMacroBindingKey(macroId: string, binding: Pick<MacroBinding, "nodeId" | "paramId">) {
  return createMacroBindingId(macroId, binding.nodeId, binding.paramId);
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

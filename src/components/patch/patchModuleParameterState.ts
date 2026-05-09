import { resolveMacroBindingValue } from "@/lib/patch/macroKeyframes";
import { MacroBinding, Patch, PatchNode, ParamSchema, ParamValue } from "@/types/patch";

export function resolveParamBindingState(
  patch: Patch,
  selectedNode: PatchNode,
  param: ParamSchema,
  selectedMacroId: string | undefined,
  selectedMacroKeyframeIndex: number | null,
  structureLocked: boolean | undefined
) {
  const boundMacros = patch.ui.macros.filter((macro) =>
    macro.bindings.some((binding) => binding.nodeId === selectedNode.id && binding.paramId === param.id)
  );
  const activeBindingMacro = boundMacros.find((macro) => macro.id === selectedMacroId) ?? boundMacros[0];
  const isExposed = boundMacros.length > 0;
  const isEditableSelectedMacroBinding =
    Boolean(activeBindingMacro) &&
    !structureLocked &&
    selectedMacroId === activeBindingMacro?.id &&
    selectedMacroKeyframeIndex !== null &&
    param.type === "float";
  return {
    activeBindingMacro,
    boundMacros,
    isEditableSelectedMacroBinding,
    isExposed
  };
}

export function resolveParamControlValue(options: {
  activeBinding?: MacroBinding;
  activeBindingMacroId?: string;
  selectedMacroId?: string;
  selectedMacroValue?: number;
  value: ParamValue;
}) {
  return options.activeBinding &&
    options.activeBindingMacroId === options.selectedMacroId &&
    typeof options.selectedMacroValue === "number"
    ? resolveMacroBindingValue(options.activeBinding, options.selectedMacroValue)
    : options.value;
}

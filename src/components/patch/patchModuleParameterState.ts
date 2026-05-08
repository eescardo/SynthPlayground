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
  const editableSummary =
    activeBindingMacro && selectedMacroId === activeBindingMacro.id
      ? selectedMacroKeyframeIndex !== null
        ? `Editing ${activeBindingMacro.name} at keyframe ${selectedMacroKeyframeIndex + 1}/${activeBindingMacro.keyframeCount}`
        : "Bound values unlock when the selected macro is parked on a keyframe notch."
      : activeBindingMacro
        ? `Select ${activeBindingMacro.name} and stop on a keyframe notch to edit this binding.`
        : null;

  return {
    activeBindingMacro,
    boundMacros,
    editableSummary,
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

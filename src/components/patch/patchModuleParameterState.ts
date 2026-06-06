import { isMacroBindingTarget } from "@/lib/patch/macroBindings";
import { resolveMacroBindingValue } from "@/lib/patch/macroKeyframes";
import { PatchBindingDiff, PatchParamDiff } from "@/lib/patch/diff";
import { PatchOp } from "@/types/ops";
import { MacroBinding, Patch, PatchNode, ParamSchema, ParamValue } from "@/types/patch";

export function resolveParamBindingState(
  patch: Patch,
  selectedNode: PatchNode,
  param: ParamSchema,
  selectedMacroId: string | undefined,
  selectedMacroKeyframeIndex: number | null,
  structureLocked: boolean | undefined
) {
  const bindingTarget = { nodeId: selectedNode.id, paramId: param.id };
  const boundMacros = patch.ui.macros.filter((macro) =>
    macro.bindings.some((binding) => isMacroBindingTarget(binding, bindingTarget))
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

export function createRestoreMacroBindingOp(bindingDiff: PatchBindingDiff): PatchOp | null {
  if (bindingDiff.status === "added") {
    return {
      type: "unbindMacro",
      macroId: bindingDiff.macroId,
      nodeId: bindingDiff.nodeId,
      paramId: bindingDiff.paramId
    };
  }
  if (!bindingDiff.baselineBinding) {
    return null;
  }
  return {
    type: "setMacroBinding",
    macroId: bindingDiff.macroId,
    nodeId: bindingDiff.nodeId,
    paramId: bindingDiff.paramId,
    map: bindingDiff.baselineBinding.map,
    min: bindingDiff.baselineBinding.min,
    max: bindingDiff.baselineBinding.max,
    points: bindingDiff.baselineBinding.points?.map((point) => ({ ...point }))
  };
}

export function createRestoreParamValueOp(paramDiff: PatchParamDiff): PatchOp {
  return {
    type: "setParam",
    nodeId: paramDiff.nodeId,
    paramId: paramDiff.paramId,
    value: paramDiff.baselineValue
  };
}

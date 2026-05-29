import { isPatchOutputPortId, PATCH_OUTPUT_PORT_ID } from "@/lib/patch/ports";
import { MacroBinding, Patch } from "@/types/patch";

export function createMacroBindingId(macroId: string, nodeId: string, paramId: string) {
  return `${macroId}:${nodeId}:${paramId}`;
}

export function createMacroBindingKey(macroId: string, binding: Pick<MacroBinding, "nodeId" | "paramId">) {
  return createMacroBindingId(macroId, binding.nodeId, binding.paramId);
}

export function createMacroBindingTargetKey(target: Pick<MacroBinding, "nodeId" | "paramId">) {
  return `${target.nodeId}:${target.paramId}`;
}

export function isMacroBindingTarget(
  binding: Pick<MacroBinding, "nodeId" | "paramId">,
  target: Pick<MacroBinding, "nodeId" | "paramId">
) {
  return createMacroBindingTargetKey(binding) === createMacroBindingTargetKey(target);
}

export function createPatchMacroBindingKey(
  patch: Pick<Patch, "ports">,
  macroId: string,
  binding: Pick<MacroBinding, "nodeId" | "paramId">
) {
  const nodeId = isPatchOutputPortId(patch, binding.nodeId) ? PATCH_OUTPUT_PORT_ID : binding.nodeId;
  return createMacroBindingId(macroId, nodeId, binding.paramId);
}

"use client";

import { Dispatch, SetStateAction, useCallback } from "react";
import { LocalPatchWorkspaceTab } from "@/hooks/patch/patchWorkspaceStateUtils";
import { resolvePatchWorkspaceMacroValues } from "@/hooks/patch/usePatchWorkspaceMacroValues";
import { createId } from "@/lib/ids";
import { createMacroBindingId } from "@/lib/patch/macroBindings";
import { clampNormalizedMacroValue } from "@/lib/patch/macroKeyframes";
import { getModuleSchema } from "@/lib/patch/moduleRegistry";
import { applyPatchOp as applyPatchGraphOp } from "@/lib/patch/ops";
import { getPatchParameterTargets } from "@/lib/patch/ports";
import { resolvePatchSource } from "@/lib/patch/source";
import { Project } from "@/types/music";
import { Patch } from "@/types/patch";

interface UsePatchWorkspaceMacroActionsOptions {
  activeTab?: LocalPatchWorkspaceTab;
  selectedPatch?: Patch;
  tabMacroValuesById: Record<string, Record<string, number>>;
  setTabMacroValuesById: Dispatch<SetStateAction<Record<string, Record<string, number>>>>;
  previewPitch: string;
  commitProjectChange: (
    updater: (current: Project) => Project,
    options?: { actionKey?: string; coalesce?: boolean; skipHistory?: boolean }
  ) => void;
  schedulePatchPreview: (patchId: string, patchOverride?: Patch, macroValues?: Record<string, number>) => void;
  previewSelectedPatchNow: (pitch: string, macroValues?: Record<string, number>) => void;
}

export function usePatchWorkspaceMacroActions({
  activeTab,
  commitProjectChange,
  previewPitch,
  previewSelectedPatchNow,
  schedulePatchPreview,
  selectedPatch,
  setTabMacroValuesById,
  tabMacroValuesById
}: UsePatchWorkspaceMacroActionsOptions) {
  const exposePatchMacro = useCallback((nodeId: string, paramId: string, suggestedName: string) => {
    if (!selectedPatch || resolvePatchSource(selectedPatch) === "preset") {
      return;
    }

    commitProjectChange((current) => {
      const currentPatch = current.patches.find((patch) => patch.id === selectedPatch.id);
      if (!currentPatch) {
        return current;
      }

      const node = getPatchParameterTargets(currentPatch).find((entry) => entry.id === nodeId);
      if (!node) {
        return current;
      }

      const moduleSchema = getModuleSchema(node.typeId);
      const paramSchema = moduleSchema?.params.find((param) => param.id === paramId);
      if (!moduleSchema || !paramSchema) {
        return current;
      }

      let nextPatch = currentPatch;
      const existingMacro = currentPatch.ui.macros.find((macro) =>
        macro.bindings.some((binding) => binding.nodeId === nodeId && binding.paramId === paramId)
      );
      if (existingMacro) {
        return current;
      }

      const macroId = createId("macro");
      nextPatch = applyPatchGraphOp(nextPatch, {
        type: "addMacro",
        macroId,
        name: suggestedName,
        keyframeCount: 2
      });

      const sliderRange = currentPatch.ui.paramRanges?.[`${nodeId}:${paramId}`];
      const min = paramSchema.type === "float" ? sliderRange?.min ?? paramSchema.range.min : 0;
      const max = paramSchema.type === "float" ? sliderRange?.max ?? paramSchema.range.max : 1;
      nextPatch = applyPatchGraphOp(nextPatch, {
        type: "bindMacro",
        macroId,
        bindingId: createMacroBindingId(macroId, nodeId, paramId),
        nodeId,
        paramId,
        map: "linear",
        min,
        max
      });

      return {
        ...current,
        patches: current.patches.map((patch) => (patch.id === selectedPatch.id ? nextPatch : patch))
      };
    }, { actionKey: `patch:${selectedPatch.id}:expose-macro:${nodeId}:${paramId}` });
  }, [commitProjectChange, selectedPatch]);

  const addPatchMacro = useCallback(() => {
    if (!selectedPatch || resolvePatchSource(selectedPatch) === "preset") {
      return;
    }
    commitProjectChange((current) => ({
      ...current,
      patches: current.patches.map((patch) =>
        patch.id === selectedPatch.id
          ? applyPatchGraphOp(patch, {
              type: "addMacro",
              macroId: createId("macro"),
              name: `Macro ${patch.ui.macros.length + 1}`,
              keyframeCount: 2
            })
          : patch
      )
    }), { actionKey: `patch:${selectedPatch.id}:add-macro` });
  }, [commitProjectChange, selectedPatch]);

  const removePatchMacro = useCallback((macroId: string) => {
    if (!selectedPatch || resolvePatchSource(selectedPatch) === "preset") {
      return;
    }
    commitProjectChange((current) => ({
      ...current,
      patches: current.patches.map((patch) =>
        patch.id === selectedPatch.id ? applyPatchGraphOp(patch, { type: "removeMacro", macroId }) : patch
      )
    }), { actionKey: `patch:${selectedPatch.id}:remove-macro:${macroId}` });
  }, [commitProjectChange, selectedPatch]);

  const renamePatchMacro = useCallback((macroId: string, name: string) => {
    if (!selectedPatch || resolvePatchSource(selectedPatch) === "preset") {
      return;
    }
    commitProjectChange((current) => ({
      ...current,
      patches: current.patches.map((patch) =>
        patch.id === selectedPatch.id ? applyPatchGraphOp(patch, { type: "renameMacro", macroId, name }) : patch
      )
    }), {
      actionKey: `patch:${selectedPatch.id}:rename-macro:${macroId}`,
      coalesce: true
    });
  }, [commitProjectChange, selectedPatch]);

  const setPatchMacroKeyframeCount = useCallback((macroId: string, keyframeCount: number) => {
    if (!selectedPatch || resolvePatchSource(selectedPatch) === "preset") {
      return;
    }
    commitProjectChange((current) => ({
      ...current,
      patches: current.patches.map((patch) =>
        patch.id === selectedPatch.id
          ? applyPatchGraphOp(patch, { type: "setMacroKeyframeCount", macroId, keyframeCount })
          : patch
      )
    }), { actionKey: `patch:${selectedPatch.id}:set-macro-keyframes:${macroId}` });
    schedulePatchPreview(selectedPatch.id, undefined, activeTab ? tabMacroValuesById[activeTab.id] : undefined);
  }, [activeTab, commitProjectChange, schedulePatchPreview, selectedPatch, tabMacroValuesById]);

  const changePatchMacroValue = useCallback((macroId: string, normalized: number, changeOptions?: { commit?: boolean }) => {
    if (!selectedPatch) {
      return;
    }
    const defaultValue = selectedPatch.ui.macros.find((macro) => macro.id === macroId)?.defaultNormalized ?? 0.5;
    const clamped = clampNormalizedMacroValue(normalized);
    const nextMacroValues = {
      ...((activeTab && tabMacroValuesById[activeTab.id]) ?? {}),
      [macroId]: clamped
    };
    if (Math.abs(clamped - defaultValue) <= 0.0005) {
      delete nextMacroValues[macroId];
    }
    if (activeTab) {
      setTabMacroValuesById((current) => ({ ...current, [activeTab.id]: nextMacroValues }));
    }

    if (changeOptions?.commit) {
      previewSelectedPatchNow(previewPitch, resolvePatchWorkspaceMacroValues(selectedPatch, nextMacroValues));
    }
  }, [activeTab, previewPitch, previewSelectedPatchNow, selectedPatch, setTabMacroValuesById, tabMacroValuesById]);

  return {
    exposePatchMacro,
    addPatchMacro,
    removePatchMacro,
    renamePatchMacro,
    setPatchMacroKeyframeCount,
    changePatchMacroValue
  };
}

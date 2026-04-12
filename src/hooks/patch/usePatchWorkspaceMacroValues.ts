"use client";

import { useMemo } from "react";
import { applyMacroValue } from "@/lib/patch/ops";
import { Patch } from "@/types/patch";

export const buildPatchWithWorkspaceMacroValues = (patch: Patch, macroValues?: Record<string, number>) => {
  if (!macroValues || Object.keys(macroValues).length === 0) {
    return patch;
  }

  return patch.ui.macros.reduce((nextPatch, macro) => {
    const normalized = macroValues[macro.id];
    return typeof normalized === "number" ? applyMacroValue(nextPatch, macro.id, normalized) : nextPatch;
  }, patch);
};

interface UsePatchWorkspaceMacroValuesOptions {
  selectedPatch?: Patch;
  macroValues?: Record<string, number>;
}

export function usePatchWorkspaceMacroValues(options: UsePatchWorkspaceMacroValuesOptions) {
  const { selectedPatch, macroValues } = options;

  const workspaceMacroValues = useMemo(() => {
    if (!selectedPatch) {
      return {};
    }
    const persistedValues = macroValues ?? {};
    return Object.fromEntries(
      selectedPatch.ui.macros.map((macro) => [macro.id, persistedValues[macro.id] ?? macro.defaultNormalized ?? 0.5])
    );
  }, [macroValues, selectedPatch]);

  const workspacePatch = useMemo(
    () => (selectedPatch ? buildPatchWithWorkspaceMacroValues(selectedPatch, workspaceMacroValues) : selectedPatch),
    [selectedPatch, workspaceMacroValues]
  );

  return {
    workspaceMacroValues,
    workspacePatch
  };
}

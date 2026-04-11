"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { applyMacroValue } from "@/lib/patch/ops";
import { clampNormalizedMacroValue } from "@/lib/patch/macroKeyframes";
import { Patch } from "@/types/patch";

const PATCH_WORKSPACE_MACRO_VALUES_SESSION_KEY = "synth-playground:patch-workspace-macro-values";

interface UsePatchWorkspaceMacroValuesOptions {
  selectedPatch?: Patch;
}

export function usePatchWorkspaceMacroValues(options: UsePatchWorkspaceMacroValuesOptions) {
  const { selectedPatch } = options;
  const [workspaceMacroValuesByPatchId, setWorkspaceMacroValuesByPatchId] = useState<Record<string, Record<string, number>>>({});

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(PATCH_WORKSPACE_MACRO_VALUES_SESSION_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as Record<string, Record<string, unknown>>;
      setWorkspaceMacroValuesByPatchId(
        Object.fromEntries(
          Object.entries(parsed).map(([patchId, macroValues]) => [
            patchId,
            Object.fromEntries(
              Object.entries(macroValues).flatMap(([macroId, normalized]) =>
                typeof normalized === "number" && Number.isFinite(normalized)
                  ? [[macroId, clampNormalizedMacroValue(normalized)]]
                  : []
              )
            )
          ])
        )
      );
    } catch {
      // Ignore invalid session data and start with defaults.
    }
  }, []);

  useEffect(() => {
    window.sessionStorage.setItem(PATCH_WORKSPACE_MACRO_VALUES_SESSION_KEY, JSON.stringify(workspaceMacroValuesByPatchId));
  }, [workspaceMacroValuesByPatchId]);

  const buildPatchWithWorkspaceMacroValues = useCallback((patch: Patch, macroValues?: Record<string, number>) => {
    const resolvedMacroValues = macroValues ?? workspaceMacroValuesByPatchId[patch.id];
    if (!resolvedMacroValues || Object.keys(resolvedMacroValues).length === 0) {
      return patch;
    }

    return patch.ui.macros.reduce((nextPatch, macro) => {
      const normalized = resolvedMacroValues[macro.id];
      return typeof normalized === "number" ? applyMacroValue(nextPatch, macro.id, normalized) : nextPatch;
    }, patch);
  }, [workspaceMacroValuesByPatchId]);

  const workspaceMacroValues = useMemo(() => {
    if (!selectedPatch) {
      return {};
    }
    const persistedValues = workspaceMacroValuesByPatchId[selectedPatch.id] ?? {};
    return Object.fromEntries(
      selectedPatch.ui.macros.map((macro) => [macro.id, persistedValues[macro.id] ?? macro.defaultNormalized ?? 0.5])
    );
  }, [selectedPatch, workspaceMacroValuesByPatchId]);

  const workspacePatch = useMemo(
    () => (selectedPatch ? buildPatchWithWorkspaceMacroValues(selectedPatch, workspaceMacroValues) : selectedPatch),
    [buildPatchWithWorkspaceMacroValues, selectedPatch, workspaceMacroValues]
  );

  const setWorkspaceMacroValue = useCallback((
    patchId: string,
    macroId: string,
    normalized: number,
    defaultNormalized: number
  ) => {
    const clamped = clampNormalizedMacroValue(normalized);
    let nextPatchMacroValues: Record<string, number> = {};

    setWorkspaceMacroValuesByPatchId((current) => {
      nextPatchMacroValues = {
        ...(current[patchId] ?? {}),
        [macroId]: clamped
      };
      if (Math.abs(clamped - defaultNormalized) <= 0.0005) {
        delete nextPatchMacroValues[macroId];
      }

      const next = { ...current };
      if (Object.keys(nextPatchMacroValues).length === 0) {
        delete next[patchId];
      } else {
        next[patchId] = nextPatchMacroValues;
      }
      return next;
    });

    return nextPatchMacroValues;
  }, []);

  return {
    buildPatchWithWorkspaceMacroValues,
    setWorkspaceMacroValue,
    workspaceMacroValues,
    workspaceMacroValuesByPatchId,
    workspacePatch
  };
}

"use client";

import { useCallback, useMemo } from "react";
import { LocalPatchWorkspaceTab } from "@/hooks/patch/patchWorkspaceStateUtils";
import { buildPatchDiff } from "@/lib/patch/diff";
import { Patch } from "@/types/patch";

interface UsePatchWorkspaceBaselineOptions {
  activeTab?: LocalPatchWorkspaceTab;
  patches: Patch[];
  selectedPatch?: Patch;
  updateActiveTab: (updater: (tab: LocalPatchWorkspaceTab) => LocalPatchWorkspaceTab) => void;
}

export function usePatchWorkspaceBaseline({
  activeTab,
  patches,
  selectedPatch,
  updateActiveTab
}: UsePatchWorkspaceBaselineOptions) {
  const baselinePatch = activeTab?.baselinePatch;
  const patchDiff = useMemo(
    () => buildPatchDiff(selectedPatch, baselinePatch),
    [baselinePatch, selectedPatch]
  );

  const setBaselinePatchFromPatchId = useCallback((patchId: string) => {
    const baselineSourcePatch = patches.find((patch) => patch.id === patchId);
    if (!baselineSourcePatch) {
      return;
    }
    updateActiveTab((tab) => ({
      ...tab,
      baselinePatch: structuredClone(baselineSourcePatch)
    }));
  }, [patches, updateActiveTab]);

  const clearCurrentPatchBaseline = useCallback(() => {
    updateActiveTab((tab) => ({
      ...tab,
      baselinePatch: undefined
    }));
  }, [updateActiveTab]);

  return {
    baselinePatch,
    patchDiff,
    setBaselinePatchFromPatchId,
    clearCurrentPatchBaseline
  };
}

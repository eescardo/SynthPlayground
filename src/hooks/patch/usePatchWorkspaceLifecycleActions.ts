"use client";

import { Dispatch, MutableRefObject, SetStateAction, useCallback } from "react";
import {
  LocalPatchWorkspaceTab,
  MAX_PATCH_WORKSPACE_TABS,
  resolveRemovedPatchFallbackId,
  retargetRemovedPatchTabs
} from "@/hooks/patch/patchWorkspaceStateUtils";
import { createClearedWorkspacePatch, createCustomDuplicatePatch } from "@/hooks/patch/patchWorkspacePatchHelpers";
import { createId } from "@/lib/ids";
import {
  getBundledPresetPatch,
  resolvePatchPresetStatus,
  resolvePatchSource,
  updatePresetPatchToLatest
} from "@/lib/patch/source";
import { Project } from "@/types/music";
import { Patch } from "@/types/patch";
import { PatchRemovalDialogState } from "@/components/composer/PatchRemovalDialogModal";

interface UsePatchWorkspaceLifecycleActionsOptions {
  activeTab?: LocalPatchWorkspaceTab;
  createWorkspaceTab: (patchId: string, name?: string) => LocalPatchWorkspaceTab;
  commitProjectChange: (
    updater: (current: Project) => Project,
    options?: { actionKey?: string; coalesce?: boolean; skipHistory?: boolean }
  ) => void;
  clearPreviewCaptures: () => void;
  project: Project;
  schedulePatchPreview: (patchId: string, patchOverride?: Patch, macroValues?: Record<string, number>) => void;
  selectedPatch?: Patch;
  setActiveTabId: (tabId: string | undefined) => void;
  setPatchRemovalDialog: Dispatch<SetStateAction<PatchRemovalDialogState | null>>;
  setRuntimeError: Dispatch<SetStateAction<string | null>>;
  setTabMacroValuesById: Dispatch<SetStateAction<Record<string, Record<string, number>>>>;
  setTabs: Dispatch<SetStateAction<LocalPatchWorkspaceTab[]>>;
  skipNextWorkspaceHistoryRef: MutableRefObject<boolean>;
  tabMacroValuesById: Record<string, Record<string, number>>;
  tabs: LocalPatchWorkspaceTab[];
  updateActiveTab: (updater: (tab: LocalPatchWorkspaceTab) => LocalPatchWorkspaceTab) => void;
}

interface CreateDuplicatePatchWorkspaceTabOptions {
  activeTab: LocalPatchWorkspaceTab;
  createWorkspaceTab: (patchId: string, name?: string) => LocalPatchWorkspaceTab;
  duplicatePatch: Patch;
  selectedPatch: Patch;
}

export function createDuplicatePatchWorkspaceTab({
  activeTab,
  createWorkspaceTab,
  duplicatePatch,
  selectedPatch
}: CreateDuplicatePatchWorkspaceTabOptions): LocalPatchWorkspaceTab {
  return {
    ...createWorkspaceTab(duplicatePatch.id, duplicatePatch.name),
    baselinePatch: structuredClone(selectedPatch),
    selectedNodeId: activeTab.selectedNodeId,
    selectedMacroId: activeTab.selectedMacroId,
    selectedProbeId: undefined,
    probes: activeTab.probes.map((probe) => ({
      ...structuredClone(probe),
      id: createId("probe")
    }))
  };
}

export function usePatchWorkspaceLifecycleActions({
  activeTab,
  clearPreviewCaptures,
  commitProjectChange,
  createWorkspaceTab,
  project,
  schedulePatchPreview,
  selectedPatch,
  setActiveTabId,
  setPatchRemovalDialog,
  setRuntimeError,
  setTabMacroValuesById,
  setTabs,
  skipNextWorkspaceHistoryRef,
  tabMacroValuesById,
  tabs,
  updateActiveTab
}: UsePatchWorkspaceLifecycleActionsOptions) {
  const renameSelectedPatch = useCallback(
    (name: string) => {
      if (!selectedPatch) {
        return;
      }
      const nextName = name.trim();
      if (!nextName) {
        return;
      }
      commitProjectChange(
        (current) => ({
          ...current,
          patches: current.patches.map((patch) =>
            patch.id === selectedPatch.id ? { ...patch, name: nextName } : patch
          )
        }),
        { actionKey: `patch:${selectedPatch.id}:rename`, coalesce: true }
      );
    },
    [commitProjectChange, selectedPatch]
  );

  const selectPatchInWorkspace = useCallback(
    (patchId: string) => {
      if (!activeTab) {
        return;
      }
      updateActiveTab((tab) => ({
        ...tab,
        patchId,
        baselinePatch: undefined,
        selectedNodeId: undefined,
        selectedMacroId: undefined,
        selectedProbeId: undefined,
        probes: [],
        migrationNotice: null
      }));
      setTabMacroValuesById((current) => ({ ...current, [activeTab.id]: {} }));
      clearPreviewCaptures();
    },
    [activeTab, clearPreviewCaptures, setTabMacroValuesById, updateActiveTab]
  );

  const updatePresetToLatest = useCallback(() => {
    if (!selectedPatch || selectedPatch.meta.source !== "preset") {
      return;
    }

    const latestPreset = getBundledPresetPatch(selectedPatch.meta.presetId);
    if (!latestPreset || latestPreset.meta.source !== "preset") {
      updateActiveTab((tab) => ({
        ...tab,
        migrationNotice: "Latest bundled preset snapshot is not available for this instrument."
      }));
      return;
    }

    const nextNodeIds = new Set(latestPreset.nodes.map((node) => node.id));
    const droppedLayoutCount = selectedPatch.layout.nodes.filter((entry) => !nextNodeIds.has(entry.nodeId)).length;
    const migratedPatch = updatePresetPatchToLatest(selectedPatch);

    commitProjectChange(
      (current) => ({
        ...current,
        patches: current.patches.map((patch) => (patch.id === selectedPatch.id ? migratedPatch : patch))
      }),
      { actionKey: `patch:${selectedPatch.id}:update-preset` }
    );
    updateActiveTab((tab) => ({
      ...tab,
      selectedNodeId: tab.selectedNodeId && nextNodeIds.has(tab.selectedNodeId) ? tab.selectedNodeId : undefined,
      migrationNotice:
        droppedLayoutCount > 0
          ? `Preset updated. ${droppedLayoutCount} saved layout position${droppedLayoutCount === 1 ? "" : "s"} were discarded because those nodes changed in the new preset.`
          : "Preset updated to the latest bundled version."
    }));
    schedulePatchPreview(selectedPatch.id, undefined, activeTab ? tabMacroValuesById[activeTab.id] : undefined);
  }, [activeTab, commitProjectChange, schedulePatchPreview, selectedPatch, tabMacroValuesById, updateActiveTab]);

  const clearSelectedPatchCircuit = useCallback(() => {
    if (!selectedPatch || resolvePatchSource(selectedPatch) === "preset") {
      return;
    }

    const nextPatch = createClearedWorkspacePatch(selectedPatch);

    commitProjectChange(
      (current) => ({
        ...current,
        patches: current.patches.map((patch) => (patch.id === selectedPatch.id ? nextPatch : patch))
      }),
      { actionKey: `patch:${selectedPatch.id}:clear-circuit` }
    );
    updateActiveTab((tab) => ({
      ...tab,
      selectedNodeId: undefined,
      selectedMacroId: undefined,
      selectedProbeId: undefined,
      probes: [],
      migrationNotice: null
    }));
    if (activeTab) {
      setTabMacroValuesById((current) => ({ ...current, [activeTab.id]: {} }));
    }
    clearPreviewCaptures();
  }, [activeTab, clearPreviewCaptures, commitProjectChange, selectedPatch, setTabMacroValuesById, updateActiveTab]);

  const duplicateSelectedPatchInWorkspace = useCallback(() => {
    if (!selectedPatch || !activeTab) {
      return;
    }

    const duplicate = createCustomDuplicatePatch(selectedPatch);

    commitProjectChange(
      (current) => ({
        ...current,
        patches: [...current.patches, duplicate]
      }),
      { actionKey: `patch:duplicate:${duplicate.id}` }
    );
    updateActiveTab((tab) => ({
      ...tab,
      patchId: duplicate.id,
      selectedNodeId: undefined,
      selectedMacroId: undefined,
      migrationNotice: null
    }));
    schedulePatchPreview(duplicate.id, undefined, activeTab ? tabMacroValuesById[activeTab.id] : undefined);
  }, [activeTab, commitProjectChange, schedulePatchPreview, selectedPatch, tabMacroValuesById, updateActiveTab]);

  const duplicateSelectedPatchToNewTab = useCallback(() => {
    if (!selectedPatch || !activeTab) {
      return;
    }
    if (tabs.length >= MAX_PATCH_WORKSPACE_TABS) {
      return;
    }

    const duplicate = createCustomDuplicatePatch(selectedPatch);

    const nextTab = createDuplicatePatchWorkspaceTab({
      activeTab,
      createWorkspaceTab,
      duplicatePatch: duplicate,
      selectedPatch
    });

    commitProjectChange(
      (current) => ({
        ...current,
        patches: [...current.patches, duplicate]
      }),
      { actionKey: `patch:duplicate:new-tab:${duplicate.id}` }
    );
    setTabs((currentTabs) => [...currentTabs, nextTab]);
    setTabMacroValuesById((current) => ({ ...current, [nextTab.id]: { ...(tabMacroValuesById[activeTab.id] ?? {}) } }));
    setActiveTabId(nextTab.id);
    schedulePatchPreview(duplicate.id, undefined, tabMacroValuesById[activeTab.id]);
  }, [
    activeTab,
    commitProjectChange,
    createWorkspaceTab,
    schedulePatchPreview,
    setActiveTabId,
    setTabMacroValuesById,
    setTabs,
    selectedPatch,
    tabMacroValuesById,
    tabs.length
  ]);

  const requestRemoveSelectedPatch = useCallback(() => {
    const patchStatus = selectedPatch ? resolvePatchPresetStatus(selectedPatch) : "custom";
    if (!selectedPatch || (resolvePatchSource(selectedPatch) !== "custom" && patchStatus !== "legacy_preset")) {
      return;
    }
    const affectedTracks = project.tracks.filter((track) => track.instrumentPatchId === selectedPatch.id);
    const fallbackPatchId = resolveRemovedPatchFallbackId(project.patches, selectedPatch.id) ?? "";
    if (affectedTracks.length === 0) {
      if (!fallbackPatchId) {
        setRuntimeError("No fallback instrument is available for this tab.");
        return;
      }
      const affectedTabIds = tabs.filter((tab) => tab.patchId === selectedPatch.id).map((tab) => tab.id);

      skipNextWorkspaceHistoryRef.current = false;
      setTabs((currentTabs) => retargetRemovedPatchTabs(currentTabs, selectedPatch.id, fallbackPatchId));
      setTabMacroValuesById((current) => ({
        ...current,
        ...Object.fromEntries(affectedTabIds.map((tabId) => [tabId, {}]))
      }));
      clearPreviewCaptures();
      commitProjectChange(
        (current) => ({
          ...current,
          patches: current.patches.filter((patch) => patch.id !== selectedPatch.id)
        }),
        { actionKey: `patch:${selectedPatch.id}:remove` }
      );
      return;
    }
    setPatchRemovalDialog({
      patchId: selectedPatch.id,
      rows: affectedTracks.map((track) => ({
        trackId: track.id,
        mode: fallbackPatchId ? "fallback" : "remove",
        fallbackPatchId
      }))
    });
  }, [
    clearPreviewCaptures,
    commitProjectChange,
    project.patches,
    project.tracks,
    selectedPatch,
    setPatchRemovalDialog,
    setRuntimeError,
    setTabMacroValuesById,
    setTabs,
    skipNextWorkspaceHistoryRef,
    tabs
  ]);

  return {
    renameSelectedPatch,
    selectPatchInWorkspace,
    updatePresetToLatest,
    clearSelectedPatchCircuit,
    duplicateSelectedPatchInWorkspace,
    duplicateSelectedPatchToNewTab,
    requestRemoveSelectedPatch
  };
}

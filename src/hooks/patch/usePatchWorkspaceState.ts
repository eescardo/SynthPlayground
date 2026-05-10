"use client";

import type { Dispatch, RefObject, SetStateAction } from "react";
import { useCallback, useEffect, useMemo } from "react";
import { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { AudioEngine } from "@/audio/engine";
import { PatchRemovalDialogState } from "@/components/composer/PatchRemovalDialogModal";
import {
  resolvePatchWorkspaceMacroValues,
  usePatchWorkspaceMacroValues
} from "@/hooks/patch/usePatchWorkspaceMacroValues";
import {
  createNextTabName,
  isAudiblePatchOp,
  isTextEditingTarget,
  MAX_PATCH_WORKSPACE_TABS,
  sanitizeWorkspaceTabs
} from "@/hooks/patch/patchWorkspaceStateUtils";
import { usePatchWorkspacePreviewController } from "@/hooks/patch/usePatchWorkspacePreviewController";
import { usePatchWorkspacePreview } from "@/hooks/patch/usePatchWorkspacePreview";
import { usePatchWorkspaceBaseline } from "@/hooks/patch/usePatchWorkspaceBaseline";
import { usePatchWorkspaceLifecycleActions } from "@/hooks/patch/usePatchWorkspaceLifecycleActions";
import { usePatchWorkspaceMacroActions } from "@/hooks/patch/usePatchWorkspaceMacroActions";
import { usePatchWorkspaceProbeState } from "@/hooks/patch/usePatchWorkspaceProbeState";
import { usePatchWorkspaceTabMacroSession } from "@/hooks/patch/usePatchWorkspaceTabMacroSession";
import { usePatchWorkspaceTabState } from "@/hooks/patch/usePatchWorkspaceTabState";
import { createId } from "@/lib/ids";
import { createClearPatch } from "@/lib/patch/presets";
import { applyPatchOp as applyPatchGraphOp } from "@/lib/patch/ops";
import { resolvePatchSource } from "@/lib/patch/source";
import { validatePatch, validatePatchConnectionCandidate } from "@/lib/patch/validation";
import { Project, Track } from "@/types/music";
import { PatchOp } from "@/types/ops";
import { PatchValidationIssue, Patch } from "@/types/patch";
import { ProjectAssetLibrary } from "@/types/assets";

interface UsePatchWorkspaceStateOptions {
  project: Project;
  projectAssets: ProjectAssetLibrary;
  selectedTrack?: Track;
  validationIssuesByPatchId: Map<string, PatchValidationIssue[]>;
  commitProjectChange: (
    updater: (current: Project) => Project,
    options?: { actionKey?: string; coalesce?: boolean; skipHistory?: boolean }
  ) => void;
  audioEngineRef: RefObject<AudioEngine | null>;
  playing: boolean;
  router: AppRouterInstance;
  setRuntimeError: Dispatch<SetStateAction<string | null>>;
  setPatchRemovalDialog: Dispatch<SetStateAction<PatchRemovalDialogState | null>>;
}

export function usePatchWorkspaceState(options: UsePatchWorkspaceStateOptions) {
  const {
    project,
    projectAssets,
    selectedTrack,
    validationIssuesByPatchId,
    commitProjectChange,
    audioEngineRef,
    playing,
    router,
    setRuntimeError,
    setPatchRemovalDialog
  } = options;
  const patchNameById = useMemo(
    () => new Map(project.patches.map((patch) => [patch.id, patch.name] as const)),
    [project.patches]
  );
  const patchById = useMemo(
    () => new Map(project.patches.map((patch) => [patch.id, patch] as const)),
    [project.patches]
  );
  const {
    tabs,
    activeTabId,
    activeTab,
    setTabs,
    setActiveTabId,
    updateTabs,
    updateActiveTab,
    createWorkspaceTab,
    closePatchWorkspace,
    skipNextWorkspaceHistoryRef
  } = usePatchWorkspaceTabState({
    project,
    selectedTrack,
    router,
    patchNameById,
    commitProjectChange
  });
  const { tabMacroValuesById, setTabMacroValuesById } = usePatchWorkspaceTabMacroSession(tabs.map((tab) => tab.id));

  const selectedPatch = useMemo(
    () =>
      project.patches.find((patch) => patch.id === activeTab?.patchId) ??
      project.patches.find((patch) => patch.id === selectedTrack?.instrumentPatchId) ??
      project.patches[0],
    [activeTab?.patchId, project.patches, selectedTrack?.instrumentPatchId]
  );
  const { workspaceMacroValues, workspacePatch } = usePatchWorkspaceMacroValues({
    selectedPatch,
    macroValues: activeTab ? tabMacroValuesById[activeTab.id] : undefined
  });
  const selectedNodeId = activeTab?.selectedNodeId;
  const selectedMacroId = activeTab?.selectedMacroId;
  const migrationNotice = activeTab?.migrationNotice ?? null;
  const {
    probes,
    selectedProbeId,
    setSelectedProbeId,
    addProbeToWorkspace,
    moveProbe,
    updateProbeTarget,
    updateProbeSpectrumWindow,
    updateProbeFrequencyView,
    toggleProbeExpanded,
    removeSelectedProbe,
    previewCaptureByProbeId,
    setPreviewCaptureByProbeId,
    clearPreviewCaptures
  } = usePatchWorkspaceProbeState({
    activeTab,
    updateActiveTab
  });
  const { baselinePatch, patchDiff, setBaselinePatchFromPatchId, clearCurrentPatchBaseline } =
    usePatchWorkspaceBaseline({
      activeTab,
      patches: project.patches,
      selectedPatch,
      updateActiveTab
    });

  const validationIssues = useMemo(
    () => (selectedPatch ? (validationIssuesByPatchId.get(selectedPatch.id) ?? []) : []),
    [selectedPatch, validationIssuesByPatchId]
  );
  const selectedPatchHasErrors = validationIssues.some((issue) => issue.level === "error");

  const {
    previewCaptureByProbeId: latestPreviewCaptureByProbeId,
    previewProgress,
    previewPatchById,
    previewPitch,
    previewPitchPickerOpen,
    releaseHeldPatchPreview,
    previewSelectedPatchNow,
    schedulePatchPreview,
    setPreviewPitch,
    setPreviewPitchPickerOpen,
    startHeldPatchPreview
  } = usePatchWorkspacePreview({
    project,
    projectAssets,
    selectedPatch: workspacePatch ?? selectedPatch,
    selectedTrack,
    probes,
    audioEngineRef,
    playing,
    setRuntimeError
  });

  useEffect(() => {
    setTabs((currentTabs) => {
      const fallbackPatchId = selectedTrack?.instrumentPatchId ?? project.patches[0]?.id;
      if (!fallbackPatchId) {
        return currentTabs;
      }
      return sanitizeWorkspaceTabs(currentTabs, patchById, patchNameById, fallbackPatchId, createWorkspaceTab);
    });
  }, [createWorkspaceTab, patchById, patchNameById, project.patches, selectedTrack?.instrumentPatchId, setTabs]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || isTextEditingTarget(event.target) || !activeTab) {
        return;
      }
      updateActiveTab((tab) => ({ ...tab, selectedMacroId: undefined }));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeTab, updateActiveTab]);

  useEffect(() => {
    setPreviewCaptureByProbeId(latestPreviewCaptureByProbeId);
  }, [latestPreviewCaptureByProbeId, setPreviewCaptureByProbeId]);

  const setSkipWorkspaceHistory = useCallback(
    (skipHistory: boolean) => {
      skipNextWorkspaceHistoryRef.current = skipHistory;
    },
    [skipNextWorkspaceHistoryRef]
  );

  const { activateWorkspaceTab, handleInstrumentEditorReady, setSkipNextTabPreview } =
    usePatchWorkspacePreviewController({
      tabs,
      activeTab,
      previewPitch,
      previewSelectedPatchNow,
      setActiveTabId,
      setSkipWorkspaceHistory
    });

  const openPatchWorkspace = useCallback(
    (patchId?: string) => {
      const resolvedPatchId = patchId ?? selectedTrack?.instrumentPatchId ?? project.patches[0]?.id;
      if (resolvedPatchId) {
        const existingTab = tabs.find((tab) => tab.patchId === resolvedPatchId);
        if (existingTab) {
          activateWorkspaceTab(existingTab.id, { preview: false, skipHistory: true });
        } else if (tabs.length < MAX_PATCH_WORKSPACE_TABS) {
          const nextTab = { ...createWorkspaceTab(resolvedPatchId), probes: [] };
          setSkipNextTabPreview(true);
          setTabs((currentTabs) => [...currentTabs, nextTab]);
          setActiveTabId(nextTab.id);
        }
      }
      router.push("/patch-workspace");
    },
    [
      activateWorkspaceTab,
      createWorkspaceTab,
      project.patches,
      router,
      selectedTrack?.instrumentPatchId,
      setActiveTabId,
      setSkipNextTabPreview,
      setTabs,
      tabs
    ]
  );

  const renameWorkspaceTab = useCallback(
    (tabId: string, name: string) => {
      const nextName = name.trim();
      if (!nextName) {
        return;
      }
      updateTabs((currentTabs) => currentTabs.map((tab) => (tab.id === tabId ? { ...tab, name: nextName } : tab)));
    },
    [updateTabs]
  );

  const createWorkspaceTabFromCurrent = useCallback(() => {
    if (tabs.length >= MAX_PATCH_WORKSPACE_TABS) {
      return;
    }
    const nextName = createNextTabName(tabs);
    const nextPatchId = createId("patch");
    const nextPatch = createClearPatch({
      id: nextPatchId,
      name: nextName
    });
    const nextTab = { ...createWorkspaceTab(nextPatchId, nextName), probes: [] };

    commitProjectChange(
      (current) => ({
        ...current,
        patches: [...current.patches, nextPatch]
      }),
      { actionKey: `patch:new-tab:${nextPatchId}` }
    );
    skipNextWorkspaceHistoryRef.current = false;
    setTabs((currentTabs) => [...currentTabs, nextTab]);
    setTabMacroValuesById((current) => ({
      ...current,
      [nextTab.id]: {}
    }));
    setActiveTabId(nextTab.id);
    setSkipNextTabPreview(true);
  }, [
    commitProjectChange,
    createWorkspaceTab,
    setActiveTabId,
    setSkipNextTabPreview,
    setTabMacroValuesById,
    setTabs,
    skipNextWorkspaceHistoryRef,
    tabs
  ]);

  const closeWorkspaceTab = useCallback(
    (tabId: string) => {
      if (tabs.length <= 1) {
        return;
      }
      const closingIndex = tabs.findIndex((tab) => tab.id === tabId);
      if (closingIndex < 0) {
        return;
      }
      const fallbackTab = tabs[closingIndex + 1] ?? tabs[closingIndex - 1];
      skipNextWorkspaceHistoryRef.current = false;
      setTabs((currentTabs) => currentTabs.filter((tab) => tab.id !== tabId));
      setTabMacroValuesById((current) => {
        const next = { ...current };
        delete next[tabId];
        return next;
      });
      if (activeTabId === tabId) {
        activateWorkspaceTab(fallbackTab.id, { preview: false, skipHistory: false });
      }
    },
    [activateWorkspaceTab, activeTabId, setTabMacroValuesById, setTabs, skipNextWorkspaceHistoryRef, tabs]
  );

  const activePreviewMacroValues = useMemo(
    () =>
      selectedPatch
        ? resolvePatchWorkspaceMacroValues(selectedPatch, activeTab ? tabMacroValuesById[activeTab.id] : undefined)
        : undefined,
    [activeTab, selectedPatch, tabMacroValuesById]
  );

  const applyPatchOp = useCallback(
    (op: PatchOp) => {
      if (!selectedPatch) {
        return;
      }
      if (
        resolvePatchSource(selectedPatch) === "preset" &&
        op.type !== "moveNode" &&
        op.type !== "setNodeLayout" &&
        op.type !== "setCanvasZoom"
      ) {
        return;
      }

      if (op.type === "connect" || op.type === "replaceConnection") {
        const validationPatch =
          op.type === "replaceConnection"
            ? {
                ...selectedPatch,
                connections: selectedPatch.connections.filter(
                  (connection) => connection.id !== op.disconnectConnectionId
                )
              }
            : selectedPatch;
        const connectionIssues = validatePatchConnectionCandidate(
          validationPatch,
          op.fromNodeId,
          op.fromPortId,
          op.toNodeId,
          op.toPortId
        );
        if (connectionIssues.some((issue) => issue.level === "error")) {
          return;
        }
      }

      let nextPatch: Patch;
      try {
        nextPatch = applyPatchGraphOp(selectedPatch, op);
      } catch (error) {
        setRuntimeError((error as Error).message);
        return;
      }

      validatePatch(nextPatch);

      commitProjectChange(
        (current) => ({
          ...current,
          patches: current.patches.map((patch) => (patch.id === selectedPatch.id ? nextPatch : patch))
        }),
        {
          actionKey:
            op.type === "moveNode"
              ? `patch:${selectedPatch.id}:move-node:${op.nodeId}`
              : op.type === "setNodeLayout"
                ? `patch:${selectedPatch.id}:set-node-layout`
                : op.type === "setCanvasZoom"
                  ? `patch:${selectedPatch.id}:set-canvas-zoom`
                  : `patch:${selectedPatch.id}:${op.type}`,
          coalesce: op.type === "moveNode" || op.type === "setCanvasZoom"
        }
      );
      updateActiveTab((tab) => ({ ...tab, migrationNotice: null }));
      if (isAudiblePatchOp(op)) {
        schedulePatchPreview(selectedPatch.id, undefined, activePreviewMacroValues);
      }
    },
    [
      activePreviewMacroValues,
      commitProjectChange,
      schedulePatchPreview,
      selectedPatch,
      setRuntimeError,
      updateActiveTab
    ]
  );

  const macroActions = usePatchWorkspaceMacroActions({
    activeTab,
    selectedPatch,
    tabMacroValuesById,
    setTabMacroValuesById,
    previewPitch,
    commitProjectChange,
    schedulePatchPreview,
    previewSelectedPatchNow
  });

  const lifecycleActions = usePatchWorkspaceLifecycleActions({
    activeTab,
    createWorkspaceTab,
    commitProjectChange,
    clearPreviewCaptures,
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
  });

  return {
    tabs,
    activeTabId,
    activateWorkspaceTab,
    createWorkspaceTabFromCurrent,
    closeWorkspaceTab,
    renameWorkspaceTab,
    selectedPatch: workspacePatch ?? selectedPatch,
    baselinePatch,
    workspaceMacroValues,
    probes,
    selectedProbeId,
    setSelectedProbeId,
    addProbeToWorkspace,
    moveProbe,
    updateProbeTarget,
    updateProbeSpectrumWindow,
    updateProbeFrequencyView,
    toggleProbeExpanded,
    removeSelectedProbe,
    previewCaptureByProbeId,
    previewProgress,
    selectedNodeId,
    setSelectedNodeId: (nodeId?: string) =>
      updateActiveTab((tab) => ({ ...tab, selectedNodeId: nodeId, selectedProbeId: undefined })),
    selectedMacroId,
    setSelectedMacroId: (macroId?: string) =>
      updateActiveTab((tab) => ({ ...tab, selectedMacroId: macroId, selectedProbeId: undefined })),
    previewPitch,
    setPreviewPitch,
    previewPitchPickerOpen,
    setPreviewPitchPickerOpen,
    migrationNotice,
    patchDiff,
    validationIssues,
    selectedPatchHasErrors,
    openPatchWorkspace,
    closePatchWorkspace,
    selectPatchInWorkspace: lifecycleActions.selectPatchInWorkspace,
    previewPatchById,
    previewSelectedPatchNow: (pitch = previewPitch) =>
      previewSelectedPatchNow(pitch, activeTab ? workspaceMacroValues : undefined),
    releaseHeldPatchPreview,
    startHeldPatchPreview: (pitch = previewPitch) =>
      startHeldPatchPreview(pitch, activeTab ? workspaceMacroValues : undefined),
    handleInstrumentEditorReady,
    renameSelectedPatch: lifecycleActions.renameSelectedPatch,
    duplicateSelectedPatchInWorkspace: lifecycleActions.duplicateSelectedPatchInWorkspace,
    duplicateSelectedPatchToNewTab: lifecycleActions.duplicateSelectedPatchToNewTab,
    updatePresetToLatest: lifecycleActions.updatePresetToLatest,
    requestRemoveSelectedPatch: lifecycleActions.requestRemoveSelectedPatch,
    clearSelectedPatchCircuit: lifecycleActions.clearSelectedPatchCircuit,
    setBaselinePatchFromPatchId,
    clearCurrentPatchBaseline,
    applyPatchOp,
    exposePatchMacro: macroActions.exposePatchMacro,
    addPatchMacro: macroActions.addPatchMacro,
    removePatchMacro: macroActions.removePatchMacro,
    renamePatchMacro: macroActions.renamePatchMacro,
    setPatchMacroKeyframeCount: macroActions.setPatchMacroKeyframeCount,
    changePatchMacroValue: macroActions.changePatchMacroValue,
    clearSelectedMacro: () => updateActiveTab((tab) => ({ ...tab, selectedMacroId: undefined }))
  };
}

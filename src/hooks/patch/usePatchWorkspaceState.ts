"use client";

import type { Dispatch, RefObject, SetStateAction } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { AudioEngine } from "@/audio/engine";
import { PatchRemovalDialogState } from "@/components/home/PatchRemovalDialogModal";
import { usePatchWorkspaceMacroValues } from "@/hooks/patch/usePatchWorkspaceMacroValues";
import { usePatchWorkspacePreview } from "@/hooks/patch/usePatchWorkspacePreview";
import { createId } from "@/lib/ids";
import { getModuleSchema } from "@/lib/patch/moduleRegistry";
import { applyPatchOp as applyPatchGraphOp } from "@/lib/patch/ops";
import { getBundledPresetPatch, resolvePatchPresetStatus, resolvePatchSource } from "@/lib/patch/source";
import { validatePatch } from "@/lib/patch/validation";
import { Project, Track } from "@/types/music";
import { PatchOp } from "@/types/ops";
import { PatchValidationIssue, Patch } from "@/types/patch";

interface PatchWorkspaceTab {
  id: string;
  patchId: string;
  migrationNotice: string | null;
  selectedNodeId?: string;
  selectedMacroId?: string;
}

const isTextEditingTarget = (target: EventTarget | null) => {
  const element = target as HTMLElement | null;
  return Boolean(
    element &&
      (element.tagName === "INPUT" ||
        element.tagName === "SELECT" ||
        element.tagName === "TEXTAREA" ||
        element.isContentEditable)
  );
};

const isShortcutBlockedTarget = (target: EventTarget | null) => {
  const element = target as HTMLElement | null;
  return Boolean(
    element &&
      (isTextEditingTarget(element) ||
        element.tagName === "BUTTON" ||
        element.tagName === "A" ||
        element.closest("[role='dialog']"))
  );
};

const isAudiblePatchOp = (op: PatchOp): boolean =>
  op.type !== "moveNode" &&
  op.type !== "setNodeLayout" &&
  op.type !== "setCanvasZoom" &&
  op.type !== "addMacro" &&
  op.type !== "removeMacro" &&
  op.type !== "bindMacro" &&
  op.type !== "unbindMacro" &&
  op.type !== "renameMacro" &&
  op.type !== "setMacroKeyframeCount";

interface UsePatchWorkspaceStateOptions {
  project: Project;
  selectedTrack?: Track;
  validationIssuesByPatchId: Map<string, PatchValidationIssue[]>;
  commitProjectChange: (
    updater: (current: Project) => Project,
    options?: { actionKey?: string; coalesce?: boolean }
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
    selectedTrack,
    validationIssuesByPatchId,
    commitProjectChange,
    audioEngineRef,
    playing,
    router,
    setRuntimeError,
    setPatchRemovalDialog
  } = options;
  const [tabs, setTabs] = useState<PatchWorkspaceTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | undefined>(undefined);
  const skipNextTabPreviewRef = useRef(true);
  const previousActiveTabIdRef = useRef<string | undefined>(undefined);

  const createWorkspaceTab = useCallback(
    (patchId: string): PatchWorkspaceTab => ({
      id: createId("patchTab"),
      patchId,
      migrationNotice: null
    }),
    []
  );

  const activeTab = useMemo(() => tabs.find((tab) => tab.id === activeTabId) ?? tabs[0], [activeTabId, tabs]);

  const selectedPatch = useMemo(
    () =>
      project.patches.find((patch) => patch.id === activeTab?.patchId) ??
      project.patches.find((patch) => patch.id === selectedTrack?.instrumentPatchId) ??
      project.patches[0],
    [activeTab?.patchId, project.patches, selectedTrack?.instrumentPatchId]
  );
  const selectedNodeId = activeTab?.selectedNodeId;
  const selectedMacroId = activeTab?.selectedMacroId;
  const migrationNotice = activeTab?.migrationNotice ?? null;

  const validationIssues = useMemo(
    () => (selectedPatch ? validationIssuesByPatchId.get(selectedPatch.id) ?? [] : []),
    [selectedPatch, validationIssuesByPatchId]
  );
  const selectedPatchHasErrors = validationIssues.some((issue) => issue.level === "error");

  useEffect(() => {
    if (tabs.length > 0 || project.patches.length === 0) {
      return;
    }
    const initialPatchId = selectedTrack?.instrumentPatchId ?? project.patches[0]?.id;
    if (!initialPatchId) {
      return;
    }
    const initialTab = createWorkspaceTab(initialPatchId);
    setTabs([initialTab]);
    setActiveTabId(initialTab.id);
  }, [createWorkspaceTab, project.patches, selectedTrack?.instrumentPatchId, tabs.length]);

  useEffect(() => {
    const validPatchIds = new Set(project.patches.map((patch) => patch.id));
    setTabs((currentTabs) => {
      const nextTabs = currentTabs.filter((tab) => validPatchIds.has(tab.patchId));
      if (nextTabs.length > 0 || project.patches.length === 0) {
        return nextTabs.length === currentTabs.length ? currentTabs : nextTabs;
      }
      const fallbackPatchId = selectedTrack?.instrumentPatchId ?? project.patches[0]?.id;
      return fallbackPatchId ? [createWorkspaceTab(fallbackPatchId)] : [];
    });
  }, [createWorkspaceTab, project.patches, selectedTrack?.instrumentPatchId]);

  useEffect(() => {
    if (!activeTabId) {
      if (tabs[0]) {
        setActiveTabId(tabs[0].id);
      }
      return;
    }
    if (!tabs.some((tab) => tab.id === activeTabId)) {
      setActiveTabId(tabs[0]?.id);
    }
  }, [activeTabId, tabs]);

  useEffect(() => {
    if (!selectedPatch || !selectedMacroId || !activeTab) {
      return;
    }
    if (!selectedPatch.ui.macros.some((macro) => macro.id === selectedMacroId)) {
      setTabs((currentTabs) =>
        currentTabs.map((tab) => (tab.id === activeTab.id ? { ...tab, selectedMacroId: undefined } : tab))
      );
    }
  }, [activeTab, selectedMacroId, selectedPatch]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || isTextEditingTarget(event.target) || !activeTab) {
        return;
      }
      setTabs((currentTabs) =>
        currentTabs.map((tab) => (tab.id === activeTab.id ? { ...tab, selectedMacroId: undefined } : tab))
      );
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeTab]);

  const {
    setWorkspaceMacroValue,
    workspaceMacroValues,
    workspaceMacroValuesByPatchId,
    workspacePatch
  } = usePatchWorkspaceMacroValues({ selectedPatch });

  const {
    previewPatchById,
    previewPitch,
    previewPitchPickerOpen,
    previewSelectedPatchNow,
    schedulePatchPreview,
    setPreviewPitch,
    setPreviewPitchPickerOpen
  } = usePatchWorkspacePreview({
    project,
    selectedPatch,
    selectedTrack,
    workspaceMacroValuesByPatchId,
    audioEngineRef,
    playing,
    setRuntimeError
  });

  const updateActiveTab = useCallback(
    (updater: (tab: PatchWorkspaceTab) => PatchWorkspaceTab) => {
      if (!activeTab) {
        return;
      }
      setTabs((currentTabs) => currentTabs.map((tab) => (tab.id === activeTab.id ? updater(tab) : tab)));
    },
    [activeTab]
  );

  const activateWorkspaceTab = useCallback((tabId: string, options?: { preview?: boolean }) => {
    skipNextTabPreviewRef.current = options?.preview === false;
    setActiveTabId(tabId);
  }, []);

  const cycleWorkspaceTabs = useCallback(
    (direction: 1 | -1) => {
      if (tabs.length < 2 || !activeTab) {
        return;
      }
      const currentIndex = tabs.findIndex((tab) => tab.id === activeTab.id);
      const nextIndex = (currentIndex + direction + tabs.length) % tabs.length;
      activateWorkspaceTab(tabs[nextIndex].id);
    },
    [activateWorkspaceTab, activeTab, tabs]
  );

  const openPatchWorkspace = useCallback(
    (patchId?: string) => {
      const resolvedPatchId = patchId ?? selectedTrack?.instrumentPatchId ?? project.patches[0]?.id;
      if (resolvedPatchId) {
        setTabs((currentTabs) => {
          const existingTab = currentTabs.find((tab) => tab.patchId === resolvedPatchId);
          if (existingTab) {
            skipNextTabPreviewRef.current = true;
            setActiveTabId(existingTab.id);
            return currentTabs;
          }
          const nextTab = createWorkspaceTab(resolvedPatchId);
          skipNextTabPreviewRef.current = true;
          setActiveTabId(nextTab.id);
          return [...currentTabs, nextTab];
        });
      }
      router.push("/patch-workspace");
    },
    [createWorkspaceTab, project.patches, router, selectedTrack?.instrumentPatchId]
  );

  const closePatchWorkspace = useCallback(() => {
    router.push("/");
  }, [router]);

  const selectPatchInWorkspace = useCallback(
    (patchId: string) => {
      updateActiveTab((tab) => ({
        ...tab,
        patchId,
        migrationNotice: null,
        selectedNodeId: undefined,
        selectedMacroId: undefined
      }));
    },
    [updateActiveTab]
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

    const savedLayoutByNodeId = new Map(selectedPatch.layout.nodes.map((entry) => [entry.nodeId, entry] as const));
    const nextNodeIds = new Set(latestPreset.nodes.map((node) => node.id));
    const droppedLayoutCount = selectedPatch.layout.nodes.filter((entry) => !nextNodeIds.has(entry.nodeId)).length;
    const migratedPatch: Patch = {
      ...structuredClone(latestPreset),
      id: selectedPatch.id,
      name: selectedPatch.name,
      meta: {
        source: "preset",
        presetId: latestPreset.meta.presetId,
        presetVersion: latestPreset.meta.presetVersion
      },
      layout: {
        nodes: latestPreset.layout.nodes.map((entry) => savedLayoutByNodeId.get(entry.nodeId) ?? entry)
      }
    };

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
    schedulePatchPreview(selectedPatch.id);
  }, [commitProjectChange, schedulePatchPreview, selectedPatch, updateActiveTab]);

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

      let nextPatch: Patch;
      try {
        nextPatch = applyPatchGraphOp(selectedPatch, op);
      } catch (error) {
        setRuntimeError((error as Error).message);
        return;
      }

      const validation = validatePatch(nextPatch);
      if (op.type === "connect" && validation.issues.some((issue) => issue.level === "error")) {
        return;
      }

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
        schedulePatchPreview(selectedPatch.id);
      }
    },
    [commitProjectChange, schedulePatchPreview, selectedPatch, setRuntimeError, updateActiveTab]
  );

  const exposePatchMacro = useCallback(
    (nodeId: string, paramId: string, suggestedName: string) => {
      if (!selectedPatch || resolvePatchSource(selectedPatch) === "preset") {
        return;
      }

      commitProjectChange(
        (current) => {
          const currentPatch = current.patches.find((patch) => patch.id === selectedPatch.id);
          if (!currentPatch) {
            return current;
          }

          const node = currentPatch.nodes.find((entry) => entry.id === nodeId);
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

          const min = paramSchema.type === "float" ? paramSchema.range.min : 0;
          const max = paramSchema.type === "float" ? paramSchema.range.max : 1;
          nextPatch = applyPatchGraphOp(nextPatch, {
            type: "bindMacro",
            macroId,
            bindingId: createId("bind"),
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
        },
        { actionKey: `patch:${selectedPatch.id}:expose-macro:${nodeId}:${paramId}` }
      );
    },
    [commitProjectChange, selectedPatch]
  );

  const addPatchMacro = useCallback(() => {
    if (!selectedPatch || resolvePatchSource(selectedPatch) === "preset") {
      return;
    }
    commitProjectChange(
      (current) => ({
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
      }),
      { actionKey: `patch:${selectedPatch.id}:add-macro` }
    );
  }, [commitProjectChange, selectedPatch]);

  const removePatchMacro = useCallback((macroId: string) => {
    if (!selectedPatch || resolvePatchSource(selectedPatch) === "preset") {
      return;
    }
    commitProjectChange(
      (current) => ({
        ...current,
        patches: current.patches.map((patch) =>
          patch.id === selectedPatch.id ? applyPatchGraphOp(patch, { type: "removeMacro", macroId }) : patch
        )
      }),
      { actionKey: `patch:${selectedPatch.id}:remove-macro:${macroId}` }
    );
  }, [commitProjectChange, selectedPatch]);

  const renamePatchMacro = useCallback((macroId: string, name: string) => {
    if (!selectedPatch || resolvePatchSource(selectedPatch) === "preset") {
      return;
    }
    commitProjectChange(
      (current) => ({
        ...current,
        patches: current.patches.map((patch) =>
          patch.id === selectedPatch.id ? applyPatchGraphOp(patch, { type: "renameMacro", macroId, name }) : patch
        )
      }),
      {
        actionKey: `patch:${selectedPatch.id}:rename-macro:${macroId}`,
        coalesce: true
      }
    );
  }, [commitProjectChange, selectedPatch]);

  const setPatchMacroKeyframeCount = useCallback((macroId: string, keyframeCount: number) => {
    if (!selectedPatch || resolvePatchSource(selectedPatch) === "preset") {
      return;
    }
    commitProjectChange(
      (current) => ({
        ...current,
        patches: current.patches.map((patch) =>
          patch.id === selectedPatch.id
            ? applyPatchGraphOp(patch, { type: "setMacroKeyframeCount", macroId, keyframeCount })
            : patch
        )
      }),
      { actionKey: `patch:${selectedPatch.id}:set-macro-keyframes:${macroId}` }
    );
    schedulePatchPreview(selectedPatch.id);
  }, [commitProjectChange, schedulePatchPreview, selectedPatch]);

  const changePatchMacroValue = useCallback(
    (macroId: string, normalized: number, changeOptions?: { commit?: boolean }) => {
      if (!selectedPatch) {
        return;
      }
      const defaultValue = selectedPatch.ui.macros.find((macro) => macro.id === macroId)?.defaultNormalized ?? 0.5;
      const nextPatchMacroValues = setWorkspaceMacroValue(selectedPatch.id, macroId, normalized, defaultValue);

      if (changeOptions?.commit) {
        previewPatchById(selectedPatch.id, previewPitch, nextPatchMacroValues);
      }
    },
    [previewPatchById, previewPitch, selectedPatch, setWorkspaceMacroValue]
  );

  const renameSelectedPatch = useCallback((name: string) => {
    if (!selectedPatch) {
      return;
    }
    commitProjectChange(
      (current) => ({
        ...current,
        patches: current.patches.map((patch) => (patch.id === selectedPatch.id ? { ...patch, name } : patch))
      }),
      { actionKey: `patch:${selectedPatch.id}:rename`, coalesce: true }
    );
  }, [commitProjectChange, selectedPatch]);

  const duplicateSelectedPatchInWorkspace = useCallback(() => {
    if (!selectedPatch) {
      return;
    }

    const duplicate = structuredClone(selectedPatch);
    duplicate.id = createId("patch");
    duplicate.name = `${selectedPatch.name} Copy`;
    duplicate.meta = { source: "custom" };

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
      migrationNotice: null,
      selectedNodeId: undefined,
      selectedMacroId: undefined
    }));
    schedulePatchPreview(duplicate.id);
  }, [commitProjectChange, schedulePatchPreview, selectedPatch, updateActiveTab]);

  const duplicateSelectedPatchToNewTab = useCallback(() => {
    if (!selectedPatch) {
      return;
    }

    const duplicate = structuredClone(selectedPatch);
    duplicate.id = createId("patch");
    duplicate.name = `${selectedPatch.name} Copy`;
    duplicate.meta = { source: "custom" };

    const nextTab = createWorkspaceTab(duplicate.id);
    commitProjectChange(
      (current) => ({
        ...current,
        patches: [...current.patches, duplicate]
      }),
      { actionKey: `patch:duplicate:new-tab:${duplicate.id}` }
    );
    setTabs((currentTabs) => [...currentTabs, nextTab]);
    setActiveTabId(nextTab.id);
    schedulePatchPreview(duplicate.id);
  }, [commitProjectChange, createWorkspaceTab, schedulePatchPreview, selectedPatch]);

  const requestRemoveSelectedPatch = useCallback(() => {
    const patchStatus = selectedPatch ? resolvePatchPresetStatus(selectedPatch) : "custom";
    if (!selectedPatch || (resolvePatchSource(selectedPatch) !== "custom" && patchStatus !== "legacy_preset")) {
      return;
    }
    const affectedTracks = project.tracks.filter((track) => track.instrumentPatchId === selectedPatch.id);
    const fallbackPatchId = project.patches.find((patch) => patch.id !== selectedPatch.id)?.id ?? "";
    if (affectedTracks.length === 0) {
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
  }, [commitProjectChange, project.patches, project.tracks, selectedPatch, setPatchRemovalDialog]);

  useEffect(() => {
    if (!activeTab || previousActiveTabIdRef.current === activeTab.id) {
      return;
    }
    const shouldSkipPreview = skipNextTabPreviewRef.current || previousActiveTabIdRef.current === undefined;
    previousActiveTabIdRef.current = activeTab.id;
    skipNextTabPreviewRef.current = false;
    if (shouldSkipPreview) {
      return;
    }
    previewPatchById(activeTab.patchId);
  }, [activeTab, previewPatchById]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isShortcutBlockedTarget(event.target)) {
        return;
      }
      if (event.code === "Space") {
        event.preventDefault();
        previewSelectedPatchNow();
        return;
      }
      if (event.ctrlKey && event.shiftKey && !event.metaKey && !event.altKey && event.code === "BracketLeft") {
        event.preventDefault();
        cycleWorkspaceTabs(-1);
        return;
      }
      if (event.ctrlKey && event.shiftKey && !event.metaKey && !event.altKey && event.code === "BracketRight") {
        event.preventDefault();
        cycleWorkspaceTabs(1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cycleWorkspaceTabs, previewSelectedPatchNow]);

  return {
    tabs,
    activeTabId,
    activateWorkspaceTab,
    selectedPatch: workspacePatch ?? selectedPatch,
    workspaceMacroValues,
    selectedNodeId,
    setSelectedNodeId: (nodeId?: string) => updateActiveTab((tab) => ({ ...tab, selectedNodeId: nodeId })),
    selectedMacroId,
    setSelectedMacroId: (macroId?: string) => updateActiveTab((tab) => ({ ...tab, selectedMacroId: macroId })),
    previewPitch,
    setPreviewPitch,
    previewPitchPickerOpen,
    setPreviewPitchPickerOpen,
    migrationNotice,
    validationIssues,
    selectedPatchHasErrors,
    openPatchWorkspace,
    closePatchWorkspace,
    selectPatchInWorkspace,
    previewPatchById,
    previewSelectedPatchNow,
    renameSelectedPatch,
    duplicateSelectedPatchInWorkspace,
    duplicateSelectedPatchToNewTab,
    updatePresetToLatest,
    requestRemoveSelectedPatch,
    applyPatchOp,
    exposePatchMacro,
    addPatchMacro,
    removePatchMacro,
    renamePatchMacro,
    setPatchMacroKeyframeCount,
    changePatchMacroValue,
    clearSelectedMacro: () => updateActiveTab((tab) => ({ ...tab, selectedMacroId: undefined }))
  };
}

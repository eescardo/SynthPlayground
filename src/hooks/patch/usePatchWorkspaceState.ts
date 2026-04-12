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
import { clampNormalizedMacroValue } from "@/lib/patch/macroKeyframes";
import { getBundledPresetPatch, resolvePatchPresetStatus, resolvePatchSource } from "@/lib/patch/source";
import { validatePatch } from "@/lib/patch/validation";
import { PatchWorkspaceTabState, Project, Track } from "@/types/music";
import { PatchOp } from "@/types/ops";
import { PatchValidationIssue, Patch } from "@/types/patch";

interface LocalPatchWorkspaceTab extends PatchWorkspaceTabState {
  migrationNotice: string | null;
}

const PATCH_WORKSPACE_TAB_MACRO_VALUES_SESSION_KEY = "synth-playground:patch-workspace-tab-macro-values";

const isTextEditingTarget = (target: EventTarget | null) => {
  const element = target as HTMLElement | null;
  const isTextInput =
    element instanceof HTMLInputElement
      ? ["text", "search", "url", "email", "tel", "password", "number"].includes(element.type)
      : false;
  return Boolean(
    element &&
      (isTextInput ||
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

const toLocalTab = (tab: PatchWorkspaceTabState): LocalPatchWorkspaceTab => ({
  ...tab,
  migrationNotice: null
});

const toPersistedTab = (tab: LocalPatchWorkspaceTab): PatchWorkspaceTabState => ({
  id: tab.id,
  name: tab.name,
  patchId: tab.patchId,
  selectedNodeId: tab.selectedNodeId,
  selectedMacroId: tab.selectedMacroId
});

const getActiveTab = (tabs: LocalPatchWorkspaceTab[], activeTabId?: string) => tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];

const createNextTabName = (tabs: Array<{ name: string }>) => {
  for (let index = 1; index < 10_000; index += 1) {
    const candidate = `Tab ${index}`;
    if (!tabs.some((tab) => tab.name === candidate)) {
      return candidate;
    }
  }
  return `Tab ${Date.now()}`;
};

interface UsePatchWorkspaceStateOptions {
  project: Project;
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
    selectedTrack,
    validationIssuesByPatchId,
    commitProjectChange,
    audioEngineRef,
    playing,
    router,
    setRuntimeError,
    setPatchRemovalDialog
  } = options;
  const initialPersistedWorkspace = project.ui.patchWorkspace;
  const [tabs, setTabs] = useState<LocalPatchWorkspaceTab[]>(() => initialPersistedWorkspace.tabs.map(toLocalTab));
  const [activeTabId, setActiveTabId] = useState<string | undefined>(initialPersistedWorkspace.activeTabId);
  const [tabMacroValuesById, setTabMacroValuesById] = useState<Record<string, Record<string, number>>>({});
  const skipNextTabPreviewRef = useRef(true);
  const previousActiveTabIdRef = useRef<string | undefined>(undefined);
  const pendingAutoPreviewTabIdRef = useRef<string | null>(null);
  const projectWorkspaceSignature = JSON.stringify(project.ui.patchWorkspace);
  const workspaceSyncSignatureRef = useRef(projectWorkspaceSignature);
  const patchNameById = useMemo(() => new Map(project.patches.map((patch) => [patch.id, patch.name] as const)), [project.patches]);

  const createWorkspaceTab = useCallback((patchId: string, name?: string): LocalPatchWorkspaceTab => ({
    id: createId("patchTab"),
    name: name ?? patchNameById.get(patchId) ?? "Instrument",
    patchId,
    migrationNotice: null
  }), [patchNameById]);

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(PATCH_WORKSPACE_TAB_MACRO_VALUES_SESSION_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as Record<string, Record<string, unknown>>;
      setTabMacroValuesById(
        Object.fromEntries(
          Object.entries(parsed).map(([tabId, macroValues]) => [
            tabId,
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
      // Ignore invalid session data.
    }
  }, []);

  useEffect(() => {
    window.sessionStorage.setItem(PATCH_WORKSPACE_TAB_MACRO_VALUES_SESSION_KEY, JSON.stringify(tabMacroValuesById));
  }, [tabMacroValuesById]);

  useEffect(() => {
    const validTabIds = new Set(tabs.map((tab) => tab.id));
    setTabMacroValuesById((current) => {
      const next = Object.fromEntries(Object.entries(current).filter(([tabId]) => validTabIds.has(tabId)));
      return Object.keys(next).length === Object.keys(current).length ? current : next;
    });
  }, [tabs]);

  useEffect(() => {
    if (projectWorkspaceSignature === workspaceSyncSignatureRef.current) {
      return;
    }
    workspaceSyncSignatureRef.current = projectWorkspaceSignature;
    setTabs(project.ui.patchWorkspace.tabs.map(toLocalTab));
    setActiveTabId(project.ui.patchWorkspace.activeTabId);
  }, [project.ui.patchWorkspace.activeTabId, project.ui.patchWorkspace.tabs, projectWorkspaceSignature]);

  const persistedWorkspaceState = useMemo(
    () => ({
      activeTabId,
      tabs: tabs.map(toPersistedTab)
    }),
    [activeTabId, tabs]
  );
  const persistedWorkspaceSignature = JSON.stringify(persistedWorkspaceState);

  useEffect(() => {
    if (persistedWorkspaceSignature === workspaceSyncSignatureRef.current) {
      return;
    }
    workspaceSyncSignatureRef.current = persistedWorkspaceSignature;
    commitProjectChange(
      (current) => ({
        ...current,
        ui: {
          ...current.ui,
          patchWorkspace: persistedWorkspaceState
        }
      }),
      { skipHistory: true }
    );
  }, [commitProjectChange, persistedWorkspaceSignature, persistedWorkspaceState]);

  const activeTab = useMemo(() => getActiveTab(tabs, activeTabId), [activeTabId, tabs]);
  const selectedPatch = useMemo(
    () =>
      project.patches.find((patch) => patch.id === activeTab?.patchId) ??
      project.patches.find((patch) => patch.id === selectedTrack?.instrumentPatchId) ??
      project.patches[0],
    [activeTab?.patchId, project.patches, selectedTrack?.instrumentPatchId]
  );
  const {
    workspaceMacroValues,
    workspacePatch
  } = usePatchWorkspaceMacroValues({
    selectedPatch,
    macroValues: activeTab ? tabMacroValuesById[activeTab.id] : undefined
  });
  const selectedNodeId = activeTab?.selectedNodeId;
  const selectedMacroId = activeTab?.selectedMacroId;
  const migrationNotice = activeTab?.migrationNotice ?? null;

  const validationIssues = useMemo(
    () => (selectedPatch ? validationIssuesByPatchId.get(selectedPatch.id) ?? [] : []),
    [selectedPatch, validationIssuesByPatchId]
  );
  const selectedPatchHasErrors = validationIssues.some((issue) => issue.level === "error");

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
    audioEngineRef,
    playing,
    setRuntimeError
  });

  const updateTabs = useCallback((updater: (currentTabs: LocalPatchWorkspaceTab[]) => LocalPatchWorkspaceTab[]) => {
    setTabs((currentTabs) => updater(currentTabs));
  }, []);

  const updateActiveTab = useCallback(
    (updater: (tab: LocalPatchWorkspaceTab) => LocalPatchWorkspaceTab) => {
      if (!activeTab) {
        return;
      }
      setTabs((currentTabs) => currentTabs.map((tab) => (tab.id === activeTab.id ? updater(tab) : tab)));
    },
    [activeTab]
  );

  useEffect(() => {
    const validPatchIds = new Set(project.patches.map((patch) => patch.id));
    setTabs((currentTabs) => {
      const fallbackPatchId = selectedTrack?.instrumentPatchId ?? project.patches[0]?.id;
      if (!fallbackPatchId) {
        return currentTabs;
      }
      const nextTabs = currentTabs
        .filter((tab) => validPatchIds.has(tab.patchId))
        .map((tab) => ({
          ...tab,
          name: tab.name || patchNameById.get(tab.patchId) || "Instrument",
          selectedMacroId:
            tab.selectedMacroId &&
            project.patches.find((patch) => patch.id === tab.patchId)?.ui.macros.some((macro) => macro.id === tab.selectedMacroId)
              ? tab.selectedMacroId
              : undefined
        }));
      return nextTabs.length > 0 ? nextTabs : [createWorkspaceTab(fallbackPatchId)];
    });
  }, [createWorkspaceTab, patchNameById, project.patches, selectedTrack?.instrumentPatchId]);

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
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || isTextEditingTarget(event.target) || !activeTab) {
        return;
      }
      updateActiveTab((tab) => ({ ...tab, selectedMacroId: undefined }));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeTab, updateActiveTab]);

  const activateWorkspaceTab = useCallback((tabId: string, options?: { preview?: boolean }) => {
    skipNextTabPreviewRef.current = options?.preview === false;
    setActiveTabId(tabId);
  }, []);

  const cycleWorkspaceTabs = useCallback((direction: 1 | -1) => {
    if (tabs.length < 2 || !activeTab) {
      return;
    }
    const currentIndex = tabs.findIndex((tab) => tab.id === activeTab.id);
    const nextIndex = (currentIndex + direction + tabs.length) % tabs.length;
    activateWorkspaceTab(tabs[nextIndex].id);
  }, [activateWorkspaceTab, activeTab, tabs]);

  const openPatchWorkspace = useCallback((patchId?: string) => {
    const resolvedPatchId = patchId ?? selectedTrack?.instrumentPatchId ?? project.patches[0]?.id;
    if (resolvedPatchId) {
      const existingTab = tabs.find((tab) => tab.patchId === resolvedPatchId);
      if (existingTab) {
        activateWorkspaceTab(existingTab.id, { preview: false });
      } else {
        const nextTab = createWorkspaceTab(resolvedPatchId);
        skipNextTabPreviewRef.current = true;
        setTabs((currentTabs) => [...currentTabs, nextTab]);
        setActiveTabId(nextTab.id);
      }
    }
    router.push("/patch-workspace");
  }, [activateWorkspaceTab, createWorkspaceTab, project.patches, router, selectedTrack?.instrumentPatchId, tabs]);

  const closePatchWorkspace = useCallback(() => {
    router.push("/");
  }, [router]);

  const renameWorkspaceTab = useCallback((tabId: string, name: string) => {
    const nextName = name.trim();
    if (!nextName) {
      return;
    }
    updateTabs((currentTabs) => currentTabs.map((tab) => (tab.id === tabId ? { ...tab, name: nextName } : tab)));
  }, [updateTabs]);

  const createWorkspaceTabFromCurrent = useCallback(() => {
    const patchId = activeTab?.patchId ?? selectedPatch?.id ?? selectedTrack?.instrumentPatchId ?? project.patches[0]?.id;
    if (!patchId) {
      return;
    }
    const nextTab = createWorkspaceTab(patchId, createNextTabName(tabs));
    setTabs((currentTabs) => [...currentTabs, nextTab]);
    setTabMacroValuesById((current) => ({
      ...current,
      [nextTab.id]: activeTab ? { ...(current[activeTab.id] ?? {}) } : {}
    }));
    setActiveTabId(nextTab.id);
    skipNextTabPreviewRef.current = true;
  }, [activeTab, createWorkspaceTab, project.patches, selectedPatch?.id, selectedTrack?.instrumentPatchId, tabs]);

  const closeWorkspaceTab = useCallback((tabId: string) => {
    if (tabs.length <= 1) {
      return;
    }
    const closingIndex = tabs.findIndex((tab) => tab.id === tabId);
    if (closingIndex < 0) {
      return;
    }
    const fallbackTab = tabs[closingIndex + 1] ?? tabs[closingIndex - 1];
    setTabs((currentTabs) => currentTabs.filter((tab) => tab.id !== tabId));
    setTabMacroValuesById((current) => {
      const next = { ...current };
      delete next[tabId];
      return next;
    });
    if (activeTabId === tabId) {
      activateWorkspaceTab(fallbackTab.id, { preview: false });
    }
  }, [activateWorkspaceTab, activeTabId, tabs]);

  const renameSelectedPatch = useCallback((name: string) => {
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
        patches: current.patches.map((patch) => (patch.id === selectedPatch.id ? { ...patch, name: nextName } : patch))
      }),
      { actionKey: `patch:${selectedPatch.id}:rename`, coalesce: true }
    );
  }, [commitProjectChange, selectedPatch]);

  const selectPatchInWorkspace = useCallback((patchId: string) => {
    if (!activeTab) {
      return;
    }
    updateActiveTab((tab) => ({
      ...tab,
      patchId,
      selectedNodeId: undefined,
      selectedMacroId: undefined,
      migrationNotice: null
    }));
    setTabMacroValuesById((current) => ({ ...current, [activeTab.id]: {} }));
  }, [activeTab, updateActiveTab]);

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
    schedulePatchPreview(selectedPatch.id, undefined, activeTab ? tabMacroValuesById[activeTab.id] : undefined);
  }, [activeTab, commitProjectChange, schedulePatchPreview, selectedPatch, tabMacroValuesById, updateActiveTab]);

  const applyPatchOp = useCallback((op: PatchOp) => {
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
      schedulePatchPreview(selectedPatch.id, undefined, activeTab ? tabMacroValuesById[activeTab.id] : undefined);
    }
  }, [activeTab, commitProjectChange, schedulePatchPreview, selectedPatch, setRuntimeError, tabMacroValuesById, updateActiveTab]);

  const exposePatchMacro = useCallback((nodeId: string, paramId: string, suggestedName: string) => {
    if (!selectedPatch || resolvePatchSource(selectedPatch) === "preset") {
      return;
    }

    commitProjectChange((current) => {
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
      previewSelectedPatchNow(previewPitch, nextMacroValues);
    }
  }, [activeTab, previewPitch, previewSelectedPatchNow, selectedPatch, tabMacroValuesById]);

  const duplicateSelectedPatchInWorkspace = useCallback(() => {
    if (!selectedPatch || !activeTab) {
      return;
    }

    const duplicate = structuredClone(selectedPatch);
    duplicate.id = createId("patch");
    duplicate.name = `${selectedPatch.name} Copy`;
    duplicate.meta = { source: "custom" };

    commitProjectChange((current) => ({
      ...current,
      patches: [...current.patches, duplicate]
    }), { actionKey: `patch:duplicate:${duplicate.id}` });
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

    const duplicate = structuredClone(selectedPatch);
    duplicate.id = createId("patch");
    duplicate.name = `${selectedPatch.name} Copy`;
    duplicate.meta = { source: "custom" };

    const nextTab: LocalPatchWorkspaceTab = {
      id: createId("patchTab"),
      name: duplicate.name,
      patchId: duplicate.id,
      selectedNodeId: activeTab.selectedNodeId,
      selectedMacroId: activeTab.selectedMacroId,
      migrationNotice: null
    };

    commitProjectChange((current) => ({
      ...current,
      patches: [...current.patches, duplicate]
    }), { actionKey: `patch:duplicate:new-tab:${duplicate.id}` });
    setTabs((currentTabs) => [...currentTabs, nextTab]);
    setTabMacroValuesById((current) => ({ ...current, [nextTab.id]: { ...(tabMacroValuesById[activeTab.id] ?? {}) } }));
    setActiveTabId(nextTab.id);
    schedulePatchPreview(duplicate.id, undefined, tabMacroValuesById[activeTab.id]);
  }, [activeTab, commitProjectChange, schedulePatchPreview, selectedPatch, tabMacroValuesById]);

  const requestRemoveSelectedPatch = useCallback(() => {
    const patchStatus = selectedPatch ? resolvePatchPresetStatus(selectedPatch) : "custom";
    if (!selectedPatch || (resolvePatchSource(selectedPatch) !== "custom" && patchStatus !== "legacy_preset")) {
      return;
    }
    const affectedTracks = project.tracks.filter((track) => track.instrumentPatchId === selectedPatch.id);
    const fallbackPatchId = project.patches.find((patch) => patch.id !== selectedPatch.id)?.id ?? "";
    if (affectedTracks.length === 0) {
      commitProjectChange((current) => ({
        ...current,
        patches: current.patches.filter((patch) => patch.id !== selectedPatch.id)
      }), { actionKey: `patch:${selectedPatch.id}:remove` });
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
      pendingAutoPreviewTabIdRef.current = null;
      return;
    }
    pendingAutoPreviewTabIdRef.current = activeTab.id;
  }, [activeTab]);

  const handleInstrumentEditorReady = useCallback((renderedMacroValues: Record<string, number>) => {
    if (!activeTab || pendingAutoPreviewTabIdRef.current !== activeTab.id) {
      return;
    }
    pendingAutoPreviewTabIdRef.current = null;
    previewSelectedPatchNow(previewPitch, renderedMacroValues);
  }, [activeTab, previewPitch, previewSelectedPatchNow]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isShortcutBlockedTarget(event.target)) {
        return;
      }
      if (event.code === "Space") {
        event.preventDefault();
        previewSelectedPatchNow(previewPitch, activeTab ? tabMacroValuesById[activeTab.id] : undefined);
        return;
      }
      if (event.ctrlKey && !event.metaKey && !event.altKey && event.code === "Backquote") {
        event.preventDefault();
        cycleWorkspaceTabs(event.shiftKey ? -1 : 1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeTab, cycleWorkspaceTabs, previewPitch, previewSelectedPatchNow, tabMacroValuesById]);

  return {
    tabs,
    activeTabId,
    activateWorkspaceTab,
    createWorkspaceTabFromCurrent,
    closeWorkspaceTab,
    renameWorkspaceTab,
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
    previewSelectedPatchNow: (pitch = previewPitch) =>
      previewSelectedPatchNow(pitch, activeTab ? tabMacroValuesById[activeTab.id] : undefined),
    handleInstrumentEditorReady,
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

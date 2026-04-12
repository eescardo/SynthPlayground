"use client";

import type { Dispatch, RefObject, SetStateAction } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { AudioEngine } from "@/audio/engine";
import { PatchRemovalDialogState } from "@/components/home/PatchRemovalDialogModal";
import { usePatchWorkspaceMacroValues } from "@/hooks/patch/usePatchWorkspaceMacroValues";
import {
  createNextTabName,
  isAudiblePatchOp,
  isTextEditingTarget,
  LocalPatchWorkspaceTab,
  MAX_PATCH_WORKSPACE_TABS
} from "@/hooks/patch/patchWorkspaceStateUtils";
import { usePatchWorkspacePreviewController } from "@/hooks/patch/usePatchWorkspacePreviewController";
import { usePatchWorkspacePreview } from "@/hooks/patch/usePatchWorkspacePreview";
import { usePatchWorkspaceTabMacroSession } from "@/hooks/patch/usePatchWorkspaceTabMacroSession";
import { usePatchWorkspaceTabState } from "@/hooks/patch/usePatchWorkspaceTabState";
import { createId } from "@/lib/ids";
import { getModuleSchema } from "@/lib/patch/moduleRegistry";
import { applyPatchOp as applyPatchGraphOp } from "@/lib/patch/ops";
import { createPatchWorkspaceProbe } from "@/lib/patch/probes";
import { clampNormalizedMacroValue } from "@/lib/patch/macroKeyframes";
import { getBundledPresetPatch, resolvePatchPresetStatus, resolvePatchSource } from "@/lib/patch/source";
import { validatePatch } from "@/lib/patch/validation";
import { Project, Track } from "@/types/music";
import { PatchOp } from "@/types/ops";
import { PatchValidationIssue, Patch } from "@/types/patch";
import { PatchProbeTarget, PatchWorkspaceProbeState, PreviewProbeCapture } from "@/types/probes";

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
  const patchNameById = useMemo(() => new Map(project.patches.map((patch) => [patch.id, patch.name] as const)), [project.patches]);
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
  const [previewCaptureByProbeId, setPreviewCaptureByProbeId] = useState<Record<string, PreviewProbeCapture>>({});

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
  const selectedProbeId = activeTab?.selectedProbeId;
  const migrationNotice = activeTab?.migrationNotice ?? null;
  const probes = activeTab?.probes ?? [];

  const validationIssues = useMemo(
    () => (selectedPatch ? validationIssuesByPatchId.get(selectedPatch.id) ?? [] : []),
    [selectedPatch, validationIssuesByPatchId]
  );
  const selectedPatchHasErrors = validationIssues.some((issue) => issue.level === "error");

  const {
    previewCaptureByProbeId: latestPreviewCaptureByProbeId,
    previewProgress,
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
    probes,
    audioEngineRef,
    playing,
    setRuntimeError
  });

  useEffect(() => {
    const validPatchIds = new Set(project.patches.map((patch) => patch.id));
    setTabs((currentTabs) => {
      const fallbackPatchId = selectedTrack?.instrumentPatchId ?? project.patches[0]?.id;
      if (!fallbackPatchId) {
        return currentTabs;
      }
      const nextTabs = currentTabs
        .filter((tab) => validPatchIds.has(tab.patchId))
        .map((tab) => {
          const patch = project.patches.find((entry) => entry.id === tab.patchId);
          const probes = (tab.probes ?? []).filter((probe) => {
            const target = probe.target;
            if (!target) {
              return true;
            }
            if (target.kind === "connection") {
              return Boolean(patch?.connections.some((connection) => connection.id === target.connectionId));
            }
            return Boolean(patch?.nodes.some((node) => node.id === target.nodeId));
          });
          return {
            ...tab,
            name: tab.name || patchNameById.get(tab.patchId) || "Instrument",
            probes,
            selectedMacroId:
              tab.selectedMacroId && patch?.ui.macros.some((macro) => macro.id === tab.selectedMacroId)
                ? tab.selectedMacroId
                : undefined,
            selectedProbeId: tab.selectedProbeId && probes.some((probe) => probe.id === tab.selectedProbeId) ? tab.selectedProbeId : undefined
          };
        });
      return nextTabs.length > 0 ? nextTabs : [{ ...createWorkspaceTab(fallbackPatchId), probes: [] }];
    });
  }, [createWorkspaceTab, patchNameById, project.patches, selectedTrack?.instrumentPatchId, setTabs]);

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
  }, [latestPreviewCaptureByProbeId]);

  const setSkipWorkspaceHistory = useCallback((skipHistory: boolean) => {
    skipNextWorkspaceHistoryRef.current = skipHistory;
  }, [skipNextWorkspaceHistoryRef]);

  const getActiveTabMacroValues = useCallback(
    () => (activeTab ? tabMacroValuesById[activeTab.id] : undefined),
    [activeTab, tabMacroValuesById]
  );

  const {
    activateWorkspaceTab,
    handleInstrumentEditorReady,
    setSkipNextTabPreview
  } = usePatchWorkspacePreviewController({
    tabs,
    activeTab,
    previewPitch,
    previewSelectedPatchNow,
    setActiveTabId,
    setSkipWorkspaceHistory,
    getActiveTabMacroValues
  });

  const openPatchWorkspace = useCallback((patchId?: string) => {
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
  }, [
    activateWorkspaceTab,
    createWorkspaceTab,
    project.patches,
    router,
    selectedTrack?.instrumentPatchId,
    setActiveTabId,
    setSkipNextTabPreview,
    setTabs,
    tabs
  ]);

  const renameWorkspaceTab = useCallback((tabId: string, name: string) => {
    const nextName = name.trim();
    if (!nextName) {
      return;
    }
    updateTabs((currentTabs) => currentTabs.map((tab) => (tab.id === tabId ? { ...tab, name: nextName } : tab)));
  }, [updateTabs]);

  const createWorkspaceTabFromCurrent = useCallback(() => {
    if (tabs.length >= MAX_PATCH_WORKSPACE_TABS) {
      return;
    }
    const patchId = activeTab?.patchId ?? selectedPatch?.id ?? selectedTrack?.instrumentPatchId ?? project.patches[0]?.id;
    if (!patchId) {
      return;
    }
    const nextTab = { ...createWorkspaceTab(patchId, createNextTabName(tabs)), probes: [] };
    skipNextWorkspaceHistoryRef.current = false;
    setTabs((currentTabs) => [...currentTabs, nextTab]);
    setTabMacroValuesById((current) => ({
      ...current,
      [nextTab.id]: activeTab ? { ...(current[activeTab.id] ?? {}) } : {}
    }));
    setActiveTabId(nextTab.id);
    setSkipNextTabPreview(true);
  }, [
    activeTab,
    createWorkspaceTab,
    project.patches,
    selectedPatch?.id,
    selectedTrack?.instrumentPatchId,
    setActiveTabId,
    setSkipNextTabPreview,
    setTabMacroValuesById,
    setTabs,
    skipNextWorkspaceHistoryRef,
    tabs
  ]);

  const closeWorkspaceTab = useCallback((tabId: string) => {
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
  }, [activateWorkspaceTab, activeTabId, setTabMacroValuesById, setTabs, skipNextWorkspaceHistoryRef, tabs]);

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
      selectedProbeId: undefined,
      probes: [],
      migrationNotice: null
    }));
    setTabMacroValuesById((current) => ({ ...current, [activeTab.id]: {} }));
    setPreviewCaptureByProbeId({});
  }, [activeTab, setTabMacroValuesById, updateActiveTab]);

  const addProbeToWorkspace = useCallback((kind: PatchWorkspaceProbeState["kind"]) => {
    if (!activeTab) {
      return;
    }
    const nextProbe = createPatchWorkspaceProbe(kind, 4, 4 + activeTab.probes.length * 7);
    updateActiveTab((tab) => ({
      ...tab,
      selectedNodeId: undefined,
      selectedMacroId: undefined,
      selectedProbeId: nextProbe.id,
      probes: [...tab.probes, nextProbe]
    }));
  }, [activeTab, updateActiveTab]);

  const setSelectedProbeId = useCallback((probeId?: string) => {
    updateActiveTab((tab) => ({
      ...tab,
      selectedNodeId: undefined,
      selectedMacroId: undefined,
      selectedProbeId: probeId
    }));
  }, [updateActiveTab]);

  const moveProbe = useCallback((probeId: string, x: number, y: number) => {
    updateActiveTab((tab) => ({
      ...tab,
      probes: tab.probes.map((probe) => (probe.id === probeId ? { ...probe, x, y } : probe))
    }));
  }, [updateActiveTab]);

  const updateProbeTarget = useCallback((probeId: string, target?: PatchProbeTarget) => {
    updateActiveTab((tab) => ({
      ...tab,
      selectedProbeId: probeId,
      probes: tab.probes.map((probe) => (probe.id === probeId ? { ...probe, target } : probe))
    }));
  }, [updateActiveTab]);

  const updateProbeSpectrumWindow = useCallback((probeId: string, spectrumWindowSize: number) => {
    updateActiveTab((tab) => ({
      ...tab,
      probes: tab.probes.map((probe) => (probe.id === probeId ? { ...probe, spectrumWindowSize } : probe))
    }));
  }, [updateActiveTab]);

  const toggleProbeExpanded = useCallback((probeId: string) => {
    updateActiveTab((tab) => ({
      ...tab,
      probes: tab.probes.map((probe) =>
        probe.id === probeId
          ? { ...probe, expanded: !probe.expanded }
          : probe
      )
    }));
  }, [updateActiveTab]);

  const removeSelectedProbe = useCallback(() => {
    const selectedProbeId = activeTab?.selectedProbeId;
    if (!selectedProbeId) {
      return;
    }
    updateActiveTab((tab) => ({
      ...tab,
      selectedProbeId: undefined,
      probes: tab.probes.filter((probe) => probe.id !== tab.selectedProbeId)
    }));
    setPreviewCaptureByProbeId((current) => {
      const next = { ...current };
      delete next[selectedProbeId];
      return next;
    });
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
  }, [activeTab, previewPitch, previewSelectedPatchNow, selectedPatch, setTabMacroValuesById, tabMacroValuesById]);

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
    if (tabs.length >= MAX_PATCH_WORKSPACE_TABS) {
      return;
    }

    const duplicate = structuredClone(selectedPatch);
    duplicate.id = createId("patch");
    duplicate.name = `${selectedPatch.name} Copy`;
    duplicate.meta = { source: "custom" };

    const nextTab: LocalPatchWorkspaceTab = {
      ...createWorkspaceTab(duplicate.id, duplicate.name),
      selectedNodeId: activeTab.selectedNodeId,
      selectedMacroId: activeTab.selectedMacroId,
      selectedProbeId: undefined,
      probes: activeTab.probes.map((probe) => ({
        ...structuredClone(probe),
        id: createId("probe")
      }))
    };

    commitProjectChange((current) => ({
      ...current,
      patches: [...current.patches, duplicate]
    }), { actionKey: `patch:duplicate:new-tab:${duplicate.id}` });
    setTabs((currentTabs) => [...currentTabs, nextTab]);
    setTabMacroValuesById((current) => ({ ...current, [nextTab.id]: { ...(tabMacroValuesById[activeTab.id] ?? {}) } }));
    setActiveTabId(nextTab.id);
    schedulePatchPreview(duplicate.id, undefined, tabMacroValuesById[activeTab.id]);
  }, [activeTab, commitProjectChange, createWorkspaceTab, schedulePatchPreview, setActiveTabId, setTabMacroValuesById, setTabs, selectedPatch, tabMacroValuesById, tabs.length]);

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

  return {
    tabs,
    activeTabId,
    activateWorkspaceTab,
    createWorkspaceTabFromCurrent,
    closeWorkspaceTab,
    renameWorkspaceTab,
    selectedPatch: workspacePatch ?? selectedPatch,
    workspaceMacroValues,
    probes,
    selectedProbeId,
    setSelectedProbeId,
    addProbeToWorkspace,
    moveProbe,
    updateProbeTarget,
    updateProbeSpectrumWindow,
    toggleProbeExpanded,
    removeSelectedProbe,
    previewCaptureByProbeId,
    previewProgress,
    selectedNodeId,
    setSelectedNodeId: (nodeId?: string) => updateActiveTab((tab) => ({ ...tab, selectedNodeId: nodeId, selectedProbeId: undefined })),
    selectedMacroId,
    setSelectedMacroId: (macroId?: string) => updateActiveTab((tab) => ({ ...tab, selectedMacroId: macroId, selectedProbeId: undefined })),
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

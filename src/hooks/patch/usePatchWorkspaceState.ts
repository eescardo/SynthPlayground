"use client";

import type { Dispatch, RefObject, SetStateAction } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { AudioEngine } from "@/audio/engine";
import { createId } from "@/lib/ids";
import { getModuleSchema } from "@/lib/patch/moduleRegistry";
import { applyPatchOp as applyPatchGraphOp } from "@/lib/patch/ops";
import { getBundledPresetPatch, resolvePatchPresetStatus, resolvePatchSource } from "@/lib/patch/source";
import { validatePatch } from "@/lib/patch/validation";
import { Project, Track } from "@/types/music";
import { PatchValidationIssue, Patch } from "@/types/patch";
import { PatchOp } from "@/types/ops";
import { PatchRemovalDialogState } from "@/components/home/PatchRemovalDialogModal";
import { usePatchWorkspaceMacroValues } from "@/hooks/patch/usePatchWorkspaceMacroValues";
import { usePatchWorkspacePreview } from "@/hooks/patch/usePatchWorkspacePreview";

const isTextEditingTarget = (target: EventTarget | null) => {
  const element = target as HTMLElement | null;
  return Boolean(element && (element.tagName === "INPUT" || element.tagName === "SELECT" || element.tagName === "TEXTAREA"));
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
  const [selectedPatchId, setSelectedPatchId] = useState<string | undefined>(undefined);
  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>(undefined);
  const [selectedMacroId, setSelectedMacroId] = useState<string | undefined>(undefined);
  const [migrationNotice, setMigrationNotice] = useState<string | null>(null);

  const selectedPatch = useMemo(
    () =>
      project.patches.find((patch) => patch.id === selectedPatchId) ??
      project.patches.find((patch) => patch.id === selectedTrack?.instrumentPatchId) ??
      project.patches[0],
    [project.patches, selectedPatchId, selectedTrack?.instrumentPatchId]
  );

  const validationIssues = useMemo(
    () => (selectedPatch ? validationIssuesByPatchId.get(selectedPatch.id) ?? [] : []),
    [selectedPatch, validationIssuesByPatchId]
  );
  const selectedPatchHasErrors = validationIssues.some((issue) => issue.level === "error");

  useEffect(() => {
    setMigrationNotice(null);
    setSelectedNodeId(undefined);
    setSelectedMacroId(undefined);
  }, [selectedPatch?.id]);

  useEffect(() => {
    if (!selectedPatch || !selectedMacroId) {
      return;
    }
    if (!selectedPatch.ui.macros.some((macro) => macro.id === selectedMacroId)) {
      setSelectedMacroId(undefined);
    }
  }, [selectedMacroId, selectedPatch]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || isTextEditingTarget(event.target)) {
        return;
      }
      setSelectedMacroId(undefined);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

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

  const openPatchWorkspace = useCallback((patchId?: string) => {
    setSelectedPatchId((current) => patchId ?? current ?? selectedTrack?.instrumentPatchId ?? project.patches[0]?.id);
    router.push("/patch-workspace");
  }, [project.patches, router, selectedTrack?.instrumentPatchId]);

  const closePatchWorkspace = useCallback(() => {
    router.push("/");
  }, [router]);

  const selectPatchInWorkspace = useCallback((patchId: string) => {
    setSelectedPatchId(patchId);
    setSelectedNodeId(undefined);
    setSelectedMacroId(undefined);
    setMigrationNotice(null);
  }, []);
  const updatePresetToLatest = useCallback(() => {
    if (!selectedPatch || selectedPatch.meta.source !== "preset") {
      return;
    }

    const latestPreset = getBundledPresetPatch(selectedPatch.meta.presetId);
    if (!latestPreset || latestPreset.meta.source !== "preset") {
      setMigrationNotice("Latest bundled preset snapshot is not available for this instrument.");
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
    setSelectedNodeId((currentSelectedNodeId) =>
      currentSelectedNodeId && nextNodeIds.has(currentSelectedNodeId) ? currentSelectedNodeId : undefined
    );
    setMigrationNotice(
      droppedLayoutCount > 0
        ? `Preset updated. ${droppedLayoutCount} saved layout position${droppedLayoutCount === 1 ? "" : "s"} were discarded because those nodes changed in the new preset.`
        : "Preset updated to the latest bundled version."
    );
    schedulePatchPreview(selectedPatch.id);
  }, [commitProjectChange, schedulePatchPreview, selectedPatch]);

  const applyPatchOp = useCallback((op: PatchOp) => {
    if (!selectedPatch) return;
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
    if (isAudiblePatchOp(op)) {
      schedulePatchPreview(selectedPatch.id);
    }
  }, [commitProjectChange, schedulePatchPreview, selectedPatch, setRuntimeError]);

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
    schedulePatchPreview(selectedPatch.id);
  }, [commitProjectChange, schedulePatchPreview, selectedPatch]);

  const changePatchMacroValue = useCallback((macroId: string, normalized: number, options?: { commit?: boolean }) => {
    if (!selectedPatch) {
      return;
    }
    const defaultValue = selectedPatch.ui.macros.find((macro) => macro.id === macroId)?.defaultNormalized ?? 0.5;
    const nextPatchMacroValues = setWorkspaceMacroValue(selectedPatch.id, macroId, normalized, defaultValue);

    if (options?.commit) {
      previewPatchById(selectedPatch.id, previewPitch, nextPatchMacroValues);
    }
  }, [previewPatchById, previewPitch, selectedPatch, setWorkspaceMacroValue]);

  const renameSelectedPatch = useCallback((name: string) => {
    if (!selectedPatch) return;
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

    commitProjectChange((current) => ({
      ...current,
      patches: [...current.patches, duplicate]
    }), { actionKey: `patch:duplicate:${duplicate.id}` });
    setSelectedPatchId(duplicate.id);
    setSelectedNodeId(undefined);
    setSelectedMacroId(undefined);
    setMigrationNotice(null);
    schedulePatchPreview(duplicate.id);
  }, [commitProjectChange, schedulePatchPreview, selectedPatch]);

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
      setSelectedPatchId(fallbackPatchId || project.patches.find((patch) => patch.id !== selectedPatch.id)?.id);
      setSelectedNodeId(undefined);
      setSelectedMacroId(undefined);
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
    selectedPatch: workspacePatch ?? selectedPatch,
    selectedPatchId,
    setSelectedPatchId,
    workspaceMacroValues,
    selectedNodeId,
    setSelectedNodeId,
    selectedMacroId,
    setSelectedMacroId,
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
    updatePresetToLatest,
    requestRemoveSelectedPatch,
    applyPatchOp,
    exposePatchMacro,
    addPatchMacro,
    removePatchMacro,
    renamePatchMacro,
    setPatchMacroKeyframeCount,
    changePatchMacroValue,
    clearSelectedMacro: () => setSelectedMacroId(undefined)
  };
}

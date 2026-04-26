import { Dispatch, RefObject, SetStateAction, useCallback, useMemo } from "react";
import {
  ProjectWorkspaceProviderProps,
  ProjectWorkspaceTransportContextValue
} from "@/components/ProjectWorkspaceContext";
import {
  PatchWorkspaceInstrumentContextValue,
  PatchWorkspaceSampleAssetsContextValue
} from "@/components/patch/PatchWorkspaceContext";
import { PatchWorkspaceView } from "@/components/app/PatchWorkspaceView";
import { downloadJsonFile } from "@/lib/browserDownloads";
import { NoteClipboardPayload } from "@/lib/clipboard";
import { createId } from "@/lib/ids";
import { RecentProjectSnapshot } from "@/lib/persistence";
import { exportPatchToJson, importPatchBundleFromJson } from "@/lib/patch/serde";
import { resolvePatchPresetStatus, resolvePatchSource } from "@/lib/patch/source";
import { createImportedWorkspacePatch } from "@/hooks/patch/patchWorkspacePatchHelpers";
import { mergeImportedPatchAssets } from "@/lib/sampleAssetLibrary";
import { MAX_PATCH_WORKSPACE_TABS } from "@/hooks/patch/patchWorkspaceStateUtils";
import { buildPatchDiff } from "@/lib/patch/diff";
import { usePatchWorkspaceState } from "@/hooks/patch/usePatchWorkspaceState";
import { ProjectAssetLibrary } from "@/types/assets";
import { Project } from "@/types/music";
import { PatchValidationIssue, Patch } from "@/types/patch";

type CommitProjectChange = (
  updater: (current: Project) => Project,
  options?: { actionKey?: string; coalesce?: boolean; skipHistory?: boolean }
) => void;

export interface UsePatchWorkspaceControllerOptions {
  project: Project;
  projectAssets: ProjectAssetLibrary;
  playheadBeat: number;
  importInputRef: RefObject<HTMLInputElement | null>;
  recentProjects: RecentProjectSnapshot[];
  selectedPatch: Patch;
  validationIssues: PatchValidationIssue[];
  selectedPatchHasErrors: boolean;
  patchWorkspace: ReturnType<typeof usePatchWorkspaceState>;
  onWriteClipboardPayload?: (payload: NoteClipboardPayload) => Promise<void>;
  onUpsertSamplePlayerAssetData: (serializedSampleData: string, existingAssetId?: string | null) => string;
  commitProjectChange: CommitProjectChange;
  setProjectAssets: Dispatch<SetStateAction<ProjectAssetLibrary>>;
  setRuntimeError: Dispatch<SetStateAction<string | null>>;
  onNewProject: () => void;
  onExportJson: () => void;
  onImportJson: () => void;
  onOpenRecentProject: (projectId: string) => void;
  onResetToDefaultProject: () => void;
  onImportFile: (file: File) => void;
}

const createAvailablePatchName = (existingNames: string[], baseName: string) => {
  const normalizedReservedNames = new Set(
    existingNames
      .map((name) => name.trim().toLocaleLowerCase())
      .filter((name) => name.length > 0)
  );

  if (!normalizedReservedNames.has(baseName.toLocaleLowerCase())) {
    return baseName;
  }

  let suffix = 2;
  while (normalizedReservedNames.has(`${baseName} ${suffix}`.toLocaleLowerCase())) {
    suffix += 1;
  }
  return `${baseName} ${suffix}`;
};

export function usePatchWorkspaceController(options: UsePatchWorkspaceControllerOptions): {
  clipboard: ProjectWorkspaceProviderProps["clipboard"];
  transport: ProjectWorkspaceTransportContextValue;
  sampleAssets: PatchWorkspaceSampleAssetsContextValue;
  instrument: PatchWorkspaceInstrumentContextValue;
  viewProps: React.ComponentProps<typeof PatchWorkspaceView>;
} {
  const {
    commitProjectChange,
    importInputRef,
    onExportJson,
    onImportFile,
    onImportJson,
    onNewProject,
    onOpenRecentProject,
    onResetToDefaultProject,
    onUpsertSamplePlayerAssetData,
    onWriteClipboardPayload,
    patchWorkspace,
    playheadBeat,
    project,
    projectAssets,
    recentProjects,
    selectedPatch,
    selectedPatchHasErrors,
    setProjectAssets,
    setRuntimeError,
    validationIssues
  } = options;

  const exportSelectedPatchJson = useCallback(() => {
    downloadJsonFile(
      exportPatchToJson(selectedPatch, projectAssets),
      `${selectedPatch.name.replace(/\s+/g, "_").toLowerCase()}.patch.json`
    );
  }, [projectAssets, selectedPatch]);

  const importPatchJson = useCallback(async (file: File) => {
    try {
      const importedBundle = importPatchBundleFromJson(await file.text());
      const merged = mergeImportedPatchAssets(importedBundle.patch, importedBundle.assets, projectAssets);
      const importedPatch = createImportedWorkspacePatch(merged.patch);
      const nextPatchId = project.patches.some((patch) => patch.id === importedPatch.id) ? createId("patch") : importedPatch.id;
      const nextPatchName = createAvailablePatchName(project.patches.map((patch) => patch.name), importedPatch.name);
      const nextPatch = {
        ...importedPatch,
        id: nextPatchId,
        name: nextPatchName
      };

      setProjectAssets(merged.assets);
      commitProjectChange((current) => ({
        ...current,
        patches: [...current.patches, nextPatch]
      }), { actionKey: `patch:import:${nextPatch.id}` });
      patchWorkspace.selectPatchInWorkspace(nextPatch.id);
      setRuntimeError(null);
    } catch (error) {
      setRuntimeError((error as Error).message);
    }
  }, [commitProjectChange, patchWorkspace, project.patches, projectAssets, setProjectAssets, setRuntimeError]);

  const canRemovePatch =
    resolvePatchSource(selectedPatch) === "custom" || resolvePatchPresetStatus(selectedPatch) === "legacy_preset";

  const transport = useMemo<ProjectWorkspaceTransportContextValue>(() => ({
    tempo: project.global.tempo,
    meter: project.global.meter,
    gridBeats: project.global.gridBeats,
    playheadBeat
  }), [
    project.global.gridBeats,
    playheadBeat,
    project.global.meter,
    project.global.tempo
  ]);

  const sampleAssets = useMemo<PatchWorkspaceSampleAssetsContextValue>(() => ({
    assets: projectAssets,
    upsertSamplePlayerAssetData: onUpsertSamplePlayerAssetData
  }), [
    onUpsertSamplePlayerAssetData,
    projectAssets
  ]);

  const importPatchFile = useCallback((file: File) => {
    void importPatchJson(file);
  }, [importPatchJson]);

  const instrument = useMemo<PatchWorkspaceInstrumentContextValue>(() => ({
    patches: project.patches,
    canRemovePatch,
    renamePatch: patchWorkspace.renameSelectedPatch,
    selectPatch: patchWorkspace.selectPatchInWorkspace,
    duplicatePatch: patchWorkspace.duplicateSelectedPatchInWorkspace,
    duplicatePatchToNewTab: patchWorkspace.duplicateSelectedPatchToNewTab,
    exportPatchJson: exportSelectedPatchJson,
    importPatchFile,
    updatePreset: patchWorkspace.updatePresetToLatest,
    requestRemovePatch: patchWorkspace.requestRemoveSelectedPatch
  }), [
    canRemovePatch,
    exportSelectedPatchJson,
    importPatchFile,
    patchWorkspace.duplicateSelectedPatchInWorkspace,
    patchWorkspace.duplicateSelectedPatchToNewTab,
    patchWorkspace.renameSelectedPatch,
    patchWorkspace.requestRemoveSelectedPatch,
    patchWorkspace.selectPatchInWorkspace,
    patchWorkspace.updatePresetToLatest,
    project.patches
  ]);

  const viewProps: React.ComponentProps<typeof PatchWorkspaceView> = {
    patch: selectedPatch,
    baselineDiff: {
      baselinePatch: patchWorkspace.baselinePatch,
      patchDiff: patchWorkspace.patchDiff,
      availablePatches: project.patches,
      onSelectBaselinePatch: patchWorkspace.setBaselinePatchFromPatchId,
      onClearBaselinePatch: patchWorkspace.clearCurrentPatchBaseline
    },
    importInputRef,
    recentProjects,
    probeState: {
      probes: patchWorkspace.probes,
      selectedProbeId: patchWorkspace.selectedProbeId,
      previewCaptureByProbeId: patchWorkspace.previewCaptureByProbeId,
      previewProgress: patchWorkspace.previewProgress
    },
    tabs: patchWorkspace.tabs.map((tab) => ({
      id: tab.id,
      name: tab.name,
      patchId: tab.patchId,
      hasBaseline: Boolean(tab.baselinePatch),
      hasPatchDiff: buildPatchDiff(project.patches.find((patch) => patch.id === tab.patchId), tab.baselinePatch).hasChanges
    })),
    activeTabId: patchWorkspace.activeTabId,
    macroValues: patchWorkspace.workspaceMacroValues,
    previewPitch: patchWorkspace.previewPitch,
    migrationNotice: patchWorkspace.migrationNotice,
    selectedNodeId: patchWorkspace.selectedNodeId,
    selectedMacroId: patchWorkspace.selectedMacroId,
    validationIssues,
    invalid: selectedPatchHasErrors,
    onBackToComposer: patchWorkspace.closePatchWorkspace,
    onActivateTab: patchWorkspace.activateWorkspaceTab,
    canCreateTab: patchWorkspace.tabs.length < MAX_PATCH_WORKSPACE_TABS,
    onCreateTab: patchWorkspace.createWorkspaceTabFromCurrent,
    onCloseTab: patchWorkspace.closeWorkspaceTab,
    onRenameTab: patchWorkspace.renameWorkspaceTab,
    onOpenPreviewPitchPicker: () => patchWorkspace.setPreviewPitchPickerOpen(true),
    onPreviewNow: () => patchWorkspace.previewSelectedPatchNow(),
    onNewProject,
    onExportJson,
    onImportJson,
    onOpenRecentProject,
    onResetToDefaultProject,
    onImportFile,
    onInstrumentEditorReady: patchWorkspace.handleInstrumentEditorReady,
    onSelectNode: patchWorkspace.setSelectedNodeId,
    onSelectMacro: patchWorkspace.setSelectedMacroId,
    onClearSelectedMacro: patchWorkspace.clearSelectedMacro,
    onClearPatch: patchWorkspace.clearSelectedPatchCircuit,
    onApplyOp: patchWorkspace.applyPatchOp,
    probeActions: {
      addProbe: patchWorkspace.addProbeToWorkspace,
      moveProbe: patchWorkspace.moveProbe,
      selectProbe: patchWorkspace.setSelectedProbeId,
      updateTarget: patchWorkspace.updateProbeTarget,
      updateSpectrumWindow: patchWorkspace.updateProbeSpectrumWindow,
      updateFrequencyView: (probeId, maxHz) => patchWorkspace.updateProbeFrequencyView(probeId, { maxHz }),
      toggleExpanded: patchWorkspace.toggleProbeExpanded,
      deleteSelected: patchWorkspace.removeSelectedProbe
    },
    onExposeMacro: patchWorkspace.exposePatchMacro,
    onAddMacro: patchWorkspace.addPatchMacro,
    onRemoveMacro: patchWorkspace.removePatchMacro,
    onRenameMacro: patchWorkspace.renamePatchMacro,
    onSetMacroKeyframeCount: patchWorkspace.setPatchMacroKeyframeCount,
    onChangeMacroValue: patchWorkspace.changePatchMacroValue
  };

  return {
    clipboard: onWriteClipboardPayload,
    transport,
    sampleAssets,
    instrument,
    viewProps
  };
}

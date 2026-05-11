"use client";

import type { RefObject } from "react";
import type { AudioEngine } from "@/audio/engine";
import type { ComposerControllerProps } from "@/components/app/ComposerController";
import type { ComposerViewProps } from "@/components/app/ComposerView";
import type { UsePatchWorkspaceControllerOptions } from "@/hooks/patch/usePatchWorkspaceController";
import type { usePatchWorkspaceState } from "@/hooks/patch/usePatchWorkspaceState";
import type { useHardwareNavigation } from "@/hooks/useHardwareNavigation";
import type { usePlaybackController } from "@/hooks/usePlaybackController";
import type { useRecordingController } from "@/hooks/useRecordingController";
import type { RecentProjectSnapshot } from "@/lib/persistence";
import { resolvePatchPresetStatus, resolvePatchSource } from "@/lib/patch/source";
import type { ProjectAssetLibrary } from "@/types/assets";
import type { Project } from "@/types/music";
import type { Patch } from "@/types/patch";

type ProjectMenuProps = Pick<
  ComposerViewProps,
  | "importInputRef"
  | "recentProjects"
  | "onNewProject"
  | "onExportJson"
  | "onImportJson"
  | "onOpenRecentProject"
  | "onResetToDefaultProject"
  | "onImportFile"
>;

type PatchWorkspaceState = ReturnType<typeof usePatchWorkspaceState>;
type RecordingState = ReturnType<typeof useRecordingController>;
type PlaybackState = ReturnType<typeof usePlaybackController>;
type HardwareNavigationState = ReturnType<typeof useHardwareNavigation>;

interface UseProjectMenuPropsOptions {
  importInputRef: RefObject<HTMLInputElement | null>;
  recentProjects: RecentProjectSnapshot[];
  createNewProject: () => Promise<void>;
  exportJson: () => void;
  openRecentProject: (projectId: string) => Promise<void>;
  resetToDefaultProject: () => Promise<void>;
  importJson: (file: File) => Promise<void>;
}

export function createProjectMenuProps(options: UseProjectMenuPropsOptions): ProjectMenuProps {
  const {
    createNewProject,
    exportJson,
    importInputRef,
    importJson,
    openRecentProject,
    recentProjects,
    resetToDefaultProject
  } = options;

  return {
    importInputRef,
    recentProjects,
    onNewProject: () => {
      void createNewProject();
    },
    onExportJson: exportJson,
    onImportJson: () => importInputRef.current?.click(),
    onOpenRecentProject: (projectId: string) => {
      void openRecentProject(projectId);
    },
    onResetToDefaultProject: () => {
      void resetToDefaultProject();
    },
    onImportFile: (file: File) => {
      void importJson(file);
    }
  };
}

interface UseComposerControllerPropsOptions {
  clipboard: ComposerControllerProps["clipboard"];
  project: Project;
  selectedTrackId: string;
  selectedTrackPatch?: Patch;
  selectedTrackInstrumentPatchId: string;
  invalidPatchIds: ComposerViewProps["invalidPatchIds"];
  canvasSelection: ComposerViewProps["canvasSelection"];
  playheadBeat: number;
  playing: boolean;
  recording: Pick<
    RecordingState,
    "activeRecordedNotes" | "countInLabel" | "ghostPlayheadBeat" | "recordEnabled" | "recordPhase" | "startRecordMode"
  >;
  playback: Pick<PlaybackState, "startPlayback" | "stopPlayback">;
  hardwareNavigation: Pick<
    HardwareNavigationState,
    | "activePlacement"
    | "ghostPreviewNote"
    | "playheadNavigationFocused"
    | "returnSelectionFocusToPlayhead"
    | "selectedContentTabStopFocusToken"
    | "tabSelectionPreviewNote"
  >;
  patchWorkspace: Pick<
    PatchWorkspaceState,
    "openPatchWorkspace" | "previewPitch" | "setPreviewPitchPickerOpen" | "setSelectedNodeId"
  >;
  projectMenuProps: ProjectMenuProps;
  timelineActionsPopover: ComposerViewProps["timelineActionsPopover"];
  selectionActionPopoverVisible: boolean;
  noteClipboardPayload: unknown;
  startMarkerAtTimelineBeat: ComposerViewProps["startMarkerAtTimelineBeat"];
  endMarkerAtTimelineBeat: ComposerViewProps["endMarkerAtTimelineBeat"];
  expandableLoopRegion: boolean;
  exportingAudio: boolean;
  selectionActionPopoverCollapsed: boolean;
  hasTimelineRangeSelection: boolean;
  setSelectedTrackId: (trackId: string | undefined) => void;
  renameTrack: (trackId: string, name: string) => void;
  toggleTrackMute: (trackId: string) => void;
  setTrackVolume: ComposerViewProps["trackActions"]["onSetTrackVolume"];
  previewTrackVolume: ComposerViewProps["trackActions"]["onPreviewTrackVolume"];
  bindTrackVolumeToAutomation: ComposerViewProps["trackActions"]["onBindTrackVolumeToAutomation"];
  unbindTrackVolumeFromAutomation: ComposerViewProps["trackActions"]["onUnbindTrackVolumeFromAutomation"];
  toggleTrackVolumeAutomationLane: ComposerViewProps["trackActions"]["onToggleTrackVolumeAutomationLane"];
  updateTrackPatch: ComposerViewProps["trackActions"]["onUpdateTrackPatch"];
  toggleTrackMacroPanel: ComposerViewProps["trackActions"]["onToggleTrackMacroPanel"];
  duplicatePatchForSelectedTrack: () => void;
  requestRemoveSelectedTrackPatch: () => void;
  changeTrackMacro: ComposerViewProps["automationActions"]["onChangeTrackMacro"];
  bindTrackMacroToAutomation: ComposerViewProps["automationActions"]["onBindTrackMacroToAutomation"];
  unbindTrackMacroFromAutomation: ComposerViewProps["automationActions"]["onUnbindTrackMacroFromAutomation"];
  toggleTrackMacroAutomationLane: ComposerViewProps["automationActions"]["onToggleTrackMacroAutomationLane"];
  upsertTrackMacroAutomationKeyframe: ComposerViewProps["automationActions"]["onUpsertTrackMacroAutomationKeyframe"];
  splitTrackMacroAutomationKeyframe: ComposerViewProps["automationActions"]["onSplitTrackMacroAutomationKeyframe"];
  updateTrackMacroAutomationKeyframeSide: ComposerViewProps["automationActions"]["onUpdateTrackMacroAutomationKeyframeSide"];
  deleteTrackMacroAutomationKeyframeSide: ComposerViewProps["automationActions"]["onDeleteTrackMacroAutomationKeyframeSide"];
  previewTrackMacroAutomation: ComposerViewProps["automationActions"]["onPreviewTrackMacroAutomation"];
  openPitchPicker: ComposerViewProps["noteActions"]["onOpenPitchPicker"];
  previewPlacedNote: ComposerViewProps["noteActions"]["onPreviewPlacedNote"];
  upsertNote: ComposerViewProps["noteActions"]["onUpsertNote"];
  updateNote: ComposerViewProps["noteActions"]["onUpdateNote"];
  deleteNote: ComposerViewProps["noteActions"]["onDeleteNote"];
  setContentSelectionFromCanvas: ComposerViewProps["selectionActions"]["onSetContentSelection"];
  setTimelineSelectionFromCanvas: ComposerViewProps["selectionActions"]["onSetTimelineSelectionBeatRange"];
  setSelectionMarqueeActive: ComposerViewProps["selectionActions"]["onSetSelectionMarqueeActive"];
  previewSelectionActionScopeChange: ComposerViewProps["selectionActions"]["onPreviewSelectionActionScopeChange"];
  expandSelectionActionPopover: () => void;
  clearCanvasSelection: () => void;
  copyAllTracksInSelection: () => Promise<void>;
  copySelectedNotes: () => Promise<void>;
  cutAllTracksInSelection: () => Promise<void>;
  cutSelectedNotes: () => Promise<void>;
  deleteAllTracksInSelection: () => void;
  deleteSelectedNoteSelection: () => void;
  openExplodeSelectionDialog: () => void;
  clearCurrentProject: () => void;
  renameProject: (name: string) => void;
  exportAudio: () => Promise<void>;
  commitGlobalTempo: (tempo: Project["global"]["tempo"]) => void;
  commitGlobalMeter: (meter: Project["global"]["meter"]) => void;
  commitGlobalGrid: (gridBeats: Project["global"]["gridBeats"]) => void;
  addTrack: () => void;
  removeSelectedTrack: () => void;
  setPlayheadFromUser: ComposerViewProps["onSetPlayheadBeat"];
  requestTimelineActionsPopover: ComposerViewProps["onRequestTimelineActionsPopover"];
  closeTimelineActionsPopover: () => void;
  applyNoteClipboardPaste: ComposerViewProps["onPasteAtTimeline"];
  addLoopBoundary: ComposerViewProps["onAddLoopBoundary"];
  expandSelectedLoopToNotes: () => void;
  updateLoopRepeatCount: ComposerViewProps["onUpdateLoopRepeatCount"];
  removeLoopBoundary: (markerId: string) => void;
}

export function createComposerControllerProps(options: UseComposerControllerPropsOptions): ComposerControllerProps {
  const {
    addLoopBoundary,
    addTrack,
    applyNoteClipboardPaste,
    bindTrackMacroToAutomation,
    bindTrackVolumeToAutomation,
    canvasSelection,
    changeTrackMacro,
    clearCanvasSelection,
    clearCurrentProject,
    clipboard,
    closeTimelineActionsPopover,
    commitGlobalGrid,
    commitGlobalMeter,
    commitGlobalTempo,
    copyAllTracksInSelection,
    copySelectedNotes,
    cutAllTracksInSelection,
    cutSelectedNotes,
    deleteAllTracksInSelection,
    deleteNote,
    deleteSelectedNoteSelection,
    deleteTrackMacroAutomationKeyframeSide,
    duplicatePatchForSelectedTrack,
    endMarkerAtTimelineBeat,
    expandableLoopRegion,
    expandSelectedLoopToNotes,
    exportingAudio,
    exportAudio,
    hardwareNavigation,
    hasTimelineRangeSelection,
    invalidPatchIds,
    noteClipboardPayload,
    openExplodeSelectionDialog,
    openPitchPicker,
    patchWorkspace,
    playheadBeat,
    playback,
    playing,
    previewPlacedNote,
    previewSelectionActionScopeChange,
    previewTrackMacroAutomation,
    previewTrackVolume,
    project,
    projectMenuProps,
    recording,
    removeLoopBoundary,
    removeSelectedTrack,
    renameProject,
    renameTrack,
    requestRemoveSelectedTrackPatch,
    requestTimelineActionsPopover,
    selectedTrackId,
    selectedTrackInstrumentPatchId,
    selectedTrackPatch,
    selectionActionPopoverCollapsed,
    selectionActionPopoverVisible,
    setContentSelectionFromCanvas,
    setPlayheadFromUser,
    setSelectedTrackId,
    setSelectionMarqueeActive,
    setTimelineSelectionFromCanvas,
    setTrackVolume,
    splitTrackMacroAutomationKeyframe,
    startMarkerAtTimelineBeat,
    timelineActionsPopover,
    toggleTrackMacroAutomationLane,
    toggleTrackMacroPanel,
    toggleTrackMute,
    toggleTrackVolumeAutomationLane,
    unbindTrackMacroFromAutomation,
    unbindTrackVolumeFromAutomation,
    updateLoopRepeatCount,
    updateNote,
    updateTrackMacroAutomationKeyframeSide,
    updateTrackPatch,
    upsertNote,
    upsertTrackMacroAutomationKeyframe
  } = options;

  const trackActions: ComposerViewProps["trackActions"] = {
    onSelectTrack: setSelectedTrackId,
    onRenameTrack: renameTrack,
    onToggleTrackMute: toggleTrackMute,
    onSetTrackVolume: setTrackVolume,
    onPreviewTrackVolume: previewTrackVolume,
    onBindTrackVolumeToAutomation: bindTrackVolumeToAutomation,
    onUnbindTrackVolumeFromAutomation: unbindTrackVolumeFromAutomation,
    onToggleTrackVolumeAutomationLane: toggleTrackVolumeAutomationLane,
    onUpdateTrackPatch: updateTrackPatch,
    onToggleTrackMacroPanel: toggleTrackMacroPanel
  };
  const patchActions: ComposerViewProps["patchActions"] = {
    canRemoveSelectedPatch: Boolean(
      selectedTrackPatch &&
      (resolvePatchSource(selectedTrackPatch) === "custom" ||
        resolvePatchPresetStatus(selectedTrackPatch) === "legacy_preset")
    ),
    onDuplicateSelectedPatch: duplicatePatchForSelectedTrack,
    onRequestRemoveSelectedPatch: requestRemoveSelectedTrackPatch,
    onOpenSelectedPatchWorkspace: () => patchWorkspace.openPatchWorkspace(selectedTrackInstrumentPatchId)
  };
  const automationActions: ComposerViewProps["automationActions"] = {
    onChangeTrackMacro: changeTrackMacro,
    onBindTrackMacroToAutomation: bindTrackMacroToAutomation,
    onUnbindTrackMacroFromAutomation: unbindTrackMacroFromAutomation,
    onToggleTrackMacroAutomationLane: toggleTrackMacroAutomationLane,
    onUpsertTrackMacroAutomationKeyframe: upsertTrackMacroAutomationKeyframe,
    onSplitTrackMacroAutomationKeyframe: splitTrackMacroAutomationKeyframe,
    onUpdateTrackMacroAutomationKeyframeSide: updateTrackMacroAutomationKeyframeSide,
    onDeleteTrackMacroAutomationKeyframeSide: deleteTrackMacroAutomationKeyframeSide,
    onPreviewTrackMacroAutomation: previewTrackMacroAutomation
  };
  const noteActions: ComposerViewProps["noteActions"] = {
    onOpenPitchPicker: openPitchPicker,
    onPreviewPlacedNote: previewPlacedNote,
    onUpsertNote: upsertNote,
    onUpdateNote: updateNote,
    onDeleteNote: deleteNote
  };
  const selectionActions: ComposerViewProps["selectionActions"] = {
    onSetContentSelection: setContentSelectionFromCanvas,
    onSetTimelineSelectionBeatRange: setTimelineSelectionFromCanvas,
    onSetSelectionMarqueeActive: setSelectionMarqueeActive,
    onPreviewSelectionActionScopeChange: previewSelectionActionScopeChange,
    selectionActionPopoverCollapsed,
    onExpandSelectionActionPopover: options.expandSelectionActionPopover,
    onDismissSelectionActionPopover: clearCanvasSelection,
    onCopySelection: () => {
      void (hasTimelineRangeSelection ? copyAllTracksInSelection() : copySelectedNotes());
    },
    onCutSelection: () => {
      void (hasTimelineRangeSelection ? cutAllTracksInSelection() : cutSelectedNotes());
    },
    onDeleteSelection: () => {
      if (hasTimelineRangeSelection) {
        deleteAllTracksInSelection();
        return;
      }
      deleteSelectedNoteSelection();
    },
    onOpenExplodeSelectionDialog: openExplodeSelectionDialog,
    onCopyAllTracksInSelection: () => {
      void copyAllTracksInSelection();
    },
    onCutAllTracksInSelection: () => {
      void cutAllTracksInSelection();
    },
    onDeleteAllTracksInSelection: deleteAllTracksInSelection
  };

  const viewProps: ComposerViewProps = {
    project,
    ...projectMenuProps,
    selectedTrackId,
    defaultPitch: patchWorkspace.previewPitch,
    invalidPatchIds,
    canvasSelection,
    playheadBeat,
    activeRecordedNotes: recording.activeRecordedNotes,
    keyboardPlacementNote: hardwareNavigation.activePlacement
      ? {
          trackId: hardwareNavigation.activePlacement.trackId,
          noteId: hardwareNavigation.activePlacement.noteId
        }
      : null,
    ghostPreviewNote: hardwareNavigation.ghostPreviewNote,
    tabSelectionPreviewNote: hardwareNavigation.tabSelectionPreviewNote,
    ghostPlayheadBeat: recording.ghostPlayheadBeat ?? undefined,
    countInLabel: recording.countInLabel ?? undefined,
    timelineActionsPopover,
    selectionActionPopoverVisible,
    noteClipboardPayload,
    playheadFocused: hardwareNavigation.playheadNavigationFocused,
    selectedContentTabStopFocusToken: hardwareNavigation.selectedContentTabStopFocusToken,
    startMarkerAtTimelineBeat,
    endMarkerAtTimelineBeat,
    expandableLoopRegion,
    recordingDisabled: recording.recordEnabled,
    isPlaying: playing || recording.recordPhase === "count_in",
    recordEnabled: recording.recordEnabled,
    recordPhase: recording.recordPhase,
    exportingAudio,
    onOpenDefaultPitchPicker: () => patchWorkspace.setPreviewPitchPickerOpen(true),
    onPlay: playback.startPlayback,
    onStop: playback.stopPlayback,
    onToggleRecord: () => {
      if (recording.recordEnabled || recording.recordPhase !== "idle") {
        playback.stopPlayback(true);
        return;
      }
      playback.stopPlayback(true);
      void recording.startRecordMode();
    },
    onClearCurrentProject: clearCurrentProject,
    onRenameProject: renameProject,
    onOpenPatchWorkspace: () => patchWorkspace.openPatchWorkspace(),
    onExportAudio: () => {
      void exportAudio();
    },
    onTempoChange: commitGlobalTempo,
    onMeterChange: commitGlobalMeter,
    onGridChange: commitGlobalGrid,
    onAddTrack: addTrack,
    onRemoveTrack: removeSelectedTrack,
    onSetPlayheadBeat: setPlayheadFromUser,
    onReturnSelectedNoteFocusToPlayhead: hardwareNavigation.returnSelectionFocusToPlayhead,
    onRequestTimelineActionsPopover: requestTimelineActionsPopover,
    onCloseTimelineActionsPopover: closeTimelineActionsPopover,
    onPasteAtTimeline: applyNoteClipboardPaste,
    onAddLoopBoundary: addLoopBoundary,
    onExpandLoopToNotes: expandSelectedLoopToNotes,
    onUpdateLoopRepeatCount: (repeatCount) => {
      if (endMarkerAtTimelineBeat) {
        updateLoopRepeatCount(repeatCount);
      }
    },
    onRemoveStartLoopBoundary: () => {
      if (startMarkerAtTimelineBeat) {
        removeLoopBoundary(startMarkerAtTimelineBeat.id);
      }
    },
    onRemoveEndLoopBoundary: () => {
      if (endMarkerAtTimelineBeat) {
        removeLoopBoundary(endMarkerAtTimelineBeat.id);
      }
    },
    trackActions,
    patchActions,
    automationActions,
    noteActions,
    selectionActions
  };

  return {
    clipboard,
    viewProps
  };
}

interface UsePatchWorkspaceControllerPropsOptions {
  project: Project;
  projectAssets: ProjectAssetLibrary;
  playheadBeat: number;
  selectedPatch: Patch;
  projectMenuProps: ProjectMenuProps;
  validationIssues: UsePatchWorkspaceControllerOptions["validationIssues"];
  selectedPatchHasErrors: boolean;
  patchWorkspace: PatchWorkspaceState;
  onWriteClipboardPayload: UsePatchWorkspaceControllerOptions["onWriteClipboardPayload"];
  onUpsertSamplePlayerAssetData: UsePatchWorkspaceControllerOptions["onUpsertSamplePlayerAssetData"];
  commitProjectChange: UsePatchWorkspaceControllerOptions["commitProjectChange"];
  setProjectAssets: UsePatchWorkspaceControllerOptions["setProjectAssets"];
  setRuntimeError: UsePatchWorkspaceControllerOptions["setRuntimeError"];
}

export function createPatchWorkspaceControllerProps(
  options: UsePatchWorkspaceControllerPropsOptions
): UsePatchWorkspaceControllerOptions {
  return {
    project: options.project,
    projectAssets: options.projectAssets,
    playheadBeat: options.playheadBeat,
    selectedPatch: options.selectedPatch,
    ...options.projectMenuProps,
    validationIssues: options.validationIssues,
    selectedPatchHasErrors: options.selectedPatchHasErrors,
    patchWorkspace: options.patchWorkspace,
    onWriteClipboardPayload: options.onWriteClipboardPayload,
    onUpsertSamplePlayerAssetData: options.onUpsertSamplePlayerAssetData,
    commitProjectChange: options.commitProjectChange,
    setProjectAssets: options.setProjectAssets,
    setRuntimeError: options.setRuntimeError
  };
}

interface ProjectCommitActionsOptions {
  commitProjectChange: UsePatchWorkspaceControllerOptions["commitProjectChange"];
}

export function createProjectGlobalCommitActions({ commitProjectChange }: ProjectCommitActionsOptions) {
  return {
    commitGlobalTempo: (tempo: Project["global"]["tempo"]) =>
      commitProjectChange((current) => ({ ...current, global: { ...current.global, tempo } }), {
        actionKey: "global:tempo"
      }),
    commitGlobalMeter: (meter: Project["global"]["meter"]) =>
      commitProjectChange((current) => ({ ...current, global: { ...current.global, meter } }), {
        actionKey: "global:meter"
      }),
    commitGlobalGrid: (gridBeats: Project["global"]["gridBeats"]) =>
      commitProjectChange((current) => ({ ...current, global: { ...current.global, gridBeats } }), {
        actionKey: "global:grid"
      })
  };
}

export interface AppRootRuntimeRefs {
  audioEngineRef: RefObject<AudioEngine | null>;
}

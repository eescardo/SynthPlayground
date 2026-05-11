"use client";

import type { RefObject } from "react";
import type { AudioEngine } from "@/audio/engine";
import type { ComposerControllerProps } from "@/components/app/ComposerController";
import type { ComposerProjectMenuProps, ComposerViewProps } from "@/components/app/ComposerView";
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

type ProjectMenuProps = ComposerProjectMenuProps;

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

interface ComposerProjectState {
  project: Project;
  selectedTrackId: string;
  selectedTrackPatch?: Patch;
  selectedTrackInstrumentPatchId: string;
  invalidPatchIds: ComposerViewProps["invalidPatchIds"];
  canvasSelection: ComposerViewProps["canvasSelection"];
}

interface ComposerRuntimeState {
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
}

interface ComposerTimelineState {
  timelineActionsPopover: ComposerViewProps["timeline"]["timelineActionsPopover"];
  selectionActionPopoverVisible: boolean;
  noteClipboardPayload: unknown;
  startMarkerAtTimelineBeat: ComposerViewProps["timeline"]["startMarkerAtTimelineBeat"];
  endMarkerAtTimelineBeat: ComposerViewProps["timeline"]["endMarkerAtTimelineBeat"];
  expandableLoopRegion: boolean;
  selectionActionPopoverCollapsed: boolean;
}

interface ComposerPrimaryActions {
  clearCurrentProject: () => void;
  renameProject: (name: string) => void;
  exportAudio: () => Promise<void>;
  commitGlobalTempo: (tempo: Project["global"]["tempo"]) => void;
  commitGlobalMeter: (meter: Project["global"]["meter"]) => void;
  commitGlobalGrid: (gridBeats: Project["global"]["gridBeats"]) => void;
  addTrack: () => void;
  removeSelectedTrack: () => void;
  setPlayheadFromUser: ComposerViewProps["projectActions"]["onSetPlayheadBeat"];
}

interface ComposerTimelineActions {
  requestTimelineActionsPopover: ComposerViewProps["timelineActions"]["onRequestTimelineActionsPopover"];
  closeTimelineActionsPopover: () => void;
  applyNoteClipboardPaste: ComposerViewProps["timelineActions"]["onPasteAtTimeline"];
  addLoopBoundary: ComposerViewProps["timelineActions"]["onAddLoopBoundary"];
  expandSelectedLoopToNotes: () => void;
  updateLoopRepeatCount: ComposerViewProps["timelineActions"]["onUpdateLoopRepeatCount"];
  removeLoopBoundary: (markerId: string) => void;
}

interface CreateTrackCanvasActionGroupsOptions {
  selectedTrackInstrumentPatchId: string;
  selectedTrackPatch?: Patch;
  patchWorkspace: Pick<PatchWorkspaceState, "openPatchWorkspace">;
  hasTimelineRangeSelection: boolean;
  selectionActionPopoverCollapsed: boolean;
  setSelectedTrackId: (trackId: string | undefined) => void;
  renameTrack: ComposerViewProps["trackActions"]["onRenameTrack"];
  toggleTrackMute: ComposerViewProps["trackActions"]["onToggleTrackMute"];
  setTrackVolume: ComposerViewProps["trackActions"]["onSetTrackVolume"];
  previewTrackVolume: ComposerViewProps["trackActions"]["onPreviewTrackVolume"];
  bindTrackVolumeToAutomation: ComposerViewProps["trackActions"]["onBindTrackVolumeToAutomation"];
  unbindTrackVolumeFromAutomation: ComposerViewProps["trackActions"]["onUnbindTrackVolumeFromAutomation"];
  toggleTrackVolumeAutomationLane: ComposerViewProps["trackActions"]["onToggleTrackVolumeAutomationLane"];
  updateTrackPatch: ComposerViewProps["trackActions"]["onUpdateTrackPatch"];
  toggleTrackMacroPanel: ComposerViewProps["trackActions"]["onToggleTrackMacroPanel"];
  duplicatePatchForSelectedTrack: ComposerViewProps["patchActions"]["onDuplicateSelectedPatch"];
  requestRemoveSelectedTrackPatch: ComposerViewProps["patchActions"]["onRequestRemoveSelectedPatch"];
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
  expandSelectionActionPopover: NonNullable<ComposerViewProps["selectionActions"]["onExpandSelectionActionPopover"]>;
  clearCanvasSelection: NonNullable<ComposerViewProps["selectionActions"]["onDismissSelectionActionPopover"]>;
  copyAllTracksInSelection: () => Promise<void>;
  copySelectedNotes: () => Promise<void>;
  cutAllTracksInSelection: () => Promise<void>;
  cutSelectedNotes: () => Promise<void>;
  deleteAllTracksInSelection: ComposerViewProps["selectionActions"]["onDeleteAllTracksInSelection"];
  deleteSelectedNoteSelection: () => void;
  openExplodeSelectionDialog: NonNullable<ComposerViewProps["selectionActions"]["onOpenExplodeSelectionDialog"]>;
}

export function createTrackCanvasActionGroups(options: CreateTrackCanvasActionGroupsOptions) {
  const trackActions: ComposerViewProps["trackActions"] = {
    onSelectTrack: options.setSelectedTrackId,
    onRenameTrack: options.renameTrack,
    onToggleTrackMute: options.toggleTrackMute,
    onSetTrackVolume: options.setTrackVolume,
    onPreviewTrackVolume: options.previewTrackVolume,
    onBindTrackVolumeToAutomation: options.bindTrackVolumeToAutomation,
    onUnbindTrackVolumeFromAutomation: options.unbindTrackVolumeFromAutomation,
    onToggleTrackVolumeAutomationLane: options.toggleTrackVolumeAutomationLane,
    onUpdateTrackPatch: options.updateTrackPatch,
    onToggleTrackMacroPanel: options.toggleTrackMacroPanel
  };
  const patchActions: ComposerViewProps["patchActions"] = {
    canRemoveSelectedPatch: Boolean(
      options.selectedTrackPatch &&
      (resolvePatchSource(options.selectedTrackPatch) === "custom" ||
        resolvePatchPresetStatus(options.selectedTrackPatch) === "legacy_preset")
    ),
    onDuplicateSelectedPatch: options.duplicatePatchForSelectedTrack,
    onRequestRemoveSelectedPatch: options.requestRemoveSelectedTrackPatch,
    onOpenSelectedPatchWorkspace: () =>
      options.patchWorkspace.openPatchWorkspace(options.selectedTrackInstrumentPatchId)
  };
  const automationActions: ComposerViewProps["automationActions"] = {
    onChangeTrackMacro: options.changeTrackMacro,
    onBindTrackMacroToAutomation: options.bindTrackMacroToAutomation,
    onUnbindTrackMacroFromAutomation: options.unbindTrackMacroFromAutomation,
    onToggleTrackMacroAutomationLane: options.toggleTrackMacroAutomationLane,
    onUpsertTrackMacroAutomationKeyframe: options.upsertTrackMacroAutomationKeyframe,
    onSplitTrackMacroAutomationKeyframe: options.splitTrackMacroAutomationKeyframe,
    onUpdateTrackMacroAutomationKeyframeSide: options.updateTrackMacroAutomationKeyframeSide,
    onDeleteTrackMacroAutomationKeyframeSide: options.deleteTrackMacroAutomationKeyframeSide,
    onPreviewTrackMacroAutomation: options.previewTrackMacroAutomation
  };
  const noteActions: ComposerViewProps["noteActions"] = {
    onOpenPitchPicker: options.openPitchPicker,
    onPreviewPlacedNote: options.previewPlacedNote,
    onUpsertNote: options.upsertNote,
    onUpdateNote: options.updateNote,
    onDeleteNote: options.deleteNote
  };
  const selectionActions: ComposerViewProps["selectionActions"] = {
    onSetContentSelection: options.setContentSelectionFromCanvas,
    onSetTimelineSelectionBeatRange: options.setTimelineSelectionFromCanvas,
    onSetSelectionMarqueeActive: options.setSelectionMarqueeActive,
    onPreviewSelectionActionScopeChange: options.previewSelectionActionScopeChange,
    selectionActionPopoverCollapsed: options.selectionActionPopoverCollapsed,
    onExpandSelectionActionPopover: options.expandSelectionActionPopover,
    onDismissSelectionActionPopover: options.clearCanvasSelection,
    onCopySelection: () => {
      void (options.hasTimelineRangeSelection ? options.copyAllTracksInSelection() : options.copySelectedNotes());
    },
    onCutSelection: () => {
      void (options.hasTimelineRangeSelection ? options.cutAllTracksInSelection() : options.cutSelectedNotes());
    },
    onDeleteSelection: () => {
      if (options.hasTimelineRangeSelection) {
        options.deleteAllTracksInSelection();
        return;
      }
      options.deleteSelectedNoteSelection();
    },
    onOpenExplodeSelectionDialog: options.openExplodeSelectionDialog,
    onCopyAllTracksInSelection: () => {
      void options.copyAllTracksInSelection();
    },
    onCutAllTracksInSelection: () => {
      void options.cutAllTracksInSelection();
    },
    onDeleteAllTracksInSelection: options.deleteAllTracksInSelection
  };

  return {
    trackActions,
    patchActions,
    automationActions,
    noteActions,
    selectionActions
  };
}

interface UseComposerControllerPropsOptions {
  clipboard: ComposerControllerProps["clipboard"];
  projectMenuProps: ProjectMenuProps;
  projectState: ComposerProjectState;
  runtimeState: ComposerRuntimeState;
  timelineState: ComposerTimelineState;
  exportingAudio: boolean;
  primaryActions: ComposerPrimaryActions;
  timelineActions: ComposerTimelineActions;
  trackActions: ComposerViewProps["trackActions"];
  patchActions: ComposerViewProps["patchActions"];
  automationActions: ComposerViewProps["automationActions"];
  noteActions: ComposerViewProps["noteActions"];
  selectionActions: ComposerViewProps["selectionActions"];
}

export function createComposerControllerProps(options: UseComposerControllerPropsOptions): ComposerControllerProps {
  const {
    automationActions,
    clipboard,
    exportingAudio,
    noteActions,
    patchActions,
    primaryActions,
    projectMenuProps,
    projectState,
    runtimeState,
    selectionActions,
    timelineActions,
    timelineState,
    trackActions
  } = options;
  const { canvasSelection, invalidPatchIds, project, selectedTrackId } = projectState;
  const { hardwareNavigation, patchWorkspace, playback, playheadBeat, playing, recording } = runtimeState;
  const {
    endMarkerAtTimelineBeat,
    expandableLoopRegion,
    noteClipboardPayload,
    selectionActionPopoverVisible,
    startMarkerAtTimelineBeat,
    timelineActionsPopover
  } = timelineState;

  const viewProps: ComposerViewProps = {
    project,
    selectedTrackId,
    defaultPitch: patchWorkspace.previewPitch,
    invalidPatchIds,
    canvasSelection,
    projectMenu: projectMenuProps,
    transport: {
      playheadBeat,
      exportingAudio
    },
    recording: {
      activeRecordedNotes: recording.activeRecordedNotes,
      ghostPlayheadBeat: recording.ghostPlayheadBeat ?? undefined,
      countInLabel: recording.countInLabel ?? undefined,
      recordingDisabled: recording.recordEnabled,
      isPlaying: playing || recording.recordPhase === "count_in",
      recordEnabled: recording.recordEnabled,
      recordPhase: recording.recordPhase
    },
    canvasPreview: {
      keyboardPlacementNote: hardwareNavigation.activePlacement
        ? {
            trackId: hardwareNavigation.activePlacement.trackId,
            noteId: hardwareNavigation.activePlacement.noteId
          }
        : null,
      ghostPreviewNote: hardwareNavigation.ghostPreviewNote,
      tabSelectionPreviewNote: hardwareNavigation.tabSelectionPreviewNote,
      playheadFocused: hardwareNavigation.playheadNavigationFocused,
      selectedContentTabStopFocusToken: hardwareNavigation.selectedContentTabStopFocusToken,
      selectionActionPopoverVisible
    },
    timeline: {
      timelineActionsPopover,
      noteClipboardPayload,
      startMarkerAtTimelineBeat,
      endMarkerAtTimelineBeat,
      expandableLoopRegion
    },
    projectActions: {
      onOpenDefaultPitchPicker: () => patchWorkspace.setPreviewPitchPickerOpen(true),
      onClearCurrentProject: primaryActions.clearCurrentProject,
      onRenameProject: primaryActions.renameProject,
      onOpenPatchWorkspace: () => patchWorkspace.openPatchWorkspace(),
      onExportAudio: () => {
        void primaryActions.exportAudio();
      },
      onTempoChange: primaryActions.commitGlobalTempo,
      onMeterChange: primaryActions.commitGlobalMeter,
      onGridChange: primaryActions.commitGlobalGrid,
      onAddTrack: primaryActions.addTrack,
      onRemoveTrack: primaryActions.removeSelectedTrack,
      onSetPlayheadBeat: primaryActions.setPlayheadFromUser,
      onReturnSelectedNoteFocusToPlayhead: hardwareNavigation.returnSelectionFocusToPlayhead
    },
    transportActions: {
      onPlay: playback.startPlayback,
      onStop: playback.stopPlayback,
      onToggleRecord: () => {
        if (recording.recordEnabled || recording.recordPhase !== "idle") {
          playback.stopPlayback(true);
          return;
        }
        playback.stopPlayback(true);
        void recording.startRecordMode();
      }
    },
    timelineActions: {
      onRequestTimelineActionsPopover: timelineActions.requestTimelineActionsPopover,
      onCloseTimelineActionsPopover: timelineActions.closeTimelineActionsPopover,
      onPasteAtTimeline: timelineActions.applyNoteClipboardPaste,
      onAddLoopBoundary: timelineActions.addLoopBoundary,
      onExpandLoopToNotes: timelineActions.expandSelectedLoopToNotes,
      onUpdateLoopRepeatCount: (repeatCount) => {
        if (endMarkerAtTimelineBeat) {
          timelineActions.updateLoopRepeatCount(repeatCount);
        }
      },
      onRemoveStartLoopBoundary: () => {
        if (startMarkerAtTimelineBeat) {
          timelineActions.removeLoopBoundary(startMarkerAtTimelineBeat.id);
        }
      },
      onRemoveEndLoopBoundary: () => {
        if (endMarkerAtTimelineBeat) {
          timelineActions.removeLoopBoundary(endMarkerAtTimelineBeat.id);
        }
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

interface CreateComposerPrimaryActionsOptions extends ProjectCommitActionsOptions {
  clearCurrentProject: () => void;
  renameProject: (name: string) => void;
  exportAudio: () => Promise<void>;
  addTrack: () => void;
  removeSelectedTrack: () => void;
  setPlayheadFromUser: ComposerViewProps["projectActions"]["onSetPlayheadBeat"];
}

export function createComposerPrimaryActions({
  addTrack,
  clearCurrentProject,
  commitProjectChange,
  exportAudio,
  removeSelectedTrack,
  renameProject,
  setPlayheadFromUser
}: CreateComposerPrimaryActionsOptions): ComposerPrimaryActions {
  return {
    clearCurrentProject,
    renameProject,
    exportAudio,
    ...createProjectGlobalCommitActions({ commitProjectChange }),
    addTrack,
    removeSelectedTrack,
    setPlayheadFromUser
  };
}

interface CreateComposerTimelineActionsOptions {
  requestTimelineActionsPopover: ComposerViewProps["timelineActions"]["onRequestTimelineActionsPopover"];
  setTimelineActionsPopover: (request: ComposerViewProps["timeline"]["timelineActionsPopover"]) => void;
  applyNoteClipboardPaste: ComposerViewProps["timelineActions"]["onPasteAtTimeline"];
  addLoopBoundary: ComposerViewProps["timelineActions"]["onAddLoopBoundary"];
  expandSelectedLoopToNotes: () => void;
  endMarkerAtTimelineBeat: ComposerViewProps["timeline"]["endMarkerAtTimelineBeat"];
  updateLoopRepeatCount: (markerId: string, repeatCount: number) => void;
  removeLoopBoundary: (markerId: string) => void;
}

export function createComposerTimelineActions({
  addLoopBoundary,
  applyNoteClipboardPaste,
  endMarkerAtTimelineBeat,
  expandSelectedLoopToNotes,
  removeLoopBoundary,
  requestTimelineActionsPopover,
  setTimelineActionsPopover,
  updateLoopRepeatCount
}: CreateComposerTimelineActionsOptions): ComposerTimelineActions {
  return {
    requestTimelineActionsPopover,
    closeTimelineActionsPopover: () => setTimelineActionsPopover(null),
    applyNoteClipboardPaste,
    addLoopBoundary,
    expandSelectedLoopToNotes,
    updateLoopRepeatCount: (repeatCount) => {
      if (endMarkerAtTimelineBeat) {
        updateLoopRepeatCount(endMarkerAtTimelineBeat.id, repeatCount);
      }
    },
    removeLoopBoundary
  };
}

export interface AppRootRuntimeRefs {
  audioEngineRef: RefObject<AudioEngine | null>;
}

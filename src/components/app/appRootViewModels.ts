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
import { isPatchRemovable } from "@/lib/patch/source";
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
  deleteCurrentProject: () => Promise<void>;
  exportJson: () => void;
  openRecentProject: (projectId: string) => Promise<void>;
  resetToDefaultProject: () => Promise<void>;
  importJson: (file: File) => Promise<void>;
}

export function createProjectMenuProps(options: UseProjectMenuPropsOptions): ProjectMenuProps {
  const {
    createNewProject,
    deleteCurrentProject,
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
    onDeleteCurrentProject: () => {
      void deleteCurrentProject();
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
  timeline: ComposerViewProps["timeline"];
  canvasPreview: Pick<ComposerViewProps["canvasPreview"], "selectionActionPopoverVisible" | "selectionMarqueeActive">;
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
  toggleCompositionEndFollow: ComposerViewProps["timelineActions"]["onToggleCompositionEndFollow"];
  updateCompositionEndBeat: ComposerViewProps["timelineActions"]["onUpdateCompositionEndBeat"];
}

interface CreateTrackCanvasActionGroupsOptions {
  selectedTrack: {
    instrumentPatchId: string;
    patch?: Patch;
  };
  patchWorkspace: Pick<PatchWorkspaceState, "openPatchWorkspace">;
  selectionState: {
    hasTimelineRangeSelection: boolean;
    actionPopoverCollapsed: boolean;
  };
  trackActions: ComposerViewProps["trackActions"];
  patchActions: Pick<ComposerViewProps["patchActions"], "onDuplicateSelectedPatch" | "onRequestRemoveSelectedPatch">;
  automationActions: ComposerViewProps["automationActions"];
  noteActions: ComposerViewProps["noteActions"];
  selectionActions: Pick<
    ComposerViewProps["selectionActions"],
    | "onSetContentSelection"
    | "onSetTimelineSelectionBeatRange"
    | "onSetSelectionMarqueeActive"
    | "onPreviewSelectionActionScopeChange"
    | "onExpandSelectionActionPopover"
    | "onDismissSelectionActionPopover"
    | "onInsertTimeInSelection"
    | "onOpenExplodeSelectionDialog"
    | "onDeleteAllTracksInSelection"
  > & {
    copyAllTracksInSelection: () => Promise<void>;
    copySelectedNotes: () => Promise<void>;
    cutAllTracksInSelection: () => Promise<void>;
    cutSelectedNotes: () => Promise<void>;
    deleteSelectedNoteSelection: () => void;
  };
}

export function createTrackCanvasActionGroups(options: CreateTrackCanvasActionGroupsOptions) {
  const { selectionActions, selectionState } = options;
  const patchActions: ComposerViewProps["patchActions"] = {
    canRemoveSelectedPatch: Boolean(options.selectedTrack.patch && isPatchRemovable(options.selectedTrack.patch)),
    onDuplicateSelectedPatch: options.patchActions.onDuplicateSelectedPatch,
    onRequestRemoveSelectedPatch: options.patchActions.onRequestRemoveSelectedPatch,
    onOpenSelectedPatchWorkspace: () =>
      options.patchWorkspace.openPatchWorkspace(options.selectedTrack.instrumentPatchId)
  };
  const composerSelectionActions: ComposerViewProps["selectionActions"] = {
    onSetContentSelection: selectionActions.onSetContentSelection,
    onSetTimelineSelectionBeatRange: selectionActions.onSetTimelineSelectionBeatRange,
    onSetSelectionMarqueeActive: selectionActions.onSetSelectionMarqueeActive,
    onPreviewSelectionActionScopeChange: selectionActions.onPreviewSelectionActionScopeChange,
    selectionActionPopoverCollapsed: selectionState.actionPopoverCollapsed,
    onExpandSelectionActionPopover: selectionActions.onExpandSelectionActionPopover,
    onDismissSelectionActionPopover: selectionActions.onDismissSelectionActionPopover,
    onCopySelection: () => {
      void (selectionState.hasTimelineRangeSelection
        ? selectionActions.copyAllTracksInSelection()
        : selectionActions.copySelectedNotes());
    },
    onCutSelection: () => {
      void (selectionState.hasTimelineRangeSelection
        ? selectionActions.cutAllTracksInSelection()
        : selectionActions.cutSelectedNotes());
    },
    onDeleteSelection: () => {
      if (selectionState.hasTimelineRangeSelection) {
        selectionActions.onDeleteAllTracksInSelection();
        return;
      }
      selectionActions.deleteSelectedNoteSelection();
    },
    onInsertTimeInSelection: selectionState.hasTimelineRangeSelection
      ? selectionActions.onInsertTimeInSelection
      : undefined,
    onOpenExplodeSelectionDialog: selectionActions.onOpenExplodeSelectionDialog,
    onCopyAllTracksInSelection: () => {
      void selectionActions.copyAllTracksInSelection();
    },
    onCutAllTracksInSelection: () => {
      void selectionActions.cutAllTracksInSelection();
    },
    onDeleteAllTracksInSelection: selectionActions.onDeleteAllTracksInSelection
  };

  return {
    trackActions: options.trackActions,
    patchActions,
    automationActions: options.automationActions,
    noteActions: options.noteActions,
    selectionActions: composerSelectionActions
  };
}

interface UseComposerControllerPropsOptions {
  clipboard: ComposerControllerProps["clipboard"];
  projectMenuProps: ProjectMenuProps;
  projectState: ComposerProjectState;
  runtimeState: ComposerRuntimeState;
  runtimeErrorMessage?: string | null;
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
    runtimeErrorMessage,
    selectionActions,
    timelineActions,
    timelineState,
    trackActions
  } = options;
  const { canvasSelection, invalidPatchIds, project, selectedTrackId } = projectState;
  const { hardwareNavigation, patchWorkspace, playback, playheadBeat, playing, recording } = runtimeState;

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
    runtimeErrorMessage,
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
      ...timelineState.canvasPreview
    },
    timeline: timelineState.timeline,
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
        if (timelineState.timeline.endMarkerAtTimelineBeat) {
          timelineActions.updateLoopRepeatCount(repeatCount);
        }
      },
      onRemoveStartLoopBoundary: () => {
        if (timelineState.timeline.startMarkerAtTimelineBeat) {
          timelineActions.removeLoopBoundary(timelineState.timeline.startMarkerAtTimelineBeat.id);
        }
      },
      onRemoveEndLoopBoundary: () => {
        if (timelineState.timeline.endMarkerAtTimelineBeat) {
          timelineActions.removeLoopBoundary(timelineState.timeline.endMarkerAtTimelineBeat.id);
        }
      },
      onToggleCompositionEndFollow: timelineActions.toggleCompositionEndFollow,
      onUpdateCompositionEndBeat: timelineActions.updateCompositionEndBeat
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
  runtimeErrorMessage?: string | null;
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
    runtimeErrorMessage: options.runtimeErrorMessage,
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
  toggleCompositionEndFollow: ComposerViewProps["timelineActions"]["onToggleCompositionEndFollow"];
  updateCompositionEndBeat: ComposerViewProps["timelineActions"]["onUpdateCompositionEndBeat"];
}

export function createComposerTimelineActions({
  addLoopBoundary,
  applyNoteClipboardPaste,
  endMarkerAtTimelineBeat,
  expandSelectedLoopToNotes,
  removeLoopBoundary,
  requestTimelineActionsPopover,
  setTimelineActionsPopover,
  toggleCompositionEndFollow,
  updateCompositionEndBeat,
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
    removeLoopBoundary,
    toggleCompositionEndFollow,
    updateCompositionEndBeat
  };
}

export interface AppRootRuntimeRefs {
  audioEngineRef: RefObject<AudioEngine | null>;
}

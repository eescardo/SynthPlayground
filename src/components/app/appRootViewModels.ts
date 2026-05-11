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
  timelineActionsPopover: ComposerViewProps["timelineActionsPopover"];
  selectionActionPopoverVisible: boolean;
  noteClipboardPayload: unknown;
  startMarkerAtTimelineBeat: ComposerViewProps["startMarkerAtTimelineBeat"];
  endMarkerAtTimelineBeat: ComposerViewProps["endMarkerAtTimelineBeat"];
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
  setPlayheadFromUser: ComposerViewProps["onSetPlayheadBeat"];
}

interface ComposerTimelineActions {
  requestTimelineActionsPopover: ComposerViewProps["onRequestTimelineActionsPopover"];
  closeTimelineActionsPopover: () => void;
  applyNoteClipboardPaste: ComposerViewProps["onPasteAtTimeline"];
  addLoopBoundary: ComposerViewProps["onAddLoopBoundary"];
  expandSelectedLoopToNotes: () => void;
  updateLoopRepeatCount: ComposerViewProps["onUpdateLoopRepeatCount"];
  removeLoopBoundary: (markerId: string) => void;
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
    onReturnSelectedNoteFocusToPlayhead: hardwareNavigation.returnSelectionFocusToPlayhead,
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

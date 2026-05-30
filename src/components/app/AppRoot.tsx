"use client";

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toAudioProject } from "@/audio/audioProject";
import { AudioEngine } from "@/audio/engine";
import { ComposerControllerProps } from "@/components/app/ComposerController";
import { AudioDebugPanel } from "@/components/app/AudioDebugPanel";
import { BrowserCompatibilityDialog } from "@/components/app/BrowserCompatibilityDialog";
import {
  createComposerPrimaryActions,
  createComposerControllerProps,
  createComposerTimelineActions,
  createPatchWorkspaceControllerProps,
  createProjectMenuProps,
  createTrackCanvasActionGroups
} from "@/components/app/appRootViewModels";
import { PatchRemovalDialogModal } from "@/components/composer/PatchRemovalDialogModal";
import { PresetUpdateDialogModal } from "@/components/composer/PresetUpdateDialogModal";
import { PitchPickerModal } from "@/components/composer/PitchPickerModal";
import { RecordingDock } from "@/components/composer/RecordingDock";
import { ExplodeSelectionDialog } from "@/components/ExplodeSelectionDialog";
import { downloadJsonFile } from "@/lib/browserDownloads";
import { LoopConflictDialog } from "@/components/LoopConflictDialog";
import { TimelineActionsPopoverRequest, TrackCanvasSelection } from "@/components/tracks/TrackCanvas";
import { createId } from "@/lib/ids";
import { expandLoopRegionToNotes, getSanitizedLoopMarkers, getUniqueMatchedLoopRegionAtBeat } from "@/lib/looping";
import { getProjectTimelineEndBeat, getTrackPreviewStateAtBeat } from "@/lib/macroAutomation";
import { DEFAULT_NOTE_PITCH } from "@/lib/noteDefaults";
import {
  BeatRange,
  clearEditorSelection,
  ContentSelection,
  createEmptyEditorSelection,
  filterEditorSelectionToProject,
  getContentSelectionLabel,
  getEditorSelectionBeatRange,
  getEditorSelectionSourceTrackId,
  hasContentSelection,
  setEditorContentSelection,
  setEditorSelectionActionScopePreview,
  setEditorSelectionMarqueeActive,
  setEditorTimelineSelection
} from "@/lib/clipboard";
import { pushHistory, redoHistory, undoHistory } from "@/lib/history";
import { freezeProjectSnapshot } from "@/lib/projectImmutability";
import { compilePatchPlan, validatePatch } from "@/lib/patch/validation";
import { renameProjectInProject } from "@/lib/projectManagement";
import { getProjectPresetUpdateSummary, isPatchRemovable, updateProjectPresetsToLatest } from "@/lib/patch/source";
import { exportProjectToJson } from "@/lib/projectSerde";
import { pitchToVoct } from "@/lib/pitch";
import { createSproutError, reportSproutErrorToConsole, toError } from "@/lib/sproutErrors";
import {
  buildMissingSampleAssetIssues,
  createEmptyProjectAssetLibrary,
  upsertSamplePlayerAssetData
} from "@/lib/sampleAssetLibrary";
import { removeTrackFromProject, renameTrackInProject, switchTrackPatchInProject } from "@/lib/trackEdits";
import { useNoteEditor } from "@/hooks/useNoteEditor";
import { useLoopSettings } from "@/hooks/useLoopSettings";
import { useExplodeSelectionDialog } from "@/hooks/useExplodeSelectionDialog";
import { useEditorClipboardEvents } from "@/hooks/useEditorClipboardEvents";
import { useEditActionKeyboardShortcuts } from "@/hooks/useEditActionKeyboardShortcuts";
import { useDismissiblePopover } from "@/hooks/useDismissiblePopover";
import { useComposerTransientUi } from "@/hooks/useComposerTransientUi";
import { useNoteClipboard } from "@/hooks/useNoteClipboard";
import { usePlatformShortcuts } from "@/hooks/usePlatformShortcuts";
import { usePlaybackController } from "@/hooks/usePlaybackController";
import { useProjectLifecycleActions } from "@/hooks/useProjectLifecycleActions";
import { useProjectRecents } from "@/hooks/useProjectRecents";
import { useProjectAudioActions } from "@/hooks/useProjectAudioActions";
import { useTrackMacroPanelState } from "@/hooks/useTrackMacroPanelState";
import { useRecordingController } from "@/hooks/useRecordingController";
import { useSelectionClipboardActions } from "@/hooks/useSelectionClipboardActions";
import { usePitchPickerHotkeys } from "@/hooks/usePitchPickerHotkeys";
import { useHardwareNavigation } from "@/hooks/useHardwareNavigation";
import { useHardwareNavigationPreview } from "@/hooks/useHardwareNavigationPreview";
import { createProjectHistory, useAppBootstrap } from "@/hooks/app/useAppBootstrap";
import { useWasmReadiness } from "@/hooks/app/useWasmReadiness";
import { UsePatchWorkspaceControllerOptions } from "@/hooks/patch/usePatchWorkspaceController";
import { usePatchWorkspaceState } from "@/hooks/patch/usePatchWorkspaceState";
import {
  buildPatchRemovalRequest,
  hasInvalidPatchRemovalFallback,
  removePatchFromProject,
  resolveSurvivingTrackIds
} from "@/lib/patch/patchRemoval";
import { useTrackMacroAutomationActions } from "@/hooks/tracks/useTrackMacroAutomationActions";
import { useTrackVolumeAutomationActions } from "@/hooks/tracks/useTrackVolumeAutomationActions";
import { ProjectAssetLibrary, SamplePlayerAssetData } from "@/types/assets";
import { Project } from "@/types/music";
import { PatchValidationIssue } from "@/types/patch";

interface AppRootContextValue {
  composerControllerProps: ComposerControllerProps;
  patchWorkspaceControllerProps: UsePatchWorkspaceControllerOptions;
}

const AppRootContext = createContext<AppRootContextValue | null>(null);

export const useAppRoot = () => {
  const context = useContext(AppRootContext);
  if (!context) {
    throw new Error("useAppRoot must be used within AppRoot.");
  }
  return context;
};

export function AppRoot({ children }: { children: ReactNode }) {
  const [playing, setPlaying] = useState(false);
  const [playheadBeat, setPlayheadBeat] = useState(0);
  const [userCueBeat, setUserCueBeat] = useState(0);
  const [editorSelection, setEditorSelection] = useState(createEmptyEditorSelection);
  const clearEditorSelectionState = useCallback(() => {
    setEditorSelection(clearEditorSelection());
  }, []);
  const { recentProjects, setRecentProjects, refreshRecentProjects } = useProjectRecents();
  const {
    clearTransientComposerUi,
    patchRemovalDialog,
    pitchPicker,
    selectionActionPopoverMode,
    setPatchRemovalDialog,
    setPitchPicker,
    setSelectionActionPopoverMode,
    setTimelineActionsPopover,
    timelineActionsPopover
  } = useComposerTransientUi({
    onClearEditorSelection: clearEditorSelectionState
  });
  const {
    project,
    projectAssets,
    ready,
    runtimeError,
    selectedTrackId,
    setProjectAssets,
    setProjectHistory,
    setRuntimeError,
    setSelectedTrackId
  } = useAppBootstrap({ setRecentProjects });
  const { browserCompatibilityIssue, setBrowserCompatibilityIssue, wasmReady } = useWasmReadiness({
    ready,
    setRuntimeError
  });

  useEffect(() => {
    if (!runtimeError) {
      return;
    }
    reportSproutErrorToConsole(runtimeError);
  }, [runtimeError]);

  const router = useRouter();
  const pathname = usePathname();
  const audioEngineRef = useRef<AudioEngine | null>(null);
  const recordingStopSessionRef = useRef<(finalBeat?: number) => void>(() => {});
  const recordingHandleBeatRef = useRef<(beat: number) => void>(() => {});
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const keepSelectionPopoverCollapsedRef = useRef(false);
  const audioProject = useMemo(() => toAudioProject(project, projectAssets), [project, projectAssets]);
  const {
    noteClipboardPayload,
    setNoteClipboardPayload,
    writeClipboardPayload,
    clearNoteClipboard,
    syncNoteClipboardPayload
  } = useNoteClipboard();
  const { isDeleteShortcutKey } = usePlatformShortcuts();
  const selectedTrack = useMemo(
    () => project.tracks.find((track) => track.id === selectedTrackId) ?? project.tracks[0],
    [project.tracks, selectedTrackId]
  );
  const selectedTrackPatch = useMemo(
    () => project.patches.find((patch) => patch.id === selectedTrack?.instrumentPatchId) ?? project.patches[0],
    [project.patches, selectedTrack?.instrumentPatchId]
  );
  const presetUpdateSummary = useMemo(() => getProjectPresetUpdateSummary(project), [project]);
  const showPresetUpdatePrompt = Boolean(ready && presetUpdateSummary);
  const selectedContent = editorSelection.content;
  const selectedNoteKeySet = useMemo(() => new Set(selectedContent.noteKeys), [selectedContent.noteKeys]);
  const selectedAutomationKeyframeSet = useMemo(
    () => new Set(selectedContent.automationKeyframeSelectionKeys),
    [selectedContent.automationKeyframeSelectionKeys]
  );
  const noteSelectionBeatRange = useMemo(
    () => getEditorSelectionBeatRange(project, editorSelection),
    [editorSelection, project]
  );
  const hasTimelineRangeSelection = editorSelection.kind === "timeline";
  const noteSelectionTrackLabel = useMemo(
    () => getContentSelectionLabel(project.tracks, selectedContent),
    [project.tracks, selectedContent]
  );
  const noteSelectionSourceTrackId = useMemo(
    () => getEditorSelectionSourceTrackId(project, editorSelection),
    [editorSelection, project]
  );
  const canvasSelection = useMemo<TrackCanvasSelection>(() => {
    if (editorSelection.kind === "timeline") {
      return {
        kind: "timeline",
        beatRange: editorSelection.beatRange,
        label: "All Tracks",
        markerTrackId: project.tracks[0]?.id ?? ""
      };
    }
    if (editorSelection.kind === "content" && noteSelectionBeatRange && noteSelectionSourceTrackId) {
      return {
        kind: "note",
        content: {
          noteKeys: selectedNoteKeySet,
          automationKeyframeSelectionKeys: selectedAutomationKeyframeSet
        },
        beatRange: noteSelectionBeatRange,
        label: noteSelectionTrackLabel,
        markerTrackId:
          editorSelection.actionScopePreview === "all-tracks"
            ? (project.tracks[0]?.id ?? noteSelectionSourceTrackId)
            : noteSelectionSourceTrackId
      };
    }
    return { kind: "none" };
  }, [
    noteSelectionBeatRange,
    noteSelectionTrackLabel,
    noteSelectionSourceTrackId,
    project.tracks,
    selectedAutomationKeyframeSet,
    selectedNoteKeySet,
    editorSelection
  ]);
  const selectionBeatRange = canvasSelection.kind === "none" ? null : canvasSelection.beatRange;
  const trackNameById = useMemo(
    () => new Map(project.tracks.map((track) => [track.id, track.name] as const)),
    [project.tracks]
  );

  const patchValidationById = useMemo(() => {
    const next = new Map<string, PatchValidationIssue[]>();
    for (const patch of project.patches) {
      next.set(patch.id, [...validatePatch(patch).issues, ...buildMissingSampleAssetIssues(patch, projectAssets)]);
    }
    return next;
  }, [project.patches, projectAssets]);
  const invalidPatchIds = useMemo(
    () =>
      new Set(
        project.patches
          .filter((patch) => (patchValidationById.get(patch.id) ?? []).some((issue) => issue.level === "error"))
          .map((patch) => patch.id)
      ),
    [patchValidationById, project.patches]
  );

  const commitProjectChange = useCallback(
    (
      updater: (current: Project) => Project,
      options?: { actionKey?: string; coalesce?: boolean; skipHistory?: boolean }
    ) => {
      setProjectHistory((prev) => {
        const next = updater(prev.current);
        if (next === prev.current) {
          return prev;
        }
        const frozenNext = freezeProjectSnapshot(next);
        if (options?.skipHistory) {
          return {
            ...prev,
            current: frozenNext
          };
        }
        return pushHistory(prev, frozenNext, options);
      });
    },
    [setProjectHistory]
  );

  const resetProjectState = useCallback(
    (nextProject: Project, nextAssets: ProjectAssetLibrary = createEmptyProjectAssetLibrary()) => {
      setProjectAssets(nextAssets);
      setProjectHistory(createProjectHistory(nextProject));
    },
    [setProjectAssets, setProjectHistory]
  );

  const dismissPresetUpdatePrompt = useCallback(() => {
    if (!presetUpdateSummary) {
      return;
    }
    const dismissedPresetUpdateVersions = Object.fromEntries(
      presetUpdateSummary.updates.map((update) => [update.presetId, update.nextVersion])
    );
    commitProjectChange(
      (current) => ({
        ...current,
        ui: {
          ...current.ui,
          dismissedPresetUpdateVersions: {
            ...(current.ui.dismissedPresetUpdateVersions ?? {}),
            ...dismissedPresetUpdateVersions
          }
        }
      }),
      { actionKey: "project:dismiss-preset-updates", skipHistory: true }
    );
  }, [commitProjectChange, presetUpdateSummary]);

  const updateAllPresetUpdates = useCallback(() => {
    commitProjectChange(updateProjectPresetsToLatest, { actionKey: "project:update-presets" });
  }, [commitProjectChange]);

  const upsertWorkspaceSamplePlayerAssetData = useCallback(
    (sampleData: SamplePlayerAssetData, existingAssetId?: string | null) => {
      const nextState = upsertSamplePlayerAssetData(projectAssets, sampleData, existingAssetId);
      setProjectAssets(nextState.assets);
      return nextState.assetId;
    },
    [projectAssets, setProjectAssets]
  );

  const patchWorkspace = usePatchWorkspaceState({
    project,
    projectAssets,
    selectedTrack,
    validationIssuesByPatchId: patchValidationById,
    commitProjectChange,
    audioEngineRef,
    playing,
    router,
    setRuntimeError,
    setPatchRemovalDialog
  });
  const selectedPatch = patchWorkspace.selectedPatch;
  const validationIssues = patchWorkspace.validationIssues;
  const selectedPatchHasErrors = patchWorkspace.selectedPatchHasErrors;

  const playbackEndBeat = useMemo(() => {
    return getProjectTimelineEndBeat(project);
  }, [project]);

  const resolveTrackPreviewStateAtBeat = useCallback(
    (trackId: string, beat: number, override: { macroId: string; normalized: number }) => {
      const track = project.tracks.find((entry) => entry.id === trackId);
      if (!track) {
        return null;
      }
      const patch = project.patches.find((entry) => entry.id === track.instrumentPatchId);
      if (!patch) {
        return null;
      }
      return getTrackPreviewStateAtBeat(track, patch, beat, playbackEndBeat, override);
    },
    [playbackEndBeat, project.patches, project.tracks]
  );

  const {
    bindTrackMacroToAutomation,
    unbindTrackMacroFromAutomation,
    toggleTrackMacroAutomationLane,
    upsertTrackMacroAutomationKeyframe,
    splitTrackMacroAutomationKeyframe,
    updateTrackMacroAutomationKeyframeSide,
    deleteTrackMacroAutomationKeyframeSide,
    previewTrackMacroAutomation
  } = useTrackMacroAutomationActions({
    audioEngineRef,
    commitProjectChange,
    previewPitch: patchWorkspace.previewPitch,
    resolveTrackPreviewStateAtBeat,
    setRuntimeError
  });
  const {
    bindTrackVolumeToAutomation,
    unbindTrackVolumeFromAutomation,
    toggleTrackVolumeAutomationLane,
    previewTrackVolume
  } = useTrackVolumeAutomationActions({
    audioEngineRef,
    commitProjectChange,
    previewPitch: patchWorkspace.previewPitch,
    setRuntimeError
  });

  useEffect(() => {
    if (!selectedPatch || selectedPatchHasErrors) return;
    try {
      compilePatchPlan(selectedPatch);
    } catch {
      // compile errors are reflected by validation issues
    }
  }, [selectedPatch, selectedPatchHasErrors, validationIssues]);

  useEffect(() => {
    if (!ready) return;
    if (!audioEngineRef.current) {
      audioEngineRef.current = new AudioEngine();
    }
    audioEngineRef.current.setRuntimeErrorListener(setRuntimeError);
    audioEngineRef.current.syncProjectSnapshot(audioProject, { syncToWorklet: !playing });
  }, [audioProject, playing, ready, setRuntimeError]);

  useEffect(() => {
    setEditorSelection((current) => filterEditorSelectionToProject(project, current));
  }, [project]);

  useEffect(() => {
    if (
      !noteSelectionSourceTrackId ||
      editorSelection.marqueeActive ||
      pitchPicker ||
      canvasSelection.kind === "timeline"
    ) {
      return;
    }
    setSelectedTrackId((current) => (current === noteSelectionSourceTrackId ? current : noteSelectionSourceTrackId));
  }, [
    canvasSelection.kind,
    editorSelection.marqueeActive,
    noteSelectionSourceTrackId,
    pitchPicker,
    setSelectedTrackId
  ]);

  useEffect(() => {
    if (!selectionBeatRange) {
      setSelectionActionPopoverMode("expanded");
      setEditorSelection((current) => setEditorSelectionActionScopePreview(current, "source"));
    }
  }, [selectionBeatRange, setSelectionActionPopoverMode]);

  useEffect(() => {
    if (keepSelectionPopoverCollapsedRef.current) {
      keepSelectionPopoverCollapsedRef.current = false;
      return;
    }
    setSelectionActionPopoverMode("expanded");
  }, [selectedContent, setSelectionActionPopoverMode]);

  useEffect(() => {
    if (editorSelection.kind !== "timeline") {
      return;
    }
    setSelectionActionPopoverMode("expanded");
  }, [editorSelection.kind, setSelectionActionPopoverMode]);

  useEffect(() => {
    if (canvasSelection.kind === "timeline") {
      setEditorSelection((current) => setEditorSelectionActionScopePreview(current, "all-tracks"));
      return;
    }
    setEditorSelection((current) => setEditorSelectionActionScopePreview(current, "source"));
  }, [canvasSelection.kind, noteSelectionSourceTrackId]);

  const { upsertNote, updateNote, deleteNote } = useNoteEditor({ commitProjectChange });

  const playback = usePlaybackController({
    project,
    audioProject,
    playbackEndBeat,
    userCueBeat,
    playheadBeat,
    wasmReady,
    audioEngineRef,
    setPlaying,
    setPlayheadBeat,
    setRuntimeError,
    onStopRecordingSession: (finalBeat: number | undefined) => recordingStopSessionRef.current(finalBeat),
    onHandleRecordingBeat: (beat: number) => recordingHandleBeatRef.current(beat)
  });

  const recording = useRecordingController({
    project,
    selectedTrack,
    playheadBeat,
    userCueBeat,
    pitchPickerOpen: Boolean(pitchPicker),
    previewPitchPickerOpen: patchWorkspace.previewPitchPickerOpen,
    wasmReady,
    audioEngineRef,
    commitProjectChange,
    upsertNote,
    updateNote,
    setPlaying,
    setPlayheadBeat,
    setRuntimeError,
    onBeginRecordingPlayback: async (trackId, cueBeat) => {
      await playback.beginPlaybackAtBeat(cueBeat, { recordingTrackId: trackId });
    }
  });

  recordingStopSessionRef.current = recording.stopRecordSession;
  recordingHandleBeatRef.current = recording.handlePlayheadBeat;

  const toggleTrackMute = useCallback(
    (trackId: string) => {
      const currentTrack = project.tracks.find((track) => track.id === trackId);
      if (currentTrack) {
        audioEngineRef.current?.setTrackMuted(trackId, !currentTrack.mute);
      }
      commitProjectChange(
        (current) => ({
          ...current,
          tracks: current.tracks.map((track) => (track.id === trackId ? { ...track, mute: !track.mute } : track))
        }),
        { actionKey: `track:${trackId}:mute` }
      );
    },
    [audioEngineRef, commitProjectChange, project.tracks]
  );
  const { exportingAudio, exportAudio, setTrackVolume } = useProjectAudioActions({
    project,
    projectAssets,
    audioEngineRef,
    commitProjectChange,
    setRuntimeError
  });

  const previewNoteForPitchPicker = useCallback(
    (trackId: string, noteId: string, pitch: string) => {
      if (playing) {
        return;
      }

      const track = project.tracks.find((entry) => entry.id === trackId);
      const note = track?.notes.find((entry) => entry.id === noteId);
      if (!track || !note) {
        return;
      }

      audioEngineRef.current
        ?.previewNote(trackId, pitchToVoct(pitch), note.durationBeats, note.velocity)
        .catch((error) => {
          const cause = toError(error);
          setRuntimeError(
            createSproutError({
              source: "audio_playback",
              code: "preview_failed",
              severity: "error",
              message: cause.message,
              error: cause,
              details: { phase: "pitch_picker_preview" }
            })
          );
        });
    },
    [playing, project.tracks, setRuntimeError]
  );

  const setPlayheadFromUser = useCallback(
    (beat: number) => {
      setUserCueBeat(beat);
      setPlayheadBeat(beat);
      setEditorSelection(clearEditorSelection());
      setPitchPicker(null);
      if (playing) {
        void playback.seekPlaybackToBeat(beat).catch((error) => {
          const cause = toError(error);
          setRuntimeError(
            createSproutError({
              source: "audio_playback",
              code: "seek_failed",
              severity: "error",
              message: cause.message,
              error: cause,
              details: { phase: "seek" }
            })
          );
        });
      }
    },
    [playback, playing, setPitchPicker, setRuntimeError]
  );
  const setPlayheadPreservingSelection = useCallback(
    (beat: number) => {
      setUserCueBeat(beat);
      setPlayheadBeat(beat);
      setPitchPicker(null);
    },
    [setPitchPicker]
  );
  const setContentSelectionWithPopoverBehavior = useCallback(
    (selection: ContentSelection, options?: { keepCollapsed?: boolean }) => {
      keepSelectionPopoverCollapsedRef.current = Boolean(options?.keepCollapsed);
      if (options?.keepCollapsed) {
        setSelectionActionPopoverMode("collapsed");
      }
      setEditorSelection((current) => setEditorContentSelection(current, selection));
    },
    [setSelectionActionPopoverMode]
  );
  const {
    applyNoteClipboardPaste,
    copyAllTracksInSelection,
    copySelectedNotes,
    cutAllTracksInSelection,
    cutSelectedNotes,
    deleteAllTracksInSelection,
    deleteSelectedNoteSelection,
    explodeSelection,
    deleteSelectedNotes
  } = useSelectionClipboardActions({
    clearNoteClipboard,
    closeTimelineActionsPopover: () => setTimelineActionsPopover(null),
    commitProjectChange,
    contentSelection: selectedContent,
    noteClipboardPayload,
    project,
    selectedTrackId: selectedTrack?.id,
    selectionBeatRange,
    setPlayheadFromUser,
    setContentSelection: (selection: ContentSelection) => {
      setContentSelectionWithPopoverBehavior(selection);
    },
    writeClipboardPayload
  });
  const {
    applyLoopSettings,
    addLoopBoundary,
    updateLoopRepeatCount,
    removeLoopBoundary,
    loopConflictDialog,
    clearLoopConflictDialog
  } = useLoopSettings({
    project,
    commitProjectChange,
    onCloseLoopPopover: () => setTimelineActionsPopover(null)
  });

  useDismissiblePopover({
    active: Boolean(timelineActionsPopover),
    popoverSelector: ".timeline-actions-popover",
    onDismiss: useCallback(() => setTimelineActionsPopover(null), [setTimelineActionsPopover])
  });

  const selectionActionPopoverAvailable = Boolean(
    selectionBeatRange && !editorSelection.marqueeActive && !pitchPicker && !timelineActionsPopover
  );
  const selectionActionPopoverVisible = selectionActionPopoverAvailable;
  const selectionActionPopoverCollapsed = selectionActionPopoverMode === "collapsed";

  const collapseSelectionActionPopover = useCallback(() => {
    setSelectionActionPopoverMode("collapsed");
    setEditorSelection((current) => setEditorSelectionActionScopePreview(current, "source"));
  }, [setSelectionActionPopoverMode]);

  const {
    explodeSelectionDialogState,
    setExplodeSelectionDialogState,
    closeExplodeSelectionDialog,
    openExplodeSelectionDialog
  } = useExplodeSelectionDialog({
    selectionBeatRange,
    selectionKind: editorSelection.kind === "content" ? "note" : editorSelection.kind,
    onCollapseSelectionActionPopover: () => setSelectionActionPopoverMode("collapsed")
  });

  useDismissiblePopover({
    active: selectionActionPopoverAvailable && !selectionActionPopoverCollapsed,
    popoverSelector: ".selection-actions-popover",
    onDismiss: collapseSelectionActionPopover
  });

  const timelineMarkersAtBeat = useMemo(
    () =>
      timelineActionsPopover
        ? getSanitizedLoopMarkers(project.global.loop).filter(
            (marker) => Math.abs(marker.beat - timelineActionsPopover.beat) < 1e-9
          )
        : [],
    [project.global.loop, timelineActionsPopover]
  );
  const startMarkerAtTimelineBeat = timelineMarkersAtBeat.find((marker) => marker.kind === "start");
  const endMarkerAtTimelineBeat = timelineMarkersAtBeat.find((marker) => marker.kind === "end");
  const expandableLoopRegion = useMemo(
    () =>
      timelineActionsPopover
        ? getUniqueMatchedLoopRegionAtBeat(project.global.loop, timelineActionsPopover.beat)
        : null,
    [project.global.loop, timelineActionsPopover]
  );

  const expandSelectedLoopToNotes = useCallback(() => {
    if (!expandableLoopRegion) {
      return;
    }
    commitProjectChange((current) => expandLoopRegionToNotes(current, expandableLoopRegion), {
      actionKey: `global:loop:expand:${expandableLoopRegion.startMarkerId}`
    });
    setTimelineActionsPopover(null);
  }, [commitProjectChange, expandableLoopRegion, setTimelineActionsPopover]);

  const requestTimelineActionsPopover = useCallback(
    (request: TimelineActionsPopoverRequest) => {
      setTimelineActionsPopover(request);
      setPitchPicker(null);
      closeExplodeSelectionDialog();
      setEditorSelection(clearEditorSelection());
      setSelectionActionPopoverMode("expanded");
      setEditorSelection((current) => setEditorSelectionActionScopePreview(current, "source"));
      void syncNoteClipboardPayload();
    },
    [
      closeExplodeSelectionDialog,
      setPitchPicker,
      setSelectionActionPopoverMode,
      setTimelineActionsPopover,
      syncNoteClipboardPayload
    ]
  );

  const openPitchPicker = useCallback(
    (trackId: string, noteId: string) => {
      setPitchPicker({ trackId, noteId });
      const notePitch = project.tracks
        .find((track) => track.id === trackId)
        ?.notes.find((note) => note.id === noteId)?.pitchStr;
      previewNoteForPitchPicker(trackId, noteId, notePitch ?? DEFAULT_NOTE_PITCH);
    },
    [previewNoteForPitchPicker, project.tracks, setPitchPicker]
  );

  const closePitchPicker = useCallback(() => {
    setPitchPicker(null);
  }, [setPitchPicker]);

  const clearCanvasSelection = useCallback(() => {
    setEditorSelection(clearEditorSelection());
    setSelectionActionPopoverMode("expanded");
    closeExplodeSelectionDialog();
  }, [closeExplodeSelectionDialog, setSelectionActionPopoverMode]);

  const confirmExplodeSelection = useCallback(() => {
    if (!explodeSelectionDialogState) {
      return;
    }

    const iterations = Number.parseInt(explodeSelectionDialogState.countText, 10);
    if (!Number.isInteger(iterations) || iterations <= 0) {
      return;
    }

    explodeSelection({
      iterations,
      mode: explodeSelectionDialogState.mode,
      scope: explodeSelectionDialogState.selectionKind === "timeline" ? "all-tracks" : explodeSelectionDialogState.scope
    });
    setExplodeSelectionDialogState(null);
  }, [explodeSelection, explodeSelectionDialogState, setExplodeSelectionDialogState]);

  const setContentSelectionFromCanvas = useCallback(
    (selection: ContentSelection) => {
      setTimelineActionsPopover(null);
      setContentSelectionWithPopoverBehavior(selection);
    },
    [setContentSelectionWithPopoverBehavior, setTimelineActionsPopover]
  );

  const setTimelineSelectionFromCanvas = useCallback(
    (range: BeatRange | null) => {
      setTimelineActionsPopover(null);
      setPitchPicker(null);
      setEditorSelection((current) => setEditorTimelineSelection(current, range));
    },
    [setPitchPicker, setTimelineActionsPopover]
  );

  const undoProject = useCallback(() => {
    setProjectHistory((prev) => {
      const next = undoHistory(prev);
      if (next === prev) {
        return prev;
      }
      return {
        ...next,
        current: freezeProjectSnapshot({
          ...next.current,
          ui: {
            ...prev.current.ui,
            patchWorkspace: next.current.ui.patchWorkspace
          }
        })
      };
    });
  }, [setProjectHistory]);

  const redoProject = useCallback(() => {
    setProjectHistory((prev) => {
      const next = redoHistory(prev);
      if (next === prev) {
        return prev;
      }
      return {
        ...next,
        current: freezeProjectSnapshot({
          ...next.current,
          ui: {
            ...prev.current.ui,
            patchWorkspace: next.current.ui.patchWorkspace
          }
        })
      };
    });
  }, [setProjectHistory]);

  useEditActionKeyboardShortcuts({
    applyNoteClipboardPaste,
    copyAllTracksInSelection,
    cutAllTracksInSelection,
    deletePrimarySelection: hasTimelineRangeSelection ? deleteAllTracksInSelection : deleteSelectedNoteSelection,
    deleteAllTracksInSelection,
    hasPrimarySelection: hasTimelineRangeSelection || hasContentSelection(selectedContent),
    isDeleteShortcutKey,
    onCloseTransientUi: () => {
      if (pitchPicker) {
        setPitchPicker(null);
        return;
      }
      if (patchWorkspace.previewPitchPickerOpen) {
        patchWorkspace.setPreviewPitchPickerOpen(false);
        return;
      }
      if (patchRemovalDialog) {
        setPatchRemovalDialog(null);
        return;
      }
      if (timelineActionsPopover) {
        setTimelineActionsPopover(null);
        return;
      }
      if (selectionActionPopoverAvailable && !selectionActionPopoverCollapsed) {
        collapseSelectionActionPopover();
        return;
      }
      if (selectionBeatRange) {
        clearCanvasSelection();
      }
    },
    playheadBeat,
    redoProject,
    undoProject
  });

  useEditorClipboardEvents({
    commitProjectChange,
    contentSelection: selectedContent,
    cutAllTracksInSelection,
    deleteSelectedNotes,
    hasTimelineRangeSelection,
    playheadBeat,
    project,
    selectionBeatRange,
    selectedTrackId: selectedTrack?.id,
    setNoteClipboardPayload,
    setContentSelection: (selection: ContentSelection) => {
      setContentSelectionWithPopoverBehavior(selection);
    }
  });

  usePitchPickerHotkeys(
    Boolean(pitchPicker),
    useCallback(
      (pitch: string) => {
        if (!pitchPicker) return;
        updateNote(
          pitchPicker.trackId,
          pitchPicker.noteId,
          { pitchStr: pitch },
          {
            actionKey: `track:${pitchPicker.trackId}:pitch:${pitchPicker.noteId}`
          }
        );
        previewNoteForPitchPicker(pitchPicker.trackId, pitchPicker.noteId, pitch);
        closePitchPicker();
      },
      [closePitchPicker, pitchPicker, previewNoteForPitchPicker, updateNote]
    )
  );

  usePitchPickerHotkeys(
    patchWorkspace.previewPitchPickerOpen,
    useCallback(
      (pitch: string) => {
        patchWorkspace.setPreviewPitch(pitch);
        patchWorkspace.setPreviewPitchPickerOpen(false);
        patchWorkspace.previewSelectedPatchNow(pitch);
      },
      [patchWorkspace]
    )
  );

  const exportJson = () => {
    downloadJsonFile(
      exportProjectToJson(project, projectAssets),
      `${project.name.replace(/\s+/g, "_").toLowerCase()}.json`
    );
  };

  const addTrack = () => {
    const fallbackPatch = project.patches[0];
    if (!fallbackPatch) return;

    const trackId = createId("track");
    commitProjectChange(
      (current) => ({
        ...current,
        tracks: [
          ...current.tracks,
          {
            id: trackId,
            name: `Track ${current.tracks.length + 1}`,
            instrumentPatchId: fallbackPatch.id,
            notes: [],
            macroValues: {},
            macroAutomations: {},
            macroPanelExpanded: false,
            volume: 1,
            fx: {
              delayEnabled: false,
              reverbEnabled: false,
              saturationEnabled: false,
              compressorEnabled: false,
              delayMix: 0.2,
              reverbMix: 0.2,
              drive: 0.2,
              compression: 0.4
            }
          }
        ]
      }),
      { actionKey: `track:add:${trackId}` }
    );
    setSelectedTrackId(trackId);
  };

  const renameTrack = useCallback(
    (trackId: string, name: string) => {
      commitProjectChange((current) => renameTrackInProject(current, trackId, name), {
        actionKey: `track:${trackId}:rename`
      });
    },
    [commitProjectChange]
  );

  const renameProject = useCallback(
    (name: string) => {
      commitProjectChange((current) => renameProjectInProject(current, name), { actionKey: "project:rename" });
    },
    [commitProjectChange]
  );

  const removeSelectedTrack = useCallback(() => {
    if (!selectedTrack || project.tracks.length <= 1) {
      return;
    }

    const remainingTracks = project.tracks.filter((track) => track.id !== selectedTrack.id);
    commitProjectChange((current) => removeTrackFromProject(current, selectedTrack.id), {
      actionKey: `track:${selectedTrack.id}:remove`
    });
    setSelectedTrackId(remainingTracks[0]?.id);
    patchWorkspace.setSelectedNodeId(undefined);
  }, [commitProjectChange, patchWorkspace, project.tracks, selectedTrack, setSelectedTrackId]);

  const duplicatePatchForSelectedTrack = () => {
    if (!selectedTrackPatch || !selectedTrack) return;

    const duplicate = structuredClone(selectedTrackPatch);
    duplicate.id = createId("patch");
    duplicate.name = `${selectedTrackPatch.name} Copy`;
    duplicate.meta = { source: "custom" };

    commitProjectChange(
      (current) => ({
        ...current,
        patches: [...current.patches, duplicate],
        tracks: current.tracks.map((track) =>
          track.id === selectedTrack.id ? { ...track, instrumentPatchId: duplicate.id } : track
        )
      }),
      { actionKey: `patch:duplicate:${duplicate.id}` }
    );
  };

  const requestRemoveSelectedTrackPatch = useCallback(() => {
    if (!selectedTrackPatch || !isPatchRemovable(selectedTrackPatch)) {
      return;
    }
    const removalRequest = buildPatchRemovalRequest(project, selectedTrackPatch);
    if (!removalRequest) {
      return;
    }
    if (removalRequest.rows.length === 0) {
      commitProjectChange(
        (current) => ({
          ...current,
          patches: current.patches.filter((patch) => patch.id !== selectedTrackPatch.id)
        }),
        { actionKey: `patch:${selectedTrackPatch.id}:remove` }
      );
      patchWorkspace.setSelectedNodeId(undefined);
      return;
    }
    setPatchRemovalDialog(removalRequest);
  }, [commitProjectChange, patchWorkspace, project, selectedTrackPatch, setPatchRemovalDialog]);

  const confirmRemovePatch = useCallback(() => {
    if (!patchRemovalDialog) {
      return;
    }

    if (hasInvalidPatchRemovalFallback(patchRemovalDialog)) {
      return;
    }
    const nextTrackIds = resolveSurvivingTrackIds(project, patchRemovalDialog);
    if (nextTrackIds.size === 0) {
      setRuntimeError(
        createSproutError({
          source: "patch_workspace",
          code: "remove_patch_last_track",
          severity: "error",
          message: "At least one track must remain in the project.",
          error: new Error("At least one track must remain in the project."),
          details: { phase: "remove_patch" }
        })
      );
      return;
    }

    commitProjectChange((current) => removePatchFromProject(current, patchRemovalDialog), {
      actionKey: `patch:${patchRemovalDialog.patchId}:remove`
    });

    const survivingSelectedTrack =
      selectedTrackId && nextTrackIds.has(selectedTrackId)
        ? selectedTrackId
        : project.tracks.find((track) => nextTrackIds.has(track.id))?.id;
    setSelectedTrackId(survivingSelectedTrack);
    setPatchRemovalDialog(null);
    patchWorkspace.setSelectedNodeId(undefined);
  }, [
    commitProjectChange,
    patchRemovalDialog,
    patchWorkspace,
    project,
    selectedTrackId,
    setPatchRemovalDialog,
    setRuntimeError,
    setSelectedTrackId
  ]);

  const updateTrackPatch = (trackId: string, patchId: string) => {
    commitProjectChange((current) => switchTrackPatchInProject(current, trackId, patchId), {
      actionKey: `track:${trackId}:patch`
    });
    patchWorkspace.setSelectedNodeId(undefined);
  };

  const { setTrackMacroPanelExpanded, toggleTrackMacroPanel } = useTrackMacroPanelState({
    tracks: project.tracks,
    commitProjectChange
  });

  const changeTrackMacro = useCallback(
    (trackId: string, macroId: string, normalized: number, options?: { commit?: boolean }) => {
      audioEngineRef.current?.setMacroValue(trackId, macroId, normalized);
      commitProjectChange(
        (current) => ({
          ...current,
          tracks: current.tracks.map((track) =>
            track.id === trackId ? { ...track, macroValues: { ...track.macroValues, [macroId]: normalized } } : track
          )
        }),
        { actionKey: `track:${trackId}:macro:${macroId}`, coalesce: !options?.commit }
      );
      if (options?.commit) {
        const track = project.tracks.find((entry) => entry.id === trackId);
        if (track) {
          patchWorkspace.previewPatchById(track.instrumentPatchId);
        }
      }
    },
    [commitProjectChange, patchWorkspace, project.tracks]
  );

  const previewPlacedNote = useCallback(
    (trackId: string, note: Project["tracks"][number]["notes"][number]) => {
      audioEngineRef.current
        ?.previewNote(trackId, pitchToVoct(note.pitchStr), note.durationBeats, note.velocity)
        .catch((error) => {
          const cause = toError(error);
          setRuntimeError(
            createSproutError({
              source: "patch_workspace",
              code: "preview_failed",
              severity: "error",
              message: cause.message,
              error: cause,
              details: { phase: "preview" }
            })
          );
        });
    },
    [setRuntimeError]
  );

  const pitchPickerTrack = pitchPicker ? project.tracks.find((track) => track.id === pitchPicker.trackId) : undefined;
  const pitchPickerNote = pitchPickerTrack?.notes.find((note) => note.id === pitchPicker?.noteId);
  const activeRecordingTrackId = recording.activeRecordingTrackId;
  const activeRecordingTrack = activeRecordingTrackId
    ? project.tracks.find((track) => track.id === activeRecordingTrackId)
    : undefined;
  const { clearCurrentProject, createNewProject, importJson, openRecentProject, resetToDefaultProject } =
    useProjectLifecycleActions({
      project,
      projectAssets,
      recentProjects,
      audioEngineRef,
      playback,
      commitProjectChange,
      resetProjectState,
      refreshRecentProjects,
      setSelectedTrackId,
      setRuntimeError,
      clearTransientComposerUi
    });
  const workspaceView = pathname.endsWith("/patch-workspace") ? "patch-workspace" : "composer";
  const { previewDefaultPitchNow, releaseHeldPatchPreview, startHeldDefaultPitchPreview } =
    useHardwareNavigationPreview({
      view: workspaceView,
      selectedTrack,
      defaultPitch: patchWorkspace.previewPitch,
      isPlaying: playing,
      audioEngineRef,
      previewSelectedPatchNow: patchWorkspace.previewSelectedPatchNow,
      releaseHeldPatchPreview: patchWorkspace.releaseHeldPatchPreview,
      startHeldPatchPreview: patchWorkspace.startHeldPatchPreview,
      setRuntimeError
    });
  const hardwareNavigation = useHardwareNavigation({
    view: workspaceView,
    projectGridBeats: project.global.gridBeats,
    projectTempo: project.global.tempo,
    tracks: project.tracks,
    selectedTrack,
    playheadBeat,
    playbackEndBeat,
    isPlaying: playing,
    recordPhase: recording.recordPhase,
    pitchPickerOpen: Boolean(pitchPicker),
    previewPitchPickerOpen: patchWorkspace.previewPitchPickerOpen,
    defaultPitch: patchWorkspace.previewPitch,
    selectionKind: editorSelection.kind,
    contentSelection: selectedContent,
    selectionActionPopoverCollapsed,
    setDefaultPitch: patchWorkspace.setPreviewPitch,
    setSelectedTrackId,
    setPlayheadBeatFromUser: setPlayheadFromUser,
    setPlayheadBeatPreservingSelection: setPlayheadPreservingSelection,
    setContentSelection: setContentSelectionWithPopoverBehavior,
    expandSelectionActionPopover: () => setSelectionActionPopoverMode("expanded"),
    toggleTrackMacroPanel: setTrackMacroPanelExpanded,
    deleteNote,
    commitProjectChange,
    audioEngineRef,
    previewDefaultPitchNow,
    releaseHeldDefaultPitchPreview: releaseHeldPatchPreview,
    startHeldDefaultPitchPreview,
    onComposerPlay: playback.startPlayback,
    onComposerStop: playback.stopPlayback,
    setRuntimeError
  });

  if (!ready || !selectedTrack || !selectedPatch) {
    return <main className="loading">Loading...</main>;
  }

  const projectMenuProps = createProjectMenuProps({
    importInputRef,
    recentProjects,
    createNewProject,
    exportJson,
    openRecentProject,
    resetToDefaultProject,
    importJson
  });
  const trackCanvasActionGroups = createTrackCanvasActionGroups({
    selectedTrackInstrumentPatchId: selectedTrack.instrumentPatchId,
    selectedTrackPatch,
    patchWorkspace,
    hasTimelineRangeSelection,
    selectionActionPopoverCollapsed,
    setSelectedTrackId,
    renameTrack,
    toggleTrackMute,
    setTrackVolume,
    previewTrackVolume,
    bindTrackVolumeToAutomation,
    unbindTrackVolumeFromAutomation,
    toggleTrackVolumeAutomationLane,
    updateTrackPatch,
    toggleTrackMacroPanel,
    duplicatePatchForSelectedTrack,
    requestRemoveSelectedTrackPatch,
    changeTrackMacro,
    bindTrackMacroToAutomation,
    unbindTrackMacroFromAutomation,
    toggleTrackMacroAutomationLane,
    upsertTrackMacroAutomationKeyframe,
    splitTrackMacroAutomationKeyframe,
    updateTrackMacroAutomationKeyframeSide,
    deleteTrackMacroAutomationKeyframeSide,
    previewTrackMacroAutomation,
    openPitchPicker,
    previewPlacedNote,
    upsertNote,
    updateNote,
    deleteNote,
    setContentSelectionFromCanvas,
    setTimelineSelectionFromCanvas,
    setSelectionMarqueeActive: (active: boolean) => {
      setEditorSelection((current) => setEditorSelectionMarqueeActive(current, active));
    },
    previewSelectionActionScopeChange: (scope: "source" | "all-tracks") => {
      setEditorSelection((current) => setEditorSelectionActionScopePreview(current, scope));
    },
    expandSelectionActionPopover: () => setSelectionActionPopoverMode("expanded"),
    clearCanvasSelection,
    copyAllTracksInSelection,
    copySelectedNotes,
    cutAllTracksInSelection,
    cutSelectedNotes,
    deleteAllTracksInSelection,
    deleteSelectedNoteSelection,
    openExplodeSelectionDialog
  });
  const runtimeErrorDisplayMessage = runtimeError?.severity === "error" ? runtimeError.message : null;

  const composerControllerProps: ComposerControllerProps = createComposerControllerProps({
    clipboard: writeClipboardPayload,
    projectMenuProps,
    projectState: {
      project,
      selectedTrackId: selectedTrack.id,
      selectedTrackPatch,
      selectedTrackInstrumentPatchId: selectedTrack.instrumentPatchId,
      invalidPatchIds,
      canvasSelection
    },
    runtimeState: {
      playheadBeat,
      playing,
      recording,
      playback,
      hardwareNavigation,
      patchWorkspace
    },
    runtimeErrorMessage: runtimeErrorDisplayMessage,
    timelineState: {
      timelineActionsPopover,
      selectionActionPopoverVisible,
      noteClipboardPayload,
      startMarkerAtTimelineBeat,
      endMarkerAtTimelineBeat,
      expandableLoopRegion: Boolean(expandableLoopRegion),
      selectionActionPopoverCollapsed
    },
    exportingAudio,
    primaryActions: createComposerPrimaryActions({
      clearCurrentProject,
      renameProject,
      exportAudio,
      commitProjectChange,
      addTrack,
      removeSelectedTrack,
      setPlayheadFromUser
    }),
    timelineActions: createComposerTimelineActions({
      requestTimelineActionsPopover,
      setTimelineActionsPopover,
      applyNoteClipboardPaste,
      addLoopBoundary,
      expandSelectedLoopToNotes,
      endMarkerAtTimelineBeat,
      updateLoopRepeatCount,
      removeLoopBoundary
    }),
    ...trackCanvasActionGroups
  });

  const patchWorkspaceControllerProps: UsePatchWorkspaceControllerOptions = createPatchWorkspaceControllerProps({
    project,
    projectAssets,
    playheadBeat,
    selectedPatch,
    projectMenuProps,
    validationIssues,
    selectedPatchHasErrors,
    patchWorkspace,
    runtimeErrorMessage: runtimeErrorDisplayMessage,
    onWriteClipboardPayload: writeClipboardPayload,
    onUpsertSamplePlayerAssetData: upsertWorkspaceSamplePlayerAssetData,
    commitProjectChange,
    setProjectAssets,
    setRuntimeError
  });

  const contextValue: AppRootContextValue = {
    composerControllerProps,
    patchWorkspaceControllerProps
  };
  const rendererLabel = wasmReady ? "wasm" : "wasm (loading)";
  const showDebugOverlay = process.env.NODE_ENV === "development";
  return (
    <AppRootContext.Provider value={contextValue}>
      <main className="app">
        {children}

        {showDebugOverlay && <AudioDebugPanel rendererLabel={rendererLabel} />}

        <BrowserCompatibilityDialog
          issue={browserCompatibilityIssue}
          onClose={() => setBrowserCompatibilityIssue(null)}
        />

        {loopConflictDialog && (
          <LoopConflictDialog
            conflicts={loopConflictDialog.conflicts}
            trackNameById={trackNameById}
            onCancel={clearLoopConflictDialog}
            onSplit={() => applyLoopSettings(loopConflictDialog.nextLoop, { autoSplit: true })}
          />
        )}

        <ExplodeSelectionDialog
          open={Boolean(explodeSelectionDialogState)}
          selectionKind={explodeSelectionDialogState?.selectionKind ?? "note"}
          countText={explodeSelectionDialogState?.countText ?? "2"}
          scope={explodeSelectionDialogState?.scope ?? "selected-tracks"}
          mode={explodeSelectionDialogState?.mode ?? "insert"}
          onClose={closeExplodeSelectionDialog}
          onConfirm={confirmExplodeSelection}
          onCountTextChange={(countText) =>
            setExplodeSelectionDialogState((current) => (current ? { ...current, countText } : current))
          }
          onScopeChange={(scope) =>
            setExplodeSelectionDialogState((current) => (current ? { ...current, scope } : current))
          }
          onModeChange={(mode) =>
            setExplodeSelectionDialogState((current) => (current ? { ...current, mode } : current))
          }
        />

        <RecordingDock
          open={recording.recordEnabled}
          track={activeRecordingTrack}
          title={recording.recordPhase === "count_in" ? "Record Count-In" : "Recording"}
          statusText={recording.recordStatusText}
          hintText={recording.recordingHintText}
          pressedPitches={recording.pressedRecordingPitches}
          onPressStart={(pitch) => {
            if (recording.recordPhase === "recording") {
              recording.startRecordedNote(`pointer:${pitch}`, pitch);
            }
          }}
          onPressEnd={(pitch) => recording.stopRecordedInput(`pointer:${pitch}`)}
        />

        <PitchPickerModal
          open={Boolean(pitchPicker && pitchPickerNote)}
          title="Pick Pitch"
          description="Select a key from C1 to C7. QWERTY-mapped keys are shown on each note."
          selectedPitch={pitchPickerNote?.pitchStr ?? patchWorkspace.previewPitch}
          onClose={closePitchPicker}
          onSelectPitch={(pitch) => {
            if (!pitchPicker) {
              return;
            }
            updateNote(
              pitchPicker.trackId,
              pitchPicker.noteId,
              { pitchStr: pitch },
              {
                actionKey: `track:${pitchPicker.trackId}:pitch:${pitchPicker.noteId}`
              }
            );
            previewNoteForPitchPicker(pitchPicker.trackId, pitchPicker.noteId, pitch);
            closePitchPicker();
          }}
        />

        <PitchPickerModal
          open={patchWorkspace.previewPitchPickerOpen}
          title="Default Pitch"
          description="Select the shared default pitch used for patch preview and keyboard note placement."
          selectedPitch={patchWorkspace.previewPitch}
          onClose={() => patchWorkspace.setPreviewPitchPickerOpen(false)}
          onSelectPitch={(pitch) => {
            patchWorkspace.setPreviewPitch(pitch);
            patchWorkspace.setPreviewPitchPickerOpen(false);
            patchWorkspace.previewSelectedPatchNow(pitch);
          }}
        />

        <PatchRemovalDialogModal
          dialog={patchRemovalDialog}
          project={project}
          setDialog={setPatchRemovalDialog}
          onConfirm={confirmRemovePatch}
        />

        <PresetUpdateDialogModal
          open={showPresetUpdatePrompt}
          summary={presetUpdateSummary}
          onCancel={dismissPresetUpdatePrompt}
          onUpdateAll={updateAllPresetUpdates}
        />
      </main>
    </AppRootContext.Provider>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AudioEngine } from "@/audio/engine";
import { PatchRemovalDialogModal, PatchRemovalDialogState } from "@/components/home/PatchRemovalDialogModal";
import { PitchPickerModal } from "@/components/home/PitchPickerModal";
import { ProjectActionsBar } from "@/components/home/ProjectActionsBar";
import { RecordingDock } from "@/components/home/RecordingDock";
import { loadDspWasm } from "@/audio/wasmBridge";
import { InstrumentEditor } from "@/components/InstrumentEditor";
import { LoopConflictDialog } from "@/components/LoopConflictDialog";
import { QuickHelpDialog } from "@/components/QuickHelpDialog";
import { TimelineActionsPopover } from "@/components/TimelineActionsPopover";
import { TimelineActionsPopoverRequest, TrackCanvas, TrackCanvasSelection } from "@/components/tracks/TrackCanvas";
import { TransportBar } from "@/components/TransportBar";
import { createId } from "@/lib/ids";
import { expandLoopRegionToNotes, getSanitizedLoopMarkers, getUniqueMatchedLoopRegionAtBeat } from "@/lib/looping";
import { createTrackVolumeAutomationLane, getProjectTimelineEndBeat, TRACK_VOLUME_AUTOMATION_ID } from "@/lib/macroAutomation";
import { DEFAULT_NOTE_PITCH } from "@/lib/noteDefaults";
import {
  BeatRange,
  getNoteSelectionKey,
  getSelectionSourceTrackId,
  getSelectionBeatRange,
} from "@/lib/noteClipboard";
import { clearProject, loadProject, saveProject } from "@/lib/persistence";
import { createHistory, HistoryState, pushHistory, redoHistory, undoHistory } from "@/lib/history";
import { getModuleSchema } from "@/lib/patch/moduleRegistry";
import { applyPatchOp as applyPatchGraphOp } from "@/lib/patch/ops";
import { compilePatchPlan, validatePatch } from "@/lib/patch/validation";
import { createDefaultProject, createEmptyProject } from "@/lib/patch/presets";
import { getBundledPresetPatch, resolvePatchPresetStatus, resolvePatchSource } from "@/lib/patch/source";
import { importProjectFromJson, exportProjectToJson, normalizeProject } from "@/lib/projectSerde";
import { pitchToVoct } from "@/lib/pitch";
import { removeTrackFromProject, renameTrackInProject } from "@/lib/trackEdits";
import { useNoteEditor } from "@/hooks/useNoteEditor";
import { useLoopSettings } from "@/hooks/useLoopSettings";
import { useEditorClipboardEvents } from "@/hooks/useEditorClipboardEvents";
import { useEditorKeyboardShortcuts } from "@/hooks/useEditorKeyboardShortcuts";
import { useDismissiblePopover } from "@/hooks/useDismissiblePopover";
import { useNoteClipboard } from "@/hooks/useNoteClipboard";
import { usePlatformShortcuts } from "@/hooks/usePlatformShortcuts";
import { usePlaybackController } from "@/hooks/usePlaybackController";
import { useProjectAudioActions } from "@/hooks/useProjectAudioActions";
import { useQuickHelpDialog } from "@/hooks/useQuickHelpDialog";
import { useRecordingController } from "@/hooks/useRecordingController";
import { useSelectionClipboardActions } from "@/hooks/useSelectionClipboardActions";
import { usePitchPickerHotkeys } from "@/hooks/usePitchPickerHotkeys";
import { useTrackMacroAutomationActions } from "@/hooks/useTrackMacroAutomationActions";
import { Project } from "@/types/music";
import { PatchValidationIssue, Patch } from "@/types/patch";
import { PatchOp } from "@/types/ops";

const isAudiblePatchOp = (op: PatchOp): boolean =>
  op.type !== "moveNode" && op.type !== "addMacro" && op.type !== "removeMacro" && op.type !== "bindMacro" && op.type !== "unbindMacro" && op.type !== "renameMacro";

export default function HomePage() {
  const [projectHistory, setProjectHistory] = useState<HistoryState<Project>>(() => createHistory(createEmptyProject()));
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [playheadBeat, setPlayheadBeat] = useState(0);
  const [userCueBeat, setUserCueBeat] = useState(0);
  const [selectedTrackId, setSelectedTrackId] = useState<string | undefined>(undefined);
  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>(undefined);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [strictWasmReady, setStrictWasmReady] = useState(process.env.NEXT_PUBLIC_STRICT_WASM !== "1");
  const [selectedNoteKeys, setSelectedNoteKeys] = useState<string[]>([]);
  const [timelineSelectionBeatRange, setTimelineSelectionBeatRange] = useState<BeatRange | null>(null);
  const [selectionMarqueeActive, setSelectionMarqueeActive] = useState(false);
  const [selectionActionScopePreview, setSelectionActionScopePreview] = useState<"source" | "all-tracks">("source");
  const [pitchPicker, setPitchPicker] = useState<{ trackId: string; noteId: string } | null>(null);
  const [previewPitch, setPreviewPitch] = useState(DEFAULT_NOTE_PITCH);
  const [previewPitchPickerOpen, setPreviewPitchPickerOpen] = useState(false);
  const [timelineActionsPopover, setTimelineActionsPopover] = useState<TimelineActionsPopoverRequest | null>(null);
  const [selectionActionPopoverMode, setSelectionActionPopoverMode] = useState<"expanded" | "collapsed">("expanded");
  const [pendingPreview, setPendingPreview] = useState<{ patchId: string; nonce: number } | null>(null);
  const [patchRemovalDialog, setPatchRemovalDialog] = useState<PatchRemovalDialogState | null>(null);
  const [migrationNotice, setMigrationNotice] = useState<string | null>(null);

  const audioEngineRef = useRef<AudioEngine | null>(null);
  const recordingStopSessionRef = useRef<(finalBeat?: number) => void>(() => {});
  const recordingHandleBeatRef = useRef<(beat: number) => void>(() => {});
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const project = projectHistory.current;
  const {
    noteClipboardPayload,
    setNoteClipboardPayload,
    writeClipboardPayload,
    clearNoteClipboard,
    syncNoteClipboardPayload
  } = useNoteClipboard();
  const {
    allTracksModifierLabel,
    deleteKeyLabel,
    isDeleteShortcutKey,
    primaryModifierLabel
  } = usePlatformShortcuts();
  const { closeHelp, helpOpen, keyboardShortcuts, openHelp } = useQuickHelpDialog({
    allTracksModifierLabel,
    deleteKeyLabel,
    primaryModifierLabel
  });

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      try {
        const saved = await loadProject();
        const loadedProject = saved ? normalizeProject(saved) : createDefaultProject();
        if (cancelled) {
          return;
        }
        if (saved) {
          saveProject(loadedProject).catch(() => {
            // ignore migration save failures
          });
        }
        setProjectHistory(createHistory(loadedProject));
        setSelectedTrackId(loadedProject.tracks[0]?.id);
        setReady(true);
      } catch (error) {
        if (cancelled) {
          return;
        }
        const fallbackProject = createDefaultProject();
        setProjectHistory(createHistory(fallbackProject));
        setSelectedTrackId(fallbackProject.tracks[0]?.id);
        setRuntimeError(`Failed to load the saved project. Loaded the default project instead. ${(error as Error).message}`);
        setReady(true);
      }
    };

    void boot();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => {
      saveProject({ ...project, updatedAt: Date.now() }).catch(() => {
        // ignore autosave errors
      });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [project, ready]);

  const selectedTrack = useMemo(
    () => project.tracks.find((track) => track.id === selectedTrackId) ?? project.tracks[0],
    [project.tracks, selectedTrackId]
  );
  const selectedNoteKeySet = useMemo(() => new Set(selectedNoteKeys), [selectedNoteKeys]);
  const noteSelectionBeatRange = useMemo(() => getSelectionBeatRange(project, selectedNoteKeys), [project, selectedNoteKeys]);
  const hasTimelineRangeSelection = Boolean(timelineSelectionBeatRange);
  const noteSelectionTrackLabel = useMemo(() => {
    const selectedTrackIds = project.tracks
      .filter((track) => track.notes.some((note) => selectedNoteKeySet.has(getNoteSelectionKey(track.id, note.id))))
      .map((track) => track.name);
    if (selectedTrackIds.length === 0) {
      return "Track 1";
    }
    if (selectedTrackIds.length === 1) {
      return selectedTrackIds[0];
    }
    return `${selectedTrackIds[0]}-${selectedTrackIds[selectedTrackIds.length - 1]}`;
  }, [project.tracks, selectedNoteKeySet]);
  const noteSelectionSourceTrackId = useMemo(
    () => getSelectionSourceTrackId(project, selectedNoteKeys),
    [project, selectedNoteKeys]
  );
  const canvasSelection = useMemo<TrackCanvasSelection>(() => {
    if (timelineSelectionBeatRange) {
      return {
        kind: "timeline",
        beatRange: timelineSelectionBeatRange,
        label: "All Tracks",
        markerTrackId: project.tracks[0]?.id ?? ""
      };
    }
    if (noteSelectionBeatRange && noteSelectionSourceTrackId) {
      return {
        kind: "note",
        selectedNoteKeys: selectedNoteKeySet,
        beatRange: noteSelectionBeatRange,
        label: noteSelectionTrackLabel,
        markerTrackId:
          selectionActionScopePreview === "all-tracks"
            ? project.tracks[0]?.id ?? noteSelectionSourceTrackId
            : noteSelectionSourceTrackId
      };
    }
    return { kind: "none" };
  }, [
    noteSelectionBeatRange,
    noteSelectionTrackLabel,
    noteSelectionSourceTrackId,
    project.tracks,
    selectedNoteKeySet,
    selectionActionScopePreview,
    timelineSelectionBeatRange
  ]);
  const selectionBeatRange = canvasSelection.kind === "none" ? null : canvasSelection.beatRange;

  const trackNameById = useMemo(() => new Map(project.tracks.map((track) => [track.id, track.name] as const)), [project.tracks]);

  const selectedPatch = useMemo(
    () => project.patches.find((patch) => patch.id === selectedTrack?.instrumentPatchId) ?? project.patches[0],
    [project.patches, selectedTrack?.instrumentPatchId]
  );

  const patchValidationById = useMemo(() => {
    const next = new Map<string, PatchValidationIssue[]>();
    for (const patch of project.patches) {
      next.set(patch.id, validatePatch(patch).issues);
    }
    return next;
  }, [project.patches]);

  const validationIssues = useMemo(
    () => (selectedPatch ? patchValidationById.get(selectedPatch.id) ?? [] : []),
    [patchValidationById, selectedPatch]
  );
  const selectedPatchHasErrors = validationIssues.some((issue) => issue.level === "error");
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
      options?: { actionKey?: string; coalesce?: boolean }
    ) => {
      setProjectHistory((prev) => {
        const next = updater(prev.current);
        if (next === prev.current) {
          return prev;
        }
        return pushHistory(prev, next, options);
      });
    },
    []
  );

  const resetProjectHistory = useCallback((nextProject: Project) => {
    setProjectHistory(createHistory(nextProject));
  }, []);

  const playbackEndBeat = useMemo(() => {
    return getProjectTimelineEndBeat(project);
  }, [project]);

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
    previewPitch,
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
    setMigrationNotice(null);
  }, [selectedPatch?.id, selectedTrack?.id]);

  useEffect(() => {
    if (!ready) return;
    if (!audioEngineRef.current) {
      audioEngineRef.current = new AudioEngine();
    }
    audioEngineRef.current.setProject(project, { syncToWorklet: !playing });
  }, [playing, project, ready]);

  useEffect(() => {
    const existingSelectionKeys = new Set(
      project.tracks.flatMap((track) => track.notes.map((note) => getNoteSelectionKey(track.id, note.id)))
    );
    setSelectedNoteKeys((current) => current.filter((selectionKey) => existingSelectionKeys.has(selectionKey)));
  }, [project.tracks]);

  useEffect(() => {
    if (selectedNoteKeys.length > 0 && timelineSelectionBeatRange) {
      setTimelineSelectionBeatRange(null);
    }
  }, [selectedNoteKeys.length, timelineSelectionBeatRange]);

  useEffect(() => {
    if (!noteSelectionSourceTrackId || selectionMarqueeActive || pitchPicker || canvasSelection.kind === "timeline") {
      return;
    }
    setSelectedTrackId((current) => (current === noteSelectionSourceTrackId ? current : noteSelectionSourceTrackId));
  }, [canvasSelection.kind, noteSelectionSourceTrackId, pitchPicker, selectionMarqueeActive]);

  useEffect(() => {
    if (!selectionBeatRange) {
      setSelectionActionPopoverMode("expanded");
      setSelectionActionScopePreview("source");
    }
  }, [selectionBeatRange]);

  useEffect(() => {
    setSelectionActionPopoverMode("expanded");
  }, [selectedNoteKeys]);

  useEffect(() => {
    if (!timelineSelectionBeatRange) {
      return;
    }
    setSelectionActionPopoverMode("expanded");
  }, [timelineSelectionBeatRange]);

  useEffect(() => {
    if (canvasSelection.kind === "timeline") {
      setSelectionActionScopePreview("all-tracks");
      return;
    }
    setSelectionActionScopePreview("source");
  }, [canvasSelection.kind, noteSelectionSourceTrackId]);

  useEffect(() => {
    if (!ready || !pendingPreview || playing || !selectedTrack) {
      return;
    }
    if (selectedTrack.instrumentPatchId !== pendingPreview.patchId) {
      setPendingPreview(null);
      return;
    }
    audioEngineRef.current
      ?.previewNote(selectedTrack.id, pitchToVoct(previewPitch), 1)
      .catch((error) => setRuntimeError((error as Error).message));
    setPendingPreview(null);
  }, [pendingPreview, playing, previewPitch, ready, selectedTrack]);

  useEffect(() => {
    if (!ready || process.env.NEXT_PUBLIC_STRICT_WASM !== "1") return;
    loadDspWasm()
      .then((exports) => {
        if (!exports) {
          setRuntimeError("Strict WASM mode is active, but WASM exports were not loaded.");
          setStrictWasmReady(false);
          return;
        }
        setRuntimeError(null);
        setStrictWasmReady(true);
      })
      .catch((error) => {
        setRuntimeError((error as Error).message);
        setStrictWasmReady(false);
      });
  }, [ready]);

  const { upsertNote, updateNote, deleteNote } = useNoteEditor({ commitProjectChange });

  const playback = usePlaybackController({
    project,
    playbackEndBeat,
    userCueBeat,
    playheadBeat,
    strictWasmReady,
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
    previewPitchPickerOpen,
    strictWasmReady,
    audioEngineRef,
    commitProjectChange,
    upsertNote,
    updateNote,
    setPlaying,
    setPlayheadBeat,
    setRuntimeError,
    onBeginRecordingPlayback: async (trackId, cueBeat) => {
      await playback.beginPlaybackAtBeat(cueBeat);
      audioEngineRef.current?.setRecordingTrack(trackId);
    }
  });

  recordingStopSessionRef.current = recording.stopRecordSession;
  recordingHandleBeatRef.current = recording.handlePlayheadBeat;

  const toggleTrackMute = useCallback((trackId: string) => {
    commitProjectChange((current) => ({
      ...current,
      tracks: current.tracks.map((track) => (track.id === trackId ? { ...track, mute: !track.mute } : track))
    }), { actionKey: `track:${trackId}:mute` });
  }, [commitProjectChange]);
  const { exportingAudio, exportAudio, setTrackVolume } = useProjectAudioActions({
    project,
    audioEngineRef,
    commitProjectChange,
    setRuntimeError
  });

  const previewNoteForPitchPicker = useCallback((trackId: string, noteId: string, pitch: string) => {
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
      .catch((error) => setRuntimeError((error as Error).message));
  }, [playing, project.tracks]);

  const setPlayheadFromUser = useCallback((beat: number) => {
    setUserCueBeat(beat);
    setPlayheadBeat(beat);
    setSelectedNoteKeys([]);
    setTimelineSelectionBeatRange(null);
    setSelectionMarqueeActive(false);
    setSelectionActionScopePreview("source");
    setPitchPicker(null);
  }, []);
  const {
    applyNoteClipboardPaste,
    copyAllTracksInSelection,
    copySelectedNotes,
    cutAllTracksInSelection,
    cutSelectedNotes,
    deleteAllTracksInSelection,
    deleteSelectedNoteSelection,
    deleteSelectedNotes
  } = useSelectionClipboardActions({
    clearNoteClipboard,
    closeTimelineActionsPopover: () => setTimelineActionsPopover(null),
    commitProjectChange,
    noteClipboardPayload,
    project,
    selectedNoteKeys,
    selectedTrackId: selectedTrack?.id,
    selectionBeatRange,
    setPlayheadFromUser,
    setSelectedNoteKeys,
    writeClipboardPayload
  });
  const { applyLoopSettings, addLoopBoundary, updateLoopRepeatCount, removeLoopBoundary, loopConflictDialog, clearLoopConflictDialog } =
    useLoopSettings({
      project,
      commitProjectChange,
      onCloseLoopPopover: () => setTimelineActionsPopover(null)
    });

  useDismissiblePopover({
    active: Boolean(timelineActionsPopover),
    popoverSelector: ".timeline-actions-popover",
    onDismiss: useCallback(() => setTimelineActionsPopover(null), [])
  });

  const selectionActionPopoverAvailable = Boolean(
    selectionBeatRange &&
    !selectionMarqueeActive &&
    !pitchPicker &&
    !timelineActionsPopover
  );
  const selectionActionPopoverVisible = selectionActionPopoverAvailable;
  const selectionActionPopoverCollapsed = selectionActionPopoverMode === "collapsed";

  const collapseSelectionActionPopover = useCallback(() => {
    setSelectionActionPopoverMode("collapsed");
    setSelectionActionScopePreview("source");
  }, []);

  useDismissiblePopover({
    active: selectionActionPopoverAvailable && !selectionActionPopoverCollapsed,
    popoverSelector: ".selection-actions-popover",
    onDismiss: collapseSelectionActionPopover
  });

  const timelineMarkersAtBeat = useMemo(
    () =>
      timelineActionsPopover
        ? getSanitizedLoopMarkers(project.global.loop).filter((marker) => Math.abs(marker.beat - timelineActionsPopover.beat) < 1e-9)
        : [],
    [project.global.loop, timelineActionsPopover]
  );
  const startMarkerAtTimelineBeat = timelineMarkersAtBeat.find((marker) => marker.kind === "start");
  const endMarkerAtTimelineBeat = timelineMarkersAtBeat.find((marker) => marker.kind === "end");
  const expandableLoopRegion = useMemo(
    () => (timelineActionsPopover ? getUniqueMatchedLoopRegionAtBeat(project.global.loop, timelineActionsPopover.beat) : null),
    [project.global.loop, timelineActionsPopover]
  );

  const expandSelectedLoopToNotes = useCallback(() => {
    if (!expandableLoopRegion) {
      return;
    }
    commitProjectChange(
      (current) => expandLoopRegionToNotes(current, expandableLoopRegion),
      { actionKey: `global:loop:expand:${expandableLoopRegion.startMarkerId}` }
    );
    setTimelineActionsPopover(null);
  }, [commitProjectChange, expandableLoopRegion]);

  const requestTimelineActionsPopover = useCallback((request: TimelineActionsPopoverRequest) => {
    setTimelineActionsPopover(request);
    setSelectionActionScopePreview("source");
    void syncNoteClipboardPayload();
  }, [syncNoteClipboardPayload]);

  const openPitchPicker = useCallback((trackId: string, noteId: string) => {
    setPitchPicker({ trackId, noteId });
    const notePitch = project.tracks.find((track) => track.id === trackId)?.notes.find((note) => note.id === noteId)?.pitchStr;
    previewNoteForPitchPicker(trackId, noteId, notePitch ?? DEFAULT_NOTE_PITCH);
  }, [previewNoteForPitchPicker, project.tracks]);

  const closePitchPicker = useCallback(() => {
    setPitchPicker(null);
  }, []);

  const clearCanvasSelection = useCallback(() => {
    setSelectedNoteKeys([]);
    setTimelineSelectionBeatRange(null);
    setSelectionActionPopoverMode("expanded");
    setSelectionActionScopePreview("source");
  }, []);

  const setNoteSelectionFromCanvas = useCallback((selectionKeys: string[]) => {
    setTimelineActionsPopover(null);
    setTimelineSelectionBeatRange(null);
    setSelectedNoteKeys(selectionKeys);
  }, []);

  const setTimelineSelectionFromCanvas = useCallback((range: BeatRange | null) => {
    setTimelineActionsPopover(null);
    setPitchPicker(null);
    setSelectedNoteKeys([]);
    setTimelineSelectionBeatRange(range);
  }, []);

  const schedulePatchPreview = useCallback((patchId: string) => {
    setPendingPreview({ patchId, nonce: Date.now() });
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

  const previewSelectedPatchNow = useCallback((pitch = previewPitch) => {
    if (!selectedPatch || !selectedTrack || playing) {
      return;
    }
    audioEngineRef.current
      ?.previewNote(selectedTrack.id, pitchToVoct(pitch), 1)
      .catch((error) => setRuntimeError((error as Error).message));
  }, [playing, previewPitch, selectedPatch, selectedTrack]);

  const applyPatchOp = (op: PatchOp) => {
    if (!selectedPatch) return;
    if (resolvePatchSource(selectedPatch) === "preset" && op.type !== "moveNode") {
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
            : `patch:${selectedPatch.id}:${op.type}`,
        coalesce: op.type === "moveNode"
      }
    );
    if (isAudiblePatchOp(op)) {
      schedulePatchPreview(selectedPatch.id);
    }
  };

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
        name: suggestedName
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

  const resetSelectedPatchMacros = useCallback(() => {
    if (!selectedPatch || !selectedTrack) {
      return;
    }

    const nextMacroValues = Object.fromEntries(
      selectedPatch.ui.macros.map((macro) => [macro.id, macro.defaultNormalized ?? 0.5])
    );
    for (const [macroId, normalized] of Object.entries(nextMacroValues)) {
      audioEngineRef.current?.setMacroValue(selectedTrack.id, macroId, normalized);
    }
    commitProjectChange(
      (current) => ({
        ...current,
        tracks: current.tracks.map((track) =>
          track.id === selectedTrack.id
            ? { ...track, macroValues: nextMacroValues, macroAutomations: {} }
            : track
        )
      }),
      { actionKey: `track:${selectedTrack.id}:macro-reset` }
    );
    schedulePatchPreview(selectedPatch.id);
  }, [commitProjectChange, schedulePatchPreview, selectedPatch, selectedTrack]);

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

  const undoProject = useCallback(() => {
    setProjectHistory((prev) => undoHistory(prev));
  }, []);

  const redoProject = useCallback(() => {
    setProjectHistory((prev) => redoHistory(prev));
  }, []);

  useEditorKeyboardShortcuts({
    applyNoteClipboardPaste,
    copyAllTracksInSelection,
    cutAllTracksInSelection,
    deletePrimarySelection: hasTimelineRangeSelection ? deleteAllTracksInSelection : deleteSelectedNoteSelection,
    deleteAllTracksInSelection,
    hasPrimarySelection: hasTimelineRangeSelection || selectedNoteKeys.length > 0,
    isDeleteShortcutKey,
    onCloseTransientUi: () => {
      closeHelp();
      setPitchPicker(null);
      setPreviewPitchPickerOpen(false);
      setPatchRemovalDialog(null);
      setTimelineActionsPopover(null);
      setSelectedNoteKeys([]);
      setTimelineSelectionBeatRange(null);
    },
    onOpenHelp: openHelp,
    playheadBeat,
    redoProject,
    undoProject
  });

  useEditorClipboardEvents({
    commitProjectChange,
    cutAllTracksInSelection,
    deleteSelectedNotes,
    hasTimelineRangeSelection,
    playheadBeat,
    project,
    selectedNoteKeys,
    selectionBeatRange,
    selectedTrackId: selectedTrack?.id,
    setNoteClipboardPayload,
    setSelectedNoteKeys
  });

  usePitchPickerHotkeys(Boolean(pitchPicker), useCallback((pitch: string) => {
    if (!pitchPicker) return;
    updateNote(pitchPicker.trackId, pitchPicker.noteId, { pitchStr: pitch }, {
      actionKey: `track:${pitchPicker.trackId}:pitch:${pitchPicker.noteId}`
    });
    previewNoteForPitchPicker(pitchPicker.trackId, pitchPicker.noteId, pitch);
    closePitchPicker();
  }, [closePitchPicker, pitchPicker, previewNoteForPitchPicker, updateNote]));

  usePitchPickerHotkeys(previewPitchPickerOpen, useCallback((pitch: string) => {
    setPreviewPitch(pitch);
    setPreviewPitchPickerOpen(false);
    previewSelectedPatchNow(pitch);
  }, [previewSelectedPatchNow]));

  const exportJson = () => {
    const payload = exportProjectToJson(project);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.name.replace(/\s+/g, "_").toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importJson = async (file: File) => {
    const text = await file.text();
    try {
      const imported = importProjectFromJson(text);
      resetProjectHistory(imported);
      setSelectedTrackId(imported.tracks[0]?.id);
      audioEngineRef.current?.setProject(imported);
    } catch (error) {
      setRuntimeError((error as Error).message);
    }
  };

  const addTrack = () => {
    const fallbackPatch = project.patches[0];
    if (!fallbackPatch) return;

    const trackId = createId("track");
    commitProjectChange((current) => ({
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
    }), { actionKey: `track:add:${trackId}` });
    setSelectedTrackId(trackId);
  };

  const renameTrack = useCallback((trackId: string, name: string) => {
    commitProjectChange((current) => renameTrackInProject(current, trackId, name), { actionKey: `track:${trackId}:rename` });
  }, [commitProjectChange]);

  const removeSelectedTrack = useCallback(() => {
    if (!selectedTrack || project.tracks.length <= 1) {
      return;
    }

    const remainingTracks = project.tracks.filter((track) => track.id !== selectedTrack.id);
    commitProjectChange((current) => removeTrackFromProject(current, selectedTrack.id), { actionKey: `track:${selectedTrack.id}:remove` });
    setSelectedTrackId(remainingTracks[0]?.id);
    setSelectedNodeId(undefined);
  }, [commitProjectChange, project.tracks, selectedTrack]);

  const duplicatePatchForSelectedTrack = () => {
    if (!selectedPatch || !selectedTrack) return;

    const duplicate = structuredClone(selectedPatch);
    duplicate.id = createId("patch");
    duplicate.name = `${selectedPatch.name} Copy`;
    duplicate.meta = { source: "custom" };

    commitProjectChange((current) => ({
      ...current,
      patches: [...current.patches, duplicate],
      tracks: current.tracks.map((track) =>
        track.id === selectedTrack.id ? { ...track, instrumentPatchId: duplicate.id } : track
      )
    }), { actionKey: `patch:duplicate:${duplicate.id}` });
  };

  const requestRemoveSelectedPatch = useCallback(() => {
    const patchStatus = selectedPatch ? resolvePatchPresetStatus(selectedPatch) : "custom";
    if (!selectedPatch || (resolvePatchSource(selectedPatch) !== "custom" && patchStatus !== "legacy_preset")) {
      return;
    }
    const affectedTracks = project.tracks.filter((track) => track.instrumentPatchId === selectedPatch.id);
    const fallbackPatchId = project.patches.find((patch) => patch.id !== selectedPatch.id)?.id ?? "";
    setPatchRemovalDialog({
      patchId: selectedPatch.id,
      rows: affectedTracks.map((track) => ({
        trackId: track.id,
        mode: fallbackPatchId ? "fallback" : "remove",
        fallbackPatchId
      }))
    });
  }, [project.patches, project.tracks, selectedPatch]);

  const confirmRemovePatch = useCallback(() => {
    if (!patchRemovalDialog) {
      return;
    }

    const nextTrackIds = new Set(project.tracks.map((track) => track.id));
    for (const row of patchRemovalDialog.rows) {
      if (row.mode === "remove") {
        nextTrackIds.delete(row.trackId);
        continue;
      }
      if (!row.fallbackPatchId || row.fallbackPatchId === patchRemovalDialog.patchId) {
        return;
      }
    }
    if (nextTrackIds.size === 0) {
      setRuntimeError("At least one track must remain in the project.");
      return;
    }

    commitProjectChange((current) => {
      const rowsByTrackId = new Map(patchRemovalDialog.rows.map((row) => [row.trackId, row] as const));
      const tracks = current.tracks
        .flatMap((track) => {
          if (track.instrumentPatchId !== patchRemovalDialog.patchId) {
            return [track];
          }
          const row = rowsByTrackId.get(track.id);
          if (!row || row.mode === "remove") {
            return [];
          }
          return [{ ...track, instrumentPatchId: row.fallbackPatchId }];
        });

      return {
        ...current,
        tracks,
        patches: current.patches.filter((patch) => patch.id !== patchRemovalDialog.patchId)
      };
    }, { actionKey: `patch:${patchRemovalDialog.patchId}:remove` });

    const survivingSelectedTrack =
      selectedTrackId && nextTrackIds.has(selectedTrackId) ? selectedTrackId : project.tracks.find((track) => nextTrackIds.has(track.id))?.id;
    setSelectedTrackId(survivingSelectedTrack);
    setPatchRemovalDialog(null);
    setSelectedNodeId(undefined);
  }, [commitProjectChange, patchRemovalDialog, project.tracks, selectedTrackId]);

  const updateTrackPatch = (trackId: string, patchId: string) => {
    commitProjectChange((current) => ({
      ...current,
      tracks: current.tracks.map((track) =>
        track.id === trackId
          ? { ...track, instrumentPatchId: patchId, macroValues: {}, macroAutomations: {}, macroPanelExpanded: false }
          : track
      )
    }), { actionKey: `track:${trackId}:patch` });
    setSelectedNodeId(undefined);
  };

  const toggleTrackMacroPanel = useCallback((trackId: string) => {
    commitProjectChange((current) => ({
      ...current,
      tracks: current.tracks.map((track) =>
        track.id === trackId ? { ...track, macroPanelExpanded: !track.macroPanelExpanded } : track
      )
    }), { actionKey: `track:${trackId}:macro-panel` });
  }, [commitProjectChange]);

  const changeTrackMacro = useCallback((trackId: string, macroId: string, normalized: number, options?: { commit?: boolean }) => {
    audioEngineRef.current?.setMacroValue(trackId, macroId, normalized);
    commitProjectChange(
      (current) => ({
        ...current,
        tracks: current.tracks.map((track) =>
          track.id === trackId
            ? { ...track, macroValues: { ...track.macroValues, [macroId]: normalized } }
            : track
        )
      }),
      { actionKey: `track:${trackId}:macro:${macroId}`, coalesce: !options?.commit }
    );
    if (options?.commit) {
      const track = project.tracks.find((entry) => entry.id === trackId);
      if (track) {
        const patch = project.patches.find((entry) => entry.id === track.instrumentPatchId);
        if (patch) {
          schedulePatchPreview(patch.id);
        }
      }
    }
  }, [commitProjectChange, project.patches, project.tracks, schedulePatchPreview]);

  const bindTrackVolumeToAutomation = useCallback((trackId: string, initialValue: number) => {
    commitProjectChange(
      (current) => ({
        ...current,
        tracks: current.tracks.map((track) =>
          track.id === trackId
            ? {
                ...track,
                macroAutomations: {
                  ...track.macroAutomations,
                  [TRACK_VOLUME_AUTOMATION_ID]: createTrackVolumeAutomationLane(initialValue)
                }
              }
            : track
        )
      }),
      { actionKey: `track:${trackId}:volume:bind-automation` }
    );
  }, [commitProjectChange]);

  const unbindTrackVolumeFromAutomation = useCallback((trackId: string) => {
    commitProjectChange(
      (current) => ({
        ...current,
        tracks: current.tracks.map((track) => {
          if (track.id !== trackId) {
            return track;
          }
          const nextAutomations = { ...track.macroAutomations };
          const lane = nextAutomations[TRACK_VOLUME_AUTOMATION_ID];
          delete nextAutomations[TRACK_VOLUME_AUTOMATION_ID];
          return {
            ...track,
            macroAutomations: nextAutomations,
            volume: lane ? lane.startValue * 2 : track.volume
          };
        })
      }),
      { actionKey: `track:${trackId}:volume:unbind-automation` }
    );
  }, [commitProjectChange]);

  const toggleTrackVolumeAutomationLane = useCallback((trackId: string) => {
    commitProjectChange(
      (current) => ({
        ...current,
        tracks: current.tracks.map((track) => {
          if (track.id !== trackId) {
            return track;
          }
          const lane = track.macroAutomations[TRACK_VOLUME_AUTOMATION_ID];
          if (!lane) {
            return track;
          }
          return {
            ...track,
            macroAutomations: {
              ...track.macroAutomations,
              [TRACK_VOLUME_AUTOMATION_ID]: {
                ...lane,
                expanded: !lane.expanded
              }
            }
          };
        })
      }),
      { actionKey: `track:${trackId}:volume:toggle-lane` }
    );
  }, [commitProjectChange]);

  const previewTrackVolume = useCallback((trackId: string, volume: number) => {
    audioEngineRef.current?.setMacroValue(trackId, TRACK_VOLUME_AUTOMATION_ID, Math.max(0, Math.min(2, volume)) / 2);
    audioEngineRef.current
      ?.previewNote(trackId, pitchToVoct(previewPitch), 1, 0.9, { ignoreMute: true, ignoreVolume: false })
      .catch((error) => setRuntimeError((error as Error).message));
  }, [previewPitch]);

  const previewPlacedNote = useCallback((trackId: string, note: Project["tracks"][number]["notes"][number]) => {
    audioEngineRef.current
      ?.previewNote(trackId, pitchToVoct(note.pitchStr), note.durationBeats, note.velocity)
      .catch((error) => setRuntimeError((error as Error).message));
  }, []);

  if (!ready || !selectedTrack || !selectedPatch) {
    return <main className="loading">Loading...</main>;
  }

  const pitchPickerTrack = pitchPicker ? project.tracks.find((track) => track.id === pitchPicker.trackId) : undefined;
  const pitchPickerNote = pitchPickerTrack?.notes.find((note) => note.id === pitchPicker?.noteId);
  const activeRecordingTrackId = recording.activeRecordingTrackId;
  const activeRecordingTrack = activeRecordingTrackId ? project.tracks.find((track) => track.id === activeRecordingTrackId) : undefined;
  const resetToProject = async (nextProject: Project) => {
    playback.stopPlayback();
    await clearProject();
    resetProjectHistory(nextProject);
    setSelectedTrackId(nextProject.tracks[0]?.id);
  };
  const trackCanvasTrackActions = {
    onSelectTrack: setSelectedTrackId,
    onRenameTrack: renameTrack,
    onToggleTrackMute: toggleTrackMute,
    onSetTrackVolume: setTrackVolume,
    onPreviewTrackVolume: previewTrackVolume,
    onBindTrackVolumeToAutomation: bindTrackVolumeToAutomation,
    onUnbindTrackVolumeFromAutomation: unbindTrackVolumeFromAutomation,
    onToggleTrackVolumeAutomationLane: toggleTrackVolumeAutomationLane,
    onUpdateTrackPatch: updateTrackPatch,
    onToggleTrackMacroPanel: toggleTrackMacroPanel,
    onResetTrackMacros: resetSelectedPatchMacros
  };
  const trackCanvasAutomationActions = {
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
  const trackCanvasNoteActions = {
    onOpenPitchPicker: openPitchPicker,
    onPreviewPlacedNote: previewPlacedNote,
    onUpsertNote: upsertNote,
    onUpdateNote: updateNote,
    onDeleteNote: deleteNote
  };
  const trackCanvasSelectionActions = {
    onSetNoteSelection: setNoteSelectionFromCanvas,
    onSetTimelineSelectionBeatRange: setTimelineSelectionFromCanvas,
    onSetSelectionMarqueeActive: setSelectionMarqueeActive,
    onPreviewSelectionActionScopeChange: setSelectionActionScopePreview,
    selectionActionPopoverCollapsed,
    onExpandSelectionActionPopover: () => setSelectionActionPopoverMode("expanded"),
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
    onCopyAllTracksInSelection: () => {
      void copyAllTracksInSelection();
    },
    onCutAllTracksInSelection: () => {
      void cutAllTracksInSelection();
    },
    onDeleteAllTracksInSelection: deleteAllTracksInSelection
  };
  return (
    <main className="app">
      <TransportBar
        tempo={project.global.tempo}
        meter={project.global.meter}
        gridBeats={project.global.gridBeats}
        isPlaying={playing || recording.recordPhase === "count_in"}
        recordEnabled={recording.recordEnabled}
        recordPhase={recording.recordPhase}
        countInLabel={recording.countInLabel}
        playheadBeat={playheadBeat}
        onPlay={playback.startPlayback}
        onStop={playback.stopPlayback}
        onToggleRecord={() => {
          if (recording.recordEnabled || recording.recordPhase !== "idle") {
            playback.stopPlayback(true);
            return;
          }
          playback.stopPlayback(true);
          void recording.startRecordMode();
        }}
        onExportAudio={() => {
          void exportAudio();
        }}
        exportAudioDisabled={exportingAudio}
        onTempoChange={(tempo) =>
          commitProjectChange((current) => ({ ...current, global: { ...current.global, tempo } }), {
            actionKey: "global:tempo"
          })
        }
        onMeterChange={(meter) =>
          commitProjectChange((current) => ({ ...current, global: { ...current.global, meter } }), {
            actionKey: "global:meter"
          })
        }
        onGridChange={(gridBeats) =>
          commitProjectChange((current) => ({ ...current, global: { ...current.global, gridBeats } }), {
            actionKey: "global:grid"
          })
        }
      />

      <ProjectActionsBar
        recordingDisabled={recording.recordEnabled}
        canRemoveTrack={project.tracks.length > 1}
        onAddTrack={addTrack}
        onRemoveTrack={removeSelectedTrack}
        onOpenHelp={openHelp}
        onExportJson={exportJson}
        onImportJson={() => importInputRef.current?.click()}
        onClearProject={() => void resetToProject(createEmptyProject())}
        onResetToDefaultProject={() => void resetToProject(createDefaultProject())}
        importInputRef={importInputRef}
        onImportFile={(file) => {
          void importJson(file);
        }}
      />

      {runtimeError && <p className="error">{runtimeError}</p>}

      <TrackCanvas
        project={project}
        invalidPatchIds={invalidPatchIds}
        selectedTrackId={selectedTrack.id}
        selection={canvasSelection}
        playheadBeat={playheadBeat}
        activeRecordedNotes={recording.activeRecordedNotes}
        ghostPlayheadBeat={recording.ghostPlayheadBeat ?? undefined}
        countInLabel={recording.countInLabel ?? undefined}
        timelineActionsPopoverOpen={Boolean(timelineActionsPopover)}
        hideSelectionActionPopover={!selectionActionPopoverVisible}
        onSetPlayheadBeat={setPlayheadFromUser}
        onRequestTimelineActionsPopover={requestTimelineActionsPopover}
        trackActions={trackCanvasTrackActions}
        automationActions={trackCanvasAutomationActions}
        noteActions={trackCanvasNoteActions}
        selectionActions={trackCanvasSelectionActions}
      />

      {timelineActionsPopover && (
        <TimelineActionsPopover
          left={timelineActionsPopover.clientX}
          top={timelineActionsPopover.clientY + 12}
          showPasteActions={Boolean(noteClipboardPayload)}
          showAddStart={!startMarkerAtTimelineBeat}
          showAddEnd={timelineActionsPopover.beat > 0 && !endMarkerAtTimelineBeat}
          showExpandLoopToNotes={Boolean(expandableLoopRegion)}
          startMarkerId={startMarkerAtTimelineBeat?.id}
          endMarkerId={endMarkerAtTimelineBeat?.id}
          endRepeatCount={endMarkerAtTimelineBeat?.repeatCount}
          onPaste={() => applyNoteClipboardPaste("paste", timelineActionsPopover.beat)}
          onPasteAllTracks={() => applyNoteClipboardPaste("paste-all-tracks", timelineActionsPopover.beat)}
          onInsert={() => applyNoteClipboardPaste("insert", timelineActionsPopover.beat)}
          onInsertAllTracks={() => applyNoteClipboardPaste("insert-all-tracks", timelineActionsPopover.beat)}
          onAddStart={() => addLoopBoundary(timelineActionsPopover.beat, "start")}
          onAddEnd={() => addLoopBoundary(timelineActionsPopover.beat, "end")}
          onExpandLoopToNotes={expandSelectedLoopToNotes}
          onUpdateRepeatCount={(repeatCount) => {
            if (endMarkerAtTimelineBeat) {
              updateLoopRepeatCount(endMarkerAtTimelineBeat.id, repeatCount);
            }
          }}
          onRemoveStart={() => {
            if (startMarkerAtTimelineBeat) {
              removeLoopBoundary(startMarkerAtTimelineBeat.id);
            }
          }}
          onRemoveEnd={() => {
            if (endMarkerAtTimelineBeat) {
              removeLoopBoundary(endMarkerAtTimelineBeat.id);
            }
          }}
          onClose={() => setTimelineActionsPopover(null)}
        />
      )}

      {loopConflictDialog && (
        <LoopConflictDialog
          conflicts={loopConflictDialog.conflicts}
          trackNameById={trackNameById}
          onCancel={clearLoopConflictDialog}
          onSplit={() => applyLoopSettings(loopConflictDialog.nextLoop, { autoSplit: true })}
        />
      )}

      <RecordingDock
        open={recording.recordEnabled}
        track={activeRecordingTrack}
        title={recording.recordPhase === "count_in" ? "Record Count-In" : "Recording"}
        statusText={recording.recordStatusText}
        pressedPitches={recording.pressedRecordingPitches}
        onPressStart={(pitch) => {
          if (recording.recordPhase === "recording") {
            recording.startRecordedNote(`pointer:${pitch}`, pitch);
          }
        }}
        onPressEnd={(pitch) => recording.stopRecordedInput(`pointer:${pitch}`)}
      />

      <InstrumentEditor
        patch={selectedPatch}
        previewPitch={previewPitch}
        migrationNotice={migrationNotice}
        selectedNodeId={selectedNodeId}
        validationIssues={validationIssues}
        invalid={selectedPatchHasErrors}
        onRenamePatch={renameSelectedPatch}
        onDuplicatePatch={duplicatePatchForSelectedTrack}
        onUpdatePreset={updatePresetToLatest}
        canRemovePatch={resolvePatchSource(selectedPatch) === "custom" || resolvePatchPresetStatus(selectedPatch) === "legacy_preset"}
        onRequestRemovePatch={requestRemoveSelectedPatch}
        onOpenPreviewPitchPicker={() => setPreviewPitchPickerOpen(true)}
        onPreviewNow={() => previewSelectedPatchNow()}
        onSelectNode={setSelectedNodeId}
        onApplyOp={applyPatchOp}
        onExposeMacro={exposePatchMacro}
      />

      <QuickHelpDialog keyboardShortcuts={keyboardShortcuts} onClose={closeHelp} open={helpOpen} />

      <PitchPickerModal
        open={Boolean(pitchPicker && pitchPickerNote)}
        title="Pick Pitch"
        description="Select a key from C1 to C7. QWERTY-mapped keys are shown on each note."
        selectedPitch={pitchPickerNote?.pitchStr ?? previewPitch}
        onClose={closePitchPicker}
        onSelectPitch={(pitch) => {
          if (!pitchPicker) {
            return;
          }
          updateNote(pitchPicker.trackId, pitchPicker.noteId, { pitchStr: pitch }, {
            actionKey: `track:${pitchPicker.trackId}:pitch:${pitchPicker.noteId}`
          });
          previewNoteForPitchPicker(pitchPicker.trackId, pitchPicker.noteId, pitch);
          closePitchPicker();
        }}
      />

      <PitchPickerModal
        open={previewPitchPickerOpen}
        title="Preview Pitch"
        description="Select the pitch used for auto-preview when an instrument sound changes."
        selectedPitch={previewPitch}
        onClose={() => setPreviewPitchPickerOpen(false)}
        onSelectPitch={(pitch) => {
          setPreviewPitch(pitch);
          setPreviewPitchPickerOpen(false);
          previewSelectedPatchNow(pitch);
        }}
      />

      <PatchRemovalDialogModal
        dialog={patchRemovalDialog}
        project={project}
        setDialog={setPatchRemovalDialog}
        onConfirm={confirmRemovePatch}
      />
    </main>
  );
}

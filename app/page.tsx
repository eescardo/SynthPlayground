"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AudioEngine } from "@/audio/engine";
import { loadDspWasm } from "@/audio/wasmBridge";
import { InstrumentEditor } from "@/components/InstrumentEditor";
import { LoopConflictDialog } from "@/components/LoopConflictDialog";
import { PianoKeyboard } from "@/components/PianoKeyboard";
import { TimelineActionsPopover } from "@/components/TimelineActionsPopover";
import { TimelineActionsPopoverRequest, TrackCanvas } from "@/components/TrackCanvas";
import { TransportBar } from "@/components/TransportBar";
import { createId } from "@/lib/ids";
import { getSanitizedLoopMarkers } from "@/lib/looping";
import { clearProject, loadProject, saveProject } from "@/lib/persistence";
import { createHistory, HistoryState, pushHistory, redoHistory, undoHistory } from "@/lib/history";
import { getModuleSchema } from "@/lib/patch/moduleRegistry";
import { applyPatchOp as applyPatchGraphOp } from "@/lib/patch/ops";
import { compilePatchPlan, validatePatch } from "@/lib/patch/validation";
import { createDefaultProject, createEmptyProject } from "@/lib/patch/presets";
import { getBundledPresetPatch, resolvePatchPresetStatus, resolvePatchSource } from "@/lib/patch/source";
import { importProjectFromJson, exportProjectToJson, normalizeProject } from "@/lib/projectSerde";
import { keyToPitch, pitchToVoct } from "@/lib/pitch";
import { removeTrackFromProject, renameTrackInProject } from "@/lib/trackEdits";
import { useNoteEditor } from "@/hooks/useNoteEditor";
import { useLoopSettings } from "@/hooks/useLoopSettings";
import { usePlaybackController } from "@/hooks/usePlaybackController";
import { useProjectAudioActions } from "@/hooks/useProjectAudioActions";
import { useRecordingController } from "@/hooks/useRecordingController";
import { Project } from "@/types/music";
import { PatchValidationIssue, Patch } from "@/types/patch";
import { PatchOp } from "@/types/ops";

const isAudiblePatchOp = (op: PatchOp): boolean =>
  op.type !== "moveNode" && op.type !== "addMacro" && op.type !== "removeMacro" && op.type !== "bindMacro" && op.type !== "unbindMacro" && op.type !== "renameMacro";

function usePitchPickerHotkeys(enabled: boolean, onSelectPitch: (pitch: string) => void) {
  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editingText = target && (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA");
      if (editingText) return;

      const pitch = keyToPitch(event.key);
      if (!pitch) return;

      event.preventDefault();
      onSelectPitch(pitch);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, onSelectPitch]);
}

export default function HomePage() {
  const [projectHistory, setProjectHistory] = useState<HistoryState<Project>>(() => createHistory(createEmptyProject()));
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [playheadBeat, setPlayheadBeat] = useState(0);
  const [userCueBeat, setUserCueBeat] = useState(0);
  const [selectedTrackId, setSelectedTrackId] = useState<string | undefined>(undefined);
  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>(undefined);
  const [helpOpen, setHelpOpen] = useState(false);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [strictWasmReady, setStrictWasmReady] = useState(process.env.NEXT_PUBLIC_STRICT_WASM !== "1");
  const [pitchPicker, setPitchPicker] = useState<{ trackId: string; noteId: string } | null>(null);
  const [previewPitch, setPreviewPitch] = useState("C4");
  const [previewPitchPickerOpen, setPreviewPitchPickerOpen] = useState(false);
  const [timelineActionsPopover, setTimelineActionsPopover] = useState<TimelineActionsPopoverRequest | null>(null);
  const [pendingPreview, setPendingPreview] = useState<{ patchId: string; nonce: number } | null>(null);
  const [patchRemovalDialog, setPatchRemovalDialog] = useState<{
    patchId: string;
    rows: Array<{ trackId: string; mode: "fallback" | "remove"; fallbackPatchId: string }>;
  } | null>(null);
  const [migrationNotice, setMigrationNotice] = useState<string | null>(null);

  const audioEngineRef = useRef<AudioEngine | null>(null);
  const recordingStopSessionRef = useRef<(finalBeat?: number) => void>(() => {});
  const recordingHandleBeatRef = useRef<(beat: number) => void>(() => {});
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const project = projectHistory.current;

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
    const maxNoteEnd = project.tracks
      .flatMap((track) => track.notes)
      .reduce((acc, note) => Math.max(acc, note.startBeat + note.durationBeats), 0);
    const meterBeats = project.global.meter === "4/4" ? 4 : 3;
    return Math.max(16, Math.ceil(maxNoteEnd + meterBeats));
  }, [project.global.meter, project.tracks]);

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

  const setPlayheadFromUser = useCallback((beat: number) => {
    setUserCueBeat(beat);
    setPlayheadBeat(beat);
  }, []);
  const { applyLoopSettings, addLoopBoundary, updateLoopRepeatCount, removeLoopBoundary, loopConflictDialog, clearLoopConflictDialog } =
    useLoopSettings({
      project,
      commitProjectChange,
      onCloseLoopPopover: () => setTimelineActionsPopover(null)
    });

  useEffect(() => {
    if (!timelineActionsPopover) {
      return;
    }

    let active = false;
    const activateTimer = window.setTimeout(() => {
      active = true;
    }, 0);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setTimelineActionsPopover(null);
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      if (!active) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target?.closest(".timeline-actions-popover")) {
        return;
      }
      setTimelineActionsPopover(null);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.clearTimeout(activateTimer);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [timelineActionsPopover]);

  const timelineMarkersAtBeat = useMemo(
    () =>
      timelineActionsPopover
        ? getSanitizedLoopMarkers(project.global.loop).filter((marker) => Math.abs(marker.beat - timelineActionsPopover.beat) < 1e-9)
        : [],
    [project.global.loop, timelineActionsPopover]
  );
  const startMarkerAtTimelineBeat = timelineMarkersAtBeat.find((marker) => marker.kind === "start");
  const endMarkerAtTimelineBeat = timelineMarkersAtBeat.find((marker) => marker.kind === "end");

  const openPitchPicker = useCallback((trackId: string, noteId: string) => {
    setPitchPicker({ trackId, noteId });
  }, []);

  const closePitchPicker = useCallback(() => {
    setPitchPicker(null);
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
            ? { ...track, macroValues: nextMacroValues }
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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editingText = target && (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA");

      const isHelpKey = event.key === "?" || (event.key === "/" && event.shiftKey);
      if (isHelpKey && !editingText) {
        event.preventDefault();
        setHelpOpen(true);
      }

      if (event.key === "Escape") {
        setHelpOpen(false);
        setPitchPicker(null);
        setPreviewPitchPickerOpen(false);
        setPatchRemovalDialog(null);
      }

      const isUndo = (event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "z";
      const isRedo =
        ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "z") ||
        ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "y");

      if (!editingText && isRedo) {
        event.preventDefault();
        redoProject();
        return;
      }

      if (!editingText && isUndo) {
        event.preventDefault();
        undoProject();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [redoProject, undoProject]);

  usePitchPickerHotkeys(Boolean(pitchPicker), useCallback((pitch: string) => {
    if (!pitchPicker) return;
    updateNote(pitchPicker.trackId, pitchPicker.noteId, { pitchStr: pitch }, {
      actionKey: `track:${pitchPicker.trackId}:pitch:${pitchPicker.noteId}`
    });
    closePitchPicker();
  }, [closePitchPicker, pitchPicker, updateNote]));

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
          macroPanelExpanded: true,
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
        track.id === trackId ? { ...track, instrumentPatchId: patchId, macroValues: {}, macroPanelExpanded: true } : track
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

  if (!ready || !selectedTrack || !selectedPatch) {
    return <main className="loading">Loading...</main>;
  }

  const pitchPickerTrack = pitchPicker ? project.tracks.find((track) => track.id === pitchPicker.trackId) : undefined;
  const pitchPickerNote = pitchPickerTrack?.notes.find((note) => note.id === pitchPicker?.noteId);
  const activeRecordingTrackId = recording.activeRecordingTrackId;
  const activeRecordingTrack = activeRecordingTrackId ? project.tracks.find((track) => track.id === activeRecordingTrackId) : undefined;

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

      <section className="top-actions">
        <button disabled={recording.recordEnabled} onClick={addTrack}>Add Track</button>
        <button disabled={recording.recordEnabled || project.tracks.length <= 1} onClick={removeSelectedTrack}>
          Remove Track
        </button>
        <button onClick={() => setHelpOpen(true)}>Help (?)</button>
        <button onClick={exportJson}>Export Project JSON</button>
        <button onClick={() => importInputRef.current?.click()}>Import Project JSON</button>
        <button
          onClick={async () => {
            playback.stopPlayback();
            await clearProject();
            const fresh = createEmptyProject();
            resetProjectHistory(fresh);
            setSelectedTrackId(fresh.tracks[0]?.id);
          }}
        >
          Clear Project
        </button>
        <button
          className="secondary-action"
          onClick={async () => {
            playback.stopPlayback();
            await clearProject();
            const fresh = createDefaultProject();
            resetProjectHistory(fresh);
            setSelectedTrackId(fresh.tracks[0]?.id);
          }}
        >
          Reset To Default Project
        </button>
        <input
          ref={importInputRef}
          type="file"
          accept="application/json"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              importJson(file);
            }
            event.currentTarget.value = "";
          }}
        />
      </section>

      {runtimeError && <p className="error">{runtimeError}</p>}

      <TrackCanvas
        project={project}
        invalidPatchIds={invalidPatchIds}
        selectedTrackId={selectedTrack.id}
        playheadBeat={playheadBeat}
        activeRecordedNotes={recording.activeRecordedNotes}
        ghostPlayheadBeat={recording.ghostPlayheadBeat ?? undefined}
        countInLabel={recording.countInLabel ?? undefined}
        timelineActionsPopoverOpen={Boolean(timelineActionsPopover)}
        onSetPlayheadBeat={setPlayheadFromUser}
        onRequestTimelineActionsPopover={setTimelineActionsPopover}
        onSelectTrack={setSelectedTrackId}
        onRenameTrack={renameTrack}
        onToggleTrackMute={toggleTrackMute}
        onSetTrackVolume={setTrackVolume}
        onUpdateTrackPatch={updateTrackPatch}
        onToggleTrackMacroPanel={toggleTrackMacroPanel}
        onChangeTrackMacro={changeTrackMacro}
        onResetTrackMacros={resetSelectedPatchMacros}
        onOpenPitchPicker={openPitchPicker}
        onUpsertNote={upsertNote}
        onUpdateNote={updateNote}
        onDeleteNote={deleteNote}
      />

      {timelineActionsPopover && (
        <TimelineActionsPopover
          left={timelineActionsPopover.clientX}
          top={timelineActionsPopover.clientY + 12}
          showAddStart={!startMarkerAtTimelineBeat}
          showAddEnd={!endMarkerAtTimelineBeat}
          startMarkerId={startMarkerAtTimelineBeat?.id}
          endMarkerId={endMarkerAtTimelineBeat?.id}
          endRepeatCount={endMarkerAtTimelineBeat?.repeatCount}
          onAddStart={() => addLoopBoundary(timelineActionsPopover.beat, "start")}
          onAddEnd={() => addLoopBoundary(timelineActionsPopover.beat, "end")}
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

      {recording.recordEnabled && activeRecordingTrack && (
        <section className="recording-dock">
          <div className="recording-dock-header">
            <div>
              <strong>{recording.recordPhase === "count_in" ? "Record Count-In" : "Recording"}</strong>
              <span className="recording-dock-subtitle">
                {activeRecordingTrack.name} · {activeRecordingTrack.instrumentPatchId.replace("preset_", "")}
              </span>
            </div>
            <div className="recording-dock-status">{recording.recordStatusText}</div>
          </div>
          <PianoKeyboard
            minPitch="C2"
            maxPitch="C7"
            pressedPitches={recording.pressedRecordingPitches}
            onSelectPitch={() => {}}
            onPressStart={(pitch) => {
              if (recording.recordPhase === "recording") {
                recording.startRecordedNote(`pointer:${pitch}`, pitch);
              }
            }}
            onPressEnd={(pitch) => recording.stopRecordedInput(`pointer:${pitch}`)}
          />
        </section>
      )}

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

      {helpOpen && (
        <div className="help-modal-backdrop" role="dialog" aria-modal="true" onClick={() => setHelpOpen(false)}>
          <div className="help-modal" onClick={(event) => event.stopPropagation()}>
            <h3>Quick Help</h3>
            <p>
              <strong>Add note:</strong> Left-click an empty spot in a track lane.
            </p>
            <p>
              <strong>Move note:</strong> Drag a note block horizontally.
            </p>
            <p>
              <strong>Resize note:</strong> Drag near the right edge of a note block.
            </p>
            <p>
              <strong>Delete note:</strong> Right-click a note block.
            </p>
            <p>
              <strong>Change note pitch:</strong> Hover the pitch label (for example <code>C4</code>) and use mouse wheel (up/down = +/- semitone).
            </p>
            <p>
              <strong>Record mode:</strong> Arm Record, press Play, watch the 3..2..1 count-in, then play notes from the docked keyboard or your typing keyboard.
            </p>
            <p className="muted">Press <kbd>Esc</kbd> to close this help panel.</p>
          </div>
        </div>
      )}

      {pitchPicker && pitchPickerNote && (
        <div className="help-modal-backdrop" role="dialog" aria-modal="true" onClick={closePitchPicker}>
          <div className="help-modal pitch-picker-modal" onClick={(event) => event.stopPropagation()}>
            <h3>Pick Pitch</h3>
            <p className="muted">
              Select a key from C1 to C7. QWERTY-mapped keys are shown on each note.
            </p>
            <PianoKeyboard
              minPitch="C1"
              maxPitch="C7"
              selectedPitch={pitchPickerNote.pitchStr}
              onSelectPitch={(pitch) => {
                updateNote(pitchPicker.trackId, pitchPicker.noteId, { pitchStr: pitch }, {
                  actionKey: `track:${pitchPicker.trackId}:pitch:${pitchPicker.noteId}`
                });
                closePitchPicker();
              }}
            />
            <div className="pitch-picker-actions">
              <button type="button" onClick={closePitchPicker}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {previewPitchPickerOpen && (
        <div className="help-modal-backdrop" role="dialog" aria-modal="true" onClick={() => setPreviewPitchPickerOpen(false)}>
          <div className="help-modal pitch-picker-modal" onClick={(event) => event.stopPropagation()}>
            <h3>Preview Pitch</h3>
            <p className="muted">Select the pitch used for auto-preview when an instrument sound changes.</p>
            <PianoKeyboard
              minPitch="C1"
              maxPitch="C7"
              selectedPitch={previewPitch}
              onSelectPitch={(pitch) => {
                setPreviewPitch(pitch);
                setPreviewPitchPickerOpen(false);
                previewSelectedPatchNow(pitch);
              }}
            />
            <div className="pitch-picker-actions">
              <button type="button" onClick={() => setPreviewPitchPickerOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {patchRemovalDialog && (
        <div className="help-modal-backdrop" role="dialog" aria-modal="true" onClick={() => setPatchRemovalDialog(null)}>
          <div className="help-modal" onClick={(event) => event.stopPropagation()}>
            <h3>Remove Instrument</h3>
            <p className="muted">Choose how tracks using this custom instrument should be handled before removal.</p>
            {patchRemovalDialog.rows.length === 0 && <p>No tracks currently use this instrument.</p>}
            {patchRemovalDialog.rows.map((row) => {
              const track = project.tracks.find((entry) => entry.id === row.trackId);
              return (
                <div key={row.trackId} className="patch-removal-row">
                  <strong>{track?.name ?? row.trackId}</strong>
                  <select
                    value={row.mode}
                    onChange={(event) =>
                      setPatchRemovalDialog((prev) =>
                        prev
                          ? {
                              ...prev,
                              rows: prev.rows.map((entry) =>
                                entry.trackId === row.trackId ? { ...entry, mode: event.target.value as "fallback" | "remove" } : entry
                              )
                            }
                          : prev
                      )
                    }
                  >
                    <option value="fallback">Fallback to instrument</option>
                    <option value="remove">Remove track</option>
                  </select>
                  <select
                    value={row.fallbackPatchId}
                    disabled={row.mode !== "fallback"}
                    onChange={(event) =>
                      setPatchRemovalDialog((prev) =>
                        prev
                          ? {
                              ...prev,
                              rows: prev.rows.map((entry) =>
                                entry.trackId === row.trackId ? { ...entry, fallbackPatchId: event.target.value } : entry
                              )
                            }
                          : prev
                      )
                    }
                  >
                    {project.patches
                      .filter((patch) => patch.id !== patchRemovalDialog.patchId)
                      .map((patch) => (
                        <option key={patch.id} value={patch.id}>
                          {patch.name}
                        </option>
                      ))}
                  </select>
                </div>
              );
            })}
            <div className="pitch-picker-actions">
              <button type="button" onClick={() => setPatchRemovalDialog(null)}>
                Cancel
              </button>
              <button type="button" onClick={confirmRemovePatch}>
                Remove Instrument
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

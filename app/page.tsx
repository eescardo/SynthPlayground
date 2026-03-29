"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AudioEngine } from "@/audio/engine";
import { loadDspWasm } from "@/audio/wasmBridge";
import { InstrumentEditor } from "@/components/InstrumentEditor";
import { PianoKeyboard } from "@/components/PianoKeyboard";
import { TrackCanvas } from "@/components/TrackCanvas";
import { TransportBar } from "@/components/TransportBar";
import { createId } from "@/lib/ids";
import { clearProject, loadProject, saveProject } from "@/lib/persistence";
import { createHistory, HistoryState, pushHistory, redoHistory, undoHistory } from "@/lib/history";
import { getModuleSchema } from "@/lib/patch/moduleRegistry";
import { applyPatchOp as applyPatchGraphOp } from "@/lib/patch/ops";
import { compilePatchPlan, validatePatch } from "@/lib/patch/validation";
import { createDefaultProject } from "@/lib/patch/presets";
import { getBundledPresetPatch, resolvePatchPresetStatus, resolvePatchSource } from "@/lib/patch/source";
import { importProjectFromJson, exportProjectToJson, normalizeProject } from "@/lib/projectSerde";
import { keyToPitch, pitchToVoct } from "@/lib/pitch";
import { snapToGrid } from "@/lib/musicTiming";
import { removeTrackFromProject, renameTrackInProject } from "@/lib/trackEdits";
import { Project, Note } from "@/types/music";
import { PatchValidationIssue, Patch } from "@/types/patch";
import { PatchOp } from "@/types/ops";

const notesOverlap = (a: Note, b: Note): boolean => {
  const epsilon = 1e-9;
  const aEnd = a.startBeat + a.durationBeats;
  const bEnd = b.startBeat + b.durationBeats;
  return a.startBeat < bEnd - epsilon && aEnd > b.startBeat + epsilon;
};

const hasOverlapWithOthers = (candidate: Note, notes: Note[]): boolean =>
  notes.some((other) => other.id !== candidate.id && notesOverlap(candidate, other));

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

type RecordPhase = "idle" | "count_in" | "recording";

interface RecordCountInState {
  cueBeat: number;
  trackId: string;
  startedAtMs: number;
  beats: number;
}

interface ActiveRecordNote {
  noteId: string;
  startBeat: number;
  trackId: string;
  pitchStr: string;
  pitchVoct: number;
}

const COUNT_IN_BEATS = 3;

const eraseNotesInBeatRange = (
  notes: Note[],
  startBeat: number,
  endBeat: number,
  protectedNoteIds: Set<string>
): Note[] => {
  if (endBeat <= startBeat) {
    return notes;
  }

  const nextNotes: Note[] = [];
  for (const note of notes) {
    if (protectedNoteIds.has(note.id)) {
      nextNotes.push(note);
      continue;
    }

    const noteEnd = note.startBeat + note.durationBeats;
    if (noteEnd <= startBeat || note.startBeat >= endBeat) {
      nextNotes.push(note);
      continue;
    }

    if (note.startBeat < startBeat) {
      nextNotes.push({
        ...note,
        durationBeats: startBeat - note.startBeat
      });
    }

    if (noteEnd > endBeat) {
      nextNotes.push({
        ...note,
        id: createId("note"),
        startBeat: endBeat,
        durationBeats: noteEnd - endBeat
      });
    }
  }

  return nextNotes
    .filter((note) => note.durationBeats > 0)
    .sort((a, b) => a.startBeat - b.startBeat);
};

export default function HomePage() {
  const [projectHistory, setProjectHistory] = useState<HistoryState<Project>>(() => createHistory(createDefaultProject()));
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [recordEnabled, setRecordEnabled] = useState(false);
  const [recordPhase, setRecordPhase] = useState<RecordPhase>("idle");
  const [recordCountIn, setRecordCountIn] = useState<RecordCountInState | null>(null);
  const [countInNowMs, setCountInNowMs] = useState(0);
  const [recordingTrackId, setRecordingTrackId] = useState<string | null>(null);
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
  const [pendingPreview, setPendingPreview] = useState<{ patchId: string; nonce: number } | null>(null);
  const [patchRemovalDialog, setPatchRemovalDialog] = useState<{
    patchId: string;
    rows: Array<{ trackId: string; mode: "fallback" | "remove"; fallbackPatchId: string }>;
  } | null>(null);
  const [migrationNotice, setMigrationNotice] = useState<string | null>(null);

  const activeRecordKeys = useRef<Map<string, ActiveRecordNote>>(new Map());
  const recordPassRef = useRef<{ trackId: string; lastErasedBeat: number } | null>(null);
  const countInRafRef = useRef<number | null>(null);
  const audioEngineRef = useRef<AudioEngine | null>(null);
  const rafRef = useRef<number | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const project = projectHistory.current;

  useEffect(() => {
    const boot = async () => {
      const saved = await loadProject();
      const loadedProject = saved ? normalizeProject(saved) : createDefaultProject();
      if (saved) {
        saveProject(loadedProject).catch(() => {
          // ignore migration save failures
        });
      }
      setProjectHistory(createHistory(loadedProject));
      setSelectedTrackId(loadedProject.tracks[0]?.id);
      setReady(true);
    };

    boot();
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

  const eraseRecordedWindow = useCallback((trackId: string, fromBeat: number, toBeat: number) => {
    const eraseStartBeat = snapToGrid(fromBeat, project.global.gridBeats);
    const eraseEndBeat = snapToGrid(toBeat, project.global.gridBeats);
    if (eraseEndBeat <= eraseStartBeat) {
      return;
    }

    const protectedNoteIds = new Set(Array.from(activeRecordKeys.current.values()).map((entry) => entry.noteId));
    commitProjectChange(
      (current) => {
        let changed = false;
        const tracks = current.tracks.map((track) => {
          if (track.id !== trackId) {
            return track;
          }
          const nextNotes = eraseNotesInBeatRange(track.notes, eraseStartBeat, eraseEndBeat, protectedNoteIds);
          if (
            nextNotes.length === track.notes.length &&
            nextNotes.every((note, index) => {
              const previous = track.notes[index];
              return previous && previous.id === note.id && previous.startBeat === note.startBeat && previous.durationBeats === note.durationBeats;
            })
          ) {
            return track;
          }
          changed = true;
          return { ...track, notes: nextNotes };
        });
        return changed ? { ...current, tracks } : current;
      },
      { actionKey: `track:${trackId}:record-overwrite`, coalesce: true }
    );
  }, [commitProjectChange, project.global.gridBeats]);

  const finishActiveRecordedNotes = useCallback((endBeat: number) => {
    const snappedEndBeat = snapToGrid(endBeat, project.global.gridBeats);
    for (const entry of activeRecordKeys.current.values()) {
      const durationBeats = Math.max(project.global.gridBeats, snappedEndBeat - entry.startBeat);
      updateNote(
        entry.trackId,
        entry.noteId,
        { durationBeats },
        { actionKey: `track:${entry.trackId}:record-note:${entry.noteId}`, coalesce: true }
      );
      audioEngineRef.current?.recordNoteOff(entry.trackId, entry.noteId, entry.pitchVoct);
    }
    activeRecordKeys.current.clear();
  }, [project.global.gridBeats, updateNote]);

  const stopRecordSession = useCallback((finalBeat?: number) => {
    if (recordPhase === "recording") {
      finishActiveRecordedNotes(finalBeat ?? playheadBeat);
    } else {
      activeRecordKeys.current.clear();
    }
    audioEngineRef.current?.setRecordingTrack(null);
    recordPassRef.current = null;
    setRecordingTrackId(null);
    setRecordPhase("idle");
    setRecordCountIn(null);
  }, [finishActiveRecordedNotes, playheadBeat, recordPhase]);

  const stopPlayback = useCallback((resetToCue = false) => {
    if (countInRafRef.current !== null) {
      cancelAnimationFrame(countInRafRef.current);
      countInRafRef.current = null;
    }
    stopRecordSession();
    audioEngineRef.current?.stop();
    setPlaying(false);
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (resetToCue) {
      setPlayheadBeat(userCueBeat);
    }
  }, [stopRecordSession, userCueBeat]);

  const tickPlayhead = useCallback(() => {
    if (!audioEngineRef.current) return;
    const beat = audioEngineRef.current.getPlayheadBeat();
    setPlayheadBeat(beat);

     if (recordPassRef.current) {
      const nextErasedBeat = snapToGrid(beat, project.global.gridBeats);
      if (nextErasedBeat > recordPassRef.current.lastErasedBeat) {
        eraseRecordedWindow(recordPassRef.current.trackId, recordPassRef.current.lastErasedBeat, nextErasedBeat);
        recordPassRef.current.lastErasedBeat = nextErasedBeat;
      }
    }

    if (playbackEndBeat > 0 && beat >= playbackEndBeat - 0.0001) {
      stopPlayback(true);
      return;
    }

    rafRef.current = window.requestAnimationFrame(tickPlayhead);
  }, [eraseRecordedWindow, playbackEndBeat, project.global.gridBeats, stopPlayback]);

  const beginRecordingPlayback = useCallback(async (trackId: string, cueBeat: number) => {
    if (!audioEngineRef.current) {
      audioEngineRef.current = new AudioEngine();
    }
    audioEngineRef.current.setProject(project, { syncToWorklet: true });
    await audioEngineRef.current.play(cueBeat);
    audioEngineRef.current.setRecordingTrack(trackId);
    recordPassRef.current = { trackId, lastErasedBeat: cueBeat };
    setRecordingTrackId(trackId);
    setRecordPhase("recording");
    setRecordCountIn(null);
    setPlaying(true);
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
    }
    rafRef.current = requestAnimationFrame(tickPlayhead);
  }, [project, tickPlayhead]);

  const startPlayback = async () => {
    if (process.env.NEXT_PUBLIC_STRICT_WASM === "1" && !strictWasmReady) {
      setRuntimeError("Strict WASM mode is enabled and WASM is not ready. Run `npm run dev:wasm:strict`.");
      return;
    }
    if (recordEnabled && selectedTrack) {
      const countIn: RecordCountInState = {
        cueBeat: playheadBeat,
        trackId: selectedTrack.id,
        startedAtMs: performance.now(),
        beats: COUNT_IN_BEATS
      };
      setRecordCountIn(countIn);
      setCountInNowMs(countIn.startedAtMs);
      setRecordPhase("count_in");
      return;
    }
    if (!audioEngineRef.current) {
      audioEngineRef.current = new AudioEngine();
    }
    audioEngineRef.current.setProject(project, { syncToWorklet: true });
    await audioEngineRef.current.play(playheadBeat);
    setPlaying(true);
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
    }
    rafRef.current = requestAnimationFrame(tickPlayhead);
  };

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
      if (countInRafRef.current !== null) {
        cancelAnimationFrame(countInRafRef.current);
      }
      audioEngineRef.current?.stop();
    };
  }, []);

  useEffect(() => {
    if (!recordCountIn) {
      if (countInRafRef.current !== null) {
        cancelAnimationFrame(countInRafRef.current);
        countInRafRef.current = null;
      }
      return;
    }

    const beatDurationMs = (60 / project.global.tempo) * 1000;
    const totalDurationMs = recordCountIn.beats * beatDurationMs;

    const tick = () => {
      const now = performance.now();
      setCountInNowMs(now);
      if (now - recordCountIn.startedAtMs >= totalDurationMs) {
        countInRafRef.current = null;
        void beginRecordingPlayback(recordCountIn.trackId, recordCountIn.cueBeat).catch((error) => {
          setRecordPhase("idle");
          setRecordCountIn(null);
          setRuntimeError((error as Error).message);
        });
        return;
      }
      countInRafRef.current = requestAnimationFrame(tick);
    };

    countInRafRef.current = requestAnimationFrame(tick);
    return () => {
      if (countInRafRef.current !== null) {
        cancelAnimationFrame(countInRafRef.current);
        countInRafRef.current = null;
      }
    };
  }, [beginRecordingPlayback, project.global.tempo, recordCountIn]);

  const upsertNote = useCallback((trackId: string, note: Note, options?: { actionKey?: string; coalesce?: boolean }) => {
    commitProjectChange(
      (current) => {
        let changed = false;
        const tracks = current.tracks.map((track) => {
          if (track.id !== trackId) {
            return track;
          }
          const existing = track.notes.find((entry) => entry.id === note.id);
          let nextNotes = track.notes;
          if (existing) {
            if (hasOverlapWithOthers(note, track.notes)) {
              return track;
            }
            nextNotes = track.notes.map((entry) => (entry.id === note.id ? note : entry));
          } else {
            if (hasOverlapWithOthers(note, track.notes)) {
              return track;
            }
            nextNotes = [...track.notes, note].sort((a, b) => a.startBeat - b.startBeat);
          }
          if (nextNotes === track.notes) {
            return track;
          }
          changed = true;
          return { ...track, notes: nextNotes };
        });
        return changed ? { ...current, tracks } : current;
      },
      options
    );
  }, [commitProjectChange]);

  const updateNote = useCallback((trackId: string, noteId: string, patch: Partial<Note>, options?: { actionKey?: string; coalesce?: boolean }) => {
    commitProjectChange(
      (current) => {
        let changed = false;
        const tracks = current.tracks.map((track) => {
          if (track.id !== trackId) {
            return track;
          }
          const nextNotes = track.notes.map((note) => {
            if (note.id !== noteId) {
              return note;
            }
            const nextNote = { ...note, ...patch };
            if (hasOverlapWithOthers(nextNote, track.notes)) {
              return note;
            }
            if (
              nextNote.pitchStr === note.pitchStr &&
              nextNote.startBeat === note.startBeat &&
              nextNote.durationBeats === note.durationBeats &&
              nextNote.velocity === note.velocity
            ) {
              return note;
            }
            changed = true;
            return nextNote;
          });
          return changed ? { ...track, notes: nextNotes } : track;
        });
        return changed ? { ...current, tracks } : current;
      },
      options
    );
  }, [commitProjectChange]);

  const deleteNote = useCallback((trackId: string, noteId: string) => {
    commitProjectChange((current) => {
      let changed = false;
      const tracks = current.tracks.map((track) => {
        if (track.id !== trackId) {
          return track;
        }
        const nextNotes = track.notes.filter((note) => note.id !== noteId);
        if (nextNotes.length === track.notes.length) {
          return track;
        }
        changed = true;
        return { ...track, notes: nextNotes };
      });
      return changed ? { ...current, tracks } : current;
    }, { actionKey: `track:${trackId}:delete-note:${noteId}` });
  }, [commitProjectChange]);

  const toggleTrackMute = useCallback((trackId: string) => {
    commitProjectChange((current) => ({
      ...current,
      tracks: current.tracks.map((track) => (track.id === trackId ? { ...track, mute: !track.mute } : track))
    }), { actionKey: `track:${trackId}:mute` });
  }, [commitProjectChange]);

  const setPlayheadFromUser = useCallback((beat: number) => {
    setUserCueBeat(beat);
    setPlayheadBeat(beat);
  }, []);

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

  const startRecordedNote = useCallback((inputId: string, pitch: string) => {
    if (recordPhase !== "recording" || !recordingTrackId) {
      return;
    }
    if (activeRecordKeys.current.has(inputId)) {
      return;
    }

    const track = project.tracks.find((entry) => entry.id === recordingTrackId);
    if (!track) {
      return;
    }

    const currentBeat = snapToGrid(audioEngineRef.current?.getPlayheadBeat() ?? playheadBeat, project.global.gridBeats);
    if (activeRecordKeys.current.size > 0) {
      finishActiveRecordedNotes(currentBeat);
    }
    eraseRecordedWindow(recordingTrackId, currentBeat, currentBeat + project.global.gridBeats);

    const noteId = createId("note");
    const pitchVoct = pitchToVoct(pitch);
    const noteEntry: ActiveRecordNote = {
      noteId,
      startBeat: currentBeat,
      trackId: recordingTrackId,
      pitchStr: pitch,
      pitchVoct
    };
    activeRecordKeys.current.set(inputId, noteEntry);

    upsertNote(
      recordingTrackId,
      {
        id: noteId,
        pitchStr: pitch,
        startBeat: currentBeat,
        durationBeats: project.global.gridBeats,
        velocity: 0.9
      },
      { actionKey: `track:${recordingTrackId}:record-note:${noteId}`, coalesce: true }
    );
    void audioEngineRef.current?.recordNoteOn(recordingTrackId, noteId, pitchVoct, 0.9).catch((error) =>
      setRuntimeError((error as Error).message)
    );
  }, [finishActiveRecordedNotes, playheadBeat, project.global.gridBeats, project.tracks, recordPhase, recordingTrackId, upsertNote]);

  const stopRecordedInput = useCallback((inputId: string) => {
    const active = activeRecordKeys.current.get(inputId);
    if (!active) {
      return;
    }
    activeRecordKeys.current.delete(inputId);

    const endBeat = snapToGrid(audioEngineRef.current?.getPlayheadBeat() ?? playheadBeat, project.global.gridBeats);
    const durationBeats = Math.max(project.global.gridBeats, endBeat - active.startBeat);
    updateNote(
      active.trackId,
      active.noteId,
      { durationBeats },
      { actionKey: `track:${active.trackId}:record-note:${active.noteId}`, coalesce: true }
    );
    audioEngineRef.current?.recordNoteOff(active.trackId, active.noteId, active.pitchVoct);
  }, [playheadBeat, project.global.gridBeats, updateNote]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (pitchPicker || previewPitchPickerOpen) return;
      if (recordPhase !== "recording") return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA")) {
        return;
      }

      const pitch = keyToPitch(event.key);
      if (!pitch) return;
      event.preventDefault();
      startRecordedNote(event.key, pitch);
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (pitchPicker) return;
      stopRecordedInput(event.key);
    };

    const onBlur = () => {
      finishActiveRecordedNotes(audioEngineRef.current?.getPlayheadBeat() ?? playheadBeat);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [finishActiveRecordedNotes, pitchPicker, playheadBeat, previewPitchPickerOpen, recordPhase, startRecordedNote, stopRecordedInput]);

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
  const activeRecordingTrackId = recordingTrackId ?? recordCountIn?.trackId ?? null;
  const activeRecordingTrack = activeRecordingTrackId ? project.tracks.find((track) => track.id === activeRecordingTrackId) : undefined;
  const pressedRecordingPitches = Array.from(activeRecordKeys.current.values()).map((entry) => entry.pitchStr);
  const countInProgressBeats =
    recordCountIn
      ? Math.min(
          recordCountIn.beats,
          ((countInNowMs - recordCountIn.startedAtMs) / 1000) * (project.global.tempo / 60)
        )
      : 0;
  const ghostPlayheadBeat = recordCountIn ? recordCountIn.cueBeat - recordCountIn.beats + countInProgressBeats : null;
  const countInLabel = recordCountIn ? String(Math.max(1, Math.ceil(recordCountIn.beats - countInProgressBeats))) : null;

  return (
    <main className="app">
      <TransportBar
        tempo={project.global.tempo}
        meter={project.global.meter}
        gridBeats={project.global.gridBeats}
        isPlaying={playing || recordPhase === "count_in"}
        recordEnabled={recordEnabled}
        playheadBeat={playheadBeat}
        onPlay={startPlayback}
        onStop={stopPlayback}
        onToggleRecord={() =>
          setRecordEnabled((prev) => {
            const next = !prev;
            if (!next && recordPhase !== "idle") {
              stopPlayback();
            }
            return next;
          })
        }
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
        <button onClick={addTrack}>Add Track</button>
        <button disabled={project.tracks.length <= 1} onClick={removeSelectedTrack}>
          Remove Track
        </button>
        <button onClick={() => setHelpOpen(true)}>Help (?)</button>
        <button onClick={exportJson}>Export Project JSON</button>
        <button onClick={() => importInputRef.current?.click()}>Import Project JSON</button>
        <button
          onClick={async () => {
            stopPlayback();
            await clearProject();
            const fresh = createDefaultProject();
            resetProjectHistory(fresh);
            setSelectedTrackId(fresh.tracks[0]?.id);
          }}
        >
          Reset Project
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
        ghostPlayheadBeat={ghostPlayheadBeat ?? undefined}
        countInLabel={countInLabel ?? undefined}
        onSetPlayheadBeat={setPlayheadFromUser}
        onSelectTrack={setSelectedTrackId}
        onRenameTrack={renameTrack}
        onToggleTrackMute={toggleTrackMute}
        onUpdateTrackPatch={updateTrackPatch}
        onToggleTrackMacroPanel={toggleTrackMacroPanel}
        onChangeTrackMacro={changeTrackMacro}
        onResetTrackMacros={resetSelectedPatchMacros}
        onOpenPitchPicker={openPitchPicker}
        onUpsertNote={upsertNote}
        onUpdateNote={updateNote}
        onDeleteNote={deleteNote}
      />

      {recordPhase !== "idle" && activeRecordingTrack && (
        <section className="recording-dock">
          <div className="recording-dock-header">
            <div>
              <strong>{recordPhase === "count_in" ? "Record Count-In" : "Recording"}</strong>
              <span className="recording-dock-subtitle">
                {activeRecordingTrack.name} · {activeRecordingTrack.instrumentPatchId.replace("preset_", "")}
              </span>
            </div>
            <div className="recording-dock-status">
              {recordPhase === "count_in" ? `Starts on beat ${recordCountIn?.cueBeat.toFixed(2)}` : `Writing on ${activeRecordingTrack.name}`}
            </div>
          </div>
          <PianoKeyboard
            minPitch="C2"
            maxPitch="C7"
            pressedPitches={pressedRecordingPitches}
            onSelectPitch={() => {}}
            onPressStart={(pitch) => {
              if (recordPhase === "recording") {
                startRecordedNote(`pointer:${pitch}`, pitch);
              }
            }}
            onPressEnd={(pitch) => stopRecordedInput(`pointer:${pitch}`)}
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

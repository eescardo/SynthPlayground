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
import { applyPatchOp as applyPatchGraphOp } from "@/lib/patch/ops";
import { compilePatchPlan, validatePatch } from "@/lib/patch/validation";
import { createDefaultProject } from "@/lib/patch/presets";
import { resolvePatchSource } from "@/lib/patch/source";
import { importProjectFromJson, exportProjectToJson, normalizeProject } from "@/lib/projectSerde";
import { keyToPitch, pitchToVoct } from "@/lib/pitch";
import { snapToGrid } from "@/lib/musicTiming";
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

export default function HomePage() {
  const [projectHistory, setProjectHistory] = useState<HistoryState<Project>>(() => createHistory(createDefaultProject()));
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [recordEnabled, setRecordEnabled] = useState(false);
  const [playheadBeat, setPlayheadBeat] = useState(0);
  const [userCueBeat, setUserCueBeat] = useState(0);
  const [selectedTrackId, setSelectedTrackId] = useState<string | undefined>(undefined);
  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>(undefined);
  const [validationIssues, setValidationIssues] = useState<PatchValidationIssue[]>([]);
  const [macroValues, setMacroValues] = useState<Record<string, number>>({});
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

  const activeRecordKeys = useRef<Map<string, { noteId: string; startBeat: number; trackId: string }>>(new Map());
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
    if (!selectedPatch) return;
    const result = validatePatch(selectedPatch);
    setValidationIssues(result.issues);
    try {
      compilePatchPlan(selectedPatch);
    } catch {
      // compile errors are reflected by validation issues
    }
  }, [selectedPatch]);

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

  const stopPlayback = useCallback((resetToCue = false) => {
    audioEngineRef.current?.stop();
    setPlaying(false);
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (resetToCue) {
      setPlayheadBeat(userCueBeat);
    }
  }, [userCueBeat]);

  const tickPlayhead = useCallback(() => {
    if (!audioEngineRef.current) return;
    const beat = audioEngineRef.current.getPlayheadBeat();
    setPlayheadBeat(beat);

    if (playbackEndBeat > 0 && beat >= playbackEndBeat - 0.0001) {
      stopPlayback(true);
      return;
    }

    rafRef.current = window.requestAnimationFrame(tickPlayhead);
  }, [playbackEndBeat, stopPlayback]);

  const startPlayback = async () => {
    if (process.env.NEXT_PUBLIC_STRICT_WASM === "1" && !strictWasmReady) {
      setRuntimeError("Strict WASM mode is enabled and WASM is not ready. Run `npm run dev:wasm:strict`.");
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
      audioEngineRef.current?.stop();
    };
  }, []);

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

  const previewSelectedPatchNow = useCallback((pitch = previewPitch) => {
    if (!selectedPatch || !selectedTrack || playing) {
      return;
    }
    audioEngineRef.current
      ?.previewNote(selectedTrack.id, pitchToVoct(pitch), 1)
      .catch((error) => setRuntimeError((error as Error).message));
  }, [playing, previewPitch, selectedPatch, selectedTrack]);

  const applyMacroToSelectedPatch = useCallback((macroId: string, normalized: number, options?: { actionKey?: string; coalesce?: boolean }) => {
    if (!selectedPatch) return;

    setMacroValues((prev) => ({ ...prev, [macroId]: normalized }));
    audioEngineRef.current?.setMacroValue(selectedPatch.id, macroId, normalized);

    const macro = selectedPatch.ui.macros.find((entry) => entry.id === macroId);
    if (!macro) return;

    commitProjectChange(
      (current) => {
        const nextPatches = current.patches.map((patch) => {
          if (patch.id !== selectedPatch.id) return patch;

          const cloned = structuredClone(patch);
          for (const binding of macro.bindings) {
            const node = cloned.nodes.find((entry) => entry.id === binding.nodeId);
            if (!node) continue;

            const mapped =
              binding.map === "exp"
                ? Math.max(binding.min, 0.000001) * Math.pow(binding.max / Math.max(binding.min, 0.000001), normalized)
                : binding.min + (binding.max - binding.min) * normalized;

            node.params[binding.paramId] = mapped;
          }

          return cloned;
        });
        return { ...current, patches: nextPatches };
      },
      options
    );
  }, [commitProjectChange, selectedPatch]);

  const applyPatchOp = (op: PatchOp) => {
    if (!selectedPatch) return;
    if (resolvePatchSource(selectedPatch) === "preset" && op.type !== "moveNode") {
      return;
    }

    let nextPatch: Patch;
    try {
      nextPatch = applyPatchGraphOp(selectedPatch, op);
    } catch (error) {
      setValidationIssues([{ level: "error", message: (error as Error).message }]);
      return;
    }

    const validation = validatePatch(nextPatch);
    if (op.type === "connect" && validation.issues.some((issue) => issue.level === "error")) {
      setValidationIssues(validation.issues);
      return;
    }

    setValidationIssues(validation.issues);
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

  const handleMacroChange = (macroId: string, normalized: number) => {
    if (!selectedPatch) return;
    applyMacroToSelectedPatch(macroId, normalized, { actionKey: `patch:${selectedPatch.id}:macro:${macroId}`, coalesce: true });
  };

  const handleMacroCommit = () => {
    if (!selectedPatch) return;
    schedulePatchPreview(selectedPatch.id);
  };

  const resetSelectedPatchMacros = useCallback(() => {
    if (!selectedPatch) {
      return;
    }

    for (const macro of selectedPatch.ui.macros) {
      applyMacroToSelectedPatch(
        macro.id,
        macro.defaultNormalized ?? 0.5,
        { actionKey: `patch:${selectedPatch.id}:macro-reset`, coalesce: true }
      );
    }
    schedulePatchPreview(selectedPatch.id);
  }, [applyMacroToSelectedPatch, schedulePatchPreview, selectedPatch]);

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
      if (pitchPicker || previewPitchPickerOpen) return;
      if (!recordEnabled || !selectedTrack) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA")) {
        return;
      }

      const pitch = keyToPitch(event.key);
      if (!pitch) return;
      if (activeRecordKeys.current.has(event.key)) return;

      const startBeat = snapToGrid(
        audioEngineRef.current?.getPlayheadBeat() ?? playheadBeat,
        project.global.gridBeats
      );

      const noteId = createId("note");
      activeRecordKeys.current.set(event.key, { noteId, startBeat, trackId: selectedTrack.id });

      upsertNote(selectedTrack.id, {
        id: noteId,
        pitchStr: pitch,
        startBeat,
        durationBeats: project.global.gridBeats,
        velocity: 0.9
      }, { actionKey: `track:${selectedTrack.id}:record-note:${noteId}` });
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (pitchPicker) return;
      const active = activeRecordKeys.current.get(event.key);
      if (!active) return;
      activeRecordKeys.current.delete(event.key);

      const endBeat = snapToGrid(audioEngineRef.current?.getPlayheadBeat() ?? playheadBeat, project.global.gridBeats);
      const duration = Math.max(project.global.gridBeats, endBeat - active.startBeat);
      updateNote(active.trackId, active.noteId, { durationBeats: duration }, {
        actionKey: `track:${active.trackId}:record-note:${active.noteId}`,
        coalesce: true
      });
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [pitchPicker, playheadBeat, previewPitchPickerOpen, project.global.gridBeats, recordEnabled, selectedTrack, updateNote, upsertNote]);

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
      setValidationIssues([{ level: "error", message: (error as Error).message }]);
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
    if (!selectedPatch || resolvePatchSource(selectedPatch) !== "custom") {
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
      tracks: current.tracks.map((track) => (track.id === trackId ? { ...track, instrumentPatchId: patchId } : track))
    }), { actionKey: `track:${trackId}:patch` });
    setSelectedNodeId(undefined);
  };

  if (!ready || !selectedTrack || !selectedPatch) {
    return <main className="loading">Loading...</main>;
  }

  const pitchPickerTrack = pitchPicker ? project.tracks.find((track) => track.id === pitchPicker.trackId) : undefined;
  const pitchPickerNote = pitchPickerTrack?.notes.find((note) => note.id === pitchPicker?.noteId);

  return (
    <main className="app">
      <TransportBar
        tempo={project.global.tempo}
        meter={project.global.meter}
        gridBeats={project.global.gridBeats}
        isPlaying={playing}
        recordEnabled={recordEnabled}
        playheadBeat={playheadBeat}
        onPlay={startPlayback}
        onStop={stopPlayback}
        onToggleRecord={() => setRecordEnabled((prev) => !prev)}
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
        selectedTrackId={selectedTrack.id}
        playheadBeat={playheadBeat}
        onSetPlayheadBeat={setPlayheadFromUser}
        onSelectTrack={setSelectedTrackId}
        onToggleTrackMute={toggleTrackMute}
        onUpdateTrackPatch={updateTrackPatch}
        onOpenPitchPicker={openPitchPicker}
        onUpsertNote={upsertNote}
        onUpdateNote={updateNote}
        onDeleteNote={deleteNote}
      />

      <InstrumentEditor
        patch={selectedPatch}
        macroValues={macroValues}
        previewPitch={previewPitch}
        selectedNodeId={selectedNodeId}
        validationIssues={validationIssues}
        onRenamePatch={renameSelectedPatch}
        onDuplicatePatch={duplicatePatchForSelectedTrack}
        onResetMacros={resetSelectedPatchMacros}
        onRequestRemovePatch={requestRemoveSelectedPatch}
        onOpenPreviewPitchPicker={() => setPreviewPitchPickerOpen(true)}
        onPreviewNow={() => previewSelectedPatchNow()}
        onMacroChange={handleMacroChange}
        onMacroCommit={handleMacroCommit}
        onSelectNode={setSelectedNodeId}
        onApplyOp={applyPatchOp}
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
              <strong>Record mode:</strong> Arm Record, then use QWERTY keys (A/W/S/E...) to input notes at playhead.
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

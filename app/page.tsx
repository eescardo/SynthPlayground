"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AudioEngine } from "@/audio/engine";
import { loadDspWasm } from "@/audio/wasmBridge";
import { MacroPanel } from "@/components/MacroPanel";
import { PatchEditorCanvas } from "@/components/PatchEditorCanvas";
import { PianoKeyboard } from "@/components/PianoKeyboard";
import { TrackCanvas } from "@/components/TrackCanvas";
import { TransportBar } from "@/components/TransportBar";
import { createId } from "@/lib/ids";
import { clearProject, loadProject, saveProject } from "@/lib/idb";
import { applyPatchOpWithHistory, createPatchHistory, redoPatchOp, undoPatchOp } from "@/lib/patchOps";
import { compilePatchPlan, validatePatch } from "@/lib/patchValidation";
import { createDefaultProject } from "@/lib/presets";
import { importProjectFromJson, exportProjectToJson } from "@/lib/projectSerde";
import { keyToPitch } from "@/lib/pitch";
import { snapToGrid } from "@/lib/time";
import { Project, Note } from "@/types/music";
import { PatchValidationIssue, Patch } from "@/types/patch";
import { PatchHistoryState, PatchOp } from "@/types/ops";

const notesOverlap = (a: Note, b: Note): boolean => {
  const epsilon = 1e-9;
  const aEnd = a.startBeat + a.durationBeats;
  const bEnd = b.startBeat + b.durationBeats;
  return a.startBeat < bEnd - epsilon && aEnd > b.startBeat + epsilon;
};

const hasOverlapWithOthers = (candidate: Note, notes: Note[]): boolean =>
  notes.some((other) => other.id !== candidate.id && notesOverlap(candidate, other));

export default function HomePage() {
  const [project, setProject] = useState<Project>(() => createDefaultProject());
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

  const [patchHistoryById, setPatchHistoryById] = useState<Record<string, PatchHistoryState<Patch>>>({});
  const activeRecordKeys = useRef<Map<string, { noteId: string; startBeat: number; trackId: string }>>(new Map());
  const audioEngineRef = useRef<AudioEngine | null>(null);
  const rafRef = useRef<number | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const boot = async () => {
      const saved = await loadProject();
      const loadedProject = saved ?? createDefaultProject();
      setProject(loadedProject);
      setSelectedTrackId(loadedProject.tracks[0]?.id);
      setPatchHistoryById(Object.fromEntries(loadedProject.patches.map((patch) => [patch.id, createPatchHistory(patch)])));
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
    audioEngineRef.current.setProject(project);
  }, [project, ready]);

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
    audioEngineRef.current.setProject(project);
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

  const patchTrackNotes = useCallback((trackId: string, update: (notes: Note[]) => Note[]) => {
    setProject((prev) => ({
      ...prev,
      tracks: prev.tracks.map((track) => (track.id === trackId ? { ...track, notes: update(track.notes) } : track))
    }));
  }, []);

  const upsertNote = useCallback((trackId: string, note: Note) => {
    patchTrackNotes(trackId, (notes) => {
      const existing = notes.find((entry) => entry.id === note.id);
      if (existing) {
        if (hasOverlapWithOthers(note, notes)) {
          return notes;
        }
        return notes.map((entry) => (entry.id === note.id ? note : entry));
      }
      if (hasOverlapWithOthers(note, notes)) {
        return notes;
      }
      return [...notes, note].sort((a, b) => a.startBeat - b.startBeat);
    });
  }, [patchTrackNotes]);

  const updateNote = useCallback((trackId: string, noteId: string, patch: Partial<Note>) => {
    patchTrackNotes(trackId, (notes) =>
      notes.map((note) => {
        if (note.id !== noteId) {
          return note;
        }
        const nextNote = { ...note, ...patch };
        if (hasOverlapWithOthers(nextNote, notes)) {
          return note;
        }
        return nextNote;
      })
    );
  }, [patchTrackNotes]);

  const deleteNote = useCallback((trackId: string, noteId: string) => {
    patchTrackNotes(trackId, (notes) => notes.filter((note) => note.id !== noteId));
  }, [patchTrackNotes]);

  const toggleTrackMute = useCallback((trackId: string) => {
    setProject((prev) => ({
      ...prev,
      tracks: prev.tracks.map((track) => (track.id === trackId ? { ...track, mute: !track.mute } : track))
    }));
  }, []);

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

  const applyPatchOp = (op: PatchOp) => {
    if (!selectedPatch) return;

    const currentHistory = patchHistoryById[selectedPatch.id] ?? createPatchHistory(selectedPatch);
    let nextHistory: PatchHistoryState<Patch>;
    try {
      nextHistory = applyPatchOpWithHistory(currentHistory, op);
    } catch (error) {
      setValidationIssues([{ level: "error", message: (error as Error).message }]);
      return;
    }

    const validation = validatePatch(nextHistory.current);
    if (op.type === "connect" && validation.issues.some((issue) => issue.level === "error")) {
      setValidationIssues(validation.issues);
      return;
    }

    setValidationIssues(validation.issues);
    setPatchHistoryById((prev) => ({
      ...prev,
      [selectedPatch.id]: nextHistory
    }));

    setProject((prev) => ({
      ...prev,
      patches: prev.patches.map((patch) => (patch.id === selectedPatch.id ? nextHistory.current : patch))
    }));
  };

  const undoPatch = () => {
    if (!selectedPatch) return;
    const history = patchHistoryById[selectedPatch.id];
    if (!history) return;
    const next = undoPatchOp(history);
    setPatchHistoryById((prev) => ({ ...prev, [selectedPatch.id]: next }));
    setProject((prev) => ({
      ...prev,
      patches: prev.patches.map((patch) => (patch.id === selectedPatch.id ? next.current : patch))
    }));
  };

  const redoPatch = () => {
    if (!selectedPatch) return;
    const history = patchHistoryById[selectedPatch.id];
    if (!history) return;
    const next = redoPatchOp(history);
    setPatchHistoryById((prev) => ({ ...prev, [selectedPatch.id]: next }));
    setProject((prev) => ({
      ...prev,
      patches: prev.patches.map((patch) => (patch.id === selectedPatch.id ? next.current : patch))
    }));
  };

  const handleMacroChange = (macroId: string, normalized: number) => {
    setMacroValues((prev) => ({ ...prev, [macroId]: normalized }));
    if (!selectedPatch) return;

    audioEngineRef.current?.setMacroValue(selectedPatch.id, macroId, normalized);

    const macro = selectedPatch.ui.macros.find((entry) => entry.id === macroId);
    if (!macro) return;

    setProject((prev) => {
      const nextPatches = prev.patches.map((patch) => {
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
      return { ...prev, patches: nextPatches };
    });
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (pitchPicker) return;
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
      });
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (pitchPicker) return;
      const active = activeRecordKeys.current.get(event.key);
      if (!active) return;
      activeRecordKeys.current.delete(event.key);

      const endBeat = snapToGrid(audioEngineRef.current?.getPlayheadBeat() ?? playheadBeat, project.global.gridBeats);
      const duration = Math.max(project.global.gridBeats, endBeat - active.startBeat);
      updateNote(active.trackId, active.noteId, { durationBeats: duration });
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [pitchPicker, playheadBeat, project.global.gridBeats, recordEnabled, selectedTrack, updateNote, upsertNote]);

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
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!pitchPicker) return;

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editingText = target && (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA");
      if (editingText) return;

      const pitch = keyToPitch(event.key);
      if (!pitch) return;

      event.preventDefault();
      updateNote(pitchPicker.trackId, pitchPicker.noteId, { pitchStr: pitch });
      closePitchPicker();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closePitchPicker, pitchPicker, updateNote]);

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
      setProject(imported);
      setSelectedTrackId(imported.tracks[0]?.id);
      setPatchHistoryById(Object.fromEntries(imported.patches.map((patch) => [patch.id, createPatchHistory(patch)])));
      audioEngineRef.current?.setProject(imported);
    } catch (error) {
      setValidationIssues([{ level: "error", message: (error as Error).message }]);
    }
  };

  const addTrack = () => {
    const fallbackPatch = project.patches[0];
    if (!fallbackPatch) return;

    const trackId = createId("track");
    setProject((prev) => ({
      ...prev,
      tracks: [
        ...prev.tracks,
        {
          id: trackId,
          name: `Track ${prev.tracks.length + 1}`,
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
    }));
    setSelectedTrackId(trackId);
  };

  const duplicatePatchForSelectedTrack = () => {
    if (!selectedPatch || !selectedTrack) return;

    const duplicate = structuredClone(selectedPatch);
    duplicate.id = createId("patch");
    duplicate.name = `${selectedPatch.name} Copy`;

    setProject((prev) => ({
      ...prev,
      patches: [...prev.patches, duplicate],
      tracks: prev.tracks.map((track) =>
        track.id === selectedTrack.id ? { ...track, instrumentPatchId: duplicate.id } : track
      )
    }));

    setPatchHistoryById((prev) => ({ ...prev, [duplicate.id]: createPatchHistory(duplicate) }));
  };

  const updateTrackPatch = (trackId: string, patchId: string) => {
    setProject((prev) => ({
      ...prev,
      tracks: prev.tracks.map((track) => (track.id === trackId ? { ...track, instrumentPatchId: patchId } : track))
    }));
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
        onTempoChange={(tempo) => setProject((prev) => ({ ...prev, global: { ...prev.global, tempo } }))}
        onMeterChange={(meter) => setProject((prev) => ({ ...prev, global: { ...prev.global, meter } }))}
        onGridChange={(gridBeats) => setProject((prev) => ({ ...prev, global: { ...prev.global, gridBeats } }))}
      />

      <section className="top-actions">
        <button onClick={addTrack}>Add Track</button>
        <button onClick={duplicatePatchForSelectedTrack}>Duplicate Instrument Patch</button>
        <button onClick={() => setHelpOpen(true)}>Help (?)</button>
        <button onClick={exportJson}>Export Project JSON</button>
        <button onClick={() => importInputRef.current?.click()}>Import Project JSON</button>
        <button
          onClick={async () => {
            stopPlayback();
            await clearProject();
            const fresh = createDefaultProject();
            setProject(fresh);
            setSelectedTrackId(fresh.tracks[0]?.id);
            setPatchHistoryById(Object.fromEntries(fresh.patches.map((patch) => [patch.id, createPatchHistory(patch)])));
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

      <section className="track-settings">
        {project.tracks.map((track) => {
          const patch = project.patches.find((entry) => entry.id === track.instrumentPatchId);
          return (
            <label key={track.id} className={track.id === selectedTrack.id ? "track-row active" : "track-row"}>
              <span onClick={() => setSelectedTrackId(track.id)}>{track.name}</span>
              <select value={track.instrumentPatchId} onChange={(e) => updateTrackPatch(track.id, e.target.value)}>
                {project.patches.map((patchOption) => (
                  <option key={patchOption.id} value={patchOption.id}>
                    {patchOption.name}
                  </option>
                ))}
              </select>
              <small>{patch?.id}</small>
            </label>
          );
        })}
      </section>

      <TrackCanvas
        project={project}
        selectedTrackId={selectedTrack.id}
        playheadBeat={playheadBeat}
        onSetPlayheadBeat={setPlayheadFromUser}
        onSelectTrack={setSelectedTrackId}
        onToggleTrackMute={toggleTrackMute}
        onOpenPitchPicker={openPitchPicker}
        onUpsertNote={upsertNote}
        onUpdateNote={updateNote}
        onDeleteNote={deleteNote}
      />

      <section className="instrument-pane">
        <MacroPanel patch={selectedPatch} macroValues={macroValues} onMacroChange={handleMacroChange} />
      </section>

      <PatchEditorCanvas
        patch={selectedPatch}
        selectedNodeId={selectedNodeId}
        validationIssues={validationIssues}
        onSelectNode={setSelectedNodeId}
        onApplyOp={applyPatchOp}
        onUndo={undoPatch}
        onRedo={redoPatch}
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
                updateNote(pitchPicker.trackId, pitchPicker.noteId, { pitchStr: pitch });
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
    </main>
  );
}

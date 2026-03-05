"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AudioEngine } from "@/audio/engine";
import { MacroPanel } from "@/components/MacroPanel";
import { PatchEditorCanvas } from "@/components/PatchEditorCanvas";
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

export default function HomePage() {
  const [project, setProject] = useState<Project>(() => createDefaultProject());
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [recordEnabled, setRecordEnabled] = useState(false);
  const [playheadBeat, setPlayheadBeat] = useState(0);
  const [selectedTrackId, setSelectedTrackId] = useState<string | undefined>(undefined);
  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>(undefined);
  const [validationIssues, setValidationIssues] = useState<PatchValidationIssue[]>([]);
  const [macroValues, setMacroValues] = useState<Record<string, number>>({});

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

  const tickPlayhead = () => {
    if (!audioEngineRef.current) return;
    setPlayheadBeat(audioEngineRef.current.getPlayheadBeat());
    rafRef.current = window.requestAnimationFrame(tickPlayhead);
  };

  const startPlayback = async () => {
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

  const stopPlayback = () => {
    audioEngineRef.current?.stop();
    setPlaying(false);
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
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
        return notes.map((entry) => (entry.id === note.id ? note : entry));
      }
      return [...notes, note].sort((a, b) => a.startBeat - b.startBeat);
    });
  }, [patchTrackNotes]);

  const updateNote = useCallback((trackId: string, noteId: string, patch: Partial<Note>) => {
    patchTrackNotes(trackId, (notes) => notes.map((note) => (note.id === noteId ? { ...note, ...patch } : note)));
  }, [patchTrackNotes]);

  const deleteNote = useCallback((trackId: string, noteId: string) => {
    patchTrackNotes(trackId, (notes) => notes.filter((note) => note.id !== noteId));
  }, [patchTrackNotes]);

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
  }, [playheadBeat, project.global.gridBeats, recordEnabled, selectedTrack, updateNote, upsertNote]);

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
        onSetPlayheadBeat={setPlayheadBeat}
        onSelectTrack={setSelectedTrackId}
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
    </main>
  );
}

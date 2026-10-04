import { describe, expect, test, vi } from "vitest";
import { createTrackEditingActions } from "../appTrackEditing";
import { createPatchLifecycleActions } from "../appPatchLifecycle";
import { createTrackAudioActions } from "../appTrackAudio";
import { createDefaultProject } from "../patch/presets";
import type { PatchRemovalRequest } from "../patch/patchRemoval";
import type { CommitProjectChange } from "../projectChanges";
import type { Project } from "@/types/music";

function setup(project = createDefaultProject()) {
  let current = project;
  const commitProjectChange = vi.fn<CommitProjectChange>((updater) => {
    current = updater(current);
  });
  return {
    project,
    selectedTrack: project.tracks[0],
    selectedTrackId: project.tracks[0].id,
    selectedTrackPatch: project.patches.find((patch) => patch.id === project.tracks[0].instrumentPatchId),
    patchRemovalDialog: null as PatchRemovalRequest | null,
    setPatchRemovalDialog: vi.fn(),
    setSelectedTrackId: vi.fn(),
    clearWorkspaceSelection: vi.fn(),
    setRuntimeError: vi.fn(),
    commitProjectChange,
    current: () => current
  };
}

describe("track editing controller", () => {
  test("add and remove update project history and selection together", () => {
    const state = setup();
    createTrackEditingActions(state).addTrack();
    const added = state.current().tracks.at(-1)!;
    expect(state.setSelectedTrackId).toHaveBeenCalledWith(added.id);
    expect(state.commitProjectChange).toHaveBeenLastCalledWith(expect.any(Function), {
      actionKey: `track:add:${added.id}`
    });
    expect(added.instrumentPatchId).toBe(state.project.patches[0].id);
    createTrackEditingActions({ ...state, project: state.current(), selectedTrack: added }).removeSelectedTrack();
    expect(state.current().tracks).toEqual(state.project.tracks);
    expect(state.setSelectedTrackId).toHaveBeenLastCalledWith(state.project.tracks[0].id);
    expect(state.clearWorkspaceSelection).toHaveBeenCalledOnce();
  });

  test("last-track removal leaves project, selection, and workspace untouched", () => {
    const project = createDefaultProject();
    project.tracks = project.tracks.slice(0, 1);
    const state = setup(project);
    createTrackEditingActions(state).removeSelectedTrack();
    expect(state.commitProjectChange).not.toHaveBeenCalled();
    expect(state.setSelectedTrackId).not.toHaveBeenCalled();
    expect(state.clearWorkspaceSelection).not.toHaveBeenCalled();
  });

  test("rename/reorder retain selection and use distinct history keys", () => {
    const state = setup();
    const actions = createTrackEditingActions(state);
    const first = state.project.tracks[0].id;
    actions.renameTrack(first, "Renamed");
    actions.moveTrack(first, state.project.tracks.at(-1)!.id, "after");
    expect(state.current().tracks.at(-1)?.name).toBe("Renamed");
    expect(state.commitProjectChange.mock.calls.map((call) => call[1]?.actionKey)).toEqual([
      `track:${first}:rename`,
      `track:${first}:move`
    ]);
    expect(state.setSelectedTrackId).not.toHaveBeenCalled();
  });
});

describe("patch lifecycle controller", () => {
  function customState() {
    const state = setup();
    createPatchLifecycleActions(state).duplicatePatchForSelectedTrack();
    return setup(state.current());
  }

  test("duplicate assigns a deep-cloned custom patch only to the selected track", () => {
    const state = setup();
    createPatchLifecycleActions(state).duplicatePatchForSelectedTrack();
    const duplicate = state.current().patches.at(-1)!;
    expect(duplicate.meta).toEqual({ source: "custom" });
    expect(duplicate.nodes).toEqual(state.selectedTrackPatch!.nodes);
    expect(duplicate.nodes).not.toBe(state.selectedTrackPatch!.nodes);
    expect(state.current().tracks[0].instrumentPatchId).toBe(duplicate.id);
    expect(state.current().tracks.slice(1)).toEqual(state.project.tracks.slice(1));
  });

  test("request opens a removal model; confirmation updates selection and clears modal/workspace", () => {
    const state = customState();
    createPatchLifecycleActions(state).requestRemoveSelectedTrackPatch();
    const request = state.setPatchRemovalDialog.mock.calls[0][0] as PatchRemovalRequest;
    expect(state.commitProjectChange).not.toHaveBeenCalled();
    const removal: PatchRemovalRequest = { ...request, rows: request.rows.map((row) => ({ ...row, mode: "remove" })) };
    createPatchLifecycleActions({ ...state, patchRemovalDialog: removal }).confirmRemovePatch();
    expect(state.current().patches.some((patch) => patch.id === request.patchId)).toBe(false);
    expect(state.current().tracks.some((track) => track.id === state.selectedTrackId)).toBe(false);
    expect(state.setSelectedTrackId).toHaveBeenCalledWith(state.project.tracks[1].id);
    expect(state.setPatchRemovalDialog).toHaveBeenLastCalledWith(null);
    expect(state.clearWorkspaceSelection).toHaveBeenCalledOnce();
  });

  test("fallback removal keeps selection; patch assignment resets stale macros", () => {
    const state = customState();
    const fallback = state.project.patches[0].id;
    createPatchLifecycleActions({
      ...state,
      patchRemovalDialog: {
        patchId: state.selectedTrackPatch!.id,
        rows: [{ trackId: state.selectedTrackId, mode: "fallback", fallbackPatchId: fallback }]
      }
    }).confirmRemovePatch();
    expect(state.setSelectedTrackId).toHaveBeenCalledWith(state.selectedTrackId);
    expect(state.current().tracks[0].instrumentPatchId).toBe(fallback);
    const project = structuredClone(state.current());
    project.tracks[0].macroValues = { old: 0.7 };
    const assignment = setup(project);
    createPatchLifecycleActions(assignment).updateTrackPatch(assignment.selectedTrackId, project.patches[1].id);
    expect(assignment.current().tracks[0].macroValues).toEqual({});
    expect(assignment.current().tracks[0].macroAutomations).toEqual({});
    expect(assignment.clearWorkspaceSelection).toHaveBeenCalledOnce();
  });

  test.each(["invalid-fallback", "last-track"])("rejected %s removal preserves modal and selection", (kind) => {
    const state = customState();
    const project = { ...state.project, tracks: state.project.tracks.slice(0, 1) };
    const patchRemovalDialog: PatchRemovalRequest = {
      patchId: state.selectedTrackPatch!.id,
      rows: [
        { trackId: state.selectedTrackId, mode: kind === "last-track" ? "remove" : "fallback", fallbackPatchId: "" }
      ]
    };
    createPatchLifecycleActions({ ...state, project, patchRemovalDialog }).confirmRemovePatch();
    expect(state.commitProjectChange).not.toHaveBeenCalled();
    expect(state.setSelectedTrackId).not.toHaveBeenCalled();
    expect(state.setPatchRemovalDialog).not.toHaveBeenCalled();
    expect(state.clearWorkspaceSelection).not.toHaveBeenCalled();
    expect(state.setRuntimeError).toHaveBeenCalledTimes(kind === "last-track" ? 1 : 0);
  });
});

describe("track audio controller", () => {
  test("mute and macro edits synchronize audio, commits, and final-value preview", () => {
    const state = setup();
    const engine = {
      setTrackMuted: vi.fn(),
      setMacroValue: vi.fn(),
      previewNote: vi.fn().mockResolvedValue(undefined)
    };
    const previewPatchById = vi.fn();
    const actions = createTrackAudioActions({ ...state, getAudioEngine: () => engine, previewPatchById });
    actions.toggleTrackMute(state.selectedTrackId);
    expect(engine.setTrackMuted).toHaveBeenCalledWith(state.selectedTrackId, !state.selectedTrack.mute);
    expect(state.current().tracks[0].mute).toBe(!state.selectedTrack.mute);
    actions.changeTrackMacro(state.selectedTrackId, "cutoff", 0.4);
    expect(previewPatchById).not.toHaveBeenCalled();
    expect(state.commitProjectChange).toHaveBeenLastCalledWith(expect.any(Function), {
      actionKey: `track:${state.selectedTrackId}:macro:cutoff`,
      coalesce: true
    });
    actions.changeTrackMacro(state.selectedTrackId, "cutoff", 0.8, { commit: true });
    expect(engine.setMacroValue).toHaveBeenLastCalledWith(state.selectedTrackId, "cutoff", 0.8);
    expect(state.current().tracks[0].macroValues.cutoff).toBe(0.8);
    expect(previewPatchById).toHaveBeenCalledWith(state.selectedTrack.instrumentPatchId);
    expect(state.commitProjectChange).toHaveBeenLastCalledWith(expect.any(Function), {
      actionKey: `track:${state.selectedTrackId}:macro:cutoff`,
      coalesce: false
    });
  });

  test("preview resolves the current engine at invocation and reports errors without editing", async () => {
    const state = setup();
    const note = {
      id: "note",
      pitchStr: "C4",
      durationBeats: 1,
      startBeat: 0,
      velocity: 0.8
    } as Project["tracks"][number]["notes"][number];
    const engine = {
      setTrackMuted: vi.fn(),
      setMacroValue: vi.fn(),
      previewNote: vi.fn().mockRejectedValue(new Error("Preview failed"))
    };
    let currentEngine: typeof engine | null = null;
    const actions = createTrackAudioActions({
      ...state,
      getAudioEngine: () => currentEngine,
      previewPatchById: vi.fn()
    });
    actions.previewPlacedNote(state.selectedTrackId, note);
    expect(engine.previewNote).not.toHaveBeenCalled();
    currentEngine = engine;
    actions.previewPlacedNote(state.selectedTrackId, note);
    await vi.waitFor(() =>
      expect(state.setRuntimeError).toHaveBeenCalledWith(expect.objectContaining({ code: "preview_failed" }))
    );
    expect(state.commitProjectChange).not.toHaveBeenCalled();
  });
});

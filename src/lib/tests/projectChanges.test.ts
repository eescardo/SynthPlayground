import { describe, expect, it, vi } from "vitest";
import { createHistory, redoHistory, undoHistory } from "@/lib/history";
import { createDefaultProject } from "@/lib/patch/presets";
import { applyProjectChange, reconcileProjectRules } from "@/lib/projectChanges";
import { freezeProjectSnapshot } from "@/lib/projectImmutability";
import type { Project } from "@/types/music";

const withNoteEnd = (project: Project, endBeat: number): Project => ({
  ...project,
  tracks: [
    {
      ...project.tracks[0],
      notes: [{ id: "tail", pitchStr: "C4", startBeat: 0, durationBeats: endBeat, velocity: 0.8 }]
    }
  ]
});

const createProject = (endBeat = 8, noteEndBeat = 4): Project => {
  const project = createDefaultProject();
  return withNoteEnd(
    {
      ...project,
      global: { ...project.global, compositionEnd: { beat: endBeat } }
    },
    noteEndBeat
  );
};

describe("project change boundary", () => {
  it("commits a note extension and its explicit end as one undoable, redoable edit", () => {
    const history = createHistory(createProject());
    freezeProjectSnapshot(history.current);
    const onCommitted = vi.fn();
    const next = applyProjectChange(history, (project) => withNoteEnd(project, 12), { onCommitted });

    expect(next.current.global.compositionEnd?.beat).toBe(12);
    expect(next.past).toEqual([history.current]);
    expect(history.current.global.compositionEnd?.beat).toBe(8);
    expect(onCommitted).toHaveBeenCalledExactlyOnceWith(next.current);
    expect(Object.isFrozen(next.current)).toBe(true);
    const undone = undoHistory(next);
    expect(undone.current).toBe(history.current);
    expect(redoHistory(undone).current).toBe(next.current);
  });

  it("materializes the end before deleting its extending note, including the undo snapshot", () => {
    const history = createHistory(createProject(8, 12));
    const next = applyProjectChange(history, (project) => {
      expect(project.global.compositionEnd?.beat).toBe(12);
      return { ...project, tracks: [{ ...project.tracks[0], notes: [] }] };
    });

    expect(next.current.global.compositionEnd?.beat).toBe(12);
    expect(next.current.tracks[0].notes).toEqual([]);
    expect(next.past).toHaveLength(1);
    const undone = undoHistory(next);
    expect(undone.current.global.compositionEnd?.beat).toBe(12);
    expect(undone.current.tracks[0].notes).toHaveLength(1);
    expect(redoHistory(undone).current).toBe(next.current);
    expect(history.current.global.compositionEnd?.beat).toBe(8);
  });

  it("does not introduce an explicit end when the project has none", () => {
    const project = createProject();
    delete project.global.compositionEnd;
    const next = applyProjectChange(createHistory(project), (current) => withNoteEnd(current, 12));
    expect(next.current.global.compositionEnd).toBeUndefined();
  });

  it("preserves no-op identity and does not notify or clear redo", () => {
    const history = { ...createHistory(createProject()), future: [createProject(16)] };
    const onCommitted = vi.fn();
    expect(applyProjectChange(history, (project) => project, { onCommitted })).toBe(history);
    expect(onCommitted).not.toHaveBeenCalled();
  });

  it("retains existing normalization behavior even for an otherwise no-op edit", () => {
    const history = createHistory(createProject(8, 12));
    const next = applyProjectChange(history, (project) => project);
    expect(next.current.global.compositionEnd?.beat).toBe(12);
    expect(next.past).toHaveLength(1);
    expect(next.past[0]).toBe(next.current);
  });

  it("coalesces related edits while undo still restores the original end", () => {
    const history = createHistory(createProject());
    const options = { actionKey: "note:resize", coalesce: true };
    const first = applyProjectChange(history, (project) => withNoteEnd(project, 10), options);
    const second = applyProjectChange(first, (project) => withNoteEnd(project, 12), options);
    expect(second.current.global.compositionEnd?.beat).toBe(12);
    expect(second.past).toEqual([history.current]);
    expect(second.lastActionKey).toBe(options.actionKey);
    expect(undoHistory(second).current).toBe(history.current);
  });

  it("applies rules with skipHistory while preserving history metadata and notifying", () => {
    const history = {
      ...createHistory(createProject()),
      past: [createProject(6)],
      future: [createProject(16)],
      lastActionKey: "prior"
    };
    const onCommitted = vi.fn();
    const next = applyProjectChange(history, (project) => withNoteEnd(project, 12), { skipHistory: true, onCommitted });
    expect(next.current.global.compositionEnd?.beat).toBe(12);
    expect(next.past).toBe(history.past);
    expect(next.future).toBe(history.future);
    expect(next.lastActionKey).toBe(history.lastActionKey);
    expect(onCommitted).toHaveBeenCalledExactlyOnceWith(next.current);
  });

  it("clears redo on a new edit", () => {
    const history = { ...createHistory(createProject()), future: [createProject(16)] };
    expect(applyProjectChange(history, (project) => withNoteEnd(project, 12)).future).toEqual([]);
  });
});

describe("project rule reconciliation", () => {
  it("normalizes a restored snapshot without changing past, future, or coalescing metadata", () => {
    const history = {
      ...createHistory(createProject(8, 12)),
      past: [createProject(6)],
      future: [createProject(16)],
      lastActionKey: "prior"
    };
    const next = reconcileProjectRules(history);
    expect(next.current.global.compositionEnd?.beat).toBe(12);
    expect(Object.isFrozen(next.current)).toBe(true);
    expect(history.current.global.compositionEnd?.beat).toBe(8);
    expect(next.past).toBe(history.past);
    expect(next.future).toBe(history.future);
    expect(next.lastActionKey).toBe(history.lastActionKey);
    expect(reconcileProjectRules(next)).toBe(next);
  });

  it("preserves identity when no reconciliation is needed", () => {
    const history = createHistory(createProject());
    expect(reconcileProjectRules(history)).toBe(history);
  });
});

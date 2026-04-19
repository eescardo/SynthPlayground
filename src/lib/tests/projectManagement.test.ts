import { describe, expect, it } from "vitest";
import {
  createAvailableProjectName,
  removeRecentProjectSummary,
  renameProjectInProject,
  upsertRecentProjectSummary
} from "@/lib/projectManagement";
import { Project } from "@/types/music";

const createProject = (overrides: Partial<Project> = {}): Project => ({
  id: "project_1",
  name: "Project One",
  global: {
    sampleRate: 48000,
    tempo: 122,
    meter: "4/4",
    gridBeats: 0.25,
    loop: []
  },
  tracks: [],
  patches: [],
  masterFx: {
    compressorEnabled: false,
    limiterEnabled: true,
    makeupGain: 0
  },
  ui: {
    patchWorkspace: {
      tabs: []
    }
  },
  createdAt: 1,
  updatedAt: 1,
  ...overrides
});

describe("projectManagement", () => {
  it("renames a project when the new name is non-empty", () => {
    expect(renameProjectInProject(createProject(), "  Sunset Sketch  ").name).toBe("Sunset Sketch");
  });

  it("ignores blank project names", () => {
    const project = createProject();
    expect(renameProjectInProject(project, "   ")).toBe(project);
  });

  it("creates a unique new-project name from recent names", () => {
    expect(createAvailableProjectName(["New Project", "New Project 2", "Bass Ideas"])).toBe("New Project 3");
  });

  it("tracks recent projects in newest-first order and limits the list", () => {
    const summaries = upsertRecentProjectSummary([], createProject({ id: "a", name: "A", updatedAt: 1 }));
    const updated = upsertRecentProjectSummary(summaries, createProject({ id: "b", name: "B", updatedAt: 2 }));
    const deduped = upsertRecentProjectSummary(updated, createProject({ id: "a", name: "A2", updatedAt: 3 }));
    const trimmed = upsertRecentProjectSummary(
      upsertRecentProjectSummary(
        upsertRecentProjectSummary(deduped, createProject({ id: "c", name: "C", updatedAt: 4 })),
        createProject({ id: "d", name: "D", updatedAt: 5 })
      ),
      createProject({ id: "e", name: "E", updatedAt: 6 })
    );

    expect(deduped.map((entry) => entry.name)).toEqual(["A2", "B"]);
    expect(trimmed.map((entry) => entry.id)).toEqual(["e", "d", "c", "a"]);
  });

  it("removes recent projects by id", () => {
    const summaries = [
      { id: "a", name: "A", updatedAt: 1 },
      { id: "b", name: "B", updatedAt: 2 }
    ];

    expect(removeRecentProjectSummary(summaries, "a")).toEqual([{ id: "b", name: "B", updatedAt: 2 }]);
  });
});

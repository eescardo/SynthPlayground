import { describe, expect, it } from "vitest";

import { createDefaultProject } from "@/lib/patch/presets";
import { moveTrackInProject, removeTrackFromProject, renameTrackInProject } from "@/lib/trackEdits";

describe("trackEdits", () => {
  it("renames a matching track and trims whitespace", () => {
    const project = createDefaultProject();
    const trackId = project.tracks[0].id;

    const next = renameTrackInProject(project, trackId, "  Low End  ");

    expect(next.tracks[0].name).toBe("Low End");
    expect(project.tracks[0].name).not.toBe("Low End");
  });

  it("ignores empty rename requests", () => {
    const project = createDefaultProject();

    const next = renameTrackInProject(project, project.tracks[0].id, "   ");

    expect(next).toBe(project);
  });

  it("removes a selected track but never removes the last remaining track", () => {
    const project = createDefaultProject();
    const removeId = project.tracks[1].id;

    const next = removeTrackFromProject(project, removeId);

    expect(next.tracks).toHaveLength(project.tracks.length - 1);
    expect(next.tracks.some((track) => track.id === removeId)).toBe(false);

    const singleTrackProject = {
      ...project,
      tracks: [project.tracks[0]]
    };

    expect(removeTrackFromProject(singleTrackProject, project.tracks[0].id)).toBe(singleTrackProject);
  });

  it("moves tracks before or after another track without changing track data", () => {
    const project = createDefaultProject();
    const [first, second, ...rest] = project.tracks;

    const movedAfter = moveTrackInProject(project, first.id, second.id, "after");
    expect(movedAfter.tracks).toEqual([second, first, ...rest]);

    const movedBefore = moveTrackInProject(movedAfter, first.id, second.id, "before");
    expect(movedBefore.tracks).toEqual(project.tracks);
  });

  it("ignores invalid and no-op track moves", () => {
    const project = createDefaultProject();
    const [first, second] = project.tracks;

    expect(moveTrackInProject(project, "missing", second.id, "before")).toBe(project);
    expect(moveTrackInProject(project, first.id, first.id, "after")).toBe(project);
    expect(moveTrackInProject(project, first.id, second.id, "before")).toBe(project);
  });
});

import { describe, expect, it } from "vitest";
import { toAudioProject } from "@/audio/audioProject";
import { createDefaultProject } from "@/lib/patch/presets";

describe("audioProject", () => {
  it("drops UI-only project state while preserving audio-facing data", () => {
    const project = createDefaultProject();
    project.ui.patchWorkspace.activeTabId = "tab_bass";
    project.ui.patchWorkspace.tabs = [
      {
        id: "tab_bass",
        name: "Bass Sketch",
        patchId: "preset_bass",
        probes: []
      }
    ];

    const audioProject = toAudioProject(project);

    expect(audioProject).toEqual({
      global: project.global,
      tracks: project.tracks,
      patches: project.patches,
      masterFx: project.masterFx
    });
    expect("ui" in (audioProject as unknown as Record<string, unknown>)).toBe(false);
  });
});

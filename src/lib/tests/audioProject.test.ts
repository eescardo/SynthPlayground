import { describe, expect, it } from "vitest";
import { toAudioProject } from "@/audio/audioProject";
import { createDefaultProject } from "@/lib/patch/presets";
import { createEmptyProjectAssetLibrary } from "@/lib/sampleAssetLibrary";

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

    const audioProject = toAudioProject(project, createEmptyProjectAssetLibrary());

    expect(audioProject).toEqual({
      global: project.global,
      tracks: project.tracks,
      patches: project.patches,
      masterFx: project.masterFx
    });
    expect("ui" in (audioProject as unknown as Record<string, unknown>)).toBe(false);
  });

  it("hydrates sample player runtime data from external sample assets", () => {
    const project = createDefaultProject();
    project.patches = [
      {
        ...project.patches[0],
        id: "patch_sample",
        nodes: [
          {
            id: "sample1",
            typeId: "SamplePlayer",
            params: {
              mode: "oneshot",
              start: 0,
              end: 1,
              gain: 1,
              pitchSemis: 0,
              sampleAssetId: "asset_1"
            }
          }
        ]
      }
    ];

    const audioProject = toAudioProject(project, {
      samplePlayerById: {
        asset_1: '{"version":1,"name":"kick.wav","sampleRate":48000,"samples":[0,0.5,-0.5]}'
      }
    });

    expect(audioProject.patches[0].nodes[0].params.sampleData).toContain('"kick.wav"');
    expect(audioProject.patches[0].nodes[0].params.sampleAssetId).toBe("asset_1");
  });
});

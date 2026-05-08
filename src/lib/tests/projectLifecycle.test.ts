import { describe, expect, it, vi } from "vitest";
import {
  createClearedProject,
  createNamedEmptyProject,
  createProjectFromDefaultTemplate,
  createProjectSnapshot,
  hydrateProjectSnapshot,
  prepareImportedProject
} from "@/lib/projectLifecycle";
import { createDefaultProject } from "@/lib/patch/presets";
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
  tracks: [
    {
      id: "track_1",
      name: "Track 1",
      instrumentPatchId: "patch_1",
      notes: [],
      mute: false,
      volume: 1,
      macroValues: {},
      macroAutomations: {},
      macroPanelExpanded: false,
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
  ],
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

describe("projectLifecycle", () => {
  it("snapshots a project with a fresh updated timestamp", () => {
    vi.spyOn(Date, "now").mockReturnValue(1234);

    expect(createProjectSnapshot(createProject())).toMatchObject({
      id: "project_1",
      updatedAt: 1234
    });
  });

  it("creates a uniquely named empty project from reserved names", () => {
    vi.spyOn(Date, "now").mockReturnValue(1234);

    const project = createNamedEmptyProject(["New Project", "New Project 2", "Song Sketch"]);

    expect(project.name).toBe("New Project 3");
    expect(project.updatedAt).toBe(1234);
    expect(project.tracks).toHaveLength(1);
  });

  it("clears a project while preserving identity and name", () => {
    vi.spyOn(Date, "now").mockReturnValue(1234);

    const cleared = createClearedProject(createProject({
      id: "project_current",
      name: "Current Project",
      createdAt: 99,
      tracks: [
        {
          id: "track_old",
          name: "Old Track",
          instrumentPatchId: "patch_old",
          notes: [],
          mute: false,
          volume: 1,
          macroValues: {},
          macroAutomations: {},
          macroPanelExpanded: false,
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

    expect(cleared.id).toBe("project_current");
    expect(cleared.name).toBe("Current Project");
    expect(cleared.createdAt).toBe(99);
    expect(cleared.updatedAt).toBe(1234);
    expect(cleared.tracks).toHaveLength(1);
    expect(cleared.tracks[0]?.name).toBe("Track 1");
  });

  it("creates a fresh default project with an updated timestamp", () => {
    vi.spyOn(Date, "now").mockReturnValue(1234);

    const resetProject = createProjectFromDefaultTemplate();

    expect(resetProject.updatedAt).toBe(1234);
    expect(resetProject.id).toMatch(/^project_/);
    expect(resetProject.tracks.length).toBeGreaterThan(0);
  });

  it("prepares imported projects with a fresh id and updated timestamp", () => {
    vi.spyOn(Date, "now").mockReturnValue(1234);

    const imported = prepareImportedProject(createProject({ id: "imported_project", updatedAt: 10 }));

    expect(imported.id).not.toBe("imported_project");
    expect(imported.updatedAt).toBe(1234);
    expect(imported.name).toBe("Project One");
  });

  it("hydrates persisted project snapshots through patch and asset normalization", () => {
    const project = createDefaultProject();
    project.patches = [
      {
        ...project.patches[0],
        nodes: [
          {
            id: "rev1",
            typeId: "Reverb",
            params: {
              size: 1,
              decay: 1.5,
              damping: 0.2,
              mix: 0.5
            }
          },
          {
            id: "sample1",
            typeId: "SamplePlayer",
            params: {
              mode: "oneshot",
              start: 0,
              end: 1,
              gain: 1,
              pitchSemis: 0,
              sampleData: "{\"version\":1,\"name\":\"tone.wav\",\"sampleRate\":48000,\"samples\":[0,0.1,-0.1]}"
            }
          }
        ]
      }
    ];

    const hydrated = hydrateProjectSnapshot(project, {
      samplePlayerById: {
        valid_asset: "{\"version\":1,\"name\":\"kept.wav\",\"sampleRate\":48000,\"samples\":[0]}",
        invalid_asset: 123
      }
    });

    const reverbParams = hydrated.project.patches[0].nodes[0].params;
    expect(reverbParams).toEqual({
      mode: "room",
      decay: 1,
      tone: 0.55,
      mix: 0.5
    });

    const sampleParams = hydrated.project.patches[0].nodes[1].params;
    const migratedAssetId = String(sampleParams.sampleAssetId);
    expect(sampleParams.sampleData).toBeUndefined();
    expect(hydrated.assets.samplePlayerById[migratedAssetId]).toContain("\"tone.wav\"");
    expect(hydrated.assets.samplePlayerById.valid_asset).toContain("\"kept.wav\"");
    expect(hydrated.assets.samplePlayerById.invalid_asset).toBeUndefined();
  });
});

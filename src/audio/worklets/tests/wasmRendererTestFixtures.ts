import { createPatchOutputPort, PATCH_OUTPUT_PORT_ID } from "@/lib/patch/ports";
import type { Project, Track } from "@/types/music";
import type { Patch } from "@/types/patch";

export function createWasmRendererTestPatch(overrides: Partial<Patch> = {}): Patch {
  return {
    schemaVersion: 1,
    id: "patch_1",
    name: "Test Patch",
    meta: { source: "custom" },
    nodes: [{ id: "osc", typeId: "VCO", params: { wave: "sine" } }],
    ports: [createPatchOutputPort({ gainDb: 0, limiter: false })],
    connections: [
      {
        id: "conn_1",
        from: { nodeId: "osc", portId: "out" },
        to: { nodeId: PATCH_OUTPUT_PORT_ID, portId: "in" }
      }
    ],
    ui: { macros: [] },
    layout: { nodes: [] },
    ...overrides
  } satisfies Patch;
}

export function createWasmRendererTestTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: "track_1",
    name: "Track 1",
    instrumentPatchId: "patch_1",
    notes: [],
    macroValues: {},
    macroAutomations: {},
    macroPanelExpanded: true,
    volume: 1,
    pan: 0.5,
    mute: false,
    fx: {
      delayEnabled: false,
      reverbEnabled: false,
      saturationEnabled: false,
      compressorEnabled: false,
      delayMix: 0.2,
      reverbMix: 0.2,
      drive: 0.2,
      compression: 0.4
    },
    ...overrides
  } satisfies Track;
}

export function createWasmRendererTestProject(options: { patch?: Patch; track?: Track } = {}): Project {
  const { patch = createWasmRendererTestPatch(), track = createWasmRendererTestTrack() } = options;
  return {
    id: "project_1",
    name: "Project",
    global: {
      sampleRate: 48000 as const,
      tempo: 120,
      meter: "4/4" as const,
      gridBeats: 0.25,
      loop: []
    },
    tracks: [track],
    patches: [patch],
    masterFx: {
      compressorEnabled: false,
      limiterEnabled: false,
      makeupGain: 0
    },
    ui: {
      patchWorkspace: {
        activeTabId: "tab_1",
        tabs: [{ id: "tab_1", name: patch.name, patchId: patch.id, probes: [] }]
      }
    },
    createdAt: 0,
    updatedAt: 0
  } satisfies Project;
}

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPatchOutputPort, PATCH_OUTPUT_PORT_ID } from "@/lib/patch/ports";
import type { Project, Track } from "@/types/music";
import type { Patch } from "@/types/patch";

const sharedMemory = new WebAssembly.Memory({ initial: 2 });
const blockSize = 128;
const leftView = new Float32Array(sharedMemory.buffer, 0, blockSize);
const rightView = new Float32Array(sharedMemory.buffer, blockSize * Float32Array.BYTES_PER_ELEMENT, blockSize);
const installedSampleAssets: Array<{
  trackIndex: number;
  nodeId: string;
  sampleRate: number;
  samples: Float32Array;
}> = [];
const engineStopTrack = vi.fn();

vi.mock("../synth-worklet-dsp-bindgen.js", () => {
  class MockWasmSubsetEngine {
    constructor() {
      leftView.fill(0.25);
      rightView.fill(0.25);
    }

    start_stream() {}
    enqueue_events() {}
    set_sample_asset(trackIndex: number, nodeId: string, sampleRate: number, samples: Float32Array) {
      installedSampleAssets.push({ trackIndex, nodeId, sampleRate, samples });
    }
    configure_preview_probe_capture() {}
    process_block() {
      return true;
    }
    has_active_voices() {
      return false;
    }
    preview_capture_state_json() {
      return JSON.stringify({ capturedSamples: 0, captures: [] });
    }
    preview_capture_sample_count() {
      return 0;
    }
    preview_capture_samples_ptr() {
      return 0;
    }
    preview_capture_samples_len() {
      return 0;
    }
    stop() {}
    stop_track(trackIndex: number) {
      engineStopTrack(trackIndex);
    }
    left_ptr() {
      return 0;
    }
    right_ptr() {
      return blockSize * Float32Array.BYTES_PER_ELEMENT;
    }
    block_size() {
      return blockSize;
    }
    set_profiling_enabled() {}
  }

  return {
    initSync: () => ({ memory: sharedMemory }),
    WasmSubsetEngine: MockWasmSubsetEngine
  };
});

function createPatch(overrides: Partial<Patch> = {}): Patch {
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

function createTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: "track_1",
    name: "Track 1",
    instrumentPatchId: "patch_1",
    notes: [],
    macroValues: {},
    macroAutomations: {},
    macroPanelExpanded: true,
    volume: 1,
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

function createProject(options: { patch?: Patch; track?: Track } = {}): Project {
  const { patch = createPatch(), track = createTrack() } = options;
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
        tabs: [
          {
            id: "tab_1",
            name: patch.name,
            patchId: patch.id,
            probes: []
          }
        ]
      }
    },
    createdAt: 0,
    updatedAt: 0
  } satisfies Project;
}

beforeEach(() => {
  vi.resetModules();
  engineStopTrack.mockReset();
  leftView.fill(0);
  rightView.fill(0);
  installedSampleAssets.length = 0;
});

describe("WASM worklet renderer sample assets", () => {
  it("installs SamplePlayer PCM assets through the binary WASM handoff", async () => {
    const { createWasmRenderer } = await import("../synth-worklet-wasm-renderer.js");
    const patch = createPatch({
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
      ],
      connections: [
        {
          id: "conn_sample",
          from: { nodeId: "sample1", portId: "out" },
          to: { nodeId: PATCH_OUTPUT_PORT_ID, portId: "in" }
        }
      ]
    });
    const project = {
      ...createProject({ patch }),
      sampleAssets: {
        samplePlayerById: {
          asset_1: {
            version: 2 as const,
            name: "sample.wav",
            sampleRate: 44100,
            samples: new Float32Array([0, 0.25, -0.25])
          }
        }
      }
    };
    const renderer = createWasmRenderer({
      processorOptions: {
        sampleRate: 48000,
        blockSize,
        project,
        wasmBytes: new Uint8Array([0, 97, 115, 109]).buffer
      }
    });

    renderer.startStream({
      project,
      songStartSample: 0,
      mode: "transport",
      events: []
    });

    expect(installedSampleAssets).toEqual([
      {
        trackIndex: 0,
        nodeId: "sample1",
        sampleRate: 44100,
        samples: new Float32Array([0, 0.25, -0.25])
      }
    ]);
    const projectSpecJson = (
      renderer as unknown as { getProjectPlan: (value: typeof project) => { projectSpecJson: string } }
    ).getProjectPlan(project).projectSpecJson;
    expect(projectSpecJson).not.toContain("legacy.wav");
    expect(projectSpecJson).not.toContain("asset_1");
  });

  it("hard-stops muted tracks and accepts track events after unmute", async () => {
    const { createWasmRenderer } = await import("../synth-worklet-wasm-renderer.js");

    const project = createProject({
      track: createTrack({
        id: "track_1",
        notes: [
          {
            id: "note_1",
            pitchStr: "C3",
            startBeat: 0,
            durationBeats: 8,
            velocity: 1
          }
        ]
      })
    });
    project.tracks.push(createTrack({ id: "track_2", name: "Track 2" }));
    const renderer = createWasmRenderer({
      processorOptions: {
        sampleRate: 48000,
        blockSize,
        project,
        wasmBytes: new Uint8Array([0, 97, 115, 109]).buffer
      }
    });

    const stream = renderer.startStream({
      project,
      songStartSample: 0,
      mode: "transport",
      events: [
        {
          id: "track_1_on",
          type: "NoteOn",
          sampleTime: 0,
          source: "timeline",
          trackId: "track_1",
          noteId: "note_1",
          pitchVoct: 0,
          velocity: 1
        },
        {
          id: "track_2_on",
          type: "NoteOn",
          sampleTime: 0,
          source: "timeline",
          trackId: "track_2",
          noteId: "note_2",
          pitchVoct: 0,
          velocity: 1
        }
      ],
      sessionId: 1
    });

    expect(stream).not.toBeNull();
    const mutableStream = stream as typeof stream & {
      dispatchTransportCommand(command: { type: "SetTrackMute"; trackId: string; muted: boolean }): void;
      enqueueEvents(events: NonNullable<typeof stream>["eventQueue"]): void;
    };
    mutableStream!.dispatchTransportCommand({ type: "SetTrackMute", trackId: "track_1", muted: true });
    mutableStream!.dispatchTransportCommand({ type: "SetTrackMute", trackId: "track_1", muted: false });
    mutableStream!.enqueueEvents([
      {
        id: "track_1_late_on",
        type: "NoteOn",
        sampleTime: 128,
        source: "timeline",
        trackId: "track_1",
        noteId: "note_1_late",
        pitchVoct: 0,
        velocity: 1
      },
      {
        id: "track_2_late_on",
        type: "NoteOn",
        sampleTime: 128,
        source: "timeline",
        trackId: "track_2",
        noteId: "note_2_late",
        pitchVoct: 0,
        velocity: 1
      }
    ]);

    expect(engineStopTrack).toHaveBeenCalledWith(0);
    expect(stream!.eventQueue.map((event) => event.id)).toEqual(["track_2_on", "track_1_late_on", "track_2_late_on"]);
  });
});

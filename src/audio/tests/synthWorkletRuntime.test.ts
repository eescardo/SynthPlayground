import { beforeEach, describe, expect, it, vi } from "vitest";

type RuntimeModule = typeof import("../../../public/worklets/synth-worklet-runtime.js");
type WorkletGlobal = typeof globalThis & {
  AudioWorkletProcessor?: new () => { port: { onmessage: ((event: unknown) => void) | null; postMessage: (...args: unknown[]) => void } };
  registerProcessor?: (name: string, processorCtor: unknown) => void;
};

function createPatch(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    id: "patch_1",
    name: "Test Patch",
    meta: { source: "custom" },
    nodes: [
      { id: "osc", typeId: "VCO", params: { wave: "sine" } },
      { id: "out", typeId: "Output", params: { gainDb: 0, limiter: false } }
    ],
    connections: [
      {
        id: "conn_1",
        from: { nodeId: "osc", portId: "out" },
        to: { nodeId: "out", portId: "in" }
      }
    ],
    ui: { macros: [] },
    layout: { nodes: [] },
    io: { audioOutNodeId: "out", audioOutPortId: "out" },
    ...overrides
  };
}

function createTrack(overrides: Record<string, unknown> = {}) {
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
  };
}

function createProject(options: {
  patch?: ReturnType<typeof createPatch>;
  track?: ReturnType<typeof createTrack>;
  masterFx?: Record<string, unknown>;
} = {}) {
  const { patch = createPatch(), track = createTrack(), masterFx = {} } = options;
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
      makeupGain: 0,
      ...masterFx
    },
    createdAt: 0,
    updatedAt: 0
  };
}

async function loadRuntimeModule(): Promise<RuntimeModule> {
  vi.resetModules();
  const workletGlobal = globalThis as WorkletGlobal;
  workletGlobal.AudioWorkletProcessor = class {
    port = { onmessage: null, postMessage() {} };
  };
  workletGlobal.registerProcessor = vi.fn();
  return import("../../../public/worklets/synth-worklet-runtime.js");
}

function renderProcessorBlock(
  processor: InstanceType<RuntimeModule["SynthWorkletProcessor"]>,
  frames = 128
) {
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  processor.process([], [[left, right]], {});
  return { left, right };
}

beforeEach(() => {
  const workletGlobal = globalThis as WorkletGlobal;
  delete workletGlobal.AudioWorkletProcessor;
  delete workletGlobal.registerProcessor;
});

describe("synth worklet runtime", () => {
  it("orders note-off before note-on on the same sample", async () => {
    const { compareScheduledEvents } = await loadRuntimeModule();

    const events = [
      { id: "note-on", type: "NoteOn", sampleTime: 1024 },
      { id: "note-off", type: "NoteOff", sampleTime: 1024 }
    ];

    events.sort(compareScheduledEvents);

    expect(events.map((event) => event.type)).toEqual(["NoteOff", "NoteOn"]);
  });

  it("applies piecewise macro bindings to compiled param targets", async () => {
    const { TrackRuntime } = await loadRuntimeModule();

    const patch = createPatch({
      ui: {
        macros: [
          {
            id: "macro_brightness",
            name: "Brightness",
            bindings: [
              {
                id: "binding_1",
                nodeId: "osc",
                paramId: "pulseWidth",
                map: "piecewise",
                points: [
                  { x: 0, y: 0.1 },
                  { x: 0.5, y: 0.3 },
                  { x: 1, y: 0.9 }
                ]
              }
            ]
          }
        ]
      }
    });

    const runtime = new TrackRuntime(createTrack(), patch, 48000, 128);
    runtime.applyMacro("macro_brightness", 0.75);

    const oscParams = runtime.compiled.paramTargets.get("osc");

    expect(oscParams?.get("pulseWidth")).toBeCloseTo(0.6, 5);
  });

  it("preview rendering bypasses mute and track volume so auditioning still produces audio", async () => {
    const { SynthWorkletProcessor } = await loadRuntimeModule();

    const project = createProject({
      track: createTrack({ mute: true, volume: 0 })
    });
    const processor = new SynthWorkletProcessor({
      processorOptions: {
        sampleRate: 48000,
        blockSize: 128,
        project
      }
    });

    processor.onMessage({
      type: "PREVIEW",
      durationSamples: 128,
      events: [
        {
          id: "preview_on",
          type: "NoteOn",
          sampleTime: 0,
          trackId: "track_1",
          noteId: "note_1",
          pitchVoct: 0,
          velocity: 1
        }
      ]
    });

    const { left } = renderProcessorBlock(processor);

    expect(left.some((sample) => Math.abs(sample) > 1e-6)).toBe(true);
  });

  it("ignores stale transport event batches from older sessions", async () => {
    const { SynthWorkletProcessor } = await loadRuntimeModule();

    const processor = new SynthWorkletProcessor({
      processorOptions: {
        sampleRate: 48000,
        blockSize: 128,
        project: createProject()
      }
    });

    processor.onMessage({ type: "TRANSPORT", isPlaying: true, sessionId: 7, songStartSample: 0, events: [] });
    processor.onMessage({
      type: "EVENTS",
      sessionId: 6,
      events: [{ id: "stale", type: "NoteOn", sampleTime: 0, trackId: "track_1", noteId: "note_1", pitchVoct: 0, velocity: 1 }]
    });

    expect(processor.eventQueue).toEqual([]);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, Track } from "@/types/music";
import type { Patch } from "@/types/patch";

type RuntimeModule = typeof import("../synth-worklet-runtime.js");
type WorkletGlobal = typeof globalThis & {
  AudioWorkletProcessor?: new () => { port: { onmessage: ((event: unknown) => void) | null; postMessage: (...args: unknown[]) => void } };
  registerProcessor?: (name: string, processorCtor: unknown) => void;
};

function createPatch(overrides: Partial<Patch> = {}): Patch {
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

function createProject(options: {
  patch?: Patch;
  track?: Track;
  masterFx?: Partial<Project["masterFx"]>;
} = {}): Project {
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
  } satisfies Project;
}

async function loadRuntimeModule(): Promise<RuntimeModule> {
  vi.resetModules();
  const workletGlobal = globalThis as WorkletGlobal;
  workletGlobal.AudioWorkletProcessor = class {
    port = { onmessage: null, postMessage() {} };
  };
  workletGlobal.registerProcessor = vi.fn();
  return import("../synth-worklet-runtime.js");
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

const sumAbs = (buffer: Float32Array) => buffer.reduce((sum, sample) => sum + Math.abs(sample), 0);

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

  it("throws during runtime compilation when a node type has no registered DSP processor", async () => {
    const { TrackRuntime } = await loadRuntimeModule();

    const patch = createPatch({
      nodes: [
        { id: "mystery", typeId: "MysteryNode", params: {} },
        { id: "out", typeId: "Output", params: { gainDb: 0, limiter: false } }
      ],
      connections: [
        {
          id: "conn_1",
          from: { nodeId: "mystery", portId: "out" },
          to: { nodeId: "out", portId: "in" }
        }
      ]
    });

    expect(() => new TrackRuntime(createTrack(), patch, 48000, 128)).toThrow(
      "No synth worklet processor registered for node type: MysteryNode"
    );
  });

  it("scales track output by track volume and can bypass mute and volume when requested", async () => {
    const { TrackRuntime } = await loadRuntimeModule();

    const event = { noteId: "note_1", pitchVoct: 0, velocity: 1 };
    const fullRuntime = new TrackRuntime(createTrack({ volume: 1 }), createPatch(), 48000, 128);
    const halfRuntime = new TrackRuntime(createTrack({ volume: 0.5 }), createPatch(), 48000, 128);
    const ignoredRuntime = new TrackRuntime(createTrack({ mute: true, volume: 0.25 }), createPatch(), 48000, 128);

    fullRuntime.noteOn(event, 0);
    halfRuntime.noteOn(event, 0);
    ignoredRuntime.noteOn(event, 0);

    const fullBuffer = new Float32Array(128);
    const halfBuffer = new Float32Array(128);
    const ignoredBuffer = new Float32Array(128);
    const bypassedBuffer = new Float32Array(128);

    fullRuntime.processTrackFrames(fullBuffer, 0, 128);
    halfRuntime.processTrackFrames(halfBuffer, 0, 128);
    ignoredRuntime.processTrackFrames(ignoredBuffer, 0, 128);
    ignoredRuntime.processTrackFrames(bypassedBuffer, 0, 128, { ignoreMute: true, ignoreVolume: true });

    expect(sumAbs(fullBuffer)).toBeGreaterThan(0.001);
    expect(sumAbs(halfBuffer)).toBeCloseTo(sumAbs(fullBuffer) * 0.5, 4);
    expect(sumAbs(ignoredBuffer)).toBe(0);
    expect(sumAbs(bypassedBuffer)).toBeGreaterThan(0.001);
  });

  it("follows ADSR release through the rendered track pipeline", async () => {
    const { TrackRuntime } = await loadRuntimeModule();

    const patch = createPatch({
      nodes: [
        { id: "osc", typeId: "VCO", params: { wave: "sine" } },
        { id: "env", typeId: "ADSR", params: { attack: 0.001, decay: 0.01, sustain: 0.4, release: 0.02 } },
        { id: "amp", typeId: "VCA", params: { bias: 0, gain: 1 } },
        { id: "out", typeId: "Output", params: { gainDb: 0, limiter: false } }
      ],
      connections: [
        { id: "conn_1", from: { nodeId: "osc", portId: "out" }, to: { nodeId: "amp", portId: "in" } },
        { id: "conn_2", from: { nodeId: "env", portId: "out" }, to: { nodeId: "amp", portId: "gainCV" } },
        { id: "conn_3", from: { nodeId: "amp", portId: "out" }, to: { nodeId: "out", portId: "in" } }
      ]
    });

    const runtime = new TrackRuntime(createTrack(), patch, 48000, 128);
    runtime.noteOn({ noteId: "note_1", pitchVoct: 0, velocity: 1 }, 0);

    const attackBuffer = new Float32Array(128);
    runtime.processTrackFrames(attackBuffer, 0, 128);

    runtime.noteOff({ noteId: "note_1" });
    const releaseBuffers = Array.from({ length: 48 }, () => new Float32Array(128));
    for (const buffer of releaseBuffers) {
      runtime.processTrackFrames(buffer, 0, 128);
    }

    const firstReleaseEnergy = sumAbs(releaseBuffers[0]);
    const finalReleaseEnergy = sumAbs(releaseBuffers[releaseBuffers.length - 1]);

    expect(sumAbs(attackBuffer)).toBeGreaterThan(0.001);
    expect(firstReleaseEnergy).toBeGreaterThan(finalReleaseEnergy);
    expect(finalReleaseEnergy).toBeLessThan(firstReleaseEnergy * 0.05);
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

  it("can preview while respecting track volume", async () => {
    const { SynthWorkletProcessor } = await loadRuntimeModule();

    const fullVolumeProcessor = new SynthWorkletProcessor({
      processorOptions: {
        sampleRate: 48000,
        blockSize: 128,
        project: createProject({ track: createTrack({ mute: true, volume: 1 }) })
      }
    });
    const quietProcessor = new SynthWorkletProcessor({
      processorOptions: {
        sampleRate: 48000,
        blockSize: 128,
        project: createProject({ track: createTrack({ mute: true, volume: 0.25 }) })
      }
    });

    for (const processor of [fullVolumeProcessor, quietProcessor]) {
      processor.onMessage({
        type: "PREVIEW",
        durationSamples: 128,
        ignoreVolume: false,
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
    }

    const { left: fullLeft } = renderProcessorBlock(fullVolumeProcessor);
    const { left: quietLeft } = renderProcessorBlock(quietProcessor);

    expect(sumAbs(fullLeft)).toBeGreaterThan(0.001);
    expect(sumAbs(quietLeft)).toBeCloseTo(sumAbs(fullLeft) * 0.25, 4);
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

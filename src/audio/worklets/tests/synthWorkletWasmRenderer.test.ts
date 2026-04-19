import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

beforeEach(() => {
  const workletGlobal = globalThis as WorkletGlobal;
  delete workletGlobal.AudioWorkletProcessor;
  delete workletGlobal.registerProcessor;
});

afterEach(async () => {
  const runtime = (await import("../synth-worklet-runtime.js")) as RuntimeModule & {
    resetRendererFactory?: () => void;
  };
  runtime.resetRendererFactory?.();
});

describe("strict WASM preview capture handling", () => {
  it("captures probes in the processor even when the active renderer does not implement probe capture", async () => {
    const runtime = (await loadRuntimeModule()) as RuntimeModule & {
      setRendererFactory?: (factory: (config?: unknown) => unknown) => void;
    };
    const { SynthWorkletProcessor, setRendererFactory } = runtime;

    class FakeRenderer {
      port: { onmessage: null; postMessage: (...args: unknown[]) => void };
      sampleRateInternal: number;
      blockSize: number;
      defaultProject: Project | null;

      constructor(options: { processorOptions?: { sampleRate?: number; blockSize?: number; project?: Project } } = {}) {
        const processorOptions = options.processorOptions || {};
        this.port = { onmessage: null, postMessage() {} };
        this.sampleRateInternal = processorOptions.sampleRate ?? 48000;
        this.blockSize = processorOptions.blockSize ?? 128;
        this.defaultProject = processorOptions.project ?? null;
      }

      configure(config: { sampleRate?: number; blockSize?: number }) {
        this.sampleRateInternal = config.sampleRate ?? this.sampleRateInternal;
        this.blockSize = config.blockSize ?? this.blockSize;
      }

      setDefaultProject(project: Project) {
        this.defaultProject = project;
      }

      get project() {
        return this.defaultProject;
      }

      startStream(options: { durationSamples?: number; project?: Project; events?: unknown[] }) {
        const durationSamples = options.durationSamples ?? this.blockSize;
        const stream = {
          port: this.port,
          project: options.project || this.defaultProject,
          trackRuntimes: [],
          eventQueue: [...(options.events || [])],
          stopped: false,
          processed: 0,
          processBlock: (output: Float32Array[]) => {
            const left = output[0];
            const right = output[1] || output[0];
            left.fill(0.25);
            if (right !== left) {
              right.fill(0.25);
            }
            stream.processed += left.length;
            if (stream.processed >= durationSamples) {
              stream.stopped = true;
            }
            return true;
          },
          enqueueEvents: () => {},
          setMacroValue: () => {},
          setRecordingTrack: () => {},
          stop: () => {
            stream.stopped = true;
          }
        };
        return stream;
      }
    }

    setRendererFactory?.((config = {}) => new FakeRenderer(config as { processorOptions?: { sampleRate?: number; blockSize?: number; project?: Project } }));

    const processor = new SynthWorkletProcessor({
      processorOptions: {
        sampleRate: 48000,
        blockSize: 128,
        project: createProject()
      }
    });

    const postMessage = vi.spyOn((processor as { port: { postMessage: (...args: unknown[]) => void } }).port, "postMessage");

    processor.onMessage({
      type: "PREVIEW",
      trackId: "track_1",
      previewId: "preview_test",
      durationSamples: 32,
      captureProbes: [
        {
          probeId: "probe_scope",
          kind: "scope",
          target: {
            kind: "connection",
            connectionId: "conn_1"
          }
        }
      ],
      events: [
        {
          id: "preview_on",
          type: "NoteOn",
          sampleTime: 0,
          source: "preview",
          trackId: "track_1",
          noteId: "note_1",
          pitchVoct: 0,
          velocity: 1
        }
      ]
    });

    renderProcessorBlock(processor);

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "PREVIEW_CAPTURE",
        previewId: "preview_test",
        captures: [
          expect.objectContaining({
            probeId: "probe_scope",
            capturedSamples: 32
          })
        ]
      })
    );
  });
});

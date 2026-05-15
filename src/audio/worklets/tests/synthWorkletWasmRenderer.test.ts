import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPatchOutputPort, PATCH_OUTPUT_PORT_ID } from "@/lib/patch/ports";
import type { Project, Track } from "@/types/music";
import type { Patch } from "@/types/patch";

const sharedMemory = new WebAssembly.Memory({ initial: 1 });
const blockSize = 128;
const leftView = new Float32Array(sharedMemory.buffer, 0, blockSize);
const rightView = new Float32Array(sharedMemory.buffer, blockSize * Float32Array.BYTES_PER_ELEMENT, blockSize);
let previewCaptureStateJson = JSON.stringify({ capturedSamples: 0, captures: [] });
let previewCaptureSampleCount = 0;
let writeInvalidPreviewCaptureJson = false;
let hasActiveVoices = false;
let configuredPreviewCaptureJson = "";
const engineStop = vi.fn();

vi.mock("../synth-worklet-dsp-bindgen.js", () => {
  class MockWasmSubsetEngine {
    constructor() {
      leftView.fill(0.25);
      rightView.fill(0.25);
    }

    start_stream() {}
    enqueue_events() {}
    configure_preview_probe_capture(captureJson: string) {
      configuredPreviewCaptureJson = captureJson;
    }
    process_block() {
      previewCaptureSampleCount += blockSize;
      previewCaptureStateJson = writeInvalidPreviewCaptureJson
        ? "\0".repeat(16)
        : JSON.stringify({
            capturedSamples: previewCaptureSampleCount,
            captures: [
              {
                probeId: "probe_1",
                sampleStride: 4,
                samples: Array.from({ length: blockSize }, () => 0.5)
              }
            ]
          });
      return true;
    }
    has_active_voices() {
      return hasActiveVoices;
    }
    preview_capture_state_json() {
      return previewCaptureStateJson;
    }
    preview_capture_sample_count() {
      return previewCaptureSampleCount;
    }
    stop() {
      engineStop();
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
  engineStop.mockReset();
  leftView.fill(0);
  rightView.fill(0);
  previewCaptureSampleCount = 0;
  writeInvalidPreviewCaptureJson = false;
  hasActiveVoices = false;
  previewCaptureStateJson = JSON.stringify({ capturedSamples: 0, captures: [] });
  configuredPreviewCaptureJson = "";
});

describe("WASM worklet renderer", () => {
  it("emits preview probe captures from backend-owned capture state", async () => {
    const { createWasmRenderer } = await import("../synth-worklet-wasm-renderer.js");

    const project = createProject();
    const renderer = createWasmRenderer({
      processorOptions: {
        sampleRate: 48000,
        blockSize,
        project,
        wasmBytes: new Uint8Array([0, 97, 115, 109]).buffer
      }
    });
    const postMessage = vi.fn();
    renderer.port.postMessage = postMessage;

    const stream = renderer.startStream({
      project,
      songStartSample: 0,
      mode: "preview",
      durationSamples: blockSize,
      trackId: "track_1",
      previewId: "preview_1",
      events: [
        {
          id: "note_on",
          type: "NoteOn",
          sampleTime: 0,
          source: "preview",
          trackId: "track_1",
          noteId: "note_1",
          pitchVoct: 0,
          velocity: 1
        }
      ],
      captureProbes: [
        {
          probeId: "probe_1",
          kind: "scope",
          target: { kind: "port", nodeId: "osc", portId: "out", portKind: "out" }
        }
      ],
      randomSeed: 123
    });

    expect(stream).not.toBeNull();
    stream!.processBlock([new Float32Array(blockSize), new Float32Array(blockSize)]);

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "PREVIEW_CAPTURE",
        previewId: "preview_1",
        captures: [
          expect.objectContaining({
            probeId: "probe_1",
            capturedSamples: blockSize / 4,
            sampleRate: 12000,
            sampleStride: 4,
            samples: expect.arrayContaining([0.5])
          })
        ]
      })
    );
  });

  it("writes preview probe captures into provided shared buffers", async () => {
    const { createWasmRenderer } = await import("../synth-worklet-wasm-renderer.js");

    const project = createProject();
    const renderer = createWasmRenderer({
      processorOptions: {
        sampleRate: 48000,
        blockSize,
        project,
        wasmBytes: new Uint8Array([0, 97, 115, 109]).buffer
      }
    });
    const postMessage = vi.fn();
    renderer.port.postMessage = postMessage;
    const sampleBuffer = new SharedArrayBuffer(blockSize * Float32Array.BYTES_PER_ELEMENT);

    const stream = renderer.startStream({
      project,
      songStartSample: 0,
      mode: "preview",
      durationSamples: blockSize,
      trackId: "track_1",
      previewId: "preview_shared",
      events: [
        {
          id: "note_on",
          type: "NoteOn",
          sampleTime: 0,
          source: "preview",
          trackId: "track_1",
          noteId: "note_1",
          pitchVoct: 0,
          velocity: 1
        }
      ],
      captureProbes: [
        {
          probeId: "probe_1",
          kind: "scope",
          target: { kind: "port", nodeId: "osc", portId: "out", portKind: "out" }
        }
      ],
      captureSharedBuffers: [{ probeId: "probe_1", sampleBuffer, capacitySamples: blockSize }],
      randomSeed: 123
    });

    expect(stream).not.toBeNull();
    stream!.processBlock([new Float32Array(blockSize), new Float32Array(blockSize)]);

    expect(new Float32Array(sampleBuffer)[0]).toBe(0.5);
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "PREVIEW_CAPTURE",
        previewId: "preview_shared",
        captures: [
          expect.objectContaining({
            probeId: "probe_1",
            sampleBuffer,
            sampleLength: blockSize,
            samples: []
          })
        ]
      })
    );
  });

  it("throttles progressive preview capture snapshots", async () => {
    const { createWasmRenderer } = await import("../synth-worklet-wasm-renderer.js");

    const project = createProject();
    const renderer = createWasmRenderer({
      processorOptions: {
        sampleRate: 48000,
        blockSize,
        project,
        wasmBytes: new Uint8Array([0, 97, 115, 109]).buffer
      }
    });
    const postMessage = vi.fn();
    renderer.port.postMessage = postMessage;
    hasActiveVoices = true;

    const stream = renderer.startStream({
      project,
      songStartSample: 0,
      mode: "preview",
      durationSamples: blockSize * 128,
      trackId: "track_1",
      previewId: "preview_throttled",
      events: [
        {
          id: "note_on",
          type: "NoteOn",
          sampleTime: 0,
          source: "preview",
          trackId: "track_1",
          noteId: "note_1",
          pitchVoct: 0,
          velocity: 1
        }
      ],
      captureProbes: [
        {
          probeId: "probe_1",
          kind: "scope",
          target: { kind: "port", nodeId: "osc", portId: "out", portKind: "out" }
        }
      ],
      randomSeed: 123
    });

    stream!.processBlock([new Float32Array(blockSize), new Float32Array(blockSize)]);
    expect(postMessage).not.toHaveBeenCalled();

    for (let index = 1; index < 64; index += 1) {
      stream!.processBlock([new Float32Array(blockSize), new Float32Array(blockSize)]);
    }

    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "PREVIEW_CAPTURE",
        captures: [expect.objectContaining({ capturedSamples: blockSize * 16 })]
      })
    );
  });

  it("uses a separate probe capture duration for held previews", async () => {
    const { createWasmRenderer } = await import("../synth-worklet-wasm-renderer.js");

    const project = createProject();
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
      mode: "preview",
      durationSamples: blockSize * 64,
      captureDurationSamples: blockSize * 2,
      trackId: "track_1",
      previewId: "preview_held",
      events: [
        {
          id: "note_on",
          type: "NoteOn",
          sampleTime: 0,
          source: "preview",
          trackId: "track_1",
          noteId: "note_1",
          pitchVoct: 0,
          velocity: 1
        }
      ],
      captureProbes: [
        {
          probeId: "probe_1",
          kind: "scope",
          target: { kind: "port", nodeId: "osc", portId: "out", portKind: "out" }
        }
      ],
      randomSeed: 123
    });

    expect(stream).not.toBeNull();
    expect(JSON.parse(configuredPreviewCaptureJson)).toEqual([
      expect.objectContaining({
        probeId: "probe_1",
        durationSamples: blockSize * 2
      })
    ]);
  });

  it("does not force a final preview capture when a preview stream is stopped early", async () => {
    const { createWasmRenderer } = await import("../synth-worklet-wasm-renderer.js");

    const project = createProject();
    const renderer = createWasmRenderer({
      processorOptions: {
        sampleRate: 48000,
        blockSize,
        project,
        wasmBytes: new Uint8Array([0, 97, 115, 109]).buffer
      }
    });
    const postMessage = vi.fn();
    renderer.port.postMessage = postMessage;

    const stream = renderer.startStream({
      project,
      songStartSample: 0,
      mode: "preview",
      durationSamples: blockSize * 16,
      trackId: "track_1",
      previewId: "preview_early_stop",
      events: [
        {
          id: "note_on",
          type: "NoteOn",
          sampleTime: 0,
          source: "preview",
          trackId: "track_1",
          noteId: "note_1",
          pitchVoct: 0,
          velocity: 1
        }
      ],
      captureProbes: [
        {
          probeId: "probe_1",
          kind: "scope",
          target: { kind: "port", nodeId: "osc", portId: "out", portKind: "out" }
        }
      ],
      randomSeed: 123
    });

    stream!.stop();

    expect(engineStop).toHaveBeenCalledTimes(1);
    expect(postMessage).not.toHaveBeenCalled();
  });

  it("ignores invalid preview capture JSON without stopping audio processing", async () => {
    const { createWasmRenderer } = await import("../synth-worklet-wasm-renderer.js");

    const project = createProject();
    const renderer = createWasmRenderer({
      processorOptions: {
        sampleRate: 48000,
        blockSize,
        project,
        wasmBytes: new Uint8Array([0, 97, 115, 109]).buffer
      }
    });
    const postMessage = vi.fn();
    renderer.port.postMessage = postMessage;
    writeInvalidPreviewCaptureJson = true;
    hasActiveVoices = true;

    const stream = renderer.startStream({
      project,
      songStartSample: 0,
      mode: "preview",
      durationSamples: blockSize * 128,
      trackId: "track_1",
      previewId: "preview_bad_capture",
      events: [
        {
          id: "note_on",
          type: "NoteOn",
          sampleTime: 0,
          source: "preview",
          trackId: "track_1",
          noteId: "note_1",
          pitchVoct: 0,
          velocity: 1
        }
      ],
      captureProbes: [
        {
          probeId: "probe_1",
          kind: "scope",
          target: { kind: "port", nodeId: "osc", portId: "out", portKind: "out" }
        }
      ],
      randomSeed: 123
    });

    expect(() => {
      for (let index = 0; index < 64; index += 1) {
        stream!.processBlock([new Float32Array(blockSize), new Float32Array(blockSize)]);
      }
    }).not.toThrow();
    expect(stream!.stopped).toBe(false);
    expect(postMessage).not.toHaveBeenCalled();
  });

  it("stops a long-lived preview once the released note has no active voices left", async () => {
    const { createWasmRenderer } = await import("../synth-worklet-wasm-renderer.js");

    const project = createProject();
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
      mode: "preview",
      durationSamples: blockSize * 16,
      trackId: "track_1",
      previewId: "preview_release",
      events: [
        {
          id: "note_on",
          type: "NoteOn",
          sampleTime: 0,
          source: "preview",
          trackId: "track_1",
          noteId: "note_1",
          pitchVoct: 0,
          velocity: 1
        }
      ],
      randomSeed: 123
    });

    hasActiveVoices = true;
    stream!.processBlock([new Float32Array(blockSize), new Float32Array(blockSize)]);
    expect(stream!.stopped).toBe(false);

    hasActiveVoices = false;
    stream!.processBlock([new Float32Array(blockSize), new Float32Array(blockSize)]);
    expect(stream!.stopped).toBe(true);
    expect(engineStop).toHaveBeenCalledTimes(1);
  });
});

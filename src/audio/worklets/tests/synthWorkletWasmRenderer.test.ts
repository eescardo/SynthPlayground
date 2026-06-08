import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPatchOutputPort, PATCH_OUTPUT_PORT_ID } from "@/lib/patch/ports";
import type { Project, Track } from "@/types/music";
import type { Patch } from "@/types/patch";

const sharedMemory = new WebAssembly.Memory({ initial: 2 });
const blockSize = 128;
const leftView = new Float32Array(sharedMemory.buffer, 0, blockSize);
const rightView = new Float32Array(sharedMemory.buffer, blockSize * Float32Array.BYTES_PER_ELEMENT, blockSize);
const captureSamplesPtr = blockSize * 2 * Float32Array.BYTES_PER_ELEMENT;
const captureSampleView = new Float32Array(sharedMemory.buffer, captureSamplesPtr, blockSize * 160);
let previewCaptureStateJson = JSON.stringify({ capturedSamples: 0, captures: [] });
let previewCaptureSampleCount = 0;
let writeInvalidPreviewCaptureJson = false;
let throwOnStartStream = false;
let hasActiveVoices = false;
let configuredPreviewCaptureJson = "";
const engineStop = vi.fn();
const engineFree = vi.fn();
const engineCreate = vi.fn();

const expectStreamEngineDetached = (stream: unknown) => {
  expect((stream as { engine?: unknown }).engine).toBeNull();
};

function resetMockPreviewCaptureState() {
  previewCaptureSampleCount = 0;
  captureSampleView.fill(0);
  previewCaptureStateJson = JSON.stringify({ capturedSamples: 0, captures: [] });
}

vi.mock("../synth-worklet-dsp-bindgen.js", () => {
  class MockWasmSubsetEngine {
    constructor() {
      engineCreate();
      leftView.fill(0.25);
      rightView.fill(0.25);
    }

    start_stream() {
      if (throwOnStartStream) {
        throw new Error("start_stream failed");
      }
      resetMockPreviewCaptureState();
    }
    enqueue_events() {}
    set_sample_asset() {}
    configure_preview_probe_capture(captureJson: string) {
      configuredPreviewCaptureJson = captureJson;
    }
    process_block() {
      const previousSampleCount = previewCaptureSampleCount;
      previewCaptureSampleCount += blockSize;
      captureSampleView.fill(0.5, previousSampleCount, previewCaptureSampleCount);
      previewCaptureStateJson = writeInvalidPreviewCaptureJson
        ? "\0".repeat(16)
        : JSON.stringify({
            capturedSamples: previewCaptureSampleCount,
            captures: [
              {
                probeId: "probe_1",
                sampleStride: 4,
                samples: Array.from({ length: blockSize }, () => 0.5),
                spectrumFrames: {
                  columns: [[0.25, 0.5]],
                  binFrequencies: [120, 240],
                  frameSize: 1024,
                  sampleRate: 48000,
                  capturedSamples: 1024
                }
              }
            ]
          });
      return true;
    }
    has_active_voices() {
      return hasActiveVoices;
    }
    preview_capture_state_json(includeFinal?: boolean, includeSamples = true) {
      if (writeInvalidPreviewCaptureJson) {
        return previewCaptureStateJson;
      }
      if (!includeFinal) {
        const snapshot = JSON.parse(previewCaptureStateJson);
        return JSON.stringify({
          ...snapshot,
          captures: snapshot.captures.map((capture: Record<string, unknown>) => ({
            ...capture,
            samples: includeSamples ? capture.samples : []
          }))
        });
      }
      const snapshot = JSON.parse(previewCaptureStateJson);
      return JSON.stringify({
        ...snapshot,
        captures: snapshot.captures.map((capture: Record<string, unknown>) => ({
          ...capture,
          samples: includeSamples ? capture.samples : [],
          finalSpectrum: {
            columns: [
              [0.1, 0.2, 0.3],
              [0.2, 0.4, 0.6]
            ],
            binFrequencies: [100, 200, 300],
            startColumn: 0,
            complete: true,
            frameSize: 1024,
            sampleRate: 48000,
            capturedSamples: previewCaptureSampleCount,
            requestedTimeColumns: 512,
            requestedFrequencyBins: 1025,
            sourceColumnCount: 2
          },
          finalScope: {
            waveformBuckets: [{ min: -0.5, max: 0.5, peak: 0.5 }],
            envelopeBuckets: [0.5],
            peak: 0.5,
            sampleRate: 48000,
            capturedSamples: previewCaptureSampleCount
          },
          adsrEstimate: {
            attackSeconds: 0.01,
            decaySeconds: 0.05,
            sustainRatio: 0.38,
            releaseSeconds: 0.024,
            label: "A: 10ms|D:50ms|S:38%|R:24ms"
          },
          qualityStats: {
            peak: 0.98,
            peakDb: -0.17,
            rms: 0.42,
            rmsDb: -7.1,
            dcOffset: 0.01,
            crestFactorDb: 7.0,
            nearClipCount: 3,
            clippedCount: 0,
            maxConsecutiveNearClip: 3,
            maxDelta: 0.2,
            zeroCrossingRate: 0.1,
            roughness: 0.2,
            capturedSamples: previewCaptureSampleCount
          }
        }))
      });
    }
    preview_capture_sample_count() {
      return previewCaptureSampleCount;
    }
    preview_capture_samples_ptr() {
      return captureSamplesPtr;
    }
    preview_capture_samples_len() {
      return previewCaptureSampleCount;
    }
    stop() {
      engineStop();
    }
    free() {
      engineFree();
    }
    stop_track() {}
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
  engineFree.mockReset();
  engineCreate.mockReset();
  leftView.fill(0);
  rightView.fill(0);
  resetMockPreviewCaptureState();
  writeInvalidPreviewCaptureJson = false;
  throwOnStartStream = false;
  hasActiveVoices = false;
  configuredPreviewCaptureJson = "";
});

describe("WASM worklet renderer", () => {
  it("filters initial transport events for tracks muted in the project", async () => {
    const { createWasmRenderer } = await import("../synth-worklet-wasm-renderer.js");

    const project = createProject({
      track: createTrack({
        id: "track_1",
        mute: true
      })
    });
    project.tracks.push(createTrack({ id: "track_2", name: "Track 2" }));
    const renderer = createWasmRenderer({
      processorOptions: {
        sampleRate: 48000,
        blockSize,
        renderProject: { project },
        wasmBytes: new Uint8Array([0, 97, 115, 109]).buffer
      }
    });

    const stream = renderer.startStream({
      renderProject: { project },
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

    const mutableStream = stream as typeof stream & { mutedTrackIds: Set<string> };
    expect(mutableStream!.eventQueue.map((event) => event.id)).toEqual(["track_2_on"]);
    expect([...mutableStream!.mutedTrackIds]).toEqual(["track_1"]);
  });

  it("emits preview probe captures from backend-owned capture state", async () => {
    const { createWasmRenderer } = await import("../synth-worklet-wasm-renderer.js");

    const project = createProject();
    const renderer = createWasmRenderer({
      processorOptions: {
        sampleRate: 48000,
        blockSize,
        renderProject: { project },
        wasmBytes: new Uint8Array([0, 97, 115, 109]).buffer
      }
    });
    const postMessage = vi.fn();
    renderer.port.postMessage = postMessage;

    const stream = renderer.startStream({
      renderProject: { project },
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
          kind: "spectrum",
          spectrumWindowSize: 1024,
          target: { kind: "port", nodeId: "osc", portId: "out", portKind: "out" }
        }
      ],
      randomSeed: 123
    });

    expect(stream).not.toBeNull();
    stream!.processBlock([new Float32Array(blockSize), new Float32Array(blockSize)]);
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
            samples: [],
            spectrumFrames: expect.objectContaining({
              columns: [[0.25, 0.5]],
              sampleRate: 48000
            })
          })
        ]
      })
    );
  });

  it("drops pooled preview engines when renderer engine configuration changes", async () => {
    const { createWasmRenderer } = await import("../synth-worklet-wasm-renderer.js");

    const project = createProject();
    const renderer = createWasmRenderer({
      processorOptions: {
        sampleRate: 48000,
        blockSize,
        renderProject: { project },
        wasmBytes: new Uint8Array([0, 97, 115, 109]).buffer
      }
    });

    const stream = renderer.startStream({
      renderProject: { project },
      songStartSample: 0,
      mode: "preview",
      durationSamples: blockSize,
      trackId: "track_1",
      previewId: "preview_pool",
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
      ]
    });

    expect(stream).not.toBeNull();
    stream!.stop();
    expectStreamEngineDetached(stream);
    expect(renderer.previewEnginePool).toHaveLength(1);
    expect(engineFree).not.toHaveBeenCalled();

    renderer.configure({ sampleRate: 44100, blockSize });

    expect(renderer.previewEnginePool).toHaveLength(0);
    expect(engineFree).toHaveBeenCalledTimes(1);
  });

  it("writes preview probe captures into provided shared buffers", async () => {
    const { createWasmRenderer } = await import("../synth-worklet-wasm-renderer.js");

    const project = createProject();
    const renderer = createWasmRenderer({
      processorOptions: {
        sampleRate: 48000,
        blockSize,
        renderProject: { project },
        wasmBytes: new Uint8Array([0, 97, 115, 109]).buffer
      }
    });
    const postMessage = vi.fn();
    renderer.port.postMessage = postMessage;
    const sampleBuffer = new SharedArrayBuffer(blockSize * Float32Array.BYTES_PER_ELEMENT);

    const stream = renderer.startStream({
      renderProject: { project },
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

  it("copies only new WASM preview samples into shared buffers on later emits", async () => {
    const { createWasmRenderer } = await import("../synth-worklet-wasm-renderer.js");

    const project = createProject();
    const renderer = createWasmRenderer({
      processorOptions: {
        sampleRate: 48000,
        blockSize,
        renderProject: { project },
        wasmBytes: new Uint8Array([0, 97, 115, 109]).buffer
      }
    });
    const postMessage = vi.fn();
    renderer.port.postMessage = postMessage;
    hasActiveVoices = true;
    const sampleBuffer = new SharedArrayBuffer(blockSize * 128 * Float32Array.BYTES_PER_ELEMENT);
    const sharedSamples = new Float32Array(sampleBuffer);

    const stream = renderer.startStream({
      renderProject: { project },
      songStartSample: 0,
      mode: "preview",
      durationSamples: blockSize * 160,
      trackId: "track_1",
      previewId: "preview_shared_incremental",
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
      captureSharedBuffers: [{ probeId: "probe_1", sampleBuffer, capacitySamples: blockSize * 128 }],
      randomSeed: 123
    });

    expect(stream).not.toBeNull();
    for (let index = 0; index < 64; index += 1) {
      stream!.processBlock([new Float32Array(blockSize), new Float32Array(blockSize)]);
    }
    expect(sharedSamples[0]).toBe(0.5);
    captureSampleView[0] = 0.25;

    for (let index = 0; index < 64; index += 1) {
      stream!.processBlock([new Float32Array(blockSize), new Float32Array(blockSize)]);
    }

    expect(postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: "PREVIEW_CAPTURE",
        previewId: "preview_shared_incremental",
        captures: [expect.objectContaining({ sampleLength: blockSize * 128 })]
      })
    );
    expect(sharedSamples[0]).toBe(0.5);
    expect(sharedSamples[blockSize * 64]).toBe(0.5);
  });

  it("keeps JSON samples when shared buffers do not cover every sample capture", async () => {
    const { createWasmRenderer } = await import("../synth-worklet-wasm-renderer.js");

    const project = createProject();
    const renderer = createWasmRenderer({
      processorOptions: {
        sampleRate: 48000,
        blockSize,
        renderProject: { project },
        wasmBytes: new Uint8Array([0, 97, 115, 109]).buffer
      }
    });
    const postMessage = vi.fn();
    renderer.port.postMessage = postMessage;
    const unrelatedSampleBuffer = new SharedArrayBuffer(blockSize * Float32Array.BYTES_PER_ELEMENT);

    const stream = renderer.startStream({
      renderProject: { project },
      songStartSample: 0,
      mode: "preview",
      durationSamples: blockSize,
      trackId: "track_1",
      previewId: "preview_partial_shared",
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
      captureSharedBuffers: [
        {
          probeId: "unrelated_probe",
          sampleBuffer: unrelatedSampleBuffer,
          capacitySamples: blockSize
        }
      ],
      randomSeed: 123
    });

    expect(stream).not.toBeNull();
    stream!.processBlock([new Float32Array(blockSize), new Float32Array(blockSize)]);
    stream!.processBlock([new Float32Array(blockSize), new Float32Array(blockSize)]);

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "PREVIEW_CAPTURE",
        previewId: "preview_partial_shared",
        captures: [
          expect.objectContaining({
            probeId: "probe_1",
            sampleBuffer: undefined,
            samples: expect.arrayContaining([0.5])
          })
        ]
      })
    );
  });

  it("emits final spectrum grids on final preview capture", async () => {
    const { createWasmRenderer } = await import("../synth-worklet-wasm-renderer.js");

    const project = createProject();
    const renderer = createWasmRenderer({
      processorOptions: {
        sampleRate: 48000,
        blockSize,
        renderProject: { project },
        wasmBytes: new Uint8Array([0, 97, 115, 109]).buffer
      }
    });
    const postMessage = vi.fn();
    renderer.port.postMessage = postMessage;

    const stream = renderer.startStream({
      renderProject: { project },
      songStartSample: 0,
      mode: "preview",
      durationSamples: blockSize,
      trackId: "track_1",
      previewId: "preview_final_spectrum",
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
          kind: "spectrum",
          target: { kind: "port", nodeId: "osc", portId: "out", portKind: "out" }
        }
      ],
      randomSeed: 123
    });

    stream!.processBlock([new Float32Array(blockSize), new Float32Array(blockSize)]);
    stream!.processBlock([new Float32Array(blockSize), new Float32Array(blockSize)]);

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "PREVIEW_CAPTURE",
        previewId: "preview_final_spectrum",
        captures: [
          expect.objectContaining({
            captureComplete: true,
            finalSpectrum: expect.objectContaining({
              requestedTimeColumns: 512,
              requestedFrequencyBins: 1025
            }),
            finalScope: expect.objectContaining({
              peak: 0.5,
              capturedSamples: previewCaptureSampleCount
            }),
            adsrEstimate: expect.objectContaining({
              label: "A: 10ms|D:50ms|S:38%|R:24ms"
            }),
            qualityStats: expect.objectContaining({
              peak: 0.98,
              nearClipCount: 3
            })
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
        renderProject: { project },
        wasmBytes: new Uint8Array([0, 97, 115, 109]).buffer
      }
    });
    const postMessage = vi.fn();
    renderer.port.postMessage = postMessage;
    hasActiveVoices = true;

    const stream = renderer.startStream({
      renderProject: { project },
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
          kind: "spectrum",
          spectrumWindowSize: 1024,
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
        renderProject: { project },
        wasmBytes: new Uint8Array([0, 97, 115, 109]).buffer
      }
    });

    const stream = renderer.startStream({
      renderProject: { project },
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
          kind: "spectrum",
          spectrumWindowSize: 1024,
          target: { kind: "port", nodeId: "osc", portId: "out", portKind: "out" }
        }
      ],
      randomSeed: 123
    });

    expect(stream).not.toBeNull();
    expect(JSON.parse(configuredPreviewCaptureJson)).toEqual([
      expect.objectContaining({
        probeId: "probe_1",
        kind: "spectrum",
        spectrumWindowSize: 1024,
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
        renderProject: { project },
        wasmBytes: new Uint8Array([0, 97, 115, 109]).buffer
      }
    });
    const postMessage = vi.fn();
    renderer.port.postMessage = postMessage;

    const stream = renderer.startStream({
      renderProject: { project },
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
    stream!.stop();

    expectStreamEngineDetached(stream);
    expect(engineStop).toHaveBeenCalledTimes(1);
    expect(engineFree).not.toHaveBeenCalled();
    expect(postMessage).not.toHaveBeenCalled();
  });

  it("reuses one stopped preview engine and frees it when the renderer is disposed", async () => {
    const { createWasmRenderer } = await import("../synth-worklet-wasm-renderer.js");

    const project = createProject();
    const renderer = createWasmRenderer({
      processorOptions: {
        sampleRate: 48000,
        blockSize,
        renderProject: { project },
        wasmBytes: new Uint8Array([0, 97, 115, 109]).buffer
      }
    });

    for (let index = 0; index < 2; index += 1) {
      const stream = renderer.startStream({
        renderProject: { project },
        songStartSample: 0,
        mode: "preview",
        durationSamples: blockSize,
        trackId: "track_1",
        previewId: `preview_${index}`,
        events: [
          {
            id: `note_on_${index}`,
            type: "NoteOn",
            sampleTime: 0,
            source: "preview",
            trackId: "track_1",
            noteId: `note_${index}`,
            pitchVoct: 0,
            velocity: 1
          }
        ],
        randomSeed: 123
      });
      stream!.stop();
      expectStreamEngineDetached(stream);
    }

    expect(engineCreate).toHaveBeenCalledTimes(1);
    expect(engineStop).toHaveBeenCalledTimes(2);
    expect(engineFree).not.toHaveBeenCalled();

    renderer.dispose();

    expect(engineFree).toHaveBeenCalledTimes(1);
  });

  it("disposes a pooled preview engine when restarting the stream fails", async () => {
    const { createWasmRenderer } = await import("../synth-worklet-wasm-renderer.js");

    const project = createProject();
    const renderer = createWasmRenderer({
      processorOptions: {
        sampleRate: 48000,
        blockSize,
        renderProject: { project },
        wasmBytes: new Uint8Array([0, 97, 115, 109]).buffer
      }
    });

    const stream = renderer.startStream({
      renderProject: { project },
      songStartSample: 0,
      mode: "preview",
      durationSamples: blockSize,
      trackId: "track_1",
      previewId: "preview_success",
      events: [],
      randomSeed: 123
    });
    stream!.stop();

    throwOnStartStream = true;

    expect(() =>
      renderer.startStream({
        renderProject: { project },
        songStartSample: 0,
        mode: "preview",
        durationSamples: blockSize,
        trackId: "track_1",
        previewId: "preview_fail",
        events: [],
        randomSeed: 123
      })
    ).toThrow("start_stream failed");

    expect(engineCreate).toHaveBeenCalledTimes(1);
    expect(engineStop).toHaveBeenCalledTimes(2);
    expect(engineFree).toHaveBeenCalledTimes(1);
  });

  it("ignores invalid preview capture JSON without stopping audio processing", async () => {
    const { createWasmRenderer } = await import("../synth-worklet-wasm-renderer.js");

    const project = createProject();
    const renderer = createWasmRenderer({
      processorOptions: {
        sampleRate: 48000,
        blockSize,
        renderProject: { project },
        wasmBytes: new Uint8Array([0, 97, 115, 109]).buffer
      }
    });
    const postMessage = vi.fn();
    renderer.port.postMessage = postMessage;
    writeInvalidPreviewCaptureJson = true;
    hasActiveVoices = true;

    const stream = renderer.startStream({
      renderProject: { project },
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

  it("stops final preview capture after invalid final capture JSON retries", async () => {
    const { createWasmRenderer } = await import("../synth-worklet-wasm-renderer.js");

    const project = createProject();
    const renderer = createWasmRenderer({
      processorOptions: {
        sampleRate: 48000,
        blockSize,
        renderProject: { project },
        wasmBytes: new Uint8Array([0, 97, 115, 109]).buffer
      }
    });
    const postMessage = vi.fn();
    renderer.port.postMessage = postMessage;
    writeInvalidPreviewCaptureJson = true;

    const stream = renderer.startStream({
      renderProject: { project },
      songStartSample: 0,
      mode: "preview",
      durationSamples: blockSize,
      trackId: "track_1",
      previewId: "preview_bad_final_capture",
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
    expect(stream!.stopped).toBe(false);

    for (let index = 0; index < 3; index += 1) {
      stream!.processBlock([new Float32Array(blockSize), new Float32Array(blockSize)]);
    }

    expect(stream!.stopped).toBe(true);
    expect(engineStop).toHaveBeenCalledTimes(1);
    expect(postMessage).not.toHaveBeenCalled();
  });

  it("stops a long-lived preview once the released note has no active voices left", async () => {
    const { createWasmRenderer } = await import("../synth-worklet-wasm-renderer.js");

    const project = createProject();
    const renderer = createWasmRenderer({
      processorOptions: {
        sampleRate: 48000,
        blockSize,
        renderProject: { project },
        wasmBytes: new Uint8Array([0, 97, 115, 109]).buffer
      }
    });

    const stream = renderer.startStream({
      renderProject: { project },
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

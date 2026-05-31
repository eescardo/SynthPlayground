import { beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH_OUTPUT_PORT_ID } from "@/lib/patch/ports";
import {
  createWasmRendererTestPatch,
  createWasmRendererTestProject
} from "@/audio/worklets/tests/wasmRendererTestFixtures";

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
const engineLifecycleCalls: string[] = [];
vi.mock("../synth-worklet-dsp-bindgen.js", () => {
  class MockWasmSubsetEngine {
    constructor() {
      leftView.fill(0.25);
      rightView.fill(0.25);
    }

    start_stream() {
      engineLifecycleCalls.push("start_stream");
    }
    enqueue_events() {}
    stage_sample_asset(trackIndex: number, nodeId: string, sampleRate: number, samples: Float32Array) {
      engineLifecycleCalls.push("stage_sample_asset");
      installedSampleAssets.push({ trackIndex, nodeId, sampleRate, samples });
    }
    set_sample_asset() {}
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

beforeEach(() => {
  vi.resetModules();
  leftView.fill(0);
  rightView.fill(0);
  installedSampleAssets.length = 0;
  engineLifecycleCalls.length = 0;
});

describe("WASM worklet renderer sample assets", () => {
  it("installs SamplePlayer PCM assets through the binary WASM handoff", async () => {
    const { createWasmRenderer } = await import("../synth-worklet-wasm-renderer.js");
    const patch = createWasmRendererTestPatch({
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
      ...createWasmRendererTestProject({ patch }),
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
    expect(engineLifecycleCalls).toEqual(["stage_sample_asset", "start_stream"]);
    const projectSpecJson = (
      renderer as unknown as { getProjectPlan: (value: typeof project) => { projectSpecJson: string } }
    ).getProjectPlan(project).projectSpecJson;
    expect(projectSpecJson).not.toContain("legacy.wav");
    expect(projectSpecJson).not.toContain("asset_1");
  });
});

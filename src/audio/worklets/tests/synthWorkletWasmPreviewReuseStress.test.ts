import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { createWasmRenderer } from "@/audio/worklets/synth-worklet-wasm-renderer.js";
import { PATCH_OUTPUT_PORT_ID } from "@/lib/patch/ports";
import { getBundledPresetPatch } from "@/lib/patch/source";
import type { AudioProject, SchedulerEvent } from "@/types/audio";
import type { PreviewProbeCapture } from "@/types/probes";

const blockSize = 128;
const durationSamples = 48_000;
const randomSeed = 0x5eed_1234;
const wasmPath = path.join(process.cwd(), "public", "wasm", "pkg", "dsp_core_bg.wasm");

const readWasmBytes = () => {
  if (!fs.existsSync(wasmPath)) {
    throw new Error("Expected WASM DSP artifact to exist. Run `pnpm run build:wasm` before this test.");
  }
  return fs.readFileSync(wasmPath);
};

const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const createBassDrumProject = (): AudioProject => {
  const patch = getBundledPresetPatch("preset_bass_drum");
  if (!patch) {
    throw new Error("Expected Bass Drum preset to be available");
  }
  return {
    global: { sampleRate: 48000, tempo: 120, meter: "4/4", gridBeats: 0.25, loop: [] },
    tracks: [
      {
        id: "track_bass_drum",
        name: "Bass Drum",
        instrumentPatchId: patch.id,
        notes: [],
        macroValues: {},
        macroAutomations: {},
        macroPanelExpanded: true,
        volume: 1,
        pan: 0.5,
        mute: false,
        solo: false,
        fx: {
          delayEnabled: false,
          reverbEnabled: false,
          saturationEnabled: false,
          compressorEnabled: false,
          delayMix: 0,
          reverbMix: 0,
          drive: 0,
          compression: 0
        }
      }
    ],
    patches: [cloneJson(patch)],
    masterFx: { compressorEnabled: false, limiterEnabled: false, makeupGain: 0 }
  };
};

const createPreviewEvents = (iteration: number): SchedulerEvent[] => [
  {
    id: `note_on_${iteration}`,
    type: "NoteOn",
    sampleTime: 0,
    source: "preview",
    trackId: "track_bass_drum",
    noteId: `note_${iteration}`,
    pitchVoct: 0,
    velocity: 0.9
  },
  {
    id: `note_off_${iteration}`,
    type: "NoteOff",
    sampleTime: Math.floor(durationSamples * 0.5),
    source: "preview",
    trackId: "track_bass_drum",
    noteId: `note_${iteration}`
  }
];

const renderPreview = (
  renderer: ReturnType<typeof createWasmRenderer>,
  project: AudioProject,
  iteration: number
): { left: Float32Array; capture: PreviewProbeCapture | null } => {
  let finalCapture: PreviewProbeCapture | null = null;
  renderer.port.postMessage = (message: unknown) => {
    const packet = message as { type?: string; captures?: PreviewProbeCapture[] };
    if (packet?.type === "PREVIEW_CAPTURE") {
      finalCapture = packet.captures?.find((capture) => capture.probeId === "health_output") ?? finalCapture;
    }
  };

  const stream = renderer.startStream({
    renderProject: { project },
    songStartSample: 0,
    mode: "preview",
    durationSamples,
    captureDurationSamples: durationSamples,
    trackId: "track_bass_drum",
    previewId: `preview_${iteration}`,
    events: createPreviewEvents(iteration),
    captureProbes: [
      {
        probeId: "health_output",
        kind: "signal_health",
        target: { kind: "port", nodeId: PATCH_OUTPUT_PORT_ID, portId: "out", portKind: "out" }
      }
    ],
    randomSeed
  });

  if (!stream) {
    throw new Error("Expected preview stream to start");
  }

  const left = new Float32Array(durationSamples);
  const blocks = Math.ceil(durationSamples / blockSize);
  for (let blockIndex = 0; blockIndex < blocks; blockIndex += 1) {
    const blockLeft = new Float32Array(blockSize);
    const blockRight = new Float32Array(blockSize);
    stream.processBlock([blockLeft, blockRight]);
    left.set(
      blockLeft.subarray(0, Math.min(blockSize, durationSamples - blockIndex * blockSize)),
      blockIndex * blockSize
    );
  }
  stream.stop({ emitPreviewCapture: true });
  return { left, capture: finalCapture };
};

describe("WASM preview engine reuse", () => {
  it("reuses one preview engine without changing repeated Bass Drum output or health capture", () => {
    const wasmBytes = readWasmBytes();
    const project = createBassDrumProject();
    const renderer = createWasmRenderer({
      processorOptions: {
        sampleRate: 48000,
        blockSize,
        renderProject: { project },
        wasmBytes: wasmBytes.buffer.slice(wasmBytes.byteOffset, wasmBytes.byteOffset + wasmBytes.byteLength)
      }
    });

    for (let iteration = 0; iteration < 5; iteration += 1) {
      renderPreview(renderer, project, iteration);
    }

    const baseline = renderPreview(renderer, project, 5);
    const baselineStats = baseline.capture?.qualityStats;
    const warmedMemoryBytes = renderer.memory?.buffer.byteLength ?? 0;

    expect(baselineStats?.capturedSamples).toBeGreaterThan(blockSize);

    for (let iteration = 6; iteration <= 30; iteration += 1) {
      const next = renderPreview(renderer, project, iteration);
      expect(Array.from(next.left)).toEqual(Array.from(baseline.left));
      expect(next.capture?.qualityStats).toEqual(baselineStats);
      expect(renderer.memory?.buffer.byteLength ?? 0).toBeLessThanOrEqual(warmedMemoryBytes + 1024 * 1024);
      expect(renderer.previewEnginePool).toHaveLength(1);
    }

    renderer.dispose();
    expect(renderer.previewEnginePool).toHaveLength(0);
  });
});

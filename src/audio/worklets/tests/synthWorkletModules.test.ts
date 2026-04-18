import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Track } from "@/types/music";
import type { ParamValue, Patch } from "@/types/patch";

type RuntimeModule = typeof import("../synth-worklet-runtime.js");
type WorkletGlobal = typeof globalThis & {
  AudioWorkletProcessor?: new () => { port: { onmessage: ((event: unknown) => void) | null; postMessage: (...args: unknown[]) => void } };
  registerProcessor?: (name: string, processorCtor: unknown) => void;
};

const SAMPLE_RATE = 48_000;
const BLOCK_SIZE = 128;

type InternalRuntimeNode = {
  id: string;
  typeId: string;
  outIndex: number;
  inputs: Record<string, number>;
};

type InternalVoice = {
  active: boolean;
  signalBuffers: Float32Array[];
  host: {
    pitchVoct: number;
    gate: number;
    velocity: number;
    modWheel: number;
  };
};

type InternalTrackRuntime = InstanceType<RuntimeModule["TrackRuntime"]> & {
  compiled: {
    hostSignalIndices: {
      pitch: number;
      gate: number;
      velocity: number;
      modWheel: number;
    };
    nodeRuntimes: InternalRuntimeNode[];
  };
  voices: InternalVoice[];
};

function createSerializedSampleData() {
  const samples = Array.from({ length: 64 }, (_, index) => Math.sin((2 * Math.PI * index) / 16) * 0.75);
  return JSON.stringify({
    version: 1,
    name: "sample.wav",
    sampleRate: SAMPLE_RATE,
    samples
  });
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

function createPatch(node: { id: string; typeId: string; params: Record<string, ParamValue> }, outputPortId = "out"): Patch {
  return {
    schemaVersion: 1,
    id: "patch_1",
    name: "Module Test Patch",
    meta: { source: "custom" },
    nodes: [
      node,
      { id: "out", typeId: "Output", params: { gainDb: 0, limiter: false } }
    ],
    connections: [
      {
        id: "to_out",
        from: { nodeId: node.id, portId: outputPortId },
        to: { nodeId: "out", portId: "in" }
      }
    ],
    ui: { macros: [] },
    layout: { nodes: [] },
    io: { audioOutNodeId: "out", audioOutPortId: "out" }
  } satisfies Patch;
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

function sumAbs(buffer: Float32Array) {
  return buffer.reduce((sum, sample) => sum + Math.abs(sample), 0);
}

function maxAbs(buffer: Float32Array) {
  return buffer.reduce((max, sample) => Math.max(max, Math.abs(sample)), 0);
}

function mean(buffer: Float32Array) {
  return buffer.reduce((sum, sample) => sum + sample, 0) / buffer.length;
}

function meanAbs(buffer: Float32Array) {
  return sumAbs(buffer) / buffer.length;
}

function zeroCrossings(buffer: Float32Array) {
  let count = 0;
  for (let i = 1; i < buffer.length; i += 1) {
    if ((buffer[i - 1] <= 0 && buffer[i] > 0) || (buffer[i - 1] >= 0 && buffer[i] < 0)) {
      count += 1;
    }
  }
  return count;
}

function createModuleHarness(
  runtimeModule: RuntimeModule,
  typeId: string,
  params: Record<string, ParamValue> = {},
  options: { randomSeed?: number } = {}
) {
  const nodeId = "node";
  const patch = createPatch({ id: nodeId, typeId, params });
  const runtime = new runtimeModule.TrackRuntime(createTrack(), patch, SAMPLE_RATE, BLOCK_SIZE, options.randomSeed) as InternalTrackRuntime;
  const runtimeNode = runtime.compiled.nodeRuntimes.find((entry) => entry.id === nodeId) as InternalRuntimeNode | undefined;
  if (!runtimeNode) {
    throw new Error(`Unable to find runtime node for ${typeId}`);
  }
  const voice = runtime.voices[0] as InternalVoice;
  voice.active = true;
  const hostSignals = runtime.compiled.hostSignalIndices;
  const assignedHostKeys = new Set<keyof typeof hostSignals>();

  const fillBuffer = (index: number, source: number | number[] | Float32Array) => {
    const buffer = voice.signalBuffers[index];
    buffer.fill(0);
    if (typeof source === "number") {
      buffer.fill(source);
      return buffer;
    }
    const values = source instanceof Float32Array ? source : Float32Array.from(source);
    buffer.set(values.subarray(0, buffer.length));
    return buffer;
  };

  const assignInput = (portId: string, hostKey: keyof typeof hostSignals, source: number | number[] | Float32Array) => {
    assignedHostKeys.add(hostKey);
    runtimeNode.inputs[portId] = hostSignals[hostKey];
    return fillBuffer(hostSignals[hostKey], source);
  };

  const syncHostBuffers = () => {
    if (!assignedHostKeys.has("pitch")) fillBuffer(hostSignals.pitch, voice.host.pitchVoct);
    if (!assignedHostKeys.has("gate")) fillBuffer(hostSignals.gate, voice.host.gate);
    if (!assignedHostKeys.has("velocity")) fillBuffer(hostSignals.velocity, voice.host.velocity);
    if (!assignedHostKeys.has("modWheel")) fillBuffer(hostSignals.modWheel, voice.host.modWheel);
  };

  const process = (frames = BLOCK_SIZE) => {
    syncHostBuffers();
    const output = voice.signalBuffers[runtimeNode.outIndex];
    output.fill(0);
    runtime.processNodeFrames(voice, runtimeNode, voice.signalBuffers, 0, frames);
    return output.slice(0, frames);
  };

  return { runtime, runtimeNode, voice, hostSignals, fillBuffer, assignInput, process };
}

beforeEach(() => {
  const workletGlobal = globalThis as WorkletGlobal;
  delete workletGlobal.AudioWorkletProcessor;
  delete workletGlobal.registerProcessor;
});

describe("synth worklet module behavior", () => {
  it("emits host values from NotePitch, NoteGate, NoteVelocity, and ModWheel", async () => {
    const { TrackRuntime } = await loadRuntimeModule();
    const patch = createPatch({ id: "osc", typeId: "VCO", params: { wave: "sine" } });
    const runtime = new TrackRuntime(createTrack(), patch, SAMPLE_RATE, BLOCK_SIZE) as InternalTrackRuntime;
    const voice = runtime.voices[0] as InternalVoice;
    voice.host.pitchVoct = 0.25;
    voice.host.gate = 1;
    voice.host.velocity = 0.75;
    voice.host.modWheel = 0.5;

    const hostIds = ["$host.pitch", "$host.gate", "$host.velocity", "$host.modwheel"] as const;
    const expected = [0.25, 1, 0.75, 0.5];

    hostIds.forEach((id, index) => {
      const runtimeNode = runtime.compiled.nodeRuntimes.find((entry) => entry.id === id) as InternalRuntimeNode | undefined;
      expect(runtimeNode).toBeTruthy();
      runtime.processNodeFrames(voice, runtimeNode!, voice.signalBuffers, 0, 16);
      const out = voice.signalBuffers[runtimeNode!.outIndex];
      expect(Array.from(out.slice(0, 16))).toEqual(new Array(16).fill(expected[index]));
    });
  });

  it("applies CVTranspose offsets to the input signal", async () => {
    const runtimeModule = await loadRuntimeModule();
    const harness = createModuleHarness(runtimeModule, "CVTranspose", { octaves: 1, semitones: 12, cents: 1200 });
    harness.assignInput("in", "pitch", 0.25);

    const output = harness.process(8);
    output.forEach((sample) => expect(sample).toBeCloseTo(3.25, 5));
  });

  it("scales CV input by the configured multiplier", async () => {
    const runtimeModule = await loadRuntimeModule();
    const harness = createModuleHarness(runtimeModule, "CVScaler", { scale: 2.5 });
    harness.assignInput("in", "pitch", Float32Array.from([0.1, -0.2, 0.3, -0.4]));

    const output = harness.process(4);
    expect(Array.from(output)).toEqual(
      expect.arrayContaining([0.25, -0.5, 0.75, -1])
    );
  });

  it("mixes two CV inputs with independent gains", async () => {
    const runtimeModule = await loadRuntimeModule();
    const harness = createModuleHarness(runtimeModule, "CVMixer2", { gain1: 0.5, gain2: 2 });
    harness.assignInput("in1", "pitch", 0.25);
    harness.assignInput("in2", "velocity", 0.1);

    const output = harness.process(8);
    output.forEach((sample) => expect(sample).toBeCloseTo(0.325, 5));
  });

  it("renders a bounded oscillating VCO waveform", async () => {
    const runtimeModule = await loadRuntimeModule();
    const harness = createModuleHarness(runtimeModule, "VCO", { wave: "sine", pulseWidth: 0.5 });
    harness.voice.host.pitchVoct = 0;

    const output = harness.process(BLOCK_SIZE);
    expect(maxAbs(output)).toBeLessThanOrEqual(1.01);
    expect(sumAbs(output)).toBeGreaterThan(1);
    expect(zeroCrossings(output)).toBeGreaterThan(0);
  });

  it("renders a decaying KarplusStrong pluck", async () => {
    const runtimeModule = await loadRuntimeModule();
    const harness = createModuleHarness(
      runtimeModule,
      "KarplusStrong",
      { decay: 0.96, damping: 0.25, brightness: 0.7, excitation: "noise" },
      { randomSeed: 4242 }
    );
    harness.voice.host.pitchVoct = 0;
    harness.voice.host.gate = 1;
    const attack = harness.process(BLOCK_SIZE);
    harness.voice.host.gate = 0;
    const releaseBlocks = Array.from({ length: 4 }, () => harness.process(BLOCK_SIZE));
    const firstRelease = releaseBlocks[0];
    const lastRelease = releaseBlocks[releaseBlocks.length - 1];

    expect(sumAbs(attack)).toBeGreaterThan(0.1);
    expect(sumAbs(lastRelease)).toBeLessThan(sumAbs(firstRelease));
  });

  it("supports bipolar and unipolar LFO modes", async () => {
    const runtimeModule = await loadRuntimeModule();
    const bipolarHarness = createModuleHarness(runtimeModule, "LFO", { wave: "sine", freqHz: 40, bipolar: true });
    const unipolarHarness = createModuleHarness(runtimeModule, "LFO", { wave: "sine", freqHz: 5, bipolar: false });

    const bipolar = Float32Array.from(
      Array.from({ length: 6 }, () => Array.from(bipolarHarness.process(BLOCK_SIZE))).flat()
    );
    const unipolar = unipolarHarness.process(BLOCK_SIZE);

    expect(Math.min(...bipolar)).toBeLessThan(0);
    expect(Math.max(...bipolar)).toBeGreaterThan(0);
    expect(Math.min(...unipolar)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...unipolar)).toBeLessThanOrEqual(1);
  });

  it("follows ADSR attack and release stages", async () => {
    const runtimeModule = await loadRuntimeModule();
    const harness = createModuleHarness(runtimeModule, "ADSR", { attack: 0.001, decay: 0.01, sustain: 0.4, release: 0.02 });
    harness.voice.host.gate = 1;
    const attack = harness.process(BLOCK_SIZE);
    harness.voice.host.gate = 0;
    const release = harness.process(BLOCK_SIZE);

    expect(Math.max(...attack)).toBeGreaterThan(0.5);
    expect(release[release.length - 1]).toBeLessThan(release[0]);
  });

  it("uses VCA gain CV to scale an input signal", async () => {
    const runtimeModule = await loadRuntimeModule();
    const harness = createModuleHarness(runtimeModule, "VCA", { bias: 0, gain: 1 });
    harness.assignInput("in", "pitch", 0.5);
    harness.assignInput("gainCV", "gate", 1);

    const output = harness.process(16);
    output.forEach((sample) => expect(sample).toBeCloseTo(0.5, 5));
  });

  it("lets VCF highpass reject DC and lowpass smooth rapid alternation", async () => {
    const runtimeModule = await loadRuntimeModule();
    const highpass = createModuleHarness(runtimeModule, "VCF", { type: "highpass", cutoffHz: 800, resonance: 0.1, cutoffModAmountOct: 0 });
    highpass.assignInput("in", "pitch", 0.75);
    highpass.process(BLOCK_SIZE);
    const hpOutput = highpass.process(BLOCK_SIZE);

    const lowpass = createModuleHarness(runtimeModule, "VCF", { type: "lowpass", cutoffHz: 200, resonance: 0.05, cutoffModAmountOct: 0 });
    const alternating = Float32Array.from({ length: BLOCK_SIZE }, (_, index) => (index % 2 === 0 ? 1 : -1));
    lowpass.assignInput("in", "pitch", alternating);
    const lpOutput = lowpass.process(BLOCK_SIZE);

    expect(meanAbs(hpOutput)).toBeLessThan(0.2);
    expect(meanAbs(lpOutput)).toBeLessThan(meanAbs(alternating));
  });

  it("sums up to four Mixer4 inputs with channel gains", async () => {
    const runtimeModule = await loadRuntimeModule();
    const harness = createModuleHarness(runtimeModule, "Mixer4", { gain1: 1, gain2: 0.5, gain3: 0.25, gain4: 0 });
    harness.assignInput("in1", "pitch", 1);
    harness.assignInput("in2", "gate", 1);
    harness.assignInput("in3", "velocity", 1);
    harness.assignInput("in4", "modWheel", 1);

    const output = harness.process(8);
    output.forEach((sample) => expect(sample).toBeCloseTo(1.75, 5));
  });

  it("renders seeded Noise output within the expected range", async () => {
    const runtimeModule = await loadRuntimeModule();
    const first = createModuleHarness(runtimeModule, "Noise", { color: "white", gain: 1 }, { randomSeed: 999 });
    const second = createModuleHarness(runtimeModule, "Noise", { color: "white", gain: 1 }, { randomSeed: 999 });

    const firstOutput = first.process(BLOCK_SIZE);
    const secondOutput = second.process(BLOCK_SIZE);

    expect(Array.from(firstOutput)).toEqual(Array.from(secondOutput));
    expect(maxAbs(firstOutput)).toBeLessThanOrEqual(1.01);
    expect(sumAbs(firstOutput)).toBeGreaterThan(1);
  });

  it("plays and then stops a one-shot SamplePlayer asset", async () => {
    const runtimeModule = await loadRuntimeModule();
    const harness = createModuleHarness(runtimeModule, "SamplePlayer", {
      mode: "oneshot",
      start: 0,
      end: 1,
      gain: 1,
      pitchSemis: 0,
      sampleData: createSerializedSampleData()
    });
    harness.voice.host.gate = 1;
    const first = harness.process(BLOCK_SIZE);
    const second = harness.process(BLOCK_SIZE);
    const third = harness.process(BLOCK_SIZE);

    expect(sumAbs(first)).toBeGreaterThan(0.1);
    expect(sumAbs(third)).toBeLessThanOrEqual(sumAbs(second));
  });

  it("emits a delayed copy of an impulse", async () => {
    const runtimeModule = await loadRuntimeModule();
    const harness = createModuleHarness(runtimeModule, "Delay", { timeMs: 1, feedback: 0, mix: 1 });
    const impulse = new Float32Array(BLOCK_SIZE);
    impulse[0] = 1;
    harness.assignInput("in", "pitch", impulse);

    const output = harness.process(BLOCK_SIZE);
    expect(sumAbs(output.slice(0, 16))).toBe(0);
    expect(sumAbs(output.slice(32, 80))).toBeGreaterThan(0.1);
  });

  it("adds a reverberant tail to an impulse", async () => {
    const runtimeModule = await loadRuntimeModule();
    const harness = createModuleHarness(runtimeModule, "Reverb", { size: 0.8, decay: 2, damping: 0.2, mix: 1 });
    const impulse = new Float32Array(BLOCK_SIZE);
    impulse[0] = 1;
    harness.assignInput("in", "pitch", impulse);

    const first = harness.process(BLOCK_SIZE);
    const later = Array.from({ length: 20 }, () => harness.process(BLOCK_SIZE));
    const tailEnergy = later.reduce((sum, block) => sum + sumAbs(block), 0);

    expect(sumAbs(first)).toBeGreaterThanOrEqual(0);
    expect(tailEnergy).toBeGreaterThan(0);
  });

  it("soft-clips Saturation output under heavy drive", async () => {
    const runtimeModule = await loadRuntimeModule();
    const harness = createModuleHarness(runtimeModule, "Saturation", { driveDb: 24, mix: 1, type: "tanh" });
    harness.assignInput("in", "pitch", 1.5);

    const output = harness.process(32);
    expect(maxAbs(output)).toBeLessThan(1.1);
    expect(meanAbs(output)).toBeLessThan(1.5);
  });

  it("changes the waveform through Overdrive processing", async () => {
    const runtimeModule = await loadRuntimeModule();
    const harness = createModuleHarness(runtimeModule, "Overdrive", { gainDb: 24, tone: 0.4, mix: 1, mode: "overdrive" });
    const source = Float32Array.from({ length: BLOCK_SIZE }, (_, index) => Math.sin((2 * Math.PI * index) / 16) * 0.8);
    harness.assignInput("in", "pitch", source);

    const output = harness.process(BLOCK_SIZE);
    expect(maxAbs(output)).toBeLessThan(1.1);
    expect(Array.from(output)).not.toEqual(Array.from(source));
  });

  it("reduces loud signals more than quiet ones in Compressor", async () => {
    const runtimeModule = await loadRuntimeModule();
    const quiet = createModuleHarness(runtimeModule, "Compressor", {
      thresholdDb: -24,
      ratio: 8,
      attackMs: 0.1,
      releaseMs: 20,
      makeupDb: 0,
      mix: 1
    });
    quiet.assignInput("in", "pitch", 0.1);
    const quietOut = quiet.process(BLOCK_SIZE);

    const loud = createModuleHarness(runtimeModule, "Compressor", {
      thresholdDb: -24,
      ratio: 8,
      attackMs: 0.1,
      releaseMs: 20,
      makeupDb: 0,
      mix: 1
    });
    loud.assignInput("in", "pitch", 1);
    const loudOut = loud.process(BLOCK_SIZE);

    expect(meanAbs(loudOut)).toBeLessThan(meanAbs(Float32Array.from({ length: BLOCK_SIZE }, () => 1)));
    expect(meanAbs(loudOut)).toBeLessThan(meanAbs(quietOut) * 9);
  });

  it("applies Output gain and limiter", async () => {
    const runtimeModule = await loadRuntimeModule();
    const harness = createModuleHarness(runtimeModule, "Output", { gainDb: 6, limiter: true }, { randomSeed: 1 });
    harness.assignInput("in", "pitch", 2);

    const output = harness.process(32);
    expect(maxAbs(output)).toBeLessThanOrEqual(1.01);
    expect(mean(output)).toBeGreaterThan(0.5);
  });
});

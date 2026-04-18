import { JsSynthRenderBackend, SynthRenderBackend, SynthWorkletProcessor } from "@/audio/worklets/synth-worklet-runtime.js";
import { AudioProject, SchedulerEvent } from "@/types/audio";

export interface OfflineRenderOptions {
  sampleRate: number;
  blockSize: number;
  durationSamples: number;
  events?: SchedulerEvent[];
  sessionId?: number;
}

export interface OfflineRenderResult {
  left: Float32Array;
  right: Float32Array;
  renderedBlocks: number;
  renderedSamples: number;
  outputAbsSum: number;
  peakHeapMb: number;
}

const BYTES_PER_MB = 1024 * 1024;
const getHeapUsedMb = () => {
  const proc = globalThis.process;
  if (!proc?.memoryUsage) {
    return 0;
  }
  return proc.memoryUsage().heapUsed / BYTES_PER_MB;
};

export const createOfflineRenderProcessor = (
  project: AudioProject,
  options: Pick<OfflineRenderOptions, "sampleRate" | "blockSize">
): SynthWorkletProcessor =>
  new SynthWorkletProcessor({
    processorOptions: {
      sampleRate: options.sampleRate,
      blockSize: options.blockSize,
      project
    }
  });

export const createOfflineRenderBackend = (
  project: AudioProject,
  options: Pick<OfflineRenderOptions, "sampleRate" | "blockSize">
): SynthRenderBackend =>
  new JsSynthRenderBackend({
    processorOptions: {
      sampleRate: options.sampleRate,
      blockSize: options.blockSize,
      project
    }
  });

export const renderProjectOffline = (
  project: AudioProject,
  options: OfflineRenderOptions
): OfflineRenderResult => {
  const { sampleRate, blockSize, durationSamples } = options;
  const backend = createOfflineRenderBackend(project, { sampleRate, blockSize });
  backend.onMessage({
    type: "TRANSPORT",
    isPlaying: true,
    songStartSample: 0,
    events: options.events ?? [],
    sessionId: options.sessionId ?? 1
  });

  const left = new Float32Array(durationSamples);
  const right = new Float32Array(durationSamples);
  const renderedBlocks = Math.ceil(durationSamples / blockSize);
  let outputAbsSum = 0;
  let peakHeapMb = getHeapUsedMb();

  for (let blockIndex = 0; blockIndex < renderedBlocks; blockIndex += 1) {
    const blockLeft = new Float32Array(blockSize);
    const blockRight = new Float32Array(blockSize);
    backend.processBlock([blockLeft, blockRight]);

    const blockOffset = blockIndex * blockSize;
    const validFrames = Math.min(blockSize, durationSamples - blockOffset);
    left.set(blockLeft.subarray(0, validFrames), blockOffset);
    right.set(blockRight.subarray(0, validFrames), blockOffset);

    for (let sampleIndex = 0; sampleIndex < validFrames; sampleIndex += 1) {
      outputAbsSum += Math.abs(blockLeft[sampleIndex]);
    }

    if ((blockIndex & 255) === 0) {
      peakHeapMb = Math.max(peakHeapMb, getHeapUsedMb());
    }
  }

  peakHeapMb = Math.max(peakHeapMb, getHeapUsedMb());

  return {
    left,
    right,
    renderedBlocks,
    renderedSamples: durationSamples,
    outputAbsSum,
    peakHeapMb
  };
};

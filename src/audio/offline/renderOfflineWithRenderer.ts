import type { SynthRenderer, SynthRenderStream } from "@/audio/renderers/shared/synth-renderer";
import { AudioProject, SchedulerEvent } from "@/types/audio";

export interface BaseOfflineRenderOptions {
  sampleRate: number;
  blockSize: number;
  durationSamples: number;
  events?: SchedulerEvent[];
  sessionId?: number;
  randomSeed?: number;
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

export const renderOfflineWithRenderer = <
  TStream extends SynthRenderStream = SynthRenderStream,
  TExtra extends object = object
>(
  renderer: SynthRenderer,
  project: AudioProject,
  options: BaseOfflineRenderOptions,
  getExtraResult?: (stream: TStream | null) => TExtra
): OfflineRenderResult & TExtra => {
  const { blockSize, durationSamples } = options;
  const stream = renderer.startStream({
    project,
    songStartSample: 0,
    events: options.events ?? [],
    sessionId: options.sessionId ?? 1,
    randomSeed: options.randomSeed,
    mode: "transport"
  }) as TStream | null;

  const left = new Float32Array(durationSamples);
  const right = new Float32Array(durationSamples);
  const renderedBlocks = Math.ceil(durationSamples / blockSize);
  let outputAbsSum = 0;
  let peakHeapMb = getHeapUsedMb();

  for (let blockIndex = 0; blockIndex < renderedBlocks; blockIndex += 1) {
    const blockLeft = new Float32Array(blockSize);
    const blockRight = new Float32Array(blockSize);
    stream?.processBlock([blockLeft, blockRight]);

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

  stream?.stop();
  peakHeapMb = Math.max(peakHeapMb, getHeapUsedMb());

  const baseResult: OfflineRenderResult = {
    left,
    right,
    renderedBlocks,
    renderedSamples: durationSamples,
    outputAbsSum,
    peakHeapMb
  };

  return {
    ...baseResult,
    ...(getExtraResult ? getExtraResult(stream) : ({} as TExtra))
  };
};

import { createWasmRenderer } from "@/audio/wasm/wasmSynthRenderer";
import { AudioProject, SchedulerEvent } from "@/types/audio";

export interface OfflineWasmRenderOptions {
  sampleRate: number;
  blockSize: number;
  durationSamples: number;
  events?: SchedulerEvent[];
  sessionId?: number;
  randomSeed?: number;
}

export interface OfflineWasmRenderResult {
  left: Float32Array;
  right: Float32Array;
  renderedBlocks: number;
  renderedSamples: number;
  outputAbsSum: number;
}

export const renderProjectOfflineWasm = async (
  project: AudioProject,
  options: OfflineWasmRenderOptions
): Promise<OfflineWasmRenderResult> => {
  const renderer = await createWasmRenderer({
    processorOptions: {
      sampleRate: options.sampleRate,
      blockSize: options.blockSize,
      project
    }
  });
  const stream = renderer.startStream({
    project,
    songStartSample: 0,
    events: options.events ?? [],
    sessionId: options.sessionId ?? 1,
    randomSeed: options.randomSeed,
    mode: "transport"
  });

  const left = new Float32Array(options.durationSamples);
  const right = new Float32Array(options.durationSamples);
  const renderedBlocks = Math.ceil(options.durationSamples / options.blockSize);
  let outputAbsSum = 0;

  for (let blockIndex = 0; blockIndex < renderedBlocks; blockIndex += 1) {
    const blockLeft = new Float32Array(options.blockSize);
    const blockRight = new Float32Array(options.blockSize);
    stream?.processBlock([blockLeft, blockRight]);
    const offset = blockIndex * options.blockSize;
    const validFrames = Math.min(options.blockSize, options.durationSamples - offset);
    left.set(blockLeft.subarray(0, validFrames), offset);
    right.set(blockRight.subarray(0, validFrames), offset);
    for (let frame = 0; frame < validFrames; frame += 1) {
      outputAbsSum += Math.abs(blockLeft[frame]);
    }
  }

  stream?.stop();

  return {
    left,
    right,
    renderedBlocks,
    renderedSamples: options.durationSamples,
    outputAbsSum
  };
};

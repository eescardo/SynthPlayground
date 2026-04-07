import type { Track } from "@/types/music";
import type { Patch } from "@/types/patch";

export interface WorkletPortLike {
  onmessage: ((event: unknown) => void) | null;
  postMessage(...args: unknown[]): void;
}

export class BaseAudioWorkletProcessor {
  port: WorkletPortLike;
}

export const compareScheduledEvents: (a: unknown, b: unknown) => number;

export class TrackRuntime {
  constructor(track: Track, patch: Patch, sampleRate: number, blockSize: number);
  compiled: {
    paramTargets: Map<string, Map<string, number>>;
    nodeRuntimes: Array<{
      typeId: string;
    }>;
  };
  voices: Array<{
    signalBuffers: Float32Array[];
  }>;
  applyMacro(macroId: string, normalized: number): void;
  processNodeFrames(
    voice: { signalBuffers: Float32Array[] },
    runtimeNode: { typeId: string },
    signalBuffers: Float32Array[],
    startFrame: number,
    endFrame: number
  ): void;
}

export class SynthWorkletProcessor extends BaseAudioWorkletProcessor {
  constructor(options?: unknown);
  eventQueue: unknown[];
  onMessage(message: unknown): void;
  process(inputs: unknown[], outputs: unknown[], parameters?: Record<string, unknown>): boolean;
}

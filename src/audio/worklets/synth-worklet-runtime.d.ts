import type { Track } from "@/types/music";
import type { Patch } from "@/types/patch";

export const compareScheduledEvents: (a: unknown, b: unknown) => number;

export class TrackRuntime {
  constructor(track: Track, patch: Patch, sampleRate: number, blockSize: number);
  compiled: {
    paramTargets: Map<string, Map<string, number>>;
  };
  applyMacro(macroId: string, normalized: number): void;
}

export class SynthWorkletProcessor {
  constructor(options?: unknown);
  eventQueue: unknown[];
  onMessage(message: unknown): void;
  process(inputs: unknown[], outputs: unknown[], parameters?: Record<string, unknown>): boolean;
}

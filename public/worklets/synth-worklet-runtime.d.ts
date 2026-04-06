import type { Track } from "@/types/music";
import type { Patch } from "@/types/patch";

export const compareScheduledEvents: (a: any, b: any) => number;

export class TrackRuntime {
  constructor(track: Track, patch: Patch, sampleRate: number, blockSize: number);
  compiled: {
    paramTargets: Map<string, Map<string, number>>;
  };
  applyMacro(macroId: string, normalized: number): void;
}

export class SynthWorkletProcessor {
  constructor(options?: any);
  eventQueue: any[];
  onMessage(message: any): void;
  process(inputs: any[], outputs: any[], parameters?: Record<string, unknown>): boolean;
}

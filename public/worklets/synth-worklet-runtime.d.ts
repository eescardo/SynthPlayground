export const compareScheduledEvents: (a: any, b: any) => number;

export class TrackRuntime {
  constructor(track: any, patch: any, sampleRate: number, blockSize: number);
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

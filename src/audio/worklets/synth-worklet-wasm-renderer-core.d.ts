export const DEFAULT_RANDOM_SEED: number;
export const MACRO_EVENT_LEAD_SAMPLES: number;
export class NullPort {
  onmessage: ((event: unknown) => void) | null;
  postMessage(...args: unknown[]): void;
}
export const resolveRandomSeed: (value: unknown) => number;
export class SharedWasmRenderStream {
  constructor(renderer: unknown, options: unknown, implementation: unknown);
  port: unknown;
  renderer: unknown;
  project: unknown;
  projectSpec: unknown;
  trackRuntimes: unknown[];
  eventQueue: unknown[];
  transportSessionId: number;
  songSampleCounter: number;
  previewing: boolean;
  previewRemainingSamples: number;
  previewId: string | undefined;
  captureProbes: unknown[];
  stopped: boolean;
  processBlock(output: Float32Array[]): boolean;
  enqueueEvents(events: unknown[]): void;
  setMacroValue(trackId: string, macroId: string, normalized: number): void;
  setRecordingTrack(trackId: string | null): void;
  stop(): void;
}
export class SharedWasmRenderer {
  constructor(options: unknown, implementation: unknown);
  port: NullPort;
  sampleRateInternal: number;
  blockSize: number;
  defaultProject: unknown;
  implementation: unknown;
  configure(config: { sampleRate?: number; blockSize?: number; project?: unknown }): void;
  setDefaultProject(project: unknown): void;
  startStream(options: unknown): unknown;
  readonly project: unknown;
}
export const defaultCompileProject: (project: unknown, options: { blockSize: number }) => unknown;
export const defaultCompileEvents: (project: unknown, projectSpec: unknown, events: unknown[]) => unknown;

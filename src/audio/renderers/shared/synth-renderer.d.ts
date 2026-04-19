import type { Track } from "@/types/music";
import type {
  AudioProject,
  SchedulerEvent,
  SynthRendererConfig,
  SynthStreamStartOptions,
  TransportSynthStreamStartOptions
} from "@/types/audio";

export interface WorkletPortLike {
  onmessage: ((event: unknown) => void) | null;
  postMessage(...args: unknown[]): void;
}

export interface SynthRenderStream {
  port: WorkletPortLike;
  project: AudioProject | null;
  trackRuntimes: Array<{ track: Track }>;
  eventQueue: SchedulerEvent[];
  processBlock(output: Float32Array[]): boolean;
  enqueueEvents(events: SchedulerEvent[]): void;
  stop(options?: { emitPreviewCapture?: boolean }): void;
  setMacroValue?(trackId: string, macroId: string, normalized: number): void;
  setRecordingTrack?(trackId: string | null): void;
  readonly stopped?: boolean;
  readonly transportSessionId?: number;
}

export interface SynthRenderer {
  port: WorkletPortLike;
  sampleRateInternal: number;
  blockSize: number;
  project: AudioProject | null;
  configure(config: Partial<SynthRendererConfig> & { wasmBytes?: ArrayBuffer }): void;
  setDefaultProject(project: AudioProject): void;
  startStream(options: SynthStreamStartOptions): SynthRenderStream | null;
}

export interface SynthRendererFactoryConfig {
  processorOptions?: Partial<SynthRendererConfig> & {
    transport?: Partial<TransportSynthStreamStartOptions>;
    wasmBytes?: ArrayBuffer;
  };
}

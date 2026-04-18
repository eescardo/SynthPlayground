import type { Track } from "@/types/music";
import type { Patch } from "@/types/patch";
import type {
  AudioProject,
  SchedulerEvent,
  SynthRendererConfig,
  SynthStreamStartOptions,
  TransportSynthStreamStartOptions,
  WorkletInboundMessage
} from "@/types/audio";

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
      id: string;
      typeId: string;
    }>;
  };
  voices: Array<{
    active: boolean;
    signalBuffers: Float32Array[];
  }>;
  applyMacro(macroId: string, normalized: number): void;
  noteOn(event: { noteId: string; pitchVoct: number; velocity: number }, sampleTime: number): void;
  noteOff(event: { noteId: string }): void;
  processNodeFrames(
    voice: { signalBuffers: Float32Array[] },
    runtimeNode: { id: string; typeId: string },
    signalBuffers: Float32Array[],
    startFrame: number,
    endFrame: number
  ): void;
  processTrackFrames(
    targetBuffer: Float32Array,
    startFrame: number,
    endFrame: number,
    options?: { ignoreMute?: boolean; ignoreVolume?: boolean }
  ): void;
}

export interface SynthRenderStream {
  port: WorkletPortLike;
  project: AudioProject | null;
  trackRuntimes: Array<{ track: Track }>;
  eventQueue: SchedulerEvent[];
  processBlock(output: Float32Array[]): boolean;
  enqueueEvents(events: SchedulerEvent[]): void;
  stop(): void;
}

export interface SynthRenderer {
  port: WorkletPortLike;
  sampleRateInternal: number;
  blockSize: number;
  project: AudioProject | null;
  configure(config: Partial<SynthRendererConfig>): void;
  setDefaultProject(project: AudioProject): void;
  startStream(options: SynthStreamStartOptions): SynthRenderStream | null;
}

export class JsSynthRenderStream implements SynthRenderStream {
  constructor(renderer: SynthRenderer, options: SynthStreamStartOptions);
  port: WorkletPortLike;
  project: AudioProject | null;
  trackRuntimes: Array<{ track: Track }>;
  eventQueue: SchedulerEvent[];
  processBlock(output: Float32Array[]): boolean;
  enqueueEvents(events: SchedulerEvent[]): void;
  stop(): void;
}

export class JsSynthRenderer implements SynthRenderer {
  constructor(options?: { processorOptions?: Partial<SynthRendererConfig> & { transport?: Partial<TransportSynthStreamStartOptions> } });
  port: WorkletPortLike;
  sampleRateInternal: number;
  blockSize: number;
  project: AudioProject | null;
  configure(config: Partial<SynthRendererConfig>): void;
  setDefaultProject(project: AudioProject): void;
  startStream(options: SynthStreamStartOptions): SynthRenderStream | null;
}

export const createRenderer: (config?: { processorOptions?: Partial<SynthRendererConfig> & { transport?: Partial<TransportSynthStreamStartOptions> } }) => JsSynthRenderer;

export class SynthWorkletProcessor extends BaseAudioWorkletProcessor {
  constructor(options?: { processorOptions?: Partial<SynthRendererConfig> & { transport?: Partial<TransportSynthStreamStartOptions> } });
  readonly renderer: SynthRenderer;
  currentStream: SynthRenderStream | null;
  readonly backend: SynthRenderStream | SynthRenderer;
  eventQueue: SchedulerEvent[];
  project: AudioProject | null;
  trackRuntimes: Array<{ track: Track }>;
  onMessage(message: WorkletInboundMessage): void;
  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters?: Record<string, unknown>): boolean;
}

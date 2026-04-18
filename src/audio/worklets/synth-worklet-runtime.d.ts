import type { Project, Track } from "@/types/music";
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

export interface SynthRenderBackend {
  port: WorkletPortLike;
  project: Project | null;
  trackRuntimes: Array<{ track: Track }>;
  eventQueue: unknown[];
  processBlock(output: Float32Array[]): boolean;
}

export interface SynthRenderStream extends SynthRenderBackend {
  enqueueEvents(events: unknown[]): void;
  stop(): void;
}

export interface SynthRenderer {
  port: WorkletPortLike;
  sampleRateInternal: number;
  blockSize: number;
  currentStream: SynthRenderStream | null;
  project: Project | null;
  trackRuntimes: Array<{ track: Track }>;
  eventQueue: unknown[];
  configure(config: unknown): void;
  setDefaultProject(project: Project): void;
  startStream(options: unknown): SynthRenderStream | null;
}

export class JsSynthRenderStream implements SynthRenderStream {
  constructor(renderer: SynthRenderer, options?: unknown);
  port: WorkletPortLike;
  project: Project | null;
  trackRuntimes: Array<{ track: Track }>;
  eventQueue: unknown[];
  processBlock(output: Float32Array[]): boolean;
  enqueueEvents(events: unknown[]): void;
  stop(): void;
}

export class JsSynthRenderer implements SynthRenderer {
  constructor(options?: unknown);
  port: WorkletPortLike;
  sampleRateInternal: number;
  blockSize: number;
  currentStream: SynthRenderStream | null;
  project: Project | null;
  trackRuntimes: Array<{ track: Track }>;
  eventQueue: unknown[];
  configure(config: unknown): void;
  setDefaultProject(project: Project): void;
  startStream(options: unknown): SynthRenderStream | null;
}

export const createRenderer: (config?: unknown) => JsSynthRenderer;

export class SynthWorkletProcessor extends BaseAudioWorkletProcessor {
  constructor(options?: unknown);
  readonly renderer: SynthRenderer;
  currentStream: SynthRenderStream | null;
  readonly backend: SynthRenderBackend | SynthRenderer;
  eventQueue: unknown[];
  project: Project | null;
  trackRuntimes: Array<{ track: Track }>;
  onMessage(message: unknown): void;
  process(inputs: unknown[], outputs: unknown[], parameters?: Record<string, unknown>): boolean;
}

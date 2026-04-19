import type { Track } from "@/types/music";
import type { Patch } from "@/types/patch";
import type {
  AudioProject,
  SynthRendererConfig,
  SynthStreamStartOptions,
  TransportSynthStreamStartOptions
} from "@/types/audio";
import type { SynthRenderer, SynthRenderStream, SynthRendererFactoryConfig } from "@/audio/renderers/shared/synth-renderer";

export const compareScheduledEvents: (a: unknown, b: unknown) => number;

export class TrackRuntime {
  constructor(track: Track, patch: Patch, sampleRate: number, blockSize: number, randomSeed?: number);
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

export class JsSynthRenderStream implements SynthRenderStream {
  readonly port: SynthRenderStream["port"];
  readonly project: AudioProject | null;
  readonly trackRuntimes: Array<{ track: Track }>;
  readonly eventQueue: SynthRenderStream["eventQueue"];
  readonly transportSessionId: number;
  readonly stopped: boolean;
  processBlock(output: Float32Array[]): boolean;
  enqueueEvents(events: SynthRenderStream["eventQueue"]): void;
  stop(options?: { emitPreviewCapture?: boolean }): void;
  setMacroValue(trackId: string, macroId: string, normalized: number): void;
  setRecordingTrack(trackId: string | null): void;
}

export class JsSynthRenderer implements SynthRenderer {
  readonly port: SynthRenderer["port"];
  sampleRateInternal: number;
  blockSize: number;
  defaultProject: AudioProject | null;
  readonly project: AudioProject | null;
  constructor(options?: SynthRendererFactoryConfig);
  configure(config: Partial<SynthRendererConfig> & { wasmBytes?: ArrayBuffer }): void;
  setDefaultProject(project: AudioProject): void;
  startStream(options: SynthStreamStartOptions): JsSynthRenderStream | null;
}

export const createJsRenderer: (config?: { processorOptions?: Partial<SynthRendererConfig> & { transport?: Partial<TransportSynthStreamStartOptions>; wasmBytes?: ArrayBuffer } }) => JsSynthRenderer;

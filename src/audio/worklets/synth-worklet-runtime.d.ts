import type { AudioProject, WorkletInboundMessage } from "@/types/audio";
import type { Track } from "@/types/music";
import type {
  SynthRenderer,
  SynthRenderStream,
  SynthRendererFactoryConfig,
  WorkletPortLike
} from "@/audio/renderers/shared/synth-renderer";

export class BaseAudioWorkletProcessor {
  port: WorkletPortLike;
}

export const setRendererFactory: (
  nextFactory: ((config?: SynthRendererFactoryConfig) => SynthRenderer) | null | undefined
) => void;
export const resetRendererFactory: () => void;
export const createRenderer: (config?: SynthRendererFactoryConfig) => SynthRenderer;

export class SynthWorkletProcessor extends BaseAudioWorkletProcessor {
  constructor(options?: SynthRendererFactoryConfig);
  renderer: SynthRenderer;
  currentStream: SynthRenderStream | null;
  readonly backend: SynthRenderStream | SynthRenderer;
  eventQueue: import("@/types/audio").SchedulerEvent[];
  project: AudioProject | null;
  trackRuntimes: Array<{ track: Track }>;
  onMessage(message: WorkletInboundMessage): void;
  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters?: Record<string, unknown>): boolean;
}

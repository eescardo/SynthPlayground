import type { SynthRenderer, SynthRenderStream } from "@/audio/renderers/shared/synth-renderer";
import type {
  AudioRenderProject,
  SynthRendererConfig,
  SynthStreamStartOptions,
  TransportSynthStreamStartOptions
} from "@/types/audio";

export class WasmWorkletRenderer implements SynthRenderer {
  port: SynthRenderer["port"];
  sampleRateInternal: number;
  blockSize: number;
  wasmBytes: ArrayBuffer | Uint8Array | null;
  memory: WebAssembly.Memory | null;
  configure(config: Partial<SynthRendererConfig> & { wasmBytes?: ArrayBuffer }): void;
  setDefaultProject(renderProject: AudioRenderProject): void;
  startStream(options: SynthStreamStartOptions): SynthRenderStream | null;
  readonly project: SynthRenderer["project"];
}

export const createWasmRenderer: (config?: {
  processorOptions?: Partial<SynthRendererConfig> & {
    transport?: Partial<TransportSynthStreamStartOptions>;
    wasmBytes?: ArrayBuffer;
  };
}) => WasmWorkletRenderer;

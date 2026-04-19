import type { SynthRenderer, SynthRenderStream } from "./synth-worklet-runtime.js";
import type { AudioProject, SynthRendererConfig, SynthStreamStartOptions, TransportSynthStreamStartOptions } from "@/types/audio";

export class WasmWorkletRenderer implements SynthRenderer {
  port: SynthRenderer["port"];
  sampleRateInternal: number;
  blockSize: number;
  wasmBytes: ArrayBuffer | Uint8Array | null;
  memory: WebAssembly.Memory | null;
  configure(config: Partial<SynthRendererConfig> & { wasmBytes?: ArrayBuffer }): void;
  setDefaultProject(project: AudioProject): void;
  startStream(options: SynthStreamStartOptions): SynthRenderStream | null;
  readonly project: SynthRenderer["project"];
}

export const createWasmRenderer: (config?: {
  processorOptions?: Partial<SynthRendererConfig> & {
    transport?: Partial<TransportSynthStreamStartOptions>;
    wasmBytes?: ArrayBuffer;
  };
}) => WasmWorkletRenderer;

import type { SynthRenderer, SynthRenderStream, WorkletPortLike } from "@/audio/worklets/synth-worklet-runtime.js";
import { AudioProject, SchedulerEvent, SynthRendererConfig, SynthStreamStartOptions, TransportSynthStreamStartOptions } from "@/types/audio";
import type { Track } from "@/types/music";
import { compileAudioProjectToWasmSubset, compileSchedulerEventsToWasmSubset } from "@/audio/wasm/wasmSubsetCompiler";
import { loadNodeDspWasmModule } from "@/audio/wasm/loadNodeDspWasm";
import type { LoadedDspCoreNodeModule, WasmSubsetEngineInstance } from "@/audio/wasm/loadNodeDspWasm";
import type { WasmProjectSpec } from "@/audio/wasm/wasmSubsetCompiler";

class NullPort implements WorkletPortLike {
  onmessage: ((event: unknown) => void) | null = null;
  postMessage() {}
}

export class WasmSynthRenderStream implements SynthRenderStream {
  readonly port: WorkletPortLike;
  readonly project: AudioProject | null;
  readonly trackRuntimes: Array<{ track: Track }>;
  readonly eventQueue: SchedulerEvent[] = [];

  private readonly engine: WasmSubsetEngineInstance;
  private readonly memory: WebAssembly.Memory;
  private readonly blockSize: number;
  private readonly projectSpec: WasmProjectSpec;
  private stopped = false;

  constructor(
    wasmModule: LoadedDspCoreNodeModule,
    project: AudioProject,
    projectSpec: WasmProjectSpec,
    options: SynthStreamStartOptions,
    port: WorkletPortLike
  ) {
    this.port = port;
    this.project = project;
    this.projectSpec = projectSpec;
    this.trackRuntimes = project.tracks.map((track) => ({ track }));
    this.engine = new wasmModule.WasmSubsetEngine(project.global.sampleRate, projectSpec.blockSize);
    this.memory = wasmModule.memory;
    this.blockSize = projectSpec.blockSize;
    this.engine.start_stream(
      JSON.stringify(projectSpec),
      options.songStartSample,
      JSON.stringify(compileSchedulerEventsToWasmSubset(project, projectSpec, options.events)),
      options.sessionId ?? 1
    );
  }

  processBlock(output: Float32Array[]): boolean {
    const leftOut = output[0];
    const rightOut = output[1] || output[0];
    if (this.stopped) {
      leftOut.fill(0);
      if (rightOut !== leftOut) {
        rightOut.fill(0);
      }
      return true;
    }

    const keepAlive = this.engine.process_block();
    const leftPtr = this.engine.left_ptr();
    const rightPtr = this.engine.right_ptr();
    const leftView = new Float32Array(this.memory.buffer, leftPtr, this.blockSize);
    const rightView = new Float32Array(this.memory.buffer, rightPtr, this.blockSize);
    leftOut.set(leftView.subarray(0, leftOut.length));
    if (rightOut !== leftOut) {
      rightOut.set(rightView.subarray(0, rightOut.length));
    }
    return keepAlive;
  }

  enqueueEvents(events: SchedulerEvent[]): void {
    this.eventQueue.push(...events);
    this.engine.enqueue_events(JSON.stringify(compileSchedulerEventsToWasmSubset(this.project!, this.projectSpec, events)));
  }

  stop(): void {
    this.stopped = true;
    this.engine.stop();
    this.eventQueue.length = 0;
  }
}

export class WasmSynthRenderer implements SynthRenderer {
  readonly port: WorkletPortLike;
  sampleRateInternal: number;
  blockSize: number;
  project: AudioProject | null;

  private readonly module: LoadedDspCoreNodeModule;

  constructor(wasmModule: LoadedDspCoreNodeModule, options?: { processorOptions?: Partial<SynthRendererConfig> & { transport?: Partial<TransportSynthStreamStartOptions> } }) {
    this.module = wasmModule;
    this.port = new NullPort();
    this.sampleRateInternal = options?.processorOptions?.sampleRate ?? 48000;
    this.blockSize = options?.processorOptions?.blockSize ?? 128;
    this.project = options?.processorOptions?.project ?? null;
  }

  configure(config: Partial<SynthRendererConfig>): void {
    this.sampleRateInternal = config.sampleRate ?? this.sampleRateInternal;
    this.blockSize = config.blockSize ?? this.blockSize;
    if (config.project) {
      this.project = config.project;
    }
  }

  setDefaultProject(project: AudioProject): void {
    this.project = project;
  }

  startStream(options: SynthStreamStartOptions): SynthRenderStream | null {
    const project = options.project || this.project;
    if (!project) {
      return null;
    }
    const projectSpec = compileAudioProjectToWasmSubset(project, { blockSize: this.blockSize });
    return new WasmSynthRenderStream(this.module, project, projectSpec, options, this.port);
  }
}

export const createWasmRenderer = async (config?: { processorOptions?: Partial<SynthRendererConfig> & { transport?: Partial<TransportSynthStreamStartOptions> } }) => {
  const wasmModule = await loadNodeDspWasmModule();
  return new WasmSynthRenderer(wasmModule, config);
};

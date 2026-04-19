import type { SynthRenderer, SynthRenderStream, WorkletPortLike } from "@/audio/worklets/synth-worklet-runtime.js";
import { AudioProject, SchedulerEvent, SynthRendererConfig, SynthStreamStartOptions, TransportSynthStreamStartOptions } from "@/types/audio";
import type { Track } from "@/types/music";
import { compileAudioProjectToWasmSubset, compileSchedulerEventsToWasmSubset } from "@/audio/wasm/wasmSubsetCompiler";
import { loadNodeDspWasmModule } from "@/audio/wasm/loadNodeDspWasm";
import type { LoadedDspCoreNodeModule, WasmSubsetEngineInstance } from "@/audio/wasm/loadNodeDspWasm";
import type { WasmProjectSpec } from "@/audio/wasm/wasmSubsetCompiler";
import { SharedWasmRenderStream, SharedWasmRenderer, NullPort } from "@/audio/worklets/synth-worklet-wasm-renderer-core.js";

export class WasmSynthRenderStream extends SharedWasmRenderStream implements SynthRenderStream {
  declare readonly port: WorkletPortLike;
  declare readonly project: AudioProject | null;
  declare readonly trackRuntimes: Array<{ track: Track }>;
  declare readonly eventQueue: SchedulerEvent[];
  declare readonly engine: WasmSubsetEngineInstance;

  private readonly profilingEnabled: boolean;

  constructor(renderer: NodeWasmSynthRenderer, options: SynthStreamStartOptions) {
    super(renderer, options, renderer.sharedImplementation);
    this.profilingEnabled = renderer.profilingEnabled;
  }

  getProfileStats(): Record<string, unknown> | null {
    if (!this.profilingEnabled) {
      return null;
    }
    return JSON.parse(this.engine.profile_stats_json()) as Record<string, unknown>;
  }
}

type SharedImplementation = {
  compileProject: (project: AudioProject, options: { blockSize: number }) => WasmProjectSpec;
  compileEvents: (project: AudioProject, projectSpec: WasmProjectSpec, events: SchedulerEvent[]) => ReturnType<typeof compileSchedulerEventsToWasmSubset>;
  createEngine: (renderer: NodeWasmSynthRenderer, project: AudioProject, projectSpec: WasmProjectSpec, options: SynthStreamStartOptions) => WasmSubsetEngineInstance;
  getMemory: (renderer: NodeWasmSynthRenderer) => WebAssembly.Memory;
};

export class NodeWasmSynthRenderer extends SharedWasmRenderer implements SynthRenderer {
  declare readonly port: WorkletPortLike;
  declare sampleRateInternal: number;
  declare blockSize: number;
  declare defaultProject: AudioProject | null;
  declare readonly project: AudioProject | null;

  readonly profilingEnabled: boolean;
  readonly module: LoadedDspCoreNodeModule;
  readonly sharedImplementation: SharedImplementation;

  constructor(
    wasmModule: LoadedDspCoreNodeModule,
    options?: { processorOptions?: Partial<SynthRendererConfig> & { transport?: Partial<TransportSynthStreamStartOptions> } },
    profilingEnabled = false
  ) {
    const implementation: SharedImplementation = {
      compileProject: compileAudioProjectToWasmSubset,
      compileEvents: compileSchedulerEventsToWasmSubset,
      createEngine: (renderer, _project, projectSpec) => {
        const engine = new renderer.module.WasmSubsetEngine(renderer.sampleRateInternal, projectSpec.blockSize);
        engine.set_profiling_enabled(renderer.profilingEnabled);
        if (renderer.profilingEnabled) {
          engine.reset_profile_stats();
        }
        return engine;
      },
      getMemory: (renderer) => renderer.module.memory
    };
    super(options ?? {}, implementation);
    this.module = wasmModule;
    this.port = new NullPort();
    this.profilingEnabled = profilingEnabled;
    this.sharedImplementation = implementation;
  }

  setDefaultProject(project: AudioProject): void {
    this.defaultProject = project;
  }

  startStream(options: SynthStreamStartOptions): SynthRenderStream | null {
    const project = options.project || this.defaultProject;
    if (!project) {
      return null;
    }
    return new WasmSynthRenderStream(this, { ...options, project });
  }
}

export const createWasmRenderer = async (config?: { processorOptions?: Partial<SynthRendererConfig> & { transport?: Partial<TransportSynthStreamStartOptions> }; profilingEnabled?: boolean }) => {
  const wasmModule = await loadNodeDspWasmModule();
  return new NodeWasmSynthRenderer(wasmModule, config, config?.profilingEnabled ?? false);
};

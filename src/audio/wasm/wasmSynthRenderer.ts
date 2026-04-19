import type { SynthRenderer, SynthRenderStream, WorkletPortLike } from "@/audio/worklets/synth-worklet-runtime.js";
import { AudioProject, SchedulerEvent, SynthRendererConfig, SynthStreamStartOptions, TransportSynthStreamStartOptions } from "@/types/audio";
import type { Track } from "@/types/music";
import { compileAudioProjectToWasmSubset, compileSchedulerEventsToWasmSubset } from "@/audio/wasm/wasmSubsetCompiler";
import { loadNodeDspWasmModule } from "@/audio/wasm/loadNodeDspWasm";
import type { LoadedDspCoreNodeModule, WasmSubsetEngineInstance } from "@/audio/wasm/loadNodeDspWasm";
import {
  SharedWasmRendererLike,
  SharedWasmImplementation,
  SharedWasmRenderStream,
  SharedWasmRenderer,
  NullPort
} from "@/audio/worklets/synth-worklet-wasm-renderer-core.js";

export class WasmSynthRenderStream extends SharedWasmRenderStream implements SynthRenderStream {
  declare readonly port: WorkletPortLike;
  declare readonly project: AudioProject;
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

export class NodeWasmSynthRenderer extends SharedWasmRenderer implements SynthRenderer {
  declare readonly port: WorkletPortLike;
  declare sampleRateInternal: number;
  declare blockSize: number;
  declare defaultProject: AudioProject | null;
  declare readonly project: AudioProject | null;

  readonly profilingEnabled: boolean;
  readonly module: LoadedDspCoreNodeModule;
  readonly sharedImplementation: SharedWasmImplementation;

  constructor(
    wasmModule: LoadedDspCoreNodeModule,
    options?: { processorOptions?: Partial<SynthRendererConfig> & { transport?: Partial<TransportSynthStreamStartOptions> } },
    profilingEnabled = false
  ) {
    const implementation: SharedWasmImplementation = {
      compileProject: compileAudioProjectToWasmSubset,
      compileEvents: compileSchedulerEventsToWasmSubset,
      createEngine: (renderer, _project, projectSpec) => {
        const nodeRenderer = renderer as unknown as SharedWasmRendererLike & NodeWasmSynthRenderer;
        const engine = new nodeRenderer.module.WasmSubsetEngine(nodeRenderer.sampleRateInternal, projectSpec.blockSize);
        engine.set_profiling_enabled(nodeRenderer.profilingEnabled);
        if (nodeRenderer.profilingEnabled) {
          engine.reset_profile_stats();
        }
        return engine;
      },
      getMemory: (renderer) => (renderer as unknown as SharedWasmRendererLike & NodeWasmSynthRenderer).module.memory
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

  startStream(options: SynthStreamStartOptions): WasmSynthRenderStream | null {
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

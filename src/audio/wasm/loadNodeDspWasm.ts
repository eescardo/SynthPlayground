import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

interface WasmSubsetEngineInstance {
  start_stream(projectJson: string, songStartSample: number, eventsJson: string, sessionId: number): void;
  enqueue_events(eventsJson: string): void;
  process_block(): boolean;
  stop(): void;
  left_ptr(): number;
  right_ptr(): number;
  block_size(): number;
}

interface DspCoreInitOutput {
  readonly memory: WebAssembly.Memory;
}

interface DspCoreNodeModule {
  default: (moduleOrPath?: BufferSource | WebAssembly.Module | Promise<BufferSource>) => Promise<DspCoreInitOutput>;
  WasmSubsetEngine: new (sampleRate: number, blockSize: number) => WasmSubsetEngineInstance;
}

interface LoadedDspCoreNodeModule extends DspCoreNodeModule {
  memory: WebAssembly.Memory;
}

let cachedModulePromise: Promise<LoadedDspCoreNodeModule> | null = null;

export const loadNodeDspWasmModule = async (): Promise<LoadedDspCoreNodeModule> => {
  if (!cachedModulePromise) {
    cachedModulePromise = (async () => {
      const pkgDir = path.join(process.cwd(), "public", "wasm", "pkg");
      const bindgenPath = pathToFileURL(path.join(pkgDir, "dsp_core.js")).href;
      const wasmPath = path.join(pkgDir, "dsp_core_bg.wasm");
      const bindgenModule = (await import(bindgenPath)) as DspCoreNodeModule;
      const wasmBytes = await fs.readFile(wasmPath);
      const initOutput = await bindgenModule.default({ module_or_path: wasmBytes });
      return {
        ...bindgenModule,
        memory: initOutput.memory
      };
    })();
  }
  return cachedModulePromise;
};

export type { DspCoreNodeModule, LoadedDspCoreNodeModule, WasmSubsetEngineInstance };

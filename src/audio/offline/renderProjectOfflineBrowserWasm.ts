import { renderOfflineWithRenderer } from "@/audio/offline/renderOfflineWithRenderer";
import { createWasmRenderer } from "@/audio/worklets/synth-worklet-wasm-renderer.js";
import type { AudioProject, SchedulerEvent } from "@/types/audio";

interface OfflineBrowserWasmRenderOptions {
  sampleRate: number;
  blockSize: number;
  durationSamples: number;
  events?: SchedulerEvent[];
  sessionId?: number;
  randomSeed?: number;
}

let cachedBrowserWasmBytes: ArrayBuffer | null = null;

const loadBrowserWasmBytes = async (): Promise<ArrayBuffer> => {
  if (cachedBrowserWasmBytes) {
    return cachedBrowserWasmBytes;
  }

  const response = await fetch(
    process.env.NODE_ENV === "development" ? `/wasm/pkg/dsp_core_bg.wasm?v=${Date.now()}` : "/wasm/pkg/dsp_core_bg.wasm"
  );
  if (!response.ok) {
    throw new Error(`Failed to load offline WASM binary: ${response.status} ${response.statusText}`);
  }

  cachedBrowserWasmBytes = await response.arrayBuffer();
  return cachedBrowserWasmBytes;
};

export const renderProjectOfflineBrowserWasm = async (
  project: AudioProject,
  options: OfflineBrowserWasmRenderOptions
) => {
  const wasmBytes = await loadBrowserWasmBytes();
  const renderer = createWasmRenderer({
    processorOptions: {
      sampleRate: options.sampleRate,
      blockSize: options.blockSize,
      project,
      wasmBytes
    }
  });

  return renderOfflineWithRenderer(renderer, project, options);
};

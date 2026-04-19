import { createWasmRenderer, WasmSynthRenderStream } from "@/audio/renderers/wasm/wasmSynthRenderer";
import { AudioProject, SchedulerEvent } from "@/types/audio";
import { BaseOfflineRenderOptions, OfflineRenderResult, renderOfflineWithRenderer } from "./renderOfflineWithRenderer";

export interface OfflineWasmRenderOptions extends BaseOfflineRenderOptions {
  events?: SchedulerEvent[];
  sessionId?: number;
  randomSeed?: number;
  profilingEnabled?: boolean;
}

export interface OfflineWasmRenderResult extends OfflineRenderResult {
  profileStats?: Record<string, unknown> | null;
}

export const renderProjectOfflineWasm = async (
  project: AudioProject,
  options: OfflineWasmRenderOptions
): Promise<OfflineWasmRenderResult> => {
  const renderer = await createWasmRenderer({
    profilingEnabled: options.profilingEnabled ?? false,
    processorOptions: {
      sampleRate: options.sampleRate,
      blockSize: options.blockSize,
      project
    }
  });
  return renderOfflineWithRenderer<WasmSynthRenderStream, { profileStats?: Record<string, unknown> | null }>(
    renderer,
    project,
    options,
    (stream) => ({ profileStats: stream?.getProfileStats() ?? null })
  );
};

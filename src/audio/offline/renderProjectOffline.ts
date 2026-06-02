import { createWasmRenderer, WasmSynthRenderStream } from "@/audio/renderers/wasm/wasmSynthRenderer";
import { AudioRenderProject, SchedulerEvent } from "@/types/audio";
import { BaseOfflineRenderOptions, OfflineRenderResult, renderOfflineWithRenderer } from "./renderOfflineWithRenderer";

export interface OfflineRenderOptions extends BaseOfflineRenderOptions {
  events?: SchedulerEvent[];
  sessionId?: number;
  randomSeed?: number;
  profilingEnabled?: boolean;
}

export interface OfflineRenderWasmResult extends OfflineRenderResult {
  profileStats?: Record<string, unknown> | null;
}

export const renderProjectOffline = async (
  renderProject: AudioRenderProject,
  options: OfflineRenderOptions
): Promise<OfflineRenderWasmResult> => {
  const renderer = await createWasmRenderer({
    profilingEnabled: options.profilingEnabled ?? false,
    processorOptions: {
      sampleRate: options.sampleRate,
      blockSize: options.blockSize,
      renderProject
    }
  });
  return renderOfflineWithRenderer<WasmSynthRenderStream, { profileStats?: Record<string, unknown> | null }>(
    renderer,
    renderProject,
    options,
    (stream) => ({ profileStats: stream?.getProfileStats() ?? null })
  );
};

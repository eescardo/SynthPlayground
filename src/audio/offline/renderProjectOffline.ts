import { createJsRenderer } from "@/audio/renderers/js/synth-renderer-js.js";
import type { SynthRenderStream } from "@/audio/renderers/shared/synth-renderer";
import { SynthWorkletProcessor } from "@/audio/worklets/synth-worklet-runtime.js";
import { AudioProject, SchedulerEvent } from "@/types/audio";
import { OfflineWasmRenderOptions, OfflineWasmRenderResult, renderProjectOfflineWasm } from "./renderProjectOfflineWasm";
import { BaseOfflineRenderOptions, OfflineRenderResult, renderOfflineWithRenderer } from "./renderOfflineWithRenderer";

export interface OfflineRenderJsOptions extends BaseOfflineRenderOptions {
  events?: SchedulerEvent[];
  sessionId?: number;
  randomSeed?: number;
}

export type { OfflineRenderResult };
export type OfflineRenderOptions = OfflineWasmRenderOptions;
export type { OfflineWasmRenderResult };

export const createOfflineRenderProcessorJs = (
  project: AudioProject,
  options: Pick<OfflineRenderJsOptions, "sampleRate" | "blockSize">
): SynthWorkletProcessor =>
  new SynthWorkletProcessor({
    processorOptions: {
      sampleRate: options.sampleRate,
      blockSize: options.blockSize,
      project
    }
  });

export const createOfflineRendererJs = (
  project: AudioProject,
  options: Pick<OfflineRenderJsOptions, "sampleRate" | "blockSize">
) =>
  createJsRenderer({
    processorOptions: {
      sampleRate: options.sampleRate,
      blockSize: options.blockSize,
      project
    }
  });

export const createOfflineRenderStreamJs = (
  project: AudioProject,
  options: Pick<OfflineRenderJsOptions, "sampleRate" | "blockSize" | "durationSamples" | "randomSeed"> & {
    events?: SchedulerEvent[];
    sessionId?: number;
  }
): SynthRenderStream | null =>
  createOfflineRendererJs(project, options).startStream({
    project,
    songStartSample: 0,
    events: options.events ?? [],
    sessionId: options.sessionId ?? 1,
    randomSeed: options.randomSeed,
    mode: "transport"
  });

export const renderProjectOfflineJs = (
  project: AudioProject,
  options: OfflineRenderJsOptions
): OfflineRenderResult => {
  const renderer = createOfflineRendererJs(project, options);
  return renderOfflineWithRenderer(renderer, project, options);
};

export const renderProjectOffline = (
  project: AudioProject,
  options: OfflineRenderOptions
): Promise<OfflineWasmRenderResult> => renderProjectOfflineWasm(project, options);

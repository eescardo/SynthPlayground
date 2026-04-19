import { createJsRenderer } from "@/audio/renderers/js/synth-renderer-js.js";
import type { SynthRenderStream } from "@/audio/renderers/shared/synth-renderer";
import { SynthWorkletProcessor } from "@/audio/worklets/synth-worklet-runtime.js";
import { AudioProject, SchedulerEvent } from "@/types/audio";
import { BaseOfflineRenderOptions, OfflineRenderResult, renderOfflineWithRenderer } from "./renderOfflineWithRenderer";

export interface OfflineRenderOptions extends BaseOfflineRenderOptions {
  events?: SchedulerEvent[];
  sessionId?: number;
  randomSeed?: number;
}

export type { OfflineRenderResult };

export const createOfflineRenderProcessor = (
  project: AudioProject,
  options: Pick<OfflineRenderOptions, "sampleRate" | "blockSize">
): SynthWorkletProcessor =>
  new SynthWorkletProcessor({
    processorOptions: {
      sampleRate: options.sampleRate,
      blockSize: options.blockSize,
      project
    }
  });

export const createOfflineRenderer = (
  project: AudioProject,
  options: Pick<OfflineRenderOptions, "sampleRate" | "blockSize">
) =>
  createJsRenderer({
    processorOptions: {
      sampleRate: options.sampleRate,
      blockSize: options.blockSize,
      project
    }
  });

export const createOfflineRenderStream = (
  project: AudioProject,
  options: Pick<OfflineRenderOptions, "sampleRate" | "blockSize" | "durationSamples" | "randomSeed"> & {
    events?: SchedulerEvent[];
    sessionId?: number;
  }
): SynthRenderStream | null =>
  createOfflineRenderer(project, options).startStream({
    project,
    songStartSample: 0,
    events: options.events ?? [],
    sessionId: options.sessionId ?? 1,
    randomSeed: options.randomSeed,
    mode: "transport"
  });

export const renderProjectOffline = (
  project: AudioProject,
  options: OfflineRenderOptions
): OfflineRenderResult => {
  const renderer = createOfflineRenderer(project, options);
  return renderOfflineWithRenderer(renderer, project, options);
};

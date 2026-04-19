import type { AudioProject, SchedulerEvent } from "@/types/audio";
import type { PreviewProbeRequest } from "@/types/probes";
import type { WasmEvent, WasmProjectSpec } from "@/audio/wasm/wasmSubsetCompiler";

export interface WasmPreviewProbeCaptureRequest {
  probeId: string;
  trackIndex: number;
  signalIndex: number;
  durationSamples: number;
}

export const compileAudioProjectToWasmSubsetCore: (
  project: AudioProject,
  options: { blockSize: number }
) => WasmProjectSpec;

export const compileSchedulerEventsToWasmSubsetCore: (
  project: AudioProject,
  projectSpec: WasmProjectSpec,
  events: SchedulerEvent[]
) => WasmEvent[];

export const compilePreviewProbeCaptureRequestsCore: (
  project: AudioProject,
  projectSpec: WasmProjectSpec,
  trackId: string,
  captureProbes: PreviewProbeRequest[],
  durationSamples: number
) => WasmPreviewProbeCaptureRequest[];

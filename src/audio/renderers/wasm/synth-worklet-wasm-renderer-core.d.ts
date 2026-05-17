import type { Track } from "@/types/music";
import type { AudioProject, SchedulerEvent, SynthRendererConfig, SynthStreamStartOptions } from "@/types/audio";
import type { PreviewProbeCapture, PreviewProbeRequest, PreviewProbeSharedBuffer } from "@/types/probes";
import type { WasmEvent, WasmProjectSpec } from "@/audio/renderers/wasm/wasmSubsetCompiler";
import type { WorkletPortLike } from "@/audio/renderers/shared/synth-renderer";
import type { WasmPreviewProbeCaptureRequest } from "@/audio/renderers/wasm/synth-worklet-wasm-compiler-core.js";

export const DEFAULT_RANDOM_SEED: number;
export const MACRO_EVENT_LEAD_SAMPLES: number;
export const PREVIEW_CAPTURE_EMIT_INTERVAL_SAMPLES: number;

export class NullPort implements WorkletPortLike {
  onmessage: ((event: unknown) => void) | null;
  postMessage(...args: unknown[]): void;
}

export const resolveRandomSeed: (value: unknown) => number;

export interface SharedWasmEngine {
  start_stream(
    projectJson: string,
    songStartSample: number,
    eventsJson: string,
    sessionId: number,
    randomSeed: number
  ): void;
  enqueue_events(eventsJson: string): void;
  process_block(): boolean;
  has_active_voices?(): boolean;
  stop(): void;
  left_ptr(): number;
  right_ptr(): number;
  block_size(): number;
  configure_preview_probe_capture?(captureJson: string): void;
  preview_capture_state_json?(includeFinal?: boolean): string;
  preview_capture_sample_count?(): number;
}

export interface SharedWasmPreviewCaptureBuffer {
  sampleBuffer: SharedArrayBuffer;
  capacitySamples: number;
}

export interface SharedWasmPreviewCaptureState {
  lastEmittedCapturedSamples: number;
  sharedBufferByProbeId?: Map<string, SharedWasmPreviewCaptureBuffer>;
  metaByProbeId: Map<
    string,
    {
      kind: PreviewProbeCapture["kind"];
      target: PreviewProbeCapture["target"];
      durationSamples: number;
    }
  >;
}

export interface SharedWasmPreviewCaptureSnapshot {
  capturedSamples: number;
  captures: Array<{
    probeId: string;
    sampleStride?: number;
    sourceCapturedSamples?: number;
    samples: number[];
    sampleBuffer?: SharedArrayBuffer;
    sampleLength?: number;
    spectrumFrames?: PreviewProbeCapture["spectrumFrames"];
    finalSpectrum?: PreviewProbeCapture["finalSpectrum"];
  }>;
}

export interface SharedWasmRendererLike {
  port: WorkletPortLike;
  sampleRateInternal: number;
  blockSize: number;
  defaultProject: AudioProject | null;
  implementation: SharedWasmImplementation;
  getProjectPlan(project: AudioProject): {
    project: AudioProject;
    blockSize: number;
    projectSpec: WasmProjectSpec;
    projectSpecJson: string;
  };
  resolveSharedCaptureBufferMap?(
    captureSharedBuffers?: PreviewProbeSharedBuffer[]
  ): Map<string, SharedWasmPreviewCaptureBuffer>;
}

export interface SharedWasmImplementation {
  compileProject: (project: AudioProject, options: { blockSize: number }) => WasmProjectSpec;
  compileEvents: (project: AudioProject, projectSpec: WasmProjectSpec, events: SchedulerEvent[]) => WasmEvent[];
  createEngine: (
    renderer: SharedWasmRendererLike & Record<string, unknown>,
    project: AudioProject,
    projectSpec: WasmProjectSpec,
    options: SynthStreamStartOptions
  ) => SharedWasmEngine;
  getMemory: (renderer: SharedWasmRendererLike & Record<string, unknown>) => WebAssembly.Memory;
  configure?: (
    renderer: SharedWasmRendererLike & Record<string, unknown>,
    config: Partial<SynthRendererConfig> & { wasmBytes?: ArrayBuffer | Uint8Array | null }
  ) => void;
  prepare?: (renderer: SharedWasmRendererLike & Record<string, unknown>, options: SynthStreamStartOptions) => void;
  preparePreviewCapture?: (
    renderer: SharedWasmRendererLike & Record<string, unknown>,
    project: AudioProject,
    projectSpec: WasmProjectSpec,
    options: Extract<SynthStreamStartOptions, { mode: "preview" }>,
    engine: SharedWasmEngine
  ) => SharedWasmPreviewCaptureState | null;
  readPreviewCapture?: (
    renderer: SharedWasmRendererLike & Record<string, unknown>,
    engine: SharedWasmEngine,
    previewCaptureState: SharedWasmPreviewCaptureState,
    force: boolean
  ) => SharedWasmPreviewCaptureSnapshot | null;
  getPreviewCaptureSampleCount?: (
    renderer: SharedWasmRendererLike & Record<string, unknown>,
    engine: SharedWasmEngine,
    previewCaptureState: SharedWasmPreviewCaptureState
  ) => number | null;
}

export class SharedWasmRenderStream {
  constructor(
    renderer: SharedWasmRendererLike,
    options: SynthStreamStartOptions,
    implementation: SharedWasmImplementation
  );
  port: WorkletPortLike;
  renderer: SharedWasmRendererLike;
  project: AudioProject;
  projectSpec: WasmProjectSpec;
  projectSpecJson: string;
  trackRuntimes: Array<{ track: Track }>;
  eventQueue: SchedulerEvent[];
  transportSessionId: number;
  songSampleCounter: number;
  previewing: boolean;
  previewRemainingSamples: number;
  previewId: string | undefined;
  captureProbes: PreviewProbeRequest[];
  stopped: boolean;
  finalizingPreviewCapture: boolean;
  implementation: SharedWasmImplementation;
  previewCaptureState: SharedWasmPreviewCaptureState | null;
  engine: SharedWasmEngine;
  hasActiveVoices(): boolean;
  maybeEmitPreviewCapture(force?: boolean): boolean;
  beginFinalPreviewCapture(): void;
  processBlock(output: Float32Array[]): boolean;
  enqueueEvents(events: SchedulerEvent[]): void;
  setMacroValue(trackId: string, macroId: string, normalized: number): void;
  setRecordingTrack(trackId?: string | null): void;
  stop(options?: { emitPreviewCapture?: boolean }): void;
}

export class SharedWasmRenderer {
  constructor(
    options?: { processorOptions?: Partial<SynthRendererConfig> & { wasmBytes?: ArrayBuffer | Uint8Array | null } },
    implementation?: SharedWasmImplementation
  );
  port: NullPort;
  sampleRateInternal: number;
  blockSize: number;
  defaultProject: AudioProject | null;
  implementation: SharedWasmImplementation;
  configure(config: Partial<SynthRendererConfig> & { wasmBytes?: ArrayBuffer | Uint8Array | null }): void;
  setDefaultProject(project: AudioProject): void;
  getProjectPlan(project: AudioProject): {
    project: AudioProject;
    blockSize: number;
    projectSpec: WasmProjectSpec;
    projectSpecJson: string;
  };
  startStream(options: SynthStreamStartOptions): SharedWasmRenderStream | null;
  readonly project: AudioProject | null;
}

export const defaultCompileProject: (project: AudioProject, options: { blockSize: number }) => WasmProjectSpec;

export const defaultCompileEvents: (
  project: AudioProject,
  projectSpec: WasmProjectSpec,
  events: SchedulerEvent[]
) => WasmEvent[];

export type { WasmPreviewProbeCaptureRequest };

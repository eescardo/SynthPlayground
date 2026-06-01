import { initSync, WasmSubsetEngine } from "./synth-worklet-dsp-bindgen.js";
import {
  SharedWasmRenderStream,
  SharedWasmRenderer,
  defaultCompileEvents,
  defaultCompileProject
} from "../renderers/wasm/synth-worklet-wasm-renderer-core.js";
import { compilePreviewProbeCaptureRequestsCore } from "../renderers/wasm/synth-worklet-wasm-compiler-core.js";

class WasmWorkletRenderStream extends SharedWasmRenderStream {}

export class WasmWorkletRenderer extends SharedWasmRenderer {
  constructor(options = {}) {
    const implementation = {
      compileProject: defaultCompileProject,
      compileEvents: defaultCompileEvents,
      configure: (renderer, config) => {
        if (config.wasmBytes) {
          renderer.wasmBytes = config.wasmBytes;
        }
        if (renderer.wasmBytes && !renderer.memory) {
          renderer.ensureInitialized();
        }
      },
      prepare: (renderer) => {
        renderer.ensureInitialized();
      },
      createEngine: (renderer, _project, projectSpec) => {
        const engine = new WasmSubsetEngine(renderer.sampleRateInternal, projectSpec.blockSize);
        engine.set_profiling_enabled(false);
        return engine;
      },
      getMemory: (renderer) => renderer.memory,
      preparePreviewCapture: (renderer, project, projectSpec, options, engine) => {
        const compiled = compilePreviewProbeCaptureRequestsCore(
          project,
          projectSpec,
          options.trackId,
          options.captureProbes,
          options.captureDurationSamples || options.durationSamples || 0
        );
        if (!compiled.length) {
          return null;
        }
        engine.configure_preview_probe_capture(JSON.stringify(compiled));
        const sharedBufferByProbeId = renderer.resolveSharedCaptureBufferMap?.(options.captureSharedBuffers);
        const sampleProbeIds = options.captureProbes
          .filter((probe) => probe.kind !== "spectrum")
          .map((probe) => probe.probeId);
        return {
          lastEmittedCapturedSamples: 0,
          sharedBufferByProbeId,
          copiedSampleCountByProbeId: new Map(),
          hasSharedBufferForAllSampleCaptures:
            sampleProbeIds.length > 0 && sampleProbeIds.every((probeId) => sharedBufferByProbeId?.has(probeId)),
          metaByProbeId: new Map(
            options.captureProbes.map((probe) => [
              probe.probeId,
              {
                kind: probe.kind,
                target: probe.target,
                durationSamples: Math.max(0, Math.floor(options.captureDurationSamples || options.durationSamples || 0))
              }
            ])
          )
        };
      },
      readPreviewCapture: (_renderer, engine, previewCaptureState, force) => {
        const includeSamples = !previewCaptureState.hasSharedBufferForAllSampleCaptures;
        const rawSnapshot = engine.preview_capture_state_json(Boolean(force), includeSamples);
        if (typeof rawSnapshot !== "string" || rawSnapshot.length === 0 || rawSnapshot.charCodeAt(0) === 0) {
          return null;
        }
        let snapshot = null;
        try {
          snapshot = JSON.parse(rawSnapshot);
        } catch {
          return null;
        }
        if (!snapshot || !Array.isArray(snapshot.captures)) {
          return null;
        }
        return snapshot;
      },
      getPreviewCaptureSampleCount: (_renderer, engine) => engine.preview_capture_sample_count(),
      getPreviewCaptureSamplesPointer: (_renderer, engine, probeId) => engine.preview_capture_samples_ptr(probeId),
      getPreviewCaptureSamplesLength: (_renderer, engine, probeId) => engine.preview_capture_samples_len(probeId)
    };
    super(options, implementation);
    if (typeof this.wasmBytes === "undefined") {
      this.wasmBytes = options?.processorOptions?.wasmBytes ?? null;
    }
    if (typeof this.memory === "undefined") {
      this.memory = null;
    }
  }

  ensureInitialized() {
    if (this.memory) {
      return;
    }
    if (!this.wasmBytes) {
      throw new Error("WASM worklet renderer requires wasmBytes before starting a stream.");
    }
    const bufferSource = this.wasmBytes instanceof Uint8Array ? this.wasmBytes : new Uint8Array(this.wasmBytes);
    const initOutput = initSync({ module: bufferSource });
    this.memory = initOutput.memory;
  }

  startStream(options) {
    const renderProject = options.renderProject || this.defaultRenderProject;
    if (!renderProject) {
      return null;
    }
    this.implementation.prepare?.(this, options);
    return new WasmWorkletRenderStream(this, { ...options, renderProject }, this.implementation);
  }
}

export const createWasmRenderer = (config = {}) => new WasmWorkletRenderer(config);

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
          options.durationSamples || 0
        );
        if (!compiled.length) {
          return null;
        }
        engine.configure_preview_probe_capture(JSON.stringify(compiled));
        return {
          lastEmittedCapturedSamples: 0,
          metaByProbeId: new Map(
            options.captureProbes.map((probe) => [
              probe.probeId,
              {
                kind: probe.kind,
                target: probe.target,
                durationSamples: Math.max(0, Math.floor(options.durationSamples || 0))
              }
            ])
          )
        };
      },
      readPreviewCapture: (_renderer, engine) => {
        const snapshot = JSON.parse(engine.preview_capture_state_json());
        if (!snapshot || !Array.isArray(snapshot.captures)) {
          return null;
        }
        return snapshot;
      },
      getPreviewCaptureSampleCount: (_renderer, engine) => engine.preview_capture_sample_count()
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
    const project = options.project || this.defaultProject;
    if (!project) {
      return null;
    }
    this.implementation.prepare?.(this, options);
    return new WasmWorkletRenderStream(this, { ...options, project }, this.implementation);
  }
}

export const createWasmRenderer = (config = {}) => new WasmWorkletRenderer(config);

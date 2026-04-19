import { initSync, WasmSubsetEngine } from "./synth-worklet-dsp-bindgen.js";
import { JsSynthRenderStream } from "./synth-worklet-runtime.js";
import {
  SharedWasmRenderStream,
  SharedWasmRenderer,
  defaultCompileEvents,
  defaultCompileProject
} from "./synth-worklet-wasm-renderer-core.js";

const createPreviewCaptureMirror = (renderer, options) => {
  if (options.mode !== "preview" || !Array.isArray(options.captureProbes) || options.captureProbes.length === 0) {
    return null;
  }
  return new JsSynthRenderStream(renderer, options);
};

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
      createPreviewMirror: createPreviewCaptureMirror
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

import initSync, { WasmSubsetEngine } from "../wasm/pkg/dsp_core.js";
import { compareScheduledEvents } from "./synth-worklet-runtime.js";
import { compileAudioProjectToWasmSubset, compileSchedulerEventsToWasmSubset } from "./synth-worklet-wasm-compiler.js";

const DEFAULT_RANDOM_SEED = 0x1234_5678;
const MACRO_EVENT_LEAD_SAMPLES = 256;

const NullPort = class {
  constructor() {
    this.onmessage = null;
  }
  postMessage() {}
};

const resolveRandomSeed = (value) =>
  Number.isFinite(value) ? Number(value) >>> 0 : DEFAULT_RANDOM_SEED;

class WasmWorkletRenderStream {
  constructor(renderer, options) {
    this.port = renderer.port;
    this.renderer = renderer;
    this.project = options.project;
    this.projectSpec = compileAudioProjectToWasmSubset(this.project, { blockSize: renderer.blockSize });
    this.trackRuntimes = this.project.tracks.map((track) => ({ track }));
    this.eventQueue = [...(options.events || [])].sort(compareScheduledEvents);
    this.transportSessionId = Number.isFinite(options.sessionId) ? options.sessionId : 1;
    this.songSampleCounter = options.songStartSample || 0;
    this.previewing = options.mode === "preview";
    this.previewRemainingSamples = this.previewing ? Number(options.durationSamples || 0) : 0;
    this.previewId = options.previewId;
    this.captureProbes = options.captureProbes || [];
    this.stopped = false;
    this.engine = new WasmSubsetEngine(this.project.global.sampleRate, this.projectSpec.blockSize);
    this.engine.set_profiling_enabled(false);
    this.engine.start_stream(
      JSON.stringify(this.projectSpec),
      this.songSampleCounter,
      JSON.stringify(compileSchedulerEventsToWasmSubset(this.project, this.projectSpec, this.eventQueue)),
      this.transportSessionId,
      resolveRandomSeed(options.randomSeed)
    );
  }

  processBlock(output) {
    const leftOut = output[0];
    const rightOut = output[1] || output[0];
    if (this.stopped) {
      leftOut.fill(0);
      if (rightOut !== leftOut) {
        rightOut.fill(0);
      }
      return true;
    }

    const keepAlive = this.engine.process_block();
    const blockSize = this.engine.block_size();
    const leftView = new Float32Array(this.renderer.memory.buffer, this.engine.left_ptr(), blockSize);
    const rightView = new Float32Array(this.renderer.memory.buffer, this.engine.right_ptr(), blockSize);
    leftOut.set(leftView.subarray(0, leftOut.length));
    if (rightOut !== leftOut) {
      rightOut.set(rightView.subarray(0, rightOut.length));
    }
    this.songSampleCounter += leftOut.length;

    if (this.previewing) {
      this.previewRemainingSamples -= leftOut.length;
      if (this.previewRemainingSamples <= 0) {
        this.stop();
        if (this.captureProbes.length > 0) {
          this.port.postMessage({
            type: "PREVIEW_CAPTURE",
            previewId: this.previewId,
            captures: []
          });
        }
      }
    }

    return keepAlive;
  }

  enqueueEvents(events) {
    if (!events || events.length === 0 || !this.project) {
      return;
    }
    this.eventQueue.push(...events);
    this.eventQueue.sort(compareScheduledEvents);
    this.engine.enqueue_events(JSON.stringify(compileSchedulerEventsToWasmSubset(this.project, this.projectSpec, events)));
  }

  setMacroValue(trackId, macroId, normalized) {
    this.enqueueEvents([
      {
        id: `wasm-macro:${trackId}:${macroId}:${this.songSampleCounter}`,
        type: "MacroChange",
        sampleTime: this.songSampleCounter + MACRO_EVENT_LEAD_SAMPLES,
        source: "live_input",
        trackId,
        macroId,
        normalized
      }
    ]);
  }

  setRecordingTrack() {}

  stop() {
    this.stopped = true;
    this.engine.stop();
    this.eventQueue.length = 0;
  }
}

export class WasmWorkletRenderer {
  constructor(options = {}) {
    this.port = new NullPort();
    this.sampleRateInternal = options?.processorOptions?.sampleRate ?? 48000;
    this.blockSize = options?.processorOptions?.blockSize ?? 128;
    this.defaultProject = options?.processorOptions?.project ?? null;
    const wasmBytes = options?.processorOptions?.wasmBytes;
    if (!wasmBytes) {
      throw new Error("WASM worklet renderer requires processorOptions.wasmBytes.");
    }
    const bufferSource = wasmBytes instanceof Uint8Array ? wasmBytes : new Uint8Array(wasmBytes);
    const initOutput = initSync({ module: bufferSource });
    this.memory = initOutput.memory;
  }

  configure(config) {
    this.sampleRateInternal = config.sampleRate || this.sampleRateInternal;
    this.blockSize = config.blockSize || this.blockSize;
  }

  setDefaultProject(project) {
    this.defaultProject = project;
  }

  startStream(options) {
    const project = options.project || this.defaultProject;
    if (!project) {
      return null;
    }
    return new WasmWorkletRenderStream(this, { ...options, project });
  }

  get project() {
    return this.defaultProject;
  }
}

export const createWasmRenderer = (config = {}) => new WasmWorkletRenderer(config);

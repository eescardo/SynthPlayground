import { compareScheduledEvents } from "./synth-worklet-runtime.js";
import {
  compileAudioProjectToWasmSubsetCore,
  compileSchedulerEventsToWasmSubsetCore
} from "./synth-worklet-wasm-compiler-core.js";

export const DEFAULT_RANDOM_SEED = 0x1234_5678;
export const MACRO_EVENT_LEAD_SAMPLES = 256;

export class NullPort {
  constructor() {
    this.onmessage = null;
  }

  postMessage() {}
}

export const resolveRandomSeed = (value) =>
  Number.isFinite(value) ? Number(value) >>> 0 : DEFAULT_RANDOM_SEED;

export class SharedWasmRenderStream {
  constructor(renderer, options, implementation) {
    this.port = renderer.port;
    this.renderer = renderer;
    this.project = options.project;
    this.projectSpec = implementation.compileProject(this.project, { blockSize: renderer.blockSize });
    this.trackRuntimes = this.project.tracks.map((track) => ({ track }));
    this.eventQueue = [...(options.events || [])].sort(compareScheduledEvents);
    this.transportSessionId = Number.isFinite(options.sessionId) ? options.sessionId : 1;
    this.songSampleCounter = options.songStartSample || 0;
    this.previewing = options.mode === "preview";
    this.previewRemainingSamples = this.previewing ? Number(options.durationSamples || 0) : 0;
    this.previewId = options.previewId;
    this.captureProbes = options.captureProbes || [];
    this.stopped = false;
    this.implementation = implementation;
    this.previewCaptureState = null;
    this.engine = implementation.createEngine(renderer, this.project, this.projectSpec, options);

    const compiledEvents = implementation.compileEvents(this.project, this.projectSpec, this.eventQueue);
    this.engine.start_stream(
      JSON.stringify(this.projectSpec),
      this.songSampleCounter,
      JSON.stringify(compiledEvents),
      this.transportSessionId,
      resolveRandomSeed(options.randomSeed)
    );
    if (this.previewing && this.captureProbes.length > 0) {
      this.previewCaptureState =
        implementation.preparePreviewCapture?.(renderer, this.project, this.projectSpec, options, this.engine) ?? null;
    }
  }

  maybeEmitPreviewCapture(force = false) {
    if (!this.previewCaptureState) {
      return;
    }
    const snapshot = this.implementation.readPreviewCapture?.(this.renderer, this.engine, this.previewCaptureState, force);
    if (!snapshot) {
      return;
    }
    const { capturedSamples, captures } = snapshot;
    if (!force && capturedSamples - this.previewCaptureState.lastEmittedCapturedSamples < 1024) {
      return;
    }
    this.previewCaptureState.lastEmittedCapturedSamples = capturedSamples;
    this.port.postMessage({
      type: "PREVIEW_CAPTURE",
      previewId: this.previewId,
      captures: captures.map((capture) => {
        const meta = this.previewCaptureState.metaByProbeId.get(capture.probeId);
        return meta
          ? {
              probeId: capture.probeId,
              kind: meta.kind,
              target: meta.target,
              sampleRate: this.renderer.sampleRateInternal,
              durationSamples: meta.durationSamples,
              capturedSamples,
              samples: capture.samples
            }
          : null;
      }).filter(Boolean)
    });
    if (force) {
      this.previewCaptureState = null;
    }
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
    const memory = this.implementation.getMemory(this.renderer);
    const blockSize = this.engine.block_size();
    const leftView = new Float32Array(memory.buffer, this.engine.left_ptr(), blockSize);
    const rightView = new Float32Array(memory.buffer, this.engine.right_ptr(), blockSize);
    leftOut.set(leftView.subarray(0, leftOut.length));
    if (rightOut !== leftOut) {
      rightOut.set(rightView.subarray(0, rightOut.length));
    }
    this.songSampleCounter += leftOut.length;

    if (this.previewing) {
      this.previewRemainingSamples -= leftOut.length;
      this.maybeEmitPreviewCapture(false);
      if (this.previewRemainingSamples <= 0) {
        this.stop();
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
    this.engine.enqueue_events(JSON.stringify(this.implementation.compileEvents(this.project, this.projectSpec, events)));
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
    this.maybeEmitPreviewCapture(true);
    this.engine.stop();
    this.eventQueue.length = 0;
  }
}

export class SharedWasmRenderer {
  constructor(options = {}, implementation) {
    this.port = new NullPort();
    this.sampleRateInternal = options?.processorOptions?.sampleRate ?? 48000;
    this.blockSize = options?.processorOptions?.blockSize ?? 128;
    this.defaultProject = options?.processorOptions?.project ?? null;
    this.implementation = implementation;
    if (options?.processorOptions) {
      this.configure(options.processorOptions);
    }
  }

  configure(config) {
    this.sampleRateInternal = config.sampleRate || this.sampleRateInternal;
    this.blockSize = config.blockSize || this.blockSize;
    if (config.project) {
      this.defaultProject = config.project;
    }
    this.implementation.configure?.(this, config);
  }

  setDefaultProject(project) {
    this.defaultProject = project;
  }

  startStream(options) {
    const project = options.project || this.defaultProject;
    if (!project) {
      return null;
    }
    this.implementation.prepare?.(this, options);
    return new SharedWasmRenderStream(this, { ...options, project }, this.implementation);
  }

  get project() {
    return this.defaultProject;
  }
}

export const defaultCompileProject = (project, options) => compileAudioProjectToWasmSubsetCore(project, options);
export const defaultCompileEvents = (project, projectSpec, events) =>
  compileSchedulerEventsToWasmSubsetCore(project, projectSpec, events);

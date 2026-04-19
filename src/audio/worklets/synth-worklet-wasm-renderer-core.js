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
    this.engine = implementation.createEngine(renderer, this.project, this.projectSpec, options);
    this.mirrorStream = implementation.createPreviewMirror?.(renderer, { ...options, project: this.project }) ?? null;
    this.previewScratch = null;

    const compiledEvents = implementation.compileEvents(this.project, this.projectSpec, this.eventQueue);
    this.engine.start_stream(
      JSON.stringify(this.projectSpec),
      this.songSampleCounter,
      JSON.stringify(compiledEvents),
      this.transportSessionId,
      resolveRandomSeed(options.randomSeed)
    );
  }

  processMirrorBlock(frameCount) {
    if (!this.mirrorStream) {
      return;
    }
    if (!this.previewScratch || this.previewScratch.left.length !== frameCount) {
      this.previewScratch = {
        left: new Float32Array(frameCount),
        right: new Float32Array(frameCount)
      };
    } else {
      this.previewScratch.left.fill(0);
      this.previewScratch.right.fill(0);
    }
    this.mirrorStream.processBlock([this.previewScratch.left, this.previewScratch.right]);
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
      this.processMirrorBlock(leftOut.length);
      this.previewRemainingSamples -= leftOut.length;
      if (this.previewRemainingSamples <= 0) {
        this.stop();
        if (this.captureProbes.length > 0 && !this.mirrorStream) {
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
    this.engine.stop();
    this.eventQueue.length = 0;
    this.mirrorStream?.stop();
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

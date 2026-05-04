import { compareScheduledEvents } from "../shared/synth-renderer-events.js";
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

const areEventsSorted = (events) => {
  for (let index = 1; index < events.length; index += 1) {
    if (compareScheduledEvents(events[index - 1], events[index]) > 0) {
      return false;
    }
  }
  return true;
};

export class SharedWasmRenderStream {
  constructor(renderer, options, implementation) {
    this.port = renderer.port;
    this.renderer = renderer;
    this.project = options.project;
    const projectPlan = renderer.getProjectPlan(this.project);
    this.projectSpec = projectPlan.projectSpec;
    this.projectSpecJson = projectPlan.projectSpecJson;
    this.trackRuntimes = this.project.tracks.map((track) => ({ track }));
    const inputEvents = options.events || [];
    this.eventQueue = areEventsSorted(inputEvents) ? [...inputEvents] : [...inputEvents].sort(compareScheduledEvents);
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
      this.projectSpecJson,
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
    const capturedSamples =
      this.implementation.getPreviewCaptureSampleCount?.(this.renderer, this.engine, this.previewCaptureState) ?? null;
    if (!Number.isFinite(capturedSamples)) {
      return;
    }
    if (!force && capturedSamples - this.previewCaptureState.lastEmittedCapturedSamples < 1024) {
      return;
    }
    let snapshot = null;
    try {
      snapshot = this.implementation.readPreviewCapture?.(this.renderer, this.engine, this.previewCaptureState, force);
    } catch {
      return;
    }
    if (!snapshot) {
      return;
    }
    const { captures } = snapshot;
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

  consumeProcessedEvents() {
    while (this.eventQueue.length > 0) {
      const next = this.eventQueue[0];
      if (!next || !Number.isFinite(next.sampleTime) || next.sampleTime <= this.songSampleCounter) {
        this.eventQueue.shift();
        continue;
      }
      break;
    }
  }

  hasActiveVoices() {
    // Preview mode can outlive the audible note duration; this lets us stop as soon as
    // every released voice has fully decayed instead of waiting for the full preview timeout.
    return Boolean(this.engine.has_active_voices?.());
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
    this.consumeProcessedEvents();

    if (this.previewing) {
      this.previewRemainingSamples -= leftOut.length;
      this.maybeEmitPreviewCapture(false);
      if (this.previewRemainingSamples <= 0) {
        this.maybeEmitPreviewCapture(true);
        this.stop({ emitPreviewCapture: false });
      } else if (this.eventQueue.length === 0 && !this.hasActiveVoices()) {
        // Long-held keyboard previews schedule a generous duration up front, then rely on
        // NoteOff plus voice-idle detection to end naturally once the release tail is done.
        this.maybeEmitPreviewCapture(true);
        this.stop({ emitPreviewCapture: false });
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

  stop(options = {}) {
    const emitPreviewCapture = Boolean(options.emitPreviewCapture);
    this.stopped = true;
    if (emitPreviewCapture) {
      this.maybeEmitPreviewCapture(true);
    }
    this.engine.stop();
    this.eventQueue.length = 0;
    if (!emitPreviewCapture) {
      this.previewCaptureState = null;
    }
  }
}

export class SharedWasmRenderer {
  constructor(options = {}, implementation) {
    this.port = new NullPort();
    this.sampleRateInternal = options?.processorOptions?.sampleRate ?? 48000;
    this.blockSize = options?.processorOptions?.blockSize ?? 128;
    this.defaultProject = options?.processorOptions?.project ?? null;
    this.implementation = implementation;
    this.projectPlanCache = null;
    if (options?.processorOptions) {
      this.configure(options.processorOptions);
    }
  }

  configure(config) {
    const nextBlockSize = config.blockSize || this.blockSize;
    if (nextBlockSize !== this.blockSize) {
      this.projectPlanCache = null;
    }
    this.sampleRateInternal = config.sampleRate || this.sampleRateInternal;
    this.blockSize = nextBlockSize;
    if (config.project) {
      this.defaultProject = config.project;
      this.projectPlanCache = null;
    }
    this.implementation.configure?.(this, config);
    if (config.project) {
      this.getProjectPlan(config.project);
    }
  }

  setDefaultProject(project) {
    if (project !== this.defaultProject) {
      this.projectPlanCache = null;
    }
    this.defaultProject = project;
    this.getProjectPlan(project);
  }

  getProjectPlan(project) {
    const cached = this.projectPlanCache;
    // Project snapshots are immutable once configured. Object identity is
    // therefore a valid cache key for the planned WASM project layout.
    if (cached && cached.project === project && cached.blockSize === this.blockSize) {
      return cached;
    }
    const projectSpec = this.implementation.compileProject(project, { blockSize: this.blockSize });
    const next = {
      project,
      blockSize: this.blockSize,
      projectSpec,
      projectSpecJson: JSON.stringify(projectSpec)
    };
    this.projectPlanCache = next;
    return next;
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

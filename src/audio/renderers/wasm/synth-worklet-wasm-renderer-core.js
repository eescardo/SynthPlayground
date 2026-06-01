import { compareScheduledEvents } from "../shared/synth-renderer-events.js";
import { TRACK_VOLUME_AUTOMATION_ID } from "../shared/synth-renderer-constants.js";
import {
  compileAudioProjectPlanToWasmSubsetCore,
  compileSchedulerEventsToWasmSubsetCore
} from "./synth-worklet-wasm-compiler-core.js";

export const DEFAULT_RANDOM_SEED = 0x1234_5678;
export const MACRO_EVENT_LEAD_SAMPLES = 256;
export const PREVIEW_CAPTURE_EMIT_INTERVAL_SAMPLES = 8192;
export const FINAL_PREVIEW_CAPTURE_READ_FAILURE_LIMIT = 3;

export class NullPort {
  constructor() {
    this.onmessage = null;
  }

  postMessage() {}
}

export const resolveRandomSeed = (value) => (Number.isFinite(value) ? Number(value) >>> 0 : DEFAULT_RANDOM_SEED);

const installWasmSampleAssets = (engine, sampleAssetsByTrack) => {
  if (typeof engine.stage_sample_asset !== "function") {
    return;
  }
  (sampleAssetsByTrack || []).forEach((assets, trackIndex) => {
    for (const asset of assets || []) {
      engine.stage_sample_asset(trackIndex, asset.nodeId, asset.sampleRate, asset.samples);
    }
  });
};

const areEventsSorted = (events) => {
  for (let index = 1; index < events.length; index += 1) {
    if (compareScheduledEvents(events[index - 1], events[index]) > 0) {
      return false;
    }
  }
  return true;
};

const resolveSharedCaptureBufferMap = (captureSharedBuffers) => {
  if (!Array.isArray(captureSharedBuffers) || captureSharedBuffers.length === 0) {
    return new Map();
  }
  const SharedArrayBufferCtor = globalThis.SharedArrayBuffer;
  if (typeof SharedArrayBufferCtor !== "function") {
    return new Map();
  }
  return new Map(
    captureSharedBuffers
      .filter((entry) => entry?.probeId && entry.sampleBuffer instanceof SharedArrayBufferCtor)
      .map((entry) => [
        entry.probeId,
        {
          sampleBuffer: entry.sampleBuffer,
          capacitySamples: Math.max(0, Math.floor(entry.capacitySamples || 0))
        }
      ])
  );
};

const writeCaptureSamplesToSharedBuffer = (capture, sharedBuffer) => {
  if (!sharedBuffer?.sampleBuffer) {
    return null;
  }
  const capacitySamples = Math.min(
    sharedBuffer.capacitySamples,
    sharedBuffer.sampleBuffer.byteLength / Float32Array.BYTES_PER_ELEMENT
  );
  if (capacitySamples <= 0) {
    return null;
  }
  const sampleLength = Math.min(capacitySamples, capture.samples?.length || 0);
  const view = new Float32Array(sharedBuffer.sampleBuffer, 0, sampleLength);
  for (let index = 0; index < sampleLength; index += 1) {
    view[index] = Number(capture.samples[index] || 0);
  }
  return {
    sampleBuffer: sharedBuffer.sampleBuffer,
    sampleLength
  };
};

const writeWasmCaptureSamplesToSharedBuffer = (
  implementation,
  renderer,
  engine,
  capture,
  sharedBuffer,
  copiedSampleCountByProbeId
) => {
  if (!sharedBuffer?.sampleBuffer || !implementation.getPreviewCaptureSamplesPointer) {
    return null;
  }
  const memory = implementation.getMemory(renderer);
  const capacitySamples = Math.min(
    sharedBuffer.capacitySamples,
    sharedBuffer.sampleBuffer.byteLength / Float32Array.BYTES_PER_ELEMENT
  );
  const sourceLength =
    implementation.getPreviewCaptureSamplesLength?.(renderer, engine, capture.probeId) ?? capture.samples?.length ?? 0;
  const sampleLength = Math.min(capacitySamples, Math.max(0, Math.floor(sourceLength)));
  if (sampleLength <= 0) {
    return null;
  }
  const pointer = implementation.getPreviewCaptureSamplesPointer(renderer, engine, capture.probeId);
  if (!Number.isFinite(pointer) || pointer <= 0) {
    return null;
  }
  const previousSampleLength = Math.min(
    sampleLength,
    Math.max(0, Math.floor(copiedSampleCountByProbeId?.get(capture.probeId) ?? 0))
  );
  const copyLength = sampleLength - previousSampleLength;
  if (copyLength > 0) {
    const source = new Float32Array(
      memory.buffer,
      pointer + previousSampleLength * Float32Array.BYTES_PER_ELEMENT,
      copyLength
    );
    new Float32Array(sharedBuffer.sampleBuffer, previousSampleLength * Float32Array.BYTES_PER_ELEMENT, copyLength).set(
      source
    );
  }
  copiedSampleCountByProbeId?.set(capture.probeId, sampleLength);
  return {
    sampleBuffer: sharedBuffer.sampleBuffer,
    sampleLength,
    sampleStride: 1
  };
};

export class SharedWasmRenderStream {
  constructor(renderer, options, implementation) {
    this.port = renderer.port;
    this.renderer = renderer;
    this.renderProject = options.renderProject;
    this.project = this.renderProject.project;
    const projectPlan = renderer.getProjectPlan(this.renderProject);
    this.projectSpec = projectPlan.projectSpec;
    this.projectSpecJson = projectPlan.projectSpecJson;
    this.sampleAssetsByTrack = projectPlan.sampleAssetsByTrack;
    this.trackRuntimes = this.project.tracks.map((track) => ({ track }));
    this.transportSessionId = Number.isFinite(options.sessionId) ? options.sessionId : 1;
    this.songSampleCounter = options.songStartSample || 0;
    this.previewing = options.mode === "preview";
    this.mutedTrackIds = this.previewing
      ? new Set()
      : new Set(this.project.tracks.filter((track) => Boolean(track.mute)).map((track) => track.id));
    const inputEvents = this.filterMutedTrackEvents(options.events || []);
    this.eventQueue = areEventsSorted(inputEvents) ? [...inputEvents] : [...inputEvents].sort(compareScheduledEvents);
    this.previewRemainingSamples = this.previewing ? Number(options.durationSamples || 0) : 0;
    this.previewId = options.previewId;
    this.captureProbes = options.captureProbes || [];
    this.stopped = false;
    this.finalizingPreviewCapture = false;
    this.finalPreviewCaptureReadFailures = 0;
    this.implementation = implementation;
    this.previewCaptureState = null;
    this.engine = implementation.createEngine(renderer, this.project, this.projectSpec, options);

    installWasmSampleAssets(this.engine, this.sampleAssetsByTrack);
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

  recordFinalPreviewCaptureReadFailure() {
    this.finalPreviewCaptureReadFailures += 1;
  }

  resetFinalPreviewCaptureReadFailures() {
    this.finalPreviewCaptureReadFailures = 0;
  }

  maybeEmitPreviewCapture(force = false) {
    if (!this.previewCaptureState) {
      return true;
    }
    const capturedSamples =
      this.implementation.getPreviewCaptureSampleCount?.(this.renderer, this.engine, this.previewCaptureState) ?? null;
    if (!Number.isFinite(capturedSamples)) {
      if (force) {
        this.recordFinalPreviewCaptureReadFailure();
      }
      return false;
    }
    if (
      !force &&
      capturedSamples - this.previewCaptureState.lastEmittedCapturedSamples < PREVIEW_CAPTURE_EMIT_INTERVAL_SAMPLES
    ) {
      return false;
    }
    let snapshot = null;
    try {
      snapshot = this.implementation.readPreviewCapture?.(this.renderer, this.engine, this.previewCaptureState, force);
    } catch {
      if (force) {
        this.recordFinalPreviewCaptureReadFailure();
      }
      return false;
    }
    if (!snapshot) {
      if (force) {
        this.recordFinalPreviewCaptureReadFailure();
      }
      return false;
    }
    if (force) {
      this.resetFinalPreviewCaptureReadFailures();
    }
    const { captures } = snapshot;
    this.previewCaptureState.lastEmittedCapturedSamples = capturedSamples;
    const finalComplete =
      !force ||
      captures.every((capture) => {
        const meta = this.previewCaptureState.metaByProbeId.get(capture.probeId);
        if (meta?.kind !== "spectrum") {
          return true;
        }
        return capture.finalSpectrum?.complete !== false;
      });
    const captureComplete = force && finalComplete;
    this.port.postMessage({
      type: "PREVIEW_CAPTURE",
      previewId: this.previewId,
      captures: captures
        .map((capture) => {
          const meta = this.previewCaptureState.metaByProbeId.get(capture.probeId);
          const shouldUseSpectrumFrames = meta?.kind === "spectrum" && capture.spectrumFrames;
          const sharedBuffer = this.previewCaptureState.sharedBufferByProbeId?.get(capture.probeId);
          const sharedSamples = shouldUseSpectrumFrames
            ? null
            : (writeWasmCaptureSamplesToSharedBuffer(
                this.implementation,
                this.renderer,
                this.engine,
                capture,
                sharedBuffer,
                this.previewCaptureState.copiedSampleCountByProbeId
              ) ?? writeCaptureSamplesToSharedBuffer(capture, sharedBuffer));
          const sampleStride = Math.max(1, sharedSamples?.sampleStride || capture.sampleStride || 1);
          return meta
            ? {
                probeId: capture.probeId,
                kind: meta.kind,
                target: meta.target,
                sampleRate: this.renderer.sampleRateInternal / sampleStride,
                durationSamples: Math.ceil(meta.durationSamples / sampleStride),
                capturedSamples: Math.ceil(Math.min(capturedSamples, meta.durationSamples) / sampleStride),
                captureComplete,
                sourceCapturedSamples: Math.min(capturedSamples, meta.durationSamples),
                sampleStride,
                samples: sharedSamples || shouldUseSpectrumFrames ? [] : capture.samples,
                sampleBuffer: sharedSamples?.sampleBuffer,
                sampleLength: sharedSamples?.sampleLength,
                spectrumFrames: capture.spectrumFrames,
                finalSpectrum: capture.finalSpectrum,
                finalScope: capture.finalScope,
                adsrEstimate: capture.adsrEstimate
              }
            : null;
        })
        .filter(Boolean)
    });
    if (force && finalComplete) {
      this.previewCaptureState = null;
    }
    return finalComplete;
  }

  beginFinalPreviewCapture() {
    if (!this.previewCaptureState) {
      this.stop({ emitPreviewCapture: false });
      return;
    }
    this.previewRemainingSamples = 0;
    this.finalizingPreviewCapture = true;
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
    if (this.finalizingPreviewCapture) {
      leftOut.fill(0);
      if (rightOut !== leftOut) {
        rightOut.fill(0);
      }
      // TODO(#86): Move final probe extraction off the AudioWorklet render callback.
      if (this.maybeEmitPreviewCapture(true)) {
        this.stop({ emitPreviewCapture: false });
      } else if (this.finalPreviewCaptureReadFailures >= FINAL_PREVIEW_CAPTURE_READ_FAILURE_LIMIT) {
        this.stop({ emitPreviewCapture: false });
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
        this.beginFinalPreviewCapture();
      } else if (this.eventQueue.length === 0 && !this.hasActiveVoices()) {
        // Long-held keyboard previews schedule a generous duration up front, then rely on
        // NoteOff plus voice-idle detection to end naturally once the release tail is done.
        this.beginFinalPreviewCapture();
      }
    }

    return keepAlive;
  }

  enqueueEvents(events) {
    if (!events || events.length === 0 || !this.project) {
      return;
    }
    const activeEvents = this.filterMutedTrackEvents(events);
    if (activeEvents.length === 0) {
      return;
    }
    this.eventQueue.push(...activeEvents);
    this.eventQueue.sort(compareScheduledEvents);
    this.engine.enqueue_events(
      JSON.stringify(this.implementation.compileEvents(this.project, this.projectSpec, activeEvents))
    );
  }

  filterMutedTrackEvents(events) {
    if (this.mutedTrackIds.size === 0) {
      return events;
    }
    return events.filter((event) => !("trackId" in event) || !this.mutedTrackIds.has(event.trackId));
  }

  dispatchTransportCommand(command) {
    if (!command) {
      return;
    }
    if (command.type === "SetTrackMute") {
      if (command.muted) {
        this.mutedTrackIds.add(command.trackId);
        this.stopTrack(command.trackId);
      } else {
        this.mutedTrackIds.delete(command.trackId);
      }
      return;
    }
    if (command.type === "SetTrackVolume" && !this.mutedTrackIds.has(command.trackId)) {
      this.setMacroValue(command.trackId, TRACK_VOLUME_AUTOMATION_ID, command.normalized);
    }
  }

  stopTrack(trackId) {
    const trackIndex = this.project.tracks.findIndex((track) => track.id === trackId);
    if (trackIndex < 0) {
      return;
    }
    this.eventQueue = this.eventQueue.filter((event) => {
      if ("trackId" in event) {
        return event.trackId !== trackId;
      }
      return true;
    });
    this.engine.stop_track?.(trackIndex);
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
    this.defaultRenderProject = options?.processorOptions?.renderProject ?? null;
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
    if (config.renderProject) {
      this.defaultRenderProject = config.renderProject;
      this.projectPlanCache = null;
    }
    this.implementation.configure?.(this, config);
    if (config.renderProject) {
      this.getProjectPlan(config.renderProject);
    }
  }

  setDefaultProject(renderProject) {
    if (renderProject !== this.defaultRenderProject) {
      this.projectPlanCache = null;
    }
    this.defaultRenderProject = renderProject;
    this.getProjectPlan(renderProject);
  }

  getProjectPlan(renderProject) {
    const cached = this.projectPlanCache;
    // Project snapshots are immutable once configured. Object identity is
    // therefore a valid cache key for the planned WASM project layout.
    if (cached && cached.renderProject === renderProject && cached.blockSize === this.blockSize) {
      return cached;
    }
    const compiledProject = this.implementation.compileProject(renderProject, {
      blockSize: this.blockSize
    });
    const next = {
      renderProject,
      project: renderProject.project,
      blockSize: this.blockSize,
      projectSpec: compiledProject.projectSpec,
      projectSpecJson: JSON.stringify(compiledProject.projectSpec),
      sampleAssetsByTrack: compiledProject.sampleAssetsByTrack
    };
    this.projectPlanCache = next;
    return next;
  }

  startStream(options) {
    const renderProject = options.renderProject || this.defaultRenderProject;
    if (!renderProject) {
      return null;
    }
    this.implementation.prepare?.(this, options);
    return new SharedWasmRenderStream(this, { ...options, renderProject }, this.implementation);
  }

  resolveSharedCaptureBufferMap(captureSharedBuffers) {
    return resolveSharedCaptureBufferMap(captureSharedBuffers);
  }

  get project() {
    return this.defaultRenderProject?.project ?? null;
  }

  get renderProject() {
    return this.defaultRenderProject;
  }
}

export const defaultCompileProject = (project, options) => compileAudioProjectPlanToWasmSubsetCore(project, options);
export const defaultCompileEvents = (project, projectSpec, events) =>
  compileSchedulerEventsToWasmSubsetCore(project, projectSpec, events);

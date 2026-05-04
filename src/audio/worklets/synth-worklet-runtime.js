import { createWasmRenderer } from "./synth-worklet-wasm-renderer.js";

const BaseAudioWorkletProcessor = globalThis.AudioWorkletProcessor || class {
  constructor() {
    this.port = {
      onmessage: null,
      postMessage() {}
    };
  }
};

let rendererFactory = (config = {}) => createWasmRenderer(config);

export const setRendererFactory = (nextFactory) => {
  rendererFactory = typeof nextFactory === "function" ? nextFactory : ((config = {}) => createWasmRenderer(config));
};

export const resetRendererFactory = () => {
  rendererFactory = (config = {}) => createWasmRenderer(config);
};

export const createRenderer = (config = {}) => rendererFactory(config);

const formatErrorMessage = (error) => error instanceof Error ? error.message : String(error);

export class SynthWorkletProcessor extends BaseAudioWorkletProcessor {
  constructor(options) {
    super();
    this.renderer = createRenderer(options);
    this.currentStream = null;
    this.transportSessionId = 0;
    this.port.onmessage = (event) => this.onMessage(event.data);
    this.renderer.port = this.port;

    const processorOptions = options && options.processorOptions ? options.processorOptions : null;
    if (processorOptions?.transport?.isPlaying && this.renderer.project) {
      this.currentStream = this.startStreamSafely("start_stream", {
        project: this.renderer.project,
        songStartSample: processorOptions.transport.songStartSample,
        events: processorOptions.transport.events || [],
        sessionId: processorOptions.transport.sessionId,
        randomSeed: processorOptions.transport.randomSeed,
        mode: "transport"
      });
      this.transportSessionId = this.currentStream?.transportSessionId ?? 0;
    }
  }

  reportRuntimeError(phase, error) {
    this.port.postMessage({
      type: "RUNTIME_ERROR",
      phase,
      error: formatErrorMessage(error)
    });
  }

  stopCurrentStream(phase = "stop_stream") {
    if (this.currentStream) {
      const currentStream = this.currentStream;
      this.currentStream = null;
      try {
        currentStream.stop();
      } catch (error) {
        this.reportRuntimeError(phase, error);
      }
    }
  }

  startStreamSafely(phase, options) {
    try {
      return this.renderer.startStream(options);
    } catch (error) {
      this.reportRuntimeError(phase, error);
      return null;
    }
  }

  replaceCurrentStream(nextStream) {
    this.currentStream = nextStream;
  }

  onMessage(message) {
    try {
      this.handleMessage(message);
    } catch (error) {
      this.reportRuntimeError("message", error);
    }
  }

  handleMessage(message) {
    switch (message.type) {
      case "INIT":
        try {
          this.renderer.configure(message);
          this.port.postMessage({ type: "INIT_READY" });
        } catch (error) {
          this.port.postMessage({
            type: "INIT_ERROR",
            error: error instanceof Error ? error.message : String(error)
          });
        }
        break;
      case "SET_PROJECT":
        this.renderer.setDefaultProject(message.project);
        break;
      case "TRANSPORT":
        this.transportSessionId = Number.isFinite(message.sessionId) ? message.sessionId : this.transportSessionId + 1;
        if (!message.isPlaying) {
          this.stopCurrentStream();
          break;
        }
        this.stopCurrentStream();
        this.replaceCurrentStream(this.startStreamSafely("start_stream", {
          project: this.renderer.project,
          songStartSample: message.songStartSample || 0,
          events: message.events || [],
          sessionId: this.transportSessionId,
          randomSeed: message.randomSeed,
          mode: "transport"
        }));
        break;
      case "PREVIEW":
        this.stopCurrentStream();
        this.replaceCurrentStream(this.startStreamSafely("start_stream", {
          project: message.project || this.renderer.project,
          songStartSample: 0,
          events: message.events || [],
          mode: "preview",
          durationSamples: message.durationSamples || 0,
          ignoreVolume: message.ignoreVolume,
          previewId: message.previewId,
          trackId: message.trackId,
          captureProbes: message.captureProbes,
          randomSeed: message.randomSeed
        }));
        break;
      case "EVENTS":
        if (Number.isFinite(message.sessionId) && message.sessionId !== this.transportSessionId) {
          break;
        }
        this.currentStream?.enqueueEvents(message.events || []);
        break;
      case "MACRO":
        this.currentStream?.setMacroValue?.(message.trackId, message.macroId, message.normalized);
        break;
      case "RECORDING":
        this.currentStream?.setRecordingTrack?.(message.trackId);
        break;
      default:
        break;
    }
  }

  get backend() {
    return this.currentStream ?? this.renderer;
  }

  get project() {
    return this.currentStream?.project ?? this.renderer.project;
  }

  get trackRuntimes() {
    return this.currentStream?.trackRuntimes ?? [];
  }

  get eventQueue() {
    return this.currentStream?.eventQueue ?? [];
  }

  process(_inputs, outputs) {
    if (!this.currentStream) {
      const left = outputs[0][0];
      const right = outputs[0][1] || outputs[0][0];
      left.fill(0);
      if (right !== left) {
        right.fill(0);
      }
      return true;
    }
    let keepAlive = true;
    try {
      keepAlive = this.currentStream.processBlock(outputs[0]);
    } catch (error) {
      this.reportRuntimeError("process_block", error);
      this.currentStream = null;
      const left = outputs[0][0];
      const right = outputs[0][1] || outputs[0][0];
      left.fill(0);
      if (right !== left) {
        right.fill(0);
      }
      return true;
    }
    if (this.currentStream.stopped) {
      this.currentStream = null;
    }
    return keepAlive;
  }
}

import { beforeEach, describe, expect, it, vi } from "vitest";
import { compareScheduledEvents } from "@/audio/renderers/shared/synth-renderer-events.js";

type RuntimeModule = typeof import("../synth-worklet-runtime.js");
type WorkletGlobal = typeof globalThis & {
  AudioWorkletProcessor?: new () => {
    port: { onmessage: ((event: unknown) => void) | null; postMessage: (...args: unknown[]) => void };
  };
  registerProcessor?: (name: string, processorCtor: unknown) => void;
};

const createProject = () => ({
  id: "project_1",
  name: "Project",
  global: {
    sampleRate: 48000 as const,
    tempo: 120,
    meter: "4/4" as const,
    gridBeats: 0.25,
    loop: []
  },
  tracks: [],
  patches: [],
  masterFx: {
    compressorEnabled: false,
    limiterEnabled: false,
    makeupGain: 0
  },
  ui: {
    patchWorkspace: {
      activeTabId: "tab_1",
      tabs: []
    }
  },
  createdAt: 0,
  updatedAt: 0
});

async function loadRuntimeModule(): Promise<RuntimeModule> {
  vi.resetModules();
  const workletGlobal = globalThis as WorkletGlobal;
  workletGlobal.AudioWorkletProcessor = class {
    port = { onmessage: null, postMessage() {} };
  };
  workletGlobal.registerProcessor = vi.fn();
  return import("../synth-worklet-runtime.js");
}

beforeEach(() => {
  const workletGlobal = globalThis as WorkletGlobal;
  delete workletGlobal.AudioWorkletProcessor;
  delete workletGlobal.registerProcessor;
});

describe("synth worklet runtime", () => {
  it("orders note-off before note-on on the same sample", () => {
    const events = [
      {
        id: "note-on",
        type: "NoteOn" as const,
        sampleTime: 1024,
        source: "timeline" as const,
        trackId: "track_1",
        noteId: "note_1",
        pitchVoct: 0,
        velocity: 1
      },
      {
        id: "note-off",
        type: "NoteOff" as const,
        sampleTime: 1024,
        source: "timeline" as const,
        trackId: "track_1",
        noteId: "note_1"
      }
    ];

    events.sort(compareScheduledEvents);

    expect(events.map((event) => event.type)).toEqual(["NoteOff", "NoteOn"]);
  });

  it("acknowledges successful renderer initialization", async () => {
    const runtime = await loadRuntimeModule();
    const portMessages: unknown[] = [];
    runtime.setRendererFactory(() => ({
      port: {
        onmessage: null,
        postMessage(message: unknown) {
          portMessages.push(message);
        }
      },
      sampleRateInternal: 48000,
      blockSize: 128,
      project: null,
      configure() {},
      setDefaultProject() {},
      startStream() {
        return null;
      }
    }));

    const processor = new runtime.SynthWorkletProcessor({
      processorOptions: { sampleRate: 48000, blockSize: 128 }
    });
    processor.port.postMessage = (message: unknown) => {
      portMessages.push(message);
    };

    processor.onMessage({ type: "INIT", sampleRate: 48000, blockSize: 128 });

    expect(portMessages).toContainEqual({ type: "INIT_READY" });
    runtime.resetRendererFactory();
  });

  it("surfaces renderer initialization failures", async () => {
    const runtime = await loadRuntimeModule();
    const portMessages: unknown[] = [];
    runtime.setRendererFactory(() => ({
      port: {
        onmessage: null,
        postMessage(message: unknown) {
          portMessages.push(message);
        }
      },
      sampleRateInternal: 48000,
      blockSize: 128,
      project: null,
      configure() {
        throw new Error("boom");
      },
      setDefaultProject() {},
      startStream() {
        return null;
      }
    }));

    const processor = new runtime.SynthWorkletProcessor({
      processorOptions: { sampleRate: 48000, blockSize: 128 }
    });
    processor.port.postMessage = (message: unknown) => {
      portMessages.push(message);
    };

    processor.onMessage({ type: "INIT", sampleRate: 48000, blockSize: 128 });

    expect(portMessages).toContainEqual({ type: "INIT_ERROR", error: "boom" });
    runtime.resetRendererFactory();
  });

  it("routes transport events only to the active session", async () => {
    const runtime = await loadRuntimeModule();
    const enqueueEvents = vi.fn();
    const stop = vi.fn();
    const startStream = vi.fn(() => ({
      port: { onmessage: null, postMessage() {} },
      project: createProject(),
      trackRuntimes: [],
      eventQueue: [],
      stopped: false,
      transportSessionId: 7,
      processBlock() {
        return true;
      },
      enqueueEvents,
      stop,
      setMacroValue() {},
      setRecordingTrack() {}
    }));

    runtime.setRendererFactory(() => ({
      port: { onmessage: null, postMessage() {} },
      sampleRateInternal: 48000,
      blockSize: 128,
      project: createProject(),
      configure() {},
      setDefaultProject() {},
      startStream
    }));

    const processor = new runtime.SynthWorkletProcessor({
      processorOptions: { sampleRate: 48000, blockSize: 128 }
    });

    processor.onMessage({
      type: "TRANSPORT",
      isPlaying: true,
      songStartSample: 0,
      events: [],
      sessionId: 7
    });
    processor.onMessage({
      type: "EVENTS",
      events: [
        {
          id: "e1",
          type: "MacroChange",
          sampleTime: 1,
          source: "live_input",
          trackId: "t",
          macroId: "m",
          normalized: 0.5
        }
      ],
      sessionId: 6
    });
    processor.onMessage({
      type: "EVENTS",
      events: [
        {
          id: "e2",
          type: "MacroChange",
          sampleTime: 2,
          source: "live_input",
          trackId: "t",
          macroId: "m",
          normalized: 0.8
        }
      ],
      sessionId: 7
    });

    expect(startStream).toHaveBeenCalledTimes(1);
    expect(enqueueEvents).toHaveBeenCalledTimes(1);
    expect(enqueueEvents).toHaveBeenCalledWith([expect.objectContaining({ id: "e2" })]);
    runtime.resetRendererFactory();
  });

  it("releases a held preview on keyup without replacing the stream", async () => {
    const runtime = await loadRuntimeModule();
    const enqueueEvents = vi.fn();
    const startStream = vi.fn(() => ({
      port: { onmessage: null, postMessage() {} },
      project: createProject(),
      trackRuntimes: [],
      eventQueue: [],
      stopped: false,
      previewId: "preview_held",
      songSampleCounter: 512,
      processBlock() {
        return true;
      },
      enqueueEvents,
      stop() {},
      setMacroValue() {},
      setRecordingTrack() {}
    }));

    runtime.setRendererFactory(() => ({
      port: { onmessage: null, postMessage() {} },
      sampleRateInternal: 48000,
      blockSize: 128,
      project: createProject(),
      configure() {},
      setDefaultProject() {},
      startStream
    }));

    const processor = new runtime.SynthWorkletProcessor({
      processorOptions: { sampleRate: 48000, blockSize: 128 }
    });

    processor.onMessage({
      type: "PREVIEW",
      trackId: "track_1",
      previewId: "preview_held",
      events: [
        {
          id: "preview_held_on",
          type: "NoteOn",
          sampleTime: 0,
          source: "preview",
          trackId: "track_1",
          noteId: "preview_held",
          pitchVoct: 0,
          velocity: 1
        }
      ],
      durationSamples: 48000
    });
    processor.onMessage({ type: "PREVIEW_RELEASE", trackId: "track_1", previewId: "preview_held" });

    expect(startStream).toHaveBeenCalledTimes(1);
    expect(enqueueEvents).toHaveBeenCalledWith([
      expect.objectContaining({
        type: "NoteOff",
        sampleTime: 768,
        trackId: "track_1",
        noteId: "preview_held"
      })
    ]);
    runtime.resetRendererFactory();
  });

  it("force-stops a held preview release for ungated patches", async () => {
    const runtime = await loadRuntimeModule();
    const enqueueEvents = vi.fn();
    const stop = vi.fn();
    const startStream = vi.fn(() => ({
      port: { onmessage: null, postMessage() {} },
      project: createProject(),
      trackRuntimes: [],
      eventQueue: [],
      stopped: false,
      previewId: "preview_ungated",
      songSampleCounter: 512,
      processBlock() {
        return true;
      },
      enqueueEvents,
      stop,
      setMacroValue() {},
      setRecordingTrack() {}
    }));

    runtime.setRendererFactory(() => ({
      port: { onmessage: null, postMessage() {} },
      sampleRateInternal: 48000,
      blockSize: 128,
      project: createProject(),
      configure() {},
      setDefaultProject() {},
      startStream
    }));

    const processor = new runtime.SynthWorkletProcessor({
      processorOptions: { sampleRate: 48000, blockSize: 128 }
    });

    processor.onMessage({
      type: "PREVIEW",
      trackId: "track_1",
      previewId: "preview_ungated",
      events: [
        {
          id: "preview_ungated_on",
          type: "NoteOn",
          sampleTime: 0,
          source: "preview",
          trackId: "track_1",
          noteId: "preview_ungated",
          pitchVoct: 0,
          velocity: 1
        }
      ],
      durationSamples: 48000
    });
    processor.onMessage({
      type: "PREVIEW_RELEASE",
      trackId: "track_1",
      previewId: "preview_ungated",
      forceStop: true
    });

    expect(startStream).toHaveBeenCalledTimes(1);
    expect(enqueueEvents).not.toHaveBeenCalled();
    expect(stop).toHaveBeenCalledWith({ emitPreviewCapture: true });
    runtime.resetRendererFactory();
  });

  it("stops the current stream before reporting a failed stream restart", async () => {
    const runtime = await loadRuntimeModule();
    const portMessages: unknown[] = [];
    const stop = vi.fn();
    const startStream = vi.fn(() => {
      throw new Error("start exploded");
    });

    runtime.setRendererFactory(() => ({
      port: { onmessage: null, postMessage() {} },
      sampleRateInternal: 48000,
      blockSize: 128,
      project: createProject(),
      configure() {},
      setDefaultProject() {},
      startStream
    }));

    const processor = new runtime.SynthWorkletProcessor({
      processorOptions: { sampleRate: 48000, blockSize: 128 }
    });
    processor.port.postMessage = (message: unknown) => {
      portMessages.push(message);
    };
    processor.currentStream = {
      port: { onmessage: null, postMessage() {} },
      project: createProject(),
      trackRuntimes: [],
      eventQueue: [],
      stopped: false,
      processBlock() {
        return true;
      },
      enqueueEvents() {},
      stop,
      setMacroValue() {},
      setRecordingTrack() {}
    };

    expect(() =>
      processor.onMessage({
        type: "TRANSPORT",
        isPlaying: true,
        songStartSample: 0,
        events: [],
        sessionId: 8
      })
    ).not.toThrow();

    expect(stop).toHaveBeenCalledTimes(1);
    expect(startStream).toHaveBeenCalledTimes(1);
    expect(processor.currentStream).toBeNull();
    expect(portMessages).toContainEqual({
      type: "RUNTIME_ERROR",
      phase: "start_stream",
      error: "start exploded"
    });
    runtime.resetRendererFactory();
  });

  it("silences output and clears the stream when processing throws", async () => {
    const runtime = await loadRuntimeModule();
    const portMessages: unknown[] = [];

    runtime.setRendererFactory(() => ({
      port: { onmessage: null, postMessage() {} },
      sampleRateInternal: 48000,
      blockSize: 128,
      project: createProject(),
      configure() {},
      setDefaultProject() {},
      startStream() {
        return null;
      }
    }));

    const processor = new runtime.SynthWorkletProcessor({
      processorOptions: { sampleRate: 48000, blockSize: 128 }
    });
    processor.port.postMessage = (message: unknown) => {
      portMessages.push(message);
    };
    processor.currentStream = {
      port: { onmessage: null, postMessage() {} },
      project: createProject(),
      trackRuntimes: [],
      eventQueue: [],
      stopped: false,
      processBlock() {
        throw new Error("process exploded");
      },
      enqueueEvents() {},
      stop() {},
      setMacroValue() {},
      setRecordingTrack() {}
    };
    const left = new Float32Array(128).fill(1);
    const right = new Float32Array(128).fill(1);

    expect(processor.process([], [[left, right]], {})).toBe(true);

    expect(Array.from(left)).toEqual(new Array(128).fill(0));
    expect(Array.from(right)).toEqual(new Array(128).fill(0));
    expect(processor.currentStream).toBeNull();
    expect(portMessages).toContainEqual({
      type: "RUNTIME_ERROR",
      phase: "process_block",
      error: "process exploded"
    });
    runtime.resetRendererFactory();
  });

  it("outputs silence when no stream is active", async () => {
    const runtime = await loadRuntimeModule();
    runtime.setRendererFactory(() => ({
      port: { onmessage: null, postMessage() {} },
      sampleRateInternal: 48000,
      blockSize: 128,
      project: null,
      configure() {},
      setDefaultProject() {},
      startStream() {
        return null;
      }
    }));

    const processor = new runtime.SynthWorkletProcessor({
      processorOptions: { sampleRate: 48000, blockSize: 128 }
    });
    const left = new Float32Array(128).fill(1);
    const right = new Float32Array(128).fill(1);

    processor.process([], [[left, right]], {});

    expect(Array.from(left)).toEqual(new Array(128).fill(0));
    expect(Array.from(right)).toEqual(new Array(128).fill(0));
    runtime.resetRendererFactory();
  });
});

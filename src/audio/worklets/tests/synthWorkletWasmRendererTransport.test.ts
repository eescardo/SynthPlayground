import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createWasmRendererTestProject,
  createWasmRendererTestTrack
} from "@/audio/worklets/tests/wasmRendererTestFixtures";

const sharedMemory = new WebAssembly.Memory({ initial: 1 });
const blockSize = 128;
const leftView = new Float32Array(sharedMemory.buffer, 0, blockSize);
const rightView = new Float32Array(sharedMemory.buffer, blockSize * Float32Array.BYTES_PER_ELEMENT, blockSize);
const engineStopTrack = vi.fn();

vi.mock("../synth-worklet-dsp-bindgen.js", () => {
  class MockWasmSubsetEngine {
    constructor() {
      leftView.fill(0.25);
      rightView.fill(0.25);
    }

    start_stream() {}
    enqueue_events() {}
    set_sample_asset() {}
    configure_preview_probe_capture() {}
    process_block() {
      return true;
    }
    has_active_voices() {
      return false;
    }
    preview_capture_state_json() {
      return JSON.stringify({ capturedSamples: 0, captures: [] });
    }
    preview_capture_sample_count() {
      return 0;
    }
    preview_capture_samples_ptr() {
      return 0;
    }
    preview_capture_samples_len() {
      return 0;
    }
    stop() {}
    stop_track(trackIndex: number) {
      engineStopTrack(trackIndex);
    }
    left_ptr() {
      return 0;
    }
    right_ptr() {
      return blockSize * Float32Array.BYTES_PER_ELEMENT;
    }
    block_size() {
      return blockSize;
    }
    set_profiling_enabled() {}
  }

  return {
    initSync: () => ({ memory: sharedMemory }),
    WasmSubsetEngine: MockWasmSubsetEngine
  };
});

beforeEach(() => {
  vi.resetModules();
  engineStopTrack.mockReset();
  leftView.fill(0);
  rightView.fill(0);
});

describe("WASM worklet renderer transport behavior", () => {
  it("hard-stops muted tracks and accepts track events after unmute", async () => {
    const { createWasmRenderer } = await import("../synth-worklet-wasm-renderer.js");

    const project = createWasmRendererTestProject({
      track: createWasmRendererTestTrack({
        id: "track_1",
        notes: [{ id: "note_1", pitchStr: "C3", startBeat: 0, durationBeats: 8, velocity: 1 }]
      })
    });
    project.tracks.push(createWasmRendererTestTrack({ id: "track_2", name: "Track 2" }));
    const renderer = createWasmRenderer({
      processorOptions: {
        sampleRate: 48000,
        blockSize,
        renderProject: { project },
        wasmBytes: new Uint8Array([0, 97, 115, 109]).buffer
      }
    });

    const stream = renderer.startStream({
      renderProject: { project },
      songStartSample: 0,
      mode: "transport",
      events: [
        {
          id: "track_1_on",
          type: "NoteOn",
          sampleTime: 0,
          source: "timeline",
          trackId: "track_1",
          noteId: "note_1",
          pitchVoct: 0,
          velocity: 1
        },
        {
          id: "track_2_on",
          type: "NoteOn",
          sampleTime: 0,
          source: "timeline",
          trackId: "track_2",
          noteId: "note_2",
          pitchVoct: 0,
          velocity: 1
        }
      ],
      sessionId: 1
    });

    expect(stream).not.toBeNull();
    const mutableStream = stream as typeof stream & {
      dispatchTransportCommand(command: { type: "SetTrackMute"; trackId: string; muted: boolean }): void;
      enqueueEvents(events: NonNullable<typeof stream>["eventQueue"]): void;
    };
    mutableStream!.dispatchTransportCommand({ type: "SetTrackMute", trackId: "track_1", muted: true });
    mutableStream!.dispatchTransportCommand({ type: "SetTrackMute", trackId: "track_1", muted: false });
    mutableStream!.enqueueEvents([
      {
        id: "track_1_late_on",
        type: "NoteOn",
        sampleTime: 128,
        source: "timeline",
        trackId: "track_1",
        noteId: "note_1_late",
        pitchVoct: 0,
        velocity: 1
      },
      {
        id: "track_2_late_on",
        type: "NoteOn",
        sampleTime: 128,
        source: "timeline",
        trackId: "track_2",
        noteId: "note_2_late",
        pitchVoct: 0,
        velocity: 1
      }
    ]);

    expect(engineStopTrack).toHaveBeenCalledWith(0);
    expect(stream!.eventQueue.map((event) => event.id)).toEqual(["track_2_on", "track_1_late_on", "track_2_late_on"]);
  });
});

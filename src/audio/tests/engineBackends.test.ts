import { describe, expect, it, vi } from "vitest";

const { createInitializedWorkletNodeMock } = vi.hoisted(() => ({
  createInitializedWorkletNodeMock: vi.fn()
}));

vi.mock("@/audio/worklets/createInitializedWorkletNode", () => ({
  createInitializedWorkletNode: createInitializedWorkletNodeMock
}));

import {
  createActiveTrackNoteEvents,
  createTrackPanRestoreCommand,
  createTrackVolumeRestoreCommand,
  createWorkletRuntimeSproutError,
  formatWorkletRuntimeError,
  RealAudioEngineBackend,
  updateTrackMuteSnapshot
} from "@/audio/engineBackends";
import { createDefaultProject } from "@/lib/patch/presets";
import { samplesPerBeat } from "@/lib/musicTiming";

const toRenderProject = <T extends ReturnType<typeof createDefaultProject>>(project: T) => ({ project });

describe("audio engine live mute transitions", () => {
  it("coalesces concurrent initialization so cold record startup does not leak connected worklets", async () => {
    const contexts: Array<{
      state: string;
      close: ReturnType<typeof vi.fn>;
      resume: ReturnType<typeof vi.fn>;
    }> = [];
    class MockAudioContext {
      currentTime = 0;
      state = "running";
      audioWorklet = {};
      destination = {};
      close = vi.fn(async () => {});
      resume = vi.fn(async () => {});

      constructor() {
        contexts.push(this);
      }
    }

    const fetchMock = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(1)
    }));
    const connect = vi.fn();
    const disconnect = vi.fn();
    const postMessage = vi.fn();
    createInitializedWorkletNodeMock.mockImplementation(async () => ({
      connect,
      disconnect,
      port: { postMessage }
    }));

    vi.stubGlobal("AudioContext", MockAudioContext);
    vi.stubGlobal("fetch", fetchMock);
    try {
      const backend = new RealAudioEngineBackend();

      await Promise.all([backend.init(), backend.init(), backend.ensureRunning()]);

      expect(contexts).toHaveLength(1);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(createInitializedWorkletNodeMock).toHaveBeenCalledTimes(1);
      expect(connect).toHaveBeenCalledTimes(1);
    } finally {
      createInitializedWorkletNodeMock.mockReset();
      vi.unstubAllGlobals();
    }
  });

  it("disconnects and closes the live audio context on dispose", async () => {
    const contexts: Array<{
      state: string;
      close: ReturnType<typeof vi.fn>;
      resume: ReturnType<typeof vi.fn>;
    }> = [];
    class MockAudioContext {
      currentTime = 0;
      state = "running";
      audioWorklet = {};
      destination = {};
      close = vi.fn(async () => {});
      resume = vi.fn(async () => {});

      constructor() {
        contexts.push(this);
      }
    }

    const fetchMock = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(1)
    }));
    const connect = vi.fn();
    const disconnect = vi.fn();
    const postMessage = vi.fn();
    createInitializedWorkletNodeMock.mockImplementation(async () => ({
      connect,
      disconnect,
      port: { postMessage }
    }));

    vi.stubGlobal("AudioContext", MockAudioContext);
    vi.stubGlobal("fetch", fetchMock);
    try {
      const backend = new RealAudioEngineBackend();

      await backend.init();
      backend.dispose();
      await Promise.resolve();

      expect(disconnect).toHaveBeenCalledTimes(1);
      expect(contexts[0]?.close).toHaveBeenCalledTimes(1);
    } finally {
      createInitializedWorkletNodeMock.mockReset();
      vi.unstubAllGlobals();
    }
  });

  it("formats worklet runtime errors for app-level reporting", () => {
    const message = {
      type: "RUNTIME_ERROR" as const,
      phase: "process_block" as const,
      error: "sample playback failed",
      sproutError: {
        source: "audio_worklet",
        code: "runtime_error",
        severity: "error" as const,
        message: "Audio worklet process_block failed: sample playback failed",
        details: {
          errorMessage: "sample playback failed",
          errorName: "Error",
          phase: "process_block",
          remoteStack: "Error: sample playback failed\n    at processBlock (synth-worklet-runtime.js:12:3)"
        }
      }
    };

    expect(formatWorkletRuntimeError(message)).toBe("Audio worklet process_block failed: sample playback failed");
    const sproutError = createWorkletRuntimeSproutError(message);

    expect(sproutError).toEqual(
      expect.objectContaining({
        source: "audio_worklet",
        code: "runtime_error",
        severity: "error",
        error: expect.any(Error),
        message: "Audio worklet process_block failed: sample playback failed",
        details: expect.objectContaining({ phase: "process_block" })
      })
    );
    expect(sproutError.error?.message).toBe("Audio worklet process_block failed: sample playback failed");
    expect(sproutError.error?.stack).toContain("sample playback failed");
  });

  it("updates the backend mute snapshot so project sync does not replay an immediate transition", () => {
    const project = createDefaultProject();
    const track = project.tracks[0];
    track.mute = true;

    const snapshot = updateTrackMuteSnapshot(project, track.id, false);

    expect(snapshot).not.toBe(project);
    expect(snapshot.tracks.find((entry) => entry.id === track.id)?.mute).toBe(false);
    expect(project.tracks.find((entry) => entry.id === track.id)?.mute).toBe(true);
    expect(updateTrackMuteSnapshot(snapshot, track.id, false)).toBe(snapshot);
  });

  it("does not replay an immediate unmute when the synced project arrives", () => {
    const project = createDefaultProject();
    const track = project.tracks[0];
    track.mute = true;
    track.notes = [
      {
        id: "active_note",
        pitchStr: "C3",
        startBeat: 1,
        durationBeats: 2,
        velocity: 0.8
      }
    ];

    const backend = new RealAudioEngineBackend();
    const postMessage = vi.fn();
    backend.syncProjectSnapshot(toRenderProject(project), { syncToWorklet: false });
    const testBackend = backend as unknown as {
      context: { currentTime: number };
      worklet: { port: { postMessage: typeof postMessage } };
      isPlaying: boolean;
      playSessionId: number;
      scheduledUntilSample: number;
      songStartContextTime: number;
      cueBeat: number;
    };
    testBackend.context = { currentTime: 1 };
    testBackend.worklet = { port: { postMessage } };
    testBackend.isPlaying = true;
    testBackend.playSessionId = 7;
    testBackend.scheduledUntilSample = 96000;
    testBackend.songStartContextTime = 0;
    testBackend.cueBeat = 0;

    backend.setTrackMuted(track.id, false);
    const immediateCalls = postMessage.mock.calls.length;
    const syncedProject = {
      ...project,
      tracks: project.tracks.map((entry) => (entry.id === track.id ? { ...entry, mute: false } : entry))
    };
    backend.syncProjectSnapshot(toRenderProject(syncedProject), { syncToWorklet: false });

    expect(postMessage.mock.calls).toHaveLength(immediateCalls);
    expect(
      postMessage.mock.calls.filter(
        ([message]) => message.type === "TRANSPORT_COMMAND" && message.command.type === "SetTrackMute"
      )
    ).toHaveLength(1);
    expect(postMessage.mock.calls.filter(([message]) => message.type === "EVENTS")).toHaveLength(1);
  });

  it("resets transport state when replacing the project", () => {
    const project = createDefaultProject();
    const nextProject = createDefaultProject();
    nextProject.id = "replacement_project";

    const backend = new RealAudioEngineBackend();
    const postMessage = vi.fn();
    backend.syncProjectSnapshot(toRenderProject(project), { syncToWorklet: false });
    const testBackend = backend as unknown as {
      worklet: { port: { postMessage: typeof postMessage } };
      isPlaying: boolean;
      scheduler: number | null;
    };
    testBackend.worklet = { port: { postMessage } };
    testBackend.isPlaying = true;
    testBackend.scheduler = null;

    backend.replaceProject(toRenderProject(nextProject));

    expect(postMessage.mock.calls.map(([message]) => message.type)).toEqual(["RECORDING", "TRANSPORT", "SET_PROJECT"]);
    expect(postMessage.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        type: "TRANSPORT",
        isPlaying: false
      })
    );
    expect(postMessage.mock.calls[2]?.[0]).toEqual({
      type: "SET_PROJECT",
      renderProject: toRenderProject(nextProject)
    });
  });

  it("applies recording track context during playback startup after transport stream creation", async () => {
    const project = createDefaultProject();
    const track = project.tracks[0];
    track.notes = [
      {
        id: "recorded_over_note",
        pitchStr: "C3",
        startBeat: 0,
        durationBeats: 1,
        velocity: 0.8
      }
    ];

    const backend = new RealAudioEngineBackend();
    const postMessage = vi.fn();
    backend.syncProjectSnapshot(toRenderProject(project), { syncToWorklet: false });
    const testBackend = backend as unknown as {
      context: { currentTime: number; state: string; resume: () => Promise<void> };
      worklet: { port: { postMessage: typeof postMessage } };
      songStartContextTime: number;
      scheduler: number | null;
    };
    testBackend.context = { currentTime: 0, state: "running", resume: vi.fn() };
    testBackend.worklet = { port: { postMessage } };
    testBackend.scheduler = null;

    vi.stubGlobal("window", { setInterval: vi.fn(() => 1), clearInterval: vi.fn() });
    try {
      await backend.play(0, { recordingTrackId: track.id });

      const messageTypes = postMessage.mock.calls.map(([message]) => message.type);
      expect(messageTypes).toEqual(["SET_PROJECT", "TRANSPORT", "RECORDING"]);
      const transportMessage = postMessage.mock.calls[1]?.[0];
      expect(transportMessage).toEqual(expect.objectContaining({ type: "TRANSPORT" }));
      expect(
        transportMessage.events.some(
          (event: { type: string; trackId?: string }) =>
            (event.type === "NoteOn" || event.type === "NoteOff") && event.trackId === track.id
        )
      ).toBe(false);
      expect(postMessage.mock.calls[2]?.[0]).toEqual({
        type: "RECORDING",
        trackId: track.id
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("builds a live volume restore command for unmuting during playback", () => {
    const project = createDefaultProject();
    const track = project.tracks[0];
    track.volume = 1.5;

    const command = createTrackVolumeRestoreCommand(project, track, 2);

    expect(command).toEqual(
      expect.objectContaining({
        type: "SetTrackVolume",
        trackId: track.id,
        normalized: 0.75
      })
    );
  });

  it("builds a live pan restore command for unmuting during playback", () => {
    const project = createDefaultProject();
    const track = project.tracks[0];
    track.pan = 0.2;

    const command = createTrackPanRestoreCommand(project, track, 2);

    expect(command).toEqual(
      expect.objectContaining({
        type: "SetTrackPan",
        trackId: track.id,
        normalized: 0.2
      })
    );
  });

  it("restores fixed pan when unmuting even if volume restore is suppressed", () => {
    const project = createDefaultProject();
    const track = project.tracks[0];
    track.volume = 1.5;
    track.pan = 0.25;

    const backend = new RealAudioEngineBackend();
    const postMessage = vi.fn();
    backend.syncProjectSnapshot(toRenderProject(project), { syncToWorklet: false });
    const testBackend = backend as unknown as {
      context: { currentTime: number };
      worklet: { port: { postMessage: typeof postMessage } };
      isPlaying: boolean;
      playSessionId: number;
      scheduledUntilSample: number;
      songStartContextTime: number;
      cueBeat: number;
    };
    testBackend.context = { currentTime: 1 };
    testBackend.worklet = { port: { postMessage } };
    testBackend.isPlaying = true;
    testBackend.playSessionId = 7;
    testBackend.scheduledUntilSample = 96000;
    testBackend.songStartContextTime = 0;
    testBackend.cueBeat = 0;

    backend.setTrackMuted(track.id, false, { restoreVolume: false });

    expect(
      postMessage.mock.calls.some(
        ([message]) => message.type === "TRANSPORT_COMMAND" && message.command.type === "SetTrackVolume"
      )
    ).toBe(false);
    expect(
      postMessage.mock.calls.some(
        ([message]) =>
          message.type === "TRANSPORT_COMMAND" &&
          message.command.type === "SetTrackPan" &&
          message.command.normalized === 0.25
      )
    ).toBe(true);
  });

  it("creates note events for notes already active when a track is unmuted", () => {
    const project = createDefaultProject();
    const track = project.tracks[0];
    track.notes = [
      {
        id: "active_note",
        pitchStr: "C3",
        startBeat: 1,
        durationBeats: 2,
        velocity: 0.8
      },
      {
        id: "future_note",
        pitchStr: "E3",
        startBeat: 4,
        durationBeats: 1,
        velocity: 0.8
      }
    ];

    const events = createActiveTrackNoteEvents(project, track.id, 2, 1234);

    const oneBeatSamples = Math.round(samplesPerBeat(project.global.sampleRate, project.global.tempo));
    expect(
      events.map((event) => [
        event.type,
        event.type === "NoteOn" || event.type === "NoteOff" ? event.noteId : null,
        event.sampleTime
      ])
    ).toEqual([
      ["NoteOn", "active_note", 1234],
      ["NoteOff", "active_note", 1234 + oneBeatSamples]
    ]);
  });
});

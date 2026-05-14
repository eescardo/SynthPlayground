import { describe, expect, it, vi } from "vitest";

import {
  createActiveTrackNoteEvents,
  createTrackVolumeRestoreCommand,
  RealAudioEngineBackend,
  updateTrackMuteSnapshot
} from "@/audio/engineBackends";
import { createDefaultProject } from "@/lib/patch/presets";
import { samplesPerBeat } from "@/lib/musicTiming";

describe("audio engine live mute transitions", () => {
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
    backend.syncProjectSnapshot(project, { syncToWorklet: false });
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
    backend.syncProjectSnapshot(syncedProject, { syncToWorklet: false });

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
    backend.syncProjectSnapshot(project, { syncToWorklet: false });
    const testBackend = backend as unknown as {
      worklet: { port: { postMessage: typeof postMessage } };
      isPlaying: boolean;
      scheduler: number | null;
    };
    testBackend.worklet = { port: { postMessage } };
    testBackend.isPlaying = true;
    testBackend.scheduler = null;

    backend.replaceProject(nextProject);

    expect(postMessage.mock.calls.map(([message]) => message.type)).toEqual(["RECORDING", "TRANSPORT", "SET_PROJECT"]);
    expect(postMessage.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        type: "TRANSPORT",
        isPlaying: false
      })
    );
    expect(postMessage.mock.calls[2]?.[0]).toEqual({
      type: "SET_PROJECT",
      project: nextProject
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
    backend.syncProjectSnapshot(project, { syncToWorklet: false });
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

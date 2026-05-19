import { describe, expect, it, vi } from "vitest";

import {
  createActiveTrackNoteEvents,
  createTrackVolumeRestoreCommand,
  filterEventsForTrack,
  RealAudioEngineBackend,
  updateTrackMuteSnapshot
} from "@/audio/engineBackends";
import { SchedulerEvent } from "@/types/audio";
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
    backend.setProject(project, { syncToWorklet: false });
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
    backend.setProject(syncedProject, { syncToWorklet: false });

    expect(postMessage.mock.calls).toHaveLength(immediateCalls);
    expect(
      postMessage.mock.calls.filter(
        ([message]) => message.type === "TRANSPORT_COMMAND" && message.command.type === "SetTrackMute"
      )
    ).toHaveLength(1);
    expect(postMessage.mock.calls.filter(([message]) => message.type === "EVENTS")).toHaveLength(1);
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

  it("filters a backfilled transport event window to one track", () => {
    const events: SchedulerEvent[] = [
      {
        id: "track_1_note",
        type: "NoteOn",
        source: "timeline",
        sampleTime: 128,
        trackId: "track_1",
        noteId: "note_1",
        pitchVoct: 0,
        velocity: 1
      },
      {
        id: "track_2_note",
        type: "NoteOn",
        source: "timeline",
        sampleTime: 128,
        trackId: "track_2",
        noteId: "note_2",
        pitchVoct: 0,
        velocity: 1
      },
      {
        id: "patch_param",
        type: "ParamChange",
        source: "live_input",
        sampleTime: 128,
        patchId: "patch_1",
        nodeId: "node_1",
        paramId: "gain",
        value: 0.5
      }
    ];

    expect(filterEventsForTrack(events, "track_1").map((event) => event.id)).toEqual(["track_1_note"]);
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

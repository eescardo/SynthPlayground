import { describe, expect, it } from "vitest";

import {
  createActiveTrackNoteEvents,
  createTrackVolumeRestoreCommand,
  filterEventsForTrack
} from "@/audio/engineBackends";
import { SchedulerEvent } from "@/types/audio";
import { createDefaultProject } from "@/lib/patch/presets";
import { samplesPerBeat } from "@/lib/musicTiming";

describe("audio engine live mute transitions", () => {
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

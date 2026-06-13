import { describe, expect, it } from "vitest";

import { collectEventsInWindow } from "@/audio/scheduler";
import {
  createTrackMacroAutomationLane,
  TRACK_PAN_AUTOMATION_ID,
  upsertAutomationLaneKeyframe
} from "@/lib/macroAutomation";
import { beatToSample } from "@/lib/musicTiming";
import { createDefaultProject } from "@/lib/patch/presets";

describe("audio scheduler macro automation", () => {
  it("still emits timeline events for muted tracks so transport runtime owns live mute state", () => {
    const project = createDefaultProject();
    const track = project.tracks[0];
    track.mute = true;
    track.notes = [
      {
        id: "muted_note",
        pitchStr: "C3",
        startBeat: 1,
        durationBeats: 1,
        velocity: 0.8
      }
    ];

    const events = collectEventsInWindow(project, {
      fromSample: 0,
      toSample: Number.MAX_SAFE_INTEGER
    });

    expect(events.some((event) => event.type === "NoteOn" && event.trackId === track.id)).toBe(true);
    expect(events.some((event) => event.type === "NoteOff" && event.trackId === track.id)).toBe(true);
  });

  it("skips timeline notes on requested tracks", () => {
    const project = createDefaultProject();
    const recordingTrack = project.tracks[0];
    const playbackTrack = project.tracks[1];
    if (!recordingTrack || !playbackTrack) {
      throw new Error("Expected default project tracks");
    }
    recordingTrack.notes = [
      {
        id: "will_be_overwritten",
        pitchStr: "C3",
        startBeat: 0,
        durationBeats: 1,
        velocity: 0.8
      }
    ];
    playbackTrack.notes = [
      {
        id: "still_audible",
        pitchStr: "G3",
        startBeat: 0,
        durationBeats: 1,
        velocity: 0.8
      }
    ];

    const events = collectEventsInWindow(
      project,
      {
        fromSample: 0,
        toSample: Number.MAX_SAFE_INTEGER
      },
      { skipTimelineNoteTrackIds: new Set([recordingTrack.id]) }
    );

    expect(
      events.some(
        (event) =>
          (event.type === "NoteOn" || event.type === "NoteOff") &&
          "trackId" in event &&
          event.trackId === recordingTrack.id
      )
    ).toBe(false);
    expect(events.some((event) => event.type === "NoteOn" && event.trackId === playbackTrack.id)).toBe(true);
  });

  it("emits macro automation events before same-sample note attacks", () => {
    const project = createDefaultProject();
    const track = project.tracks[0];
    const patch = project.patches.find((entry) => entry.id === track.instrumentPatchId);
    if (!patch) {
      throw new Error("Expected selected patch");
    }
    const macro = patch.ui.macros[0];
    if (!macro) {
      throw new Error("Expected at least one macro on the patch");
    }

    track.notes = [
      {
        id: "note_1",
        pitchStr: "C3",
        startBeat: 4,
        durationBeats: 1,
        velocity: 0.9
      }
    ];
    let lane = createTrackMacroAutomationLane(macro.id, 0.1);
    lane = upsertAutomationLaneKeyframe(lane, 4, 0.9, 8);
    track.macroAutomations[macro.id] = lane;

    const events = collectEventsInWindow(project, {
      fromSample: 0,
      toSample: Number.MAX_SAFE_INTEGER
    });

    const noteOnIndex = events.findIndex(
      (event) => event.type === "NoteOn" && event.trackId === track.id && event.noteId === "note_1"
    );
    const macroEventIndex = events.findIndex(
      (event) =>
        event.type === "MacroChange" &&
        event.trackId === track.id &&
        event.macroId === macro.id &&
        Math.abs(event.normalized - 0.9) < 1e-6
    );

    expect(macroEventIndex).toBeGreaterThanOrEqual(0);
    expect(noteOnIndex).toBeGreaterThanOrEqual(0);
    expect(events[macroEventIndex]?.sampleTime).toBe(events[noteOnIndex]?.sampleTime);
    expect(macroEventIndex).toBeLessThan(noteOnIndex);
  });

  it("emits track pan automation as macro change events", () => {
    const project = createDefaultProject();
    const track = project.tracks[0];
    track.pan = 0.5;
    track.macroAutomations[TRACK_PAN_AUTOMATION_ID] = upsertAutomationLaneKeyframe(
      createTrackMacroAutomationLane(TRACK_PAN_AUTOMATION_ID, 0.5),
      2,
      0.8,
      8
    );

    const events = collectEventsInWindow(project, {
      fromSample: 0,
      toSample: Number.MAX_SAFE_INTEGER
    });

    expect(
      events.some(
        (event) =>
          event.type === "MacroChange" &&
          event.trackId === track.id &&
          event.macroId === TRACK_PAN_AUTOMATION_ID &&
          Math.abs(event.normalized - 0.8) < 1e-6
      )
    ).toBe(true);
  });

  it("matches full-song scheduling when collecting a small unlooped transport window", () => {
    const project = createDefaultProject();
    const track = project.tracks[0];
    const patch = project.patches.find((entry) => entry.id === track.instrumentPatchId);
    if (!patch) {
      throw new Error("Expected selected patch");
    }
    const macro = patch.ui.macros[0];
    if (!macro) {
      throw new Error("Expected at least one macro on the patch");
    }

    track.notes = [
      {
        id: "before_window",
        pitchStr: "C3",
        startBeat: 2,
        durationBeats: 0.5,
        velocity: 0.8
      },
      {
        id: "inside_window",
        pitchStr: "E3",
        startBeat: 16.5,
        durationBeats: 0.5,
        velocity: 0.9
      },
      {
        id: "after_window",
        pitchStr: "G3",
        startBeat: 24,
        durationBeats: 0.5,
        velocity: 0.7
      }
    ];

    let lane = createTrackMacroAutomationLane(macro.id, 0.1);
    lane = upsertAutomationLaneKeyframe(lane, 16, 0.3, 32);
    lane = upsertAutomationLaneKeyframe(lane, 17, 0.8, 32);
    lane = upsertAutomationLaneKeyframe(lane, 24, 0.2, 32);
    track.macroAutomations[macro.id] = lane;

    const sampleRate = project.global.sampleRate;
    const tempo = project.global.tempo;
    const fromSample = beatToSample(16, sampleRate, tempo);
    const toSample = beatToSample(18, sampleRate, tempo);
    const fullEvents = collectEventsInWindow(project, {
      fromSample: 0,
      toSample: Number.MAX_SAFE_INTEGER
    });
    const windowEvents = collectEventsInWindow(project, { fromSample, toSample });

    expect(windowEvents).toEqual(
      fullEvents.filter((event) => event.sampleTime >= fromSample && event.sampleTime < toSample)
    );
  });
});

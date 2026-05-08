import { describe, expect, it } from "vitest";

import { collectEventsInWindow } from "@/audio/scheduler";
import { createTrackMacroAutomationLane, upsertAutomationLaneKeyframe } from "@/lib/macroAutomation";
import { beatToSample } from "@/lib/musicTiming";
import { createDefaultProject } from "@/lib/patch/presets";

describe("audio scheduler macro automation", () => {
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

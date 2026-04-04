import { describe, expect, it } from "vitest";

import { collectEventsInWindow } from "@/audio/scheduler";
import { createTrackMacroAutomationLane, upsertAutomationLaneKeyframe } from "@/lib/macroAutomation";
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

    const noteOnIndex = events.findIndex((event) => event.type === "NoteOn" && event.trackId === track.id && event.noteId === "note_1");
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
});

import { describe, expect, it } from "vitest";
import {
  findTrackBackspaceTargetNote,
  shiftContentSelectionByBeats,
  upsertKeyboardPlacedNote,
  trackHasNoteAtBeat
} from "@/lib/hardwareNavigation";
import { getAutomationSelectionKey, getNoteSelectionKey } from "@/lib/clipboard";
import { Project, Track } from "@/types/music";

const createTrack = (notes: Track["notes"]): Track => ({
  id: "track_1",
  name: "Track 1",
  instrumentPatchId: "patch_1",
  notes,
  macroValues: {},
  macroAutomations: {},
  macroPanelExpanded: false,
  volume: 1,
  fx: {
    delayEnabled: false,
    reverbEnabled: false,
    saturationEnabled: false,
    compressorEnabled: false,
    delayMix: 0.2,
    reverbMix: 0.2,
    drive: 0.2,
    compression: 0.4
  }
});

const createProject = (track: Track): Project => ({
  id: "project_1",
  name: "Project",
  global: {
    sampleRate: 48000,
    tempo: 120,
    meter: "4/4",
    gridBeats: 0.25,
    loop: []
  },
  tracks: [track],
  patches: [],
  masterFx: {
    compressorEnabled: false,
    limiterEnabled: false,
    makeupGain: 0
  },
  ui: {
    patchWorkspace: {
      activeTabId: undefined,
      tabs: []
    }
  },
  createdAt: 0,
  updatedAt: 0
});

describe("hardware navigation note placement", () => {
  it("detects whether the playhead is sitting on a note", () => {
    const track = createTrack([{ id: "note_a", pitchStr: "C4", startBeat: 2, durationBeats: 1, velocity: 0.8 }]);

    expect(trackHasNoteAtBeat(track, 2.25)).toBe(true);
    expect(trackHasNoteAtBeat(track, 3.05)).toBe(false);
  });

  it("overwrites note content inside the held placement range while preserving the active note id", () => {
    const track = createTrack([
      { id: "left", pitchStr: "C4", startBeat: 0, durationBeats: 4, velocity: 0.8 },
      { id: "right", pitchStr: "G4", startBeat: 5, durationBeats: 2, velocity: 0.8 }
    ]);

    const next = upsertKeyboardPlacedNote(track, {
      id: "placing",
      pitchStr: "D4",
      startBeat: 1,
      durationBeats: 4
    });

    expect(next.notes).toEqual([
      expect.objectContaining({ id: "left", startBeat: 0, durationBeats: 1 }),
      expect.objectContaining({ id: "placing", pitchStr: "D4", startBeat: 1, durationBeats: 4 }),
      expect.objectContaining({ id: "right", startBeat: 5, durationBeats: 2 })
    ]);
  });

  it("prefers deleting the note ending at the playhead when backspacing at a note boundary", () => {
    const track = createTrack([
      { id: "left", pitchStr: "C4", startBeat: 0, durationBeats: 1, velocity: 0.8 },
      { id: "right", pitchStr: "D4", startBeat: 1, durationBeats: 1, velocity: 0.8 }
    ]);

    expect(findTrackBackspaceTargetNote(track, 1)?.id).toBe("left");
  });

  it("moves selected notes and automation keyframes together when the destination is clear", () => {
    const track = {
      ...createTrack([
        { id: "note_a", pitchStr: "C4", startBeat: 0, durationBeats: 1, velocity: 0.8 },
        { id: "note_b", pitchStr: "D4", startBeat: 3, durationBeats: 1, velocity: 0.8 }
      ]),
      macroAutomations: {
        macro_cutoff: {
          macroId: "macro_cutoff",
          expanded: true,
          startValue: 0.2,
          endValue: 0.7,
          keyframes: [
            { id: "kf_a", beat: 0.5, type: "whole", value: 0.5 }
          ]
        }
      }
    } satisfies Track;

    const result = shiftContentSelectionByBeats(
      createProject(track),
      {
        noteKeys: [getNoteSelectionKey(track.id, "note_a")],
        automationKeyframeSelectionKeys: [getAutomationSelectionKey(track.id, "macro_cutoff", "kf_a")]
      },
      1
    );

    expect(result.status).toBe("moved");
    if (result.status !== "moved") {
      return;
    }

    expect(result.project.tracks[0]?.notes).toEqual([
      expect.objectContaining({ id: "note_a", startBeat: 1 }),
      expect.objectContaining({ id: "note_b", startBeat: 3 })
    ]);
    expect(result.project.tracks[0]?.macroAutomations.macro_cutoff?.keyframes).toEqual([
      expect.objectContaining({ id: "kf_a", beat: 1.5 })
    ]);
  });

  it("blocks a single-note shift that would overlap another note and reports the blocker", () => {
    const track = createTrack([
      { id: "note_a", pitchStr: "C4", startBeat: 0, durationBeats: 1, velocity: 0.8 },
      { id: "note_b", pitchStr: "D4", startBeat: 1, durationBeats: 1, velocity: 0.8 }
    ]);

    const result = shiftContentSelectionByBeats(
      createProject(track),
      {
        noteKeys: [getNoteSelectionKey(track.id, "note_a")],
        automationKeyframeSelectionKeys: []
      },
      0.5
    );

    expect(result).toEqual({
      status: "blocked",
      block: {
        reason: "note",
        blockingSelectionKey: getNoteSelectionKey(track.id, "note_b")
      }
    });
  });
});

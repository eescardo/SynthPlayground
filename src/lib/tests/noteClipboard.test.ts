import { describe, expect, it } from "vitest";

import {
  applyNoteClipboardPaste,
  buildNoteClipboardPayload,
  getNoteSelectionKey,
  parseNoteClipboardPayload,
  serializeNoteClipboardPayload
} from "@/lib/noteClipboard";
import { Project } from "@/types/music";

const createProject = (): Project => ({
  id: "project_test",
  name: "Clipboard Test",
  global: {
    sampleRate: 48000,
    tempo: 120,
    meter: "4/4",
    gridBeats: 1,
    loop: []
  },
  tracks: [
    {
      id: "track_1",
      name: "Track 1",
      instrumentPatchId: "patch_1",
      notes: [
        { id: "note_a", pitchStr: "C4", startBeat: 1, durationBeats: 2, velocity: 0.8 },
        { id: "note_b", pitchStr: "E4", startBeat: 5, durationBeats: 1, velocity: 0.7 }
      ],
      macroValues: {},
      macroPanelExpanded: true,
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
    },
    {
      id: "track_2",
      name: "Track 2",
      instrumentPatchId: "patch_1",
      notes: [
        { id: "note_c", pitchStr: "G4", startBeat: 2, durationBeats: 2, velocity: 0.9 }
      ],
      macroValues: {},
      macroPanelExpanded: true,
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
    },
    {
      id: "track_3",
      name: "Track 3",
      instrumentPatchId: "patch_1",
      notes: [
        { id: "note_d", pitchStr: "A3", startBeat: 3, durationBeats: 4, velocity: 0.6 },
        { id: "note_e", pitchStr: "B3", startBeat: 8, durationBeats: 1, velocity: 0.5 }
      ],
      macroValues: {},
      macroPanelExpanded: true,
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
    }
  ],
  patches: [],
  masterFx: {
    compressorEnabled: false,
    limiterEnabled: false,
    makeupGain: 1
  },
  createdAt: 0,
  updatedAt: 0
});

describe("noteClipboard", () => {
  it("serializes selected notes into clipboard-safe text and html", () => {
    const project = createProject();
    const payload = buildNoteClipboardPayload(project, [
      getNoteSelectionKey("track_1", "note_a"),
      getNoteSelectionKey("track_2", "note_c")
    ]);

    expect(payload).not.toBeNull();
    expect(payload?.beatSpan).toBe(3);
    expect(payload?.tracks).toHaveLength(2);
    expect(payload?.tracks[0].notes[0]).toMatchObject({ pitchStr: "C4", startBeat: 0, durationBeats: 2 });
    expect(payload?.tracks[1].notes[0]).toMatchObject({ pitchStr: "G4", startBeat: 1, durationBeats: 2 });

    const serialized = serializeNoteClipboardPayload(payload!);
    expect(serialized.html).toContain("data-synth=");

    const parsed = parseNoteClipboardPayload(serialized.html, serialized.plainText);
    expect(parsed).toEqual(payload);
  });

  it("pastes selected note groups at the playhead and overwrites the destination window", () => {
    const project = createProject();
    const payload = buildNoteClipboardPayload(project, [
      getNoteSelectionKey("track_1", "note_a"),
      getNoteSelectionKey("track_2", "note_c")
    ]);

    const applied = applyNoteClipboardPaste(project, payload!, "track_2", 4);

    expect(applied.selectionKeys).toHaveLength(2);

    const destinationTrack = applied.project.tracks[1];
    expect(destinationTrack.notes).toHaveLength(2);
    expect(destinationTrack.notes[0]).toMatchObject({
      pitchStr: "G4",
      startBeat: 2,
      durationBeats: 2
    });
    expect(destinationTrack.notes[1]).toMatchObject({
      pitchStr: "C4",
      startBeat: 4,
      durationBeats: 2
    });

    const nextTrack = applied.project.tracks[2];
    expect(nextTrack.notes).toHaveLength(3);
    expect(nextTrack.notes[0]).toMatchObject({
      pitchStr: "A3",
      startBeat: 3,
      durationBeats: 1
    });
    expect(nextTrack.notes[1]).toMatchObject({
      pitchStr: "G4",
      startBeat: 5,
      durationBeats: 2
    });
    expect(nextTrack.notes[2]).toMatchObject({
      pitchStr: "B3",
      startBeat: 8,
      durationBeats: 1
    });
  });
});

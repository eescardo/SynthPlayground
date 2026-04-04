import { describe, expect, it } from "vitest";

import {
  applyNoteClipboardInsert,
  applyNoteClipboardInsertAllTracks,
  applyNoteClipboardPaste,
  buildAllTracksClipboardPayload,
  buildNoteClipboardPayload,
  cutBeatRangeAcrossAllTracks,
  getNoteSelectionKey,
  getSelectionBeatRange,
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
    loop: [
      { id: "loop_start_before", kind: "start", beat: 0 },
      { id: "loop_start_inside", kind: "start", beat: 2 },
      { id: "loop_end_after", kind: "end", beat: 8, repeatCount: 2 }
    ]
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

  it("copies the full selected time span across all tracks", () => {
    const project = createProject();
    const range = getSelectionBeatRange(project, [
      getNoteSelectionKey("track_1", "note_a"),
      getNoteSelectionKey("track_2", "note_c")
    ]);

    const payload = buildAllTracksClipboardPayload(project, range!);

    expect(payload?.beatSpan).toBe(3);
    expect(payload?.tracks).toHaveLength(3);
    expect(payload?.tracks[0].notes).toHaveLength(1);
    expect(payload?.tracks[1].notes).toHaveLength(1);
    expect(payload?.tracks[2].notes[0]).toMatchObject({
      pitchStr: "A3",
      startBeat: 2,
      durationBeats: 1
    });
  });

  it("cuts the selected span across all tracks and closes the gap", () => {
    const project = createProject();
    const next = cutBeatRangeAcrossAllTracks(project, {
      startBeat: 1,
      endBeat: 4,
      beatSpan: 3
    });

    expect(next.tracks[0].notes[0]).toMatchObject({
      pitchStr: "E4",
      startBeat: 2,
      durationBeats: 1
    });
    expect(next.tracks[1].notes).toHaveLength(0);
    expect(next.tracks[2].notes[0]).toMatchObject({
      pitchStr: "A3",
      startBeat: 1,
      durationBeats: 3
    });
    expect(next.tracks[2].notes[1]).toMatchObject({
      pitchStr: "B3",
      startBeat: 5,
      durationBeats: 1
    });
    expect(next.global.loop).toEqual([
      { id: "loop_start_before", kind: "start", beat: 0, repeatCount: undefined },
      { id: "loop_end_after", kind: "end", beat: 5, repeatCount: 2 }
    ]);
  });

  it("inserts clipboard contents by shifting later notes to the right", () => {
    const project = createProject();
    const payload = buildNoteClipboardPayload(project, [
      getNoteSelectionKey("track_1", "note_a"),
      getNoteSelectionKey("track_2", "note_c")
    ]);

    const applied = applyNoteClipboardInsert(project, payload!, "track_2", 4);

    expect(applied.project.tracks[0].notes[1]).toMatchObject({
      pitchStr: "E4",
      startBeat: 8,
      durationBeats: 1
    });
    expect(applied.project.tracks[1].notes[1]).toMatchObject({
      pitchStr: "C4",
      startBeat: 4,
      durationBeats: 2
    });
    expect(applied.project.tracks[2].notes[0]).toMatchObject({
      pitchStr: "A3",
      startBeat: 3,
      durationBeats: 1
    });
    expect(applied.project.tracks[2].notes[1]).toMatchObject({
      pitchStr: "G4",
      startBeat: 5,
      durationBeats: 2
    });
    expect(applied.project.tracks[2].notes[2]).toMatchObject({
      pitchStr: "A3",
      startBeat: 7,
      durationBeats: 3
    });
    expect(applied.project.tracks[2].notes[3]).toMatchObject({
      pitchStr: "B3",
      startBeat: 11,
      durationBeats: 1
    });
    expect(applied.project.global.loop).toEqual([
      { id: "loop_start_before", kind: "start", beat: 0, repeatCount: undefined },
      { id: "loop_start_inside", kind: "start", beat: 2, repeatCount: undefined },
      { id: "loop_end_after", kind: "end", beat: 11, repeatCount: 2 }
    ]);
  });

  it("inserts clipboard contents across all tracks starting at the first track", () => {
    const project = createProject();
    const payload = buildNoteClipboardPayload(project, [
      getNoteSelectionKey("track_1", "note_a"),
      getNoteSelectionKey("track_2", "note_c")
    ]);

    const applied = applyNoteClipboardInsertAllTracks(project, payload!, 4);

    expect(applied.project.tracks[0].notes[1]).toMatchObject({
      pitchStr: "C4",
      startBeat: 4,
      durationBeats: 2
    });
    expect(applied.project.tracks[1].notes[1]).toMatchObject({
      pitchStr: "G4",
      startBeat: 5,
      durationBeats: 2
    });
    expect(applied.project.global.loop).toEqual([
      { id: "loop_start_before", kind: "start", beat: 0, repeatCount: undefined },
      { id: "loop_start_inside", kind: "start", beat: 2, repeatCount: undefined },
      { id: "loop_end_after", kind: "end", beat: 11, repeatCount: 2 }
    ]);
  });
});

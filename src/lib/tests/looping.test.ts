import { describe, expect, it } from "vitest";

import {
  findLoopBoundaryConflicts,
  getLoopMarkerStates,
  getLoopPlaybackEndBeat,
  getSongBeatForPlaybackBeat,
  getLoopedPlaybackBeatsForSongBeat,
  sanitizeLoopSettings,
  splitProjectNotesAtLoopBoundaries
} from "@/lib/looping";
import { Project } from "@/types/music";

const createProject = (): Project => ({
  id: "project_test",
  name: "Loop Test",
  global: {
    sampleRate: 48000,
    tempo: 120,
    meter: "4/4",
    gridBeats: 0.25,
    loop: []
  },
  tracks: [
    {
      id: "track_1",
      name: "Track 1",
      instrumentPatchId: "preset_bass",
      notes: [
        {
          id: "note_1",
          pitchStr: "C4",
          startBeat: 3.5,
          durationBeats: 2,
          velocity: 0.9
        }
      ],
      macroValues: {},
      macroPanelExpanded: true,
      volume: 1,
      mute: false,
      solo: false,
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
    limiterEnabled: true,
    makeupGain: 0
  },
  createdAt: 0,
  updatedAt: 0
});

describe("looping", () => {
  it("sanitizes markers by sorting them and clamping repeat count", () => {
    const markers = sanitizeLoopSettings([
      { id: "end_1", kind: "end", beat: 8, repeatCount: 99 },
      { id: "start_1", kind: "start", beat: 4 },
      { id: "start_2", kind: "start", beat: -2 },
      { id: "end_2", kind: "end", beat: 0.5, repeatCount: 0 }
    ]);

    expect(markers).toEqual([
      { id: "start_2", kind: "start", beat: 0, repeatCount: undefined },
      { id: "end_2", kind: "end", beat: 0.5, repeatCount: 1 },
      { id: "start_1", kind: "start", beat: 4, repeatCount: undefined },
      { id: "end_1", kind: "end", beat: 8, repeatCount: 16 }
    ]);
  });

  it("marks loop markers using parentheses-style matching", () => {
    const states = getLoopMarkerStates([
      { id: "start_outer", kind: "start", beat: 0 },
      { id: "start_inner", kind: "start", beat: 4 },
      { id: "end_inner", kind: "end", beat: 8, repeatCount: 1 }
    ]);

    expect(states).toEqual([
      { markerId: "start_outer", kind: "start", beat: 0, repeatCount: undefined, matched: false },
      { markerId: "start_inner", kind: "start", beat: 4, repeatCount: undefined, matched: true },
      { markerId: "end_inner", kind: "end", beat: 8, repeatCount: 1, matched: true }
    ]);
  });

  it("expands song beats across nested loop passes", () => {
    const loop = [
      { id: "start_outer", kind: "start" as const, beat: 0 },
      { id: "start_inner", kind: "start" as const, beat: 2 },
      { id: "end_inner", kind: "end" as const, beat: 4, repeatCount: 1 },
      { id: "end_outer", kind: "end" as const, beat: 6, repeatCount: 1 }
    ];
    const project = createProject();
    project.global.loop = loop;

    expect(getLoopedPlaybackBeatsForSongBeat(3, 0, loop)).toEqual([3, 5, 11, 13]);
    expect(getLoopPlaybackEndBeat(project, 0, 6)).toBe(16);
  });

  it("ignores loop passes that are fully before the cue beat", () => {
    const loop = [
      { id: "start_outer", kind: "start" as const, beat: 0 },
      { id: "end_outer", kind: "end" as const, beat: 4, repeatCount: 1 }
    ];

    expect(getSongBeatForPlaybackBeat(0, 8, loop)).toBe(8);
    expect(getLoopedPlaybackBeatsForSongBeat(8, 8, loop)).toEqual([0]);
  });

  it("starts inside a looped section without rewinding the transport", () => {
    const loop = [
      { id: "start_outer", kind: "start" as const, beat: 0 },
      { id: "end_outer", kind: "end" as const, beat: 8, repeatCount: 1 }
    ];

    expect(getSongBeatForPlaybackBeat(0, 4, loop)).toBe(4);
    expect(getSongBeatForPlaybackBeat(6, 4, loop)).toBe(2);
    expect(getLoopedPlaybackBeatsForSongBeat(6, 4, loop)).toEqual([2, 10]);
  });

  it("includes exact loop-end boundaries in every pass for event scheduling", () => {
    const loop = [
      { id: "start_outer", kind: "start" as const, beat: 0 },
      { id: "end_outer", kind: "end" as const, beat: 4, repeatCount: 1 }
    ];

    expect(getLoopedPlaybackBeatsForSongBeat(0, 0, loop)).toEqual([0, 4]);
    expect(getLoopedPlaybackBeatsForSongBeat(4, 0, loop)).toEqual([4, 8]);
  });

  it("finds note conflicts at loop boundaries and can split them", () => {
    const project = createProject();
    const loop = [{ id: "loop_start", kind: "start" as const, beat: 4 }];

    const conflicts = findLoopBoundaryConflicts(project, loop);
    expect(conflicts).toEqual([
      {
        trackId: "track_1",
        noteId: "note_1",
        pitchStr: "C4",
        startBeat: 3.5,
        endBeat: 5.5,
        boundaryBeat: 4,
        boundary: "start"
      }
    ]);

    const split = splitProjectNotesAtLoopBoundaries(project, loop);
    expect(split.tracks[0].notes).toHaveLength(2);
    expect(split.tracks[0].notes[0]).toMatchObject({
      id: "note_1",
      startBeat: 3.5,
      durationBeats: 0.5
    });
    expect(split.tracks[0].notes[1]).toMatchObject({
      startBeat: 4,
      durationBeats: 1.5,
      pitchStr: "C4"
    });
  });
});

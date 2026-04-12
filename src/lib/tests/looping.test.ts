import { describe, expect, it } from "vitest";

import {
  expandLoopRegionToNotes,
  findLoopBoundaryConflicts,
  getLoopMarkerStates,
  getLoopPlaybackEndBeat,
  getSongBeatForPlaybackBeat,
  getLoopedPlaybackBeatsForSongBeat,
  getUniqueMatchedLoopRegionAtBeat,
  sanitizeLoopSettings,
  splitProjectNotesAtLoopBoundaries
} from "@/lib/looping";
import { isSplitAutomationKeyframe } from "@/lib/macroAutomation";
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
      macroAutomations: {},
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
  ui: {
    patchWorkspace: {
      activeTabId: "tab_1",
      tabs: [
        {
          id: "tab_1",
          name: "Track 1",
          patchId: "patch_missing"
        }
      ]
    }
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

  it("schedules cue-earlier beats on later repeated passes when cueing inside a loop", () => {
    const loop = [
      { id: "start_outer", kind: "start" as const, beat: 0 },
      { id: "end_outer", kind: "end" as const, beat: 4, repeatCount: 1 }
    ];

    expect(getLoopedPlaybackBeatsForSongBeat(0, 2.25, loop)).toEqual([1.75]);
    expect(getLoopedPlaybackBeatsForSongBeat(0.75, 2.25, loop)).toEqual([2.5]);
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

  it("finds a unique matched loop region at a selected boundary beat", () => {
    const loop = [
      { id: "start_outer", kind: "start" as const, beat: 0 },
      { id: "end_outer", kind: "end" as const, beat: 4, repeatCount: 2 }
    ];

    expect(getUniqueMatchedLoopRegionAtBeat(loop, 0)).toEqual({
      startMarkerId: "start_outer",
      endMarkerId: "end_outer",
      startBeat: 0,
      endBeat: 4,
      repeatCount: 2
    });
    expect(getUniqueMatchedLoopRegionAtBeat(loop, 2)).toBeNull();
  });

  it("expands a matched loop into explicit notes across tracks and shifts later content", () => {
    const project = createProject();
    project.global.loop = [
      { id: "loop_start", kind: "start", beat: 9 },
      { id: "loop_end", kind: "end", beat: 11, repeatCount: 3 }
    ];
    project.tracks = [
      {
        ...project.tracks[0],
        id: "track_1",
        notes: [
          { id: "t1_a", pitchStr: "C4", startBeat: 9, durationBeats: 0.5, velocity: 0.9 },
          { id: "t1_b", pitchStr: "E4", startBeat: 10, durationBeats: 1, velocity: 0.8 },
          { id: "t1_c", pitchStr: "G4", startBeat: 11, durationBeats: 0.5, velocity: 0.7 }
        ]
      },
      {
        ...project.tracks[0],
        id: "track_2",
        name: "Track 2",
        notes: [
          { id: "t2_a", pitchStr: "A3", startBeat: 9.5, durationBeats: 0.5, velocity: 0.6 },
          { id: "t2_b", pitchStr: "B3", startBeat: 12, durationBeats: 0.5, velocity: 0.6 }
        ]
      }
    ];

    const region = getUniqueMatchedLoopRegionAtBeat(project.global.loop, 9);
    expect(region).not.toBeNull();

    const expanded = expandLoopRegionToNotes(project, region!);

    expect(expanded.global.loop).toEqual([]);
    expect(expanded.tracks[0].notes.map((note) => [note.pitchStr, note.startBeat, note.durationBeats])).toEqual([
      ["C4", 9, 0.5],
      ["E4", 10, 1],
      ["C4", 11, 0.5],
      ["E4", 12, 1],
      ["C4", 13, 0.5],
      ["E4", 14, 1],
      ["C4", 15, 0.5],
      ["E4", 16, 1],
      ["G4", 17, 0.5]
    ]);
    expect(expanded.tracks[1].notes.map((note) => [note.pitchStr, note.startBeat, note.durationBeats])).toEqual([
      ["A3", 9.5, 0.5],
      ["A3", 11.5, 0.5],
      ["A3", 13.5, 0.5],
      ["A3", 15.5, 0.5],
      ["B3", 18, 0.5]
    ]);
  });

  it("explodes looped automation and preserves restart jumps with split keyframes", () => {
    const project = createProject();
    project.global.loop = [
      { id: "loop_start", kind: "start", beat: 9 },
      { id: "loop_end", kind: "end", beat: 11, repeatCount: 1 }
    ];
    project.tracks[0] = {
      ...project.tracks[0],
      notes: [
        { id: "note_a", pitchStr: "C4", startBeat: 9, durationBeats: 1, velocity: 0.8 },
        { id: "note_b", pitchStr: "C4", startBeat: 11, durationBeats: 1, velocity: 0.8 }
      ],
      macroValues: {
        macro_cutoff: 0.2
      },
      macroAutomations: {
        macro_cutoff: {
          macroId: "macro_cutoff",
          expanded: true,
          startValue: 0.2,
          endValue: 0.6,
          keyframes: [
            { id: "cutoff_mid", beat: 10, type: "whole", value: 0.8 }
          ]
        }
      }
    };

    const region = getUniqueMatchedLoopRegionAtBeat(project.global.loop, 9);
    expect(region).not.toBeNull();

    const expanded = expandLoopRegionToNotes(project, region!);
    const lane = expanded.tracks[0]!.macroAutomations.macro_cutoff;

    expect(lane.keyframes[0]).toEqual(expect.objectContaining({ id: "cutoff_mid", beat: 10, type: "whole", value: 0.8 }));
    expect(lane.keyframes[1]).toEqual(expect.objectContaining({ beat: 11, type: "split" }));
    expect(isSplitAutomationKeyframe(lane.keyframes[1]!)).toBe(true);
    if (!isSplitAutomationKeyframe(lane.keyframes[1]!)) {
      throw new Error("expected restart keyframe to be split");
    }
    expect(lane.keyframes[1].incomingValue).toBeCloseTo(0.7666666667);
    expect(lane.keyframes[1].outgoingValue).toBeCloseTo(0.74);
    expect(lane.keyframes[2]).toEqual(expect.objectContaining({ beat: 12, type: "whole", value: 0.8 }));
  });

  it("prefers split restart boundaries over duplicated start keyframes when exploding a saw loop", () => {
    const project = createProject();
    project.global.gridBeats = 0.5;
    project.global.loop = [
      { id: "loop_start", kind: "start", beat: 8 },
      { id: "loop_end", kind: "end", beat: 8.5, repeatCount: 3 }
    ];
    project.tracks[0] = {
      ...project.tracks[0],
      notes: [
        { id: "note_a", pitchStr: "B3", startBeat: 8, durationBeats: 0.5, velocity: 0.8 },
        { id: "note_tail", pitchStr: "B3", startBeat: 12, durationBeats: 0.5, velocity: 0.8 }
      ],
      macroValues: {
        macro_cutoff: 0.1
      },
      macroAutomations: {
        macro_cutoff: {
          macroId: "macro_cutoff",
          expanded: true,
          startValue: 0.1,
          endValue: 0.9,
          keyframes: [
            { id: "loop_start_value", beat: 8, type: "whole", value: 0.1 },
            { id: "loop_end_value", beat: 8.5, type: "whole", value: 0.9 }
          ]
        }
      }
    };

    const region = getUniqueMatchedLoopRegionAtBeat(project.global.loop, 8);
    expect(region).not.toBeNull();

    const expanded = expandLoopRegionToNotes(project, region!);
    const keyframes = expanded.tracks[0]!.macroAutomations.macro_cutoff.keyframes;

    expect(keyframes.filter((keyframe) => Math.abs(keyframe.beat - 8) <= 1e-9)).toHaveLength(1);
    expect(keyframes.filter((keyframe) => Math.abs(keyframe.beat - 8.5) <= 1e-9)).toEqual([
      expect.objectContaining({ type: "split", incomingValue: 0.9, outgoingValue: 0.1 })
    ]);
    expect(keyframes.filter((keyframe) => Math.abs(keyframe.beat - 9) <= 1e-9)).toEqual([
      expect.objectContaining({ type: "split", incomingValue: 0.9, outgoingValue: 0.1 })
    ]);
    expect(keyframes.filter((keyframe) => Math.abs(keyframe.beat - 9.5) <= 1e-9)).toEqual([
      expect.objectContaining({ type: "split", incomingValue: 0.9, outgoingValue: 0.1 })
    ]);
  });
});

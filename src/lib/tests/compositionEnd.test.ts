import { describe, expect, it } from "vitest";

import { clearFollowCompositionEndOverrideAfterLastNoteEndChange } from "@/lib/compositionEnd";
import type { Project, Track } from "@/types/music";
import type { Patch } from "@/types/patch";

const createTrack = (): Track => ({
  id: "track_1",
  name: "Track 1",
  instrumentPatchId: "patch_1",
  notes: [{ id: "note_1", pitchStr: "C4", startBeat: 1, durationBeats: 3, velocity: 0.8 }],
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
});

const createPatch = (): Patch => ({
  schemaVersion: 1,
  id: "patch_1",
  name: "Patch",
  meta: { source: "custom" },
  nodes: [],
  connections: [],
  ui: { macros: [] },
  layout: { nodes: [] }
});

const createProject = (): Project => ({
  id: "project_composition_end_test",
  name: "Composition End Test",
  global: {
    sampleRate: 48000,
    tempo: 120,
    meter: "4/4",
    gridBeats: 1,
    compositionEnd: { mode: "follow", beat: 8 },
    loop: []
  },
  tracks: [createTrack()],
  patches: [createPatch()],
  masterFx: {
    compressorEnabled: false,
    limiterEnabled: true,
    makeupGain: 1
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

describe("compositionEnd", () => {
  it("clears a follow override after the last note end is edited", () => {
    const previous = createProject();
    const next = {
      ...previous,
      tracks: [
        {
          ...previous.tracks[0]!,
          notes: [{ ...previous.tracks[0]!.notes[0]!, durationBeats: 4 }]
        }
      ]
    };

    expect(
      clearFollowCompositionEndOverrideAfterLastNoteEndChange(previous, next).global.compositionEnd
    ).toBeUndefined();
  });

  it("keeps a follow override after explicit timeline edits", () => {
    const previous = createProject();
    const next = {
      ...previous,
      global: {
        ...previous.global,
        compositionEnd: { mode: "follow" as const, beat: 6 }
      }
    };

    expect(
      clearFollowCompositionEndOverrideAfterLastNoteEndChange(previous, next, "timeline:cut:all-tracks").global
        .compositionEnd
    ).toEqual({ mode: "follow", beat: 6 });
  });
});

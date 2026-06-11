import { describe, expect, it } from "vitest";

import {
  clearCompositionEndBeat,
  extendExplicitCompositionEndToLastNote,
  setCompositionEndBeat,
  shiftCompositionEndForInsertedRange,
  shiftCompositionEndForRemovedRange
} from "@/lib/compositionEnd";
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

const createProject = (compositionEndBeat?: number): Project => ({
  id: "project_composition_end_test",
  name: "Composition End Test",
  global: {
    sampleRate: 48000,
    tempo: 120,
    meter: "4/4",
    gridBeats: 1,
    compositionEnd: compositionEndBeat === undefined ? undefined : { beat: compositionEndBeat },
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
  it("sets and clears an explicit composition end beat", () => {
    const withEnd = setCompositionEndBeat(createProject(), 8);

    expect(withEnd.global.compositionEnd).toEqual({ beat: 8 });
    expect(clearCompositionEndBeat(withEnd).global.compositionEnd).toBeUndefined();
  });

  it("does not set the explicit end before the last note end", () => {
    expect(setCompositionEndBeat(createProject(), 2).global.compositionEnd).toEqual({ beat: 4 });
  });

  it("materializes an explicit end when timeline insertion crosses the implicit end", () => {
    const next = shiftCompositionEndForInsertedRange(createProject(), 4, 2, 8);

    expect(next.global.compositionEnd).toEqual({ beat: 10 });
  });

  it("materializes an explicit end when timeline deletion trims the implicit tail", () => {
    const next = shiftCompositionEndForRemovedRange(createProject(), 6, 8, 8);

    expect(next.global.compositionEnd).toEqual({ beat: 6 });
  });

  it("preserves explicit end beats when edits happen after the end", () => {
    const project = createProject(8);

    expect(shiftCompositionEndForInsertedRange(project, 12, 2, 8).global.compositionEnd).toEqual({ beat: 8 });
  });

  it("extends stored explicit end beats when notes grow beyond them", () => {
    const project = createProject(8);
    const next = {
      ...project,
      tracks: [
        {
          ...project.tracks[0]!,
          notes: [{ ...project.tracks[0]!.notes[0]!, startBeat: 10, durationBeats: 2 }]
        }
      ]
    };

    expect(extendExplicitCompositionEndToLastNote(next).global.compositionEnd).toEqual({ beat: 12 });
  });

  it("does not shrink stored explicit end beats when notes are removed", () => {
    const project = createProject(8);
    const next = {
      ...project,
      tracks: [{ ...project.tracks[0]!, notes: [] }]
    };

    expect(extendExplicitCompositionEndToLastNote(next).global.compositionEnd).toEqual({ beat: 8 });
  });

  it("can materialize a note-extended end before removing the extending note", () => {
    const visibleExtendedProject = {
      ...createProject(8),
      tracks: [
        {
          ...createProject(8).tracks[0]!,
          notes: [{ id: "tail", pitchStr: "C4", startBeat: 10, durationBeats: 2, velocity: 0.8 }]
        }
      ]
    };
    const materialized = extendExplicitCompositionEndToLastNote(visibleExtendedProject);
    const afterDelete = {
      ...materialized,
      tracks: [{ ...materialized.tracks[0]!, notes: [] }]
    };

    expect(extendExplicitCompositionEndToLastNote(afterDelete).global.compositionEnd).toEqual({ beat: 12 });
  });
});

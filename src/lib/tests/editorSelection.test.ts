import { describe, expect, it } from "vitest";
import { getNoteSelectionKey } from "@/lib/clipboard";
import {
  createEmptyEditorSelection,
  filterEditorSelectionToProject,
  setEditorContentSelection
} from "@/lib/editorSelection";
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
    sampleRate: 48_000,
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

describe("filterEditorSelectionToProject", () => {
  it("preserves the current selection object when all selected content still exists", () => {
    const track = createTrack([{ id: "note_a", pitchStr: "C4", startBeat: 1, durationBeats: 1, velocity: 0.8 }]);
    const selection = setEditorContentSelection(createEmptyEditorSelection(), {
      noteKeys: [getNoteSelectionKey(track.id, "note_a")],
      automationKeyframeSelectionKeys: []
    });

    const filtered = filterEditorSelectionToProject(createProject(track), selection);

    expect(filtered).toBe(selection);
  });
});

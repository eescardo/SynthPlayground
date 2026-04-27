import { describe, expect, it } from "vitest";

import { buildPatchedPreviewProject } from "@/hooks/patch/usePatchWorkspacePreview";
import { createClearPatch } from "@/lib/patch/presets";
import type { AudioProject } from "@/types/audio";
import type { Track } from "@/types/music";

describe("patch workspace preview", () => {
  it("replaces patch macro values with a complete workspace macro set", () => {
    const patch = createClearPatch({ id: "patch_a", name: "Lead" });
    patch.ui.macros = [
      {
        id: "macro_cutoff",
        name: "Cutoff",
        keyframeCount: 2,
        defaultNormalized: 0.5,
        bindings: []
      },
      {
        id: "macro_decay",
        name: "Pop/Slap",
        keyframeCount: 3,
        defaultNormalized: 0.25,
        bindings: []
      }
    ];
    const track: Track = {
      id: "track_a",
      name: "Bass",
      instrumentPatchId: patch.id,
      notes: [],
      volume: 1,
      mute: false,
      solo: false,
      macroValues: {
        macro_cutoff: 0.1,
        macro_decay: 0.9,
        track_only_macro: 0.7
      },
      macroAutomations: {},
      macroPanelExpanded: false,
      fx: {
        delayEnabled: false,
        reverbEnabled: false,
        saturationEnabled: false,
        compressorEnabled: false,
        delayMix: 0,
        reverbMix: 0,
        drive: 0,
        compression: 0
      }
    };
    const project: AudioProject = {
      global: { tempo: 120, sampleRate: 48000, meter: "4/4", gridBeats: 0.25, loop: [] },
      tracks: [track],
      patches: [patch],
      masterFx: {
        compressorEnabled: false,
        limiterEnabled: true,
        makeupGain: 0
      }
    };

    const previewProject = buildPatchedPreviewProject(project, track, patch, { macro_decay: 0 });

    expect(previewProject.tracks[0].macroValues).toEqual({
      macro_cutoff: 0.5,
      macro_decay: 0,
      track_only_macro: 0.7
    });
  });
});

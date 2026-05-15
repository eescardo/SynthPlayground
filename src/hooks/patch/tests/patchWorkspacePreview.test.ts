import { describe, expect, it } from "vitest";

import {
  buildPatchedPreviewProject,
  hasHostGateConnection,
  resolvePatchPreviewCaptureDurationBeats
} from "@/hooks/patch/usePatchWorkspacePreview";
import { HOST_PORT_IDS } from "@/lib/patch/constants";
import { resolvePatchWorkspaceMacroValues } from "@/hooks/patch/usePatchWorkspaceMacroValues";
import { createClearPatch } from "@/lib/patch/presets";
import type { AudioProject } from "@/types/audio";
import type { Track } from "@/types/music";

describe("patch workspace preview", () => {
  it("keeps probe capture open for held previews", () => {
    expect(resolvePatchPreviewCaptureDurationBeats(false, 120)).toBe(1);
    expect(resolvePatchPreviewCaptureDurationBeats(true, 120)).toBe(8);
  });

  it("caps held preview probe capture to a short diagnostic window", () => {
    expect(resolvePatchPreviewCaptureDurationBeats(true, 60)).toBe(4);
    expect(resolvePatchPreviewCaptureDurationBeats(true, 240)).toBe(16);
  });

  it("detects whether a patch uses the host gate for held preview release", () => {
    const patch = createClearPatch({ id: "patch_a", name: "Lead" });
    expect(hasHostGateConnection(patch)).toBe(false);

    patch.connections.push({
      id: "gate_to_env",
      from: { nodeId: HOST_PORT_IDS.gate, portId: "out" },
      to: { nodeId: "env1", portId: "gate" }
    });

    expect(hasHostGateConnection(patch)).toBe(true);
  });

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

  it("uses patch macro defaults for workspace previews when no session override has loaded", () => {
    const patch = createClearPatch({ id: "patch_a", name: "Lead" });
    patch.ui.macros = [
      {
        id: "macro_shape",
        name: "Shape",
        keyframeCount: 2,
        defaultNormalized: 0.72,
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
        macro_shape: 0.1,
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

    const previewProject = buildPatchedPreviewProject(project, track, patch, resolvePatchWorkspaceMacroValues(patch));

    expect(previewProject.tracks[0].macroValues).toEqual({
      macro_shape: 0.72,
      track_only_macro: 0.7
    });
  });
});

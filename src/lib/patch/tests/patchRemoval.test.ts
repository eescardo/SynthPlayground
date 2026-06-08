import { describe, expect, it } from "vitest";
import {
  buildPatchRemovalRequest,
  hasInvalidPatchRemovalFallback,
  removePatchFromProject,
  resolveSurvivingTrackIds
} from "@/lib/patch/patchRemoval";
import { Project, Track, TrackFxSettings } from "@/types/music";
import { Patch } from "@/types/patch";

const fx: TrackFxSettings = {
  delayEnabled: false,
  reverbEnabled: false,
  saturationEnabled: false,
  compressorEnabled: false,
  delayMix: 0,
  reverbMix: 0,
  drive: 0,
  compression: 0
};

function patch(id: string): Patch {
  return {
    schemaVersion: 1,
    id,
    name: id,
    meta: { source: "custom" },
    nodes: [],
    connections: [],
    ui: { macros: [] },
    layout: { nodes: [] }
  };
}

function track(id: string, instrumentPatchId: string): Track {
  return {
    id,
    name: id,
    instrumentPatchId,
    notes: [],
    macroValues: {},
    macroAutomations: {},
    macroPanelExpanded: false,
    volume: 1,
    pan: 0.5,
    mute: false,
    solo: false,
    fx
  };
}

function project(patches: Patch[], tracks: Track[]): Project {
  return {
    id: "project",
    name: "Project",
    global: { tempo: 120, sampleRate: 48000, meter: "4/4", gridBeats: 0.25, loop: [] },
    tracks,
    patches,
    masterFx: { compressorEnabled: false, limiterEnabled: true, makeupGain: 0 },
    ui: { patchWorkspace: { tabs: [] } },
    createdAt: 0,
    updatedAt: 0
  };
}

describe("patch removal", () => {
  it("returns an empty removal row set for unaffected patches", () => {
    const targetPatch = patch("patch_target");
    const removal = buildPatchRemovalRequest(
      project([patch("patch_a"), targetPatch], [track("track_a", "patch_a")]),
      targetPatch
    );

    expect(removal).toEqual({
      patchId: "patch_target",
      rows: []
    });
  });

  it("reassigns affected tracks to the fallback patch", () => {
    const targetPatch = patch("patch_target");
    const removal = buildPatchRemovalRequest(
      project([patch("patch_fallback"), targetPatch], [track("track_a", "patch_target"), track("track_b", "patch_b")]),
      targetPatch
    );

    expect(removal?.rows).toEqual([{ trackId: "track_a", mode: "fallback", fallbackPatchId: "patch_fallback" }]);

    const nextProject = removePatchFromProject(
      project([patch("patch_fallback"), targetPatch], [track("track_a", "patch_target"), track("track_b", "patch_b")]),
      removal!
    );

    expect(nextProject.patches.map((entry) => entry.id)).toEqual(["patch_fallback"]);
    expect(nextProject.tracks.map((entry) => [entry.id, entry.instrumentPatchId])).toEqual([
      ["track_a", "patch_fallback"],
      ["track_b", "patch_b"]
    ]);
  });

  it("removes affected tracks when there is no fallback patch", () => {
    const targetPatch = patch("patch_target");
    const removal = buildPatchRemovalRequest(project([targetPatch], [track("track_a", "patch_target")]), targetPatch);

    expect(removal?.rows).toEqual([{ trackId: "track_a", mode: "remove", fallbackPatchId: "" }]);
    expect(removePatchFromProject(project([targetPatch], [track("track_a", "patch_target")]), removal!).tracks).toEqual(
      []
    );
  });

  it("detects empty and self fallbacks as invalid", () => {
    expect(
      hasInvalidPatchRemovalFallback({
        patchId: "patch_target",
        rows: [{ trackId: "track_a", mode: "fallback", fallbackPatchId: "" }]
      })
    ).toBe(true);
    expect(
      hasInvalidPatchRemovalFallback({
        patchId: "patch_target",
        rows: [{ trackId: "track_a", mode: "fallback", fallbackPatchId: "patch_target" }]
      })
    ).toBe(true);
    expect(
      hasInvalidPatchRemovalFallback({
        patchId: "patch_target",
        rows: [{ trackId: "track_a", mode: "fallback", fallbackPatchId: "patch_other" }]
      })
    ).toBe(false);
  });

  it("reports no surviving tracks when every affected track is removed", () => {
    const removal = {
      patchId: "patch_target",
      rows: [
        { trackId: "track_a", mode: "remove" as const, fallbackPatchId: "" },
        { trackId: "track_b", mode: "remove" as const, fallbackPatchId: "" }
      ]
    };

    expect([
      ...resolveSurvivingTrackIds(
        project([patch("patch_target")], [track("track_a", "patch_target"), track("track_b", "patch_target")]),
        removal
      )
    ]).toEqual([]);
  });
});

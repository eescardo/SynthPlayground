import { describe, expect, it } from "vitest";

import { exportProjectToJson, importProjectFromJson, normalizeProject } from "@/lib/projectSerde";
import { createDefaultProject } from "@/lib/patch/presets";

describe("projectSerde", () => {
  it("normalizeProject upgrades legacy preset metadata and track macro defaults", () => {
  const project = createDefaultProject();
  const legacy = structuredClone(project) as unknown as {
    patches: Array<Record<string, unknown>>;
    tracks: Array<Record<string, unknown>>;
  };
  legacy.patches = legacy.patches.map((patch) =>
    patch.meta && typeof patch.meta === "object" && patch.meta !== null && "source" in patch.meta && patch.meta.source === "preset"
      ? {
          ...patch,
          meta: { source: "preset" as const }
        }
      : patch
  );
  legacy.tracks = legacy.tracks.map((track) => {
    const { macroValues, macroPanelExpanded, ...rest } = track;
    return rest;
  });

  const normalized = normalizeProject(legacy);
  for (const patch of normalized.patches) {
    if (patch.meta.source === "preset") {
      expect(patch.meta.presetId).toBe(patch.id);
      expect(patch.meta.presetVersion).toBe(1);
    }
  }
  for (const track of normalized.tracks) {
    expect(track.macroValues).toEqual({});
    expect(track.macroPanelExpanded).toBe(true);
  }
  });

  it("normalizeProject clamps persisted track macro values into 0..1", () => {
  const project = createDefaultProject();
  const mutated = structuredClone(project);
  mutated.tracks[0].macroValues = {
    macro_cutoff: 2,
    macro_decay: -1,
    ignored: Number.NaN
  };

  const normalized = normalizeProject(mutated);
  expect(normalized.tracks[0].macroValues.macro_cutoff).toBe(1);
  expect(normalized.tracks[0].macroValues.macro_decay).toBe(0);
  expect("ignored" in normalized.tracks[0].macroValues).toBe(false);
  });

  it("import/export roundtrip preserves track macro values and preset lineage", () => {
  const project = createDefaultProject();
  project.tracks[0].macroValues = {
    macro_cutoff: 0.23,
    macro_decay: 0.41
  };

  const roundTrip = importProjectFromJson(exportProjectToJson(project));

  expect(roundTrip.tracks[0].macroValues).toEqual(project.tracks[0].macroValues);
  const presetPatch = roundTrip.patches.find((patch) => patch.id === "preset_bass");
  expect(presetPatch).toBeDefined();
  if (!presetPatch) {
    throw new Error("Expected preset_bass patch to exist after roundtrip");
  }
  expect(presetPatch.meta.source).toBe("preset");
  if (presetPatch.meta.source === "preset") {
    expect(presetPatch.meta.presetId).toBe("preset_bass");
    expect(presetPatch.meta.presetVersion).toBe(1);
  }
  });
});

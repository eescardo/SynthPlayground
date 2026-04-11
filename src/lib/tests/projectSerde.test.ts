import { describe, expect, it } from "vitest";

import { exportProjectToJson, importProjectFromJson, normalizeProject } from "@/lib/projectSerde";
import { createDefaultProject } from "@/lib/patch/presets";
import { getBundledPresetLineage } from "@/lib/patch/source";
import { validatePatch } from "@/lib/patch/validation";

describe("projectSerde", () => {
  it("normalizeProject upgrades legacy preset metadata and defaults macro panel to collapsed", () => {
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
      const nextTrack = { ...track };
      delete nextTrack.macroValues;
      delete nextTrack.macroPanelExpanded;
      return nextTrack;
    });

    const normalized = normalizeProject(legacy);
    for (const patch of normalized.patches) {
      if (patch.meta.source === "preset") {
        const bundledLineage = getBundledPresetLineage(patch.id);
        expect(patch.meta.presetId).toBe(patch.id);
        expect(patch.meta.presetVersion).toBe(bundledLineage?.presetVersion ?? 1);
      }
    }
    for (const track of normalized.tracks) {
      expect(track.macroValues).toEqual({});
      expect(track.macroPanelExpanded).toBe(false);
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
      expect(presetPatch.meta.presetVersion).toBe(getBundledPresetLineage("preset_bass")?.presetVersion ?? 1);
    }
    const pluckPatch = roundTrip.patches.find((patch) => patch.id === "preset_pluck");
    expect(pluckPatch).toBeDefined();
    if (pluckPatch?.meta.source === "preset") {
      expect(pluckPatch.meta.presetVersion).toBe(getBundledPresetLineage("preset_pluck")?.presetVersion ?? 1);
    }
    const popSlapMacro = presetPatch.ui.macros.find((macro) => macro.id === "macro_decay");
    expect(popSlapMacro?.name).toBe("Pop/Slap");
    expect(popSlapMacro?.keyframeCount).toBe(3);
    const attackBinding = popSlapMacro?.bindings.find((binding) => binding.paramId === "attack");
    expect(attackBinding?.map).toBe("piecewise");
    expect(attackBinding?.points).toEqual([
      { x: 0, y: 0.0032 },
      { x: 0.5, y: 0.0075 },
      { x: 1, y: 0.0035 }
    ]);
  });

  it("preserves invalid preset snapshots so UI can surface validation failures", () => {
    const project = createDefaultProject();
    const pluck = project.patches.find((patch) => patch.id === "preset_pluck");
    if (!pluck || pluck.meta.source !== "preset") {
      throw new Error("Expected preset_pluck preset patch");
    }

    pluck.ui.macros[0].bindings.push({
      id: "invalid_conflict_binding",
      nodeId: "vcf1",
      paramId: "cutoffHz",
      map: "linear",
      min: 100,
      max: 200
    });

    const normalized = normalizeProject(project);
    const repairedPluck = normalized.patches.find((patch) => patch.id === "preset_pluck");
    expect(repairedPluck).toBeDefined();
    if (!repairedPluck || repairedPluck.meta.source !== "preset") {
      throw new Error("Expected invalid preset_pluck patch to remain present");
    }
    const validation = validatePatch(repairedPluck);
    expect(validation.ok).toBe(false);
    expect(validation.issues.some((issue) => issue.message.includes("Macro binds the same parameter more than once"))).toBe(true);
  });

  it("treats legacy three-keyframe macros without macro keyframe count as invalid snapshots", () => {
    const project = createDefaultProject();
    const bass = project.patches.find((patch) => patch.id === "preset_bass");
    if (!bass) {
      throw new Error("Expected preset_bass patch");
    }

    const legacy = structuredClone(project) as unknown as { patches: Array<Record<string, unknown>> };
    legacy.patches = legacy.patches.map((patch) => {
      if (patch.id !== "preset_bass") {
        return patch;
      }
      const ui = patch.ui as { macros?: Array<Record<string, unknown>> } | undefined;
      return {
        ...patch,
        ui: {
          ...ui,
          macros: (ui?.macros ?? []).map((macro) => {
            const nextMacro = { ...macro };
            delete nextMacro.keyframeCount;
            return nextMacro;
          })
        }
      };
    });

    const normalized = normalizeProject(legacy);
    const normalizedBass = normalized.patches.find((patch) => patch.id === bass.id);
    const validation = normalizedBass ? validatePatch(normalizedBass) : { ok: true, issues: [] };

    expect(validation.ok).toBe(false);
    expect(validation.issues.some((issue) => issue.message.includes("keyframe count"))).toBe(true);
  });
});

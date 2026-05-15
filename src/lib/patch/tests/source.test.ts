import { describe, expect, it } from "vitest";

import { createDefaultProject } from "@/lib/patch/presets";
import {
  getBundledPresetPatch,
  getProjectPresetUpdateSummary,
  updatePresetPatchToLatest,
  updateProjectPresetsToLatest
} from "@/lib/patch/source";

describe("patch source helpers", () => {
  it("summarizes preset updates with a stable key for the latest bundled versions", () => {
    const project = createDefaultProject();
    const bass = project.patches.find((patch) => patch.id === "preset_bass");
    if (!bass || bass.meta.source !== "preset") {
      throw new Error("Expected preset_bass to be available");
    }
    bass.meta.presetVersion -= 1;

    const summary = getProjectPresetUpdateSummary(project);

    expect(summary?.updates).toEqual([
      {
        patchId: "preset_bass",
        presetId: "preset_bass",
        currentVersion: bass.meta.presetVersion,
        nextVersion: bass.meta.presetVersion + 1
      }
    ]);
    expect(summary?.updateKey).toBe(`preset_bass@${bass.meta.presetVersion + 1}`);
  });

  it("updates stale preset patches while preserving the patch identity and saved layout", () => {
    const latestBass = getBundledPresetPatch("preset_bass");
    if (!latestBass || latestBass.meta.source !== "preset") {
      throw new Error("Expected preset_bass to be available");
    }
    const bass = structuredClone(latestBass);
    if (bass.meta.source !== "preset") {
      throw new Error("Expected cloned preset_bass to keep preset metadata");
    }
    const latestVersion = bass.meta.presetVersion;
    bass.meta.presetVersion = latestVersion - 1;
    bass.name = "My Bass";
    const savedLayoutNode = { nodeId: bass.nodes[0].id, x: 88, y: 13 };
    bass.layout.nodes = [savedLayoutNode];

    const updated = updatePresetPatchToLatest(bass);

    expect(updated.id).toBe("preset_bass");
    expect(updated.name).toBe("My Bass");
    expect(updated.meta).toEqual({ source: "preset", presetId: "preset_bass", presetVersion: latestVersion });
    expect(updated.layout.nodes.find((entry) => entry.nodeId === savedLayoutNode.nodeId)).toEqual(savedLayoutNode);
  });

  it("updates all stale project presets and clears the dismissed update key", () => {
    const project = createDefaultProject();
    project.ui.dismissedPresetUpdateKey = "preset_bass@old";
    for (const patchId of ["preset_bass", "preset_pluck"]) {
      const patch = project.patches.find((entry) => entry.id === patchId);
      if (patch?.meta.source === "preset") {
        patch.meta.presetVersion -= 1;
      }
    }

    const updatedProject = updateProjectPresetsToLatest(project);

    expect(getProjectPresetUpdateSummary(updatedProject)).toBeNull();
    expect(updatedProject.ui.dismissedPresetUpdateKey).toBeUndefined();
  });
});

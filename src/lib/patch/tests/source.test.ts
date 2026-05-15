import { describe, expect, it } from "vitest";

import { createDefaultProject } from "@/lib/patch/presets";
import {
  getBundledPresetPatch,
  getProjectPresetUpdateSummary,
  updatePresetPatchToLatest,
  updateProjectPresetsToLatest
} from "@/lib/patch/source";

describe("patch source helpers", () => {
  it("creates the default song with the latest bundled bass preset", () => {
    const project = createDefaultProject();
    const bass = project.patches.find((patch) => patch.id === "preset_bass");
    const latestBass = getBundledPresetPatch("preset_bass");
    if (!bass || bass.meta.source !== "preset" || !latestBass || latestBass.meta.source !== "preset") {
      throw new Error("Expected preset_bass to be available");
    }

    expect(getProjectPresetUpdateSummary(project)).toBeNull();
    expect(bass.meta.presetVersion).toBe(latestBass.meta.presetVersion);
    expect(bass.nodes.map((node) => node.id)).toEqual(latestBass.nodes.map((node) => node.id));
    expect(bass.connections.map((connection) => connection.id)).toEqual(
      latestBass.connections.map((connection) => connection.id)
    );
    expect(bass.ui.macros.map((macro) => macro.id)).toEqual(latestBass.ui.macros.map((macro) => macro.id));
  });

  it("summarizes preset updates that exceed the per-project dismissed versions", () => {
    const project = createDefaultProject();
    const bass = project.patches.find((patch) => patch.id === "preset_bass");
    if (!bass || bass.meta.source !== "preset") {
      throw new Error("Expected preset_bass to be available");
    }
    const latestVersion = bass.meta.presetVersion;
    bass.meta.presetVersion = latestVersion - 2;
    project.ui.dismissedPresetUpdateVersions = {
      preset_bass: latestVersion - 1
    };

    const summary = getProjectPresetUpdateSummary(project);

    expect(summary?.updates).toEqual([
      {
        patchId: "preset_bass",
        presetId: "preset_bass",
        currentVersion: bass.meta.presetVersion,
        nextVersion: latestVersion
      }
    ]);
  });

  it("does not summarize preset updates that the project already dismissed at that version", () => {
    const project = createDefaultProject();
    const bass = project.patches.find((patch) => patch.id === "preset_bass");
    if (!bass || bass.meta.source !== "preset") {
      throw new Error("Expected preset_bass to be available");
    }
    const latestVersion = bass.meta.presetVersion;
    bass.meta.presetVersion = latestVersion - 1;
    project.ui.dismissedPresetUpdateVersions = {
      preset_bass: latestVersion
    };

    expect(getProjectPresetUpdateSummary(project)).toBeNull();
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

  it("updates all stale project presets and clears dismissed update versions", () => {
    const project = createDefaultProject();
    project.ui.dismissedPresetUpdateVersions = { preset_bass: 1 };
    for (const patchId of ["preset_bass", "preset_pluck"]) {
      const patch = project.patches.find((entry) => entry.id === patchId);
      if (patch?.meta.source === "preset") {
        patch.meta.presetVersion -= 1;
      }
    }

    const updatedProject = updateProjectPresetsToLatest(project);

    expect(getProjectPresetUpdateSummary(updatedProject)).toBeNull();
    expect(updatedProject.ui.dismissedPresetUpdateVersions).toBeUndefined();
  });
});

import { presetPatches } from "@/lib/patch/presets";
import type { Project } from "@/types/music";
import type { Patch, PatchMeta } from "@/types/patch";

export type PatchSource = Patch["meta"]["source"];
export type PatchPresetStatus = "preset" | "preset_update_available" | "legacy_preset" | "custom";

interface BundledPresetLineage {
  presetId: string;
  presetVersion: number;
}

const bundledPresetLineageById = new Map<string, BundledPresetLineage>();
const bundledPresetById = new Map<string, Patch>();

for (const patch of presetPatches) {
  if (patch.meta.source === "preset" && Number.isFinite(patch.meta.presetVersion)) {
    bundledPresetLineageById.set(patch.meta.presetId, {
      presetId: patch.meta.presetId,
      presetVersion: patch.meta.presetVersion
    });
    bundledPresetById.set(patch.meta.presetId, patch);
  }
}

export const resolvePatchSource = (
  patch: Pick<Patch, "id"> & { meta?: Pick<PatchMeta, "source"> | null }
): PatchSource => {
  if (patch.meta?.source === "preset" || patch.meta?.source === "custom") {
    return patch.meta.source;
  }
  return patch.id.startsWith("preset_") ? "preset" : "custom";
};

export const getBundledPresetLineage = (presetId: string | undefined): BundledPresetLineage | undefined =>
  presetId ? bundledPresetLineageById.get(presetId) : undefined;

export const getBundledPresetPatch = (presetId: string | undefined): Patch | undefined =>
  presetId ? bundledPresetById.get(presetId) : undefined;

export const resolvePatchPresetStatus = (patch: Pick<Patch, "id"> & { meta?: PatchMeta | null }): PatchPresetStatus => {
  const source = resolvePatchSource(patch);
  if (source === "custom") {
    return "custom";
  }

  const presetId = patch.meta?.source === "preset" ? patch.meta.presetId : patch.id;
  const bundled = getBundledPresetLineage(presetId);
  if (!bundled) {
    return "legacy_preset";
  }

  const storedVersion = patch.meta?.source === "preset" ? patch.meta.presetVersion : bundled.presetVersion;
  return bundled.presetVersion > storedVersion ? "preset_update_available" : "preset";
};

export interface ProjectPresetUpdateSummary {
  updateKey: string;
  updates: Array<{
    patchId: string;
    presetId: string;
    currentVersion: number;
    nextVersion: number;
  }>;
}

export const getProjectPresetUpdateSummary = (project: Pick<Project, "patches">): ProjectPresetUpdateSummary | null => {
  const updates = project.patches.flatMap((patch) => {
    if (resolvePatchPresetStatus(patch) !== "preset_update_available" || patch.meta?.source !== "preset") {
      return [];
    }
    const bundled = getBundledPresetLineage(patch.meta.presetId);
    if (!bundled) {
      return [];
    }
    return [
      {
        patchId: patch.id,
        presetId: patch.meta.presetId,
        currentVersion: patch.meta.presetVersion,
        nextVersion: bundled.presetVersion
      }
    ];
  });

  if (updates.length === 0) {
    return null;
  }

  updates.sort((a, b) => a.presetId.localeCompare(b.presetId) || a.patchId.localeCompare(b.patchId));
  return {
    updates,
    updateKey: updates.map((update) => `${update.presetId}@${update.nextVersion}`).join("|")
  };
};

export const updatePresetPatchToLatest = (patch: Patch): Patch => {
  if (patch.meta.source !== "preset") {
    return patch;
  }

  const latestPreset = getBundledPresetPatch(patch.meta.presetId);
  if (
    !latestPreset ||
    latestPreset.meta.source !== "preset" ||
    latestPreset.meta.presetVersion <= patch.meta.presetVersion
  ) {
    return patch;
  }

  const savedLayoutByNodeId = new Map(patch.layout.nodes.map((entry) => [entry.nodeId, entry] as const));
  return {
    ...structuredClone(latestPreset),
    id: patch.id,
    name: patch.name,
    meta: {
      source: "preset",
      presetId: latestPreset.meta.presetId,
      presetVersion: latestPreset.meta.presetVersion
    },
    layout: {
      nodes: latestPreset.layout.nodes.map((entry) => savedLayoutByNodeId.get(entry.nodeId) ?? entry)
    }
  };
};

export const updateProjectPresetsToLatest = (project: Project): Project => {
  const summary = getProjectPresetUpdateSummary(project);
  if (!summary) {
    return project;
  }

  return {
    ...project,
    patches: project.patches.map(updatePresetPatchToLatest),
    ui: {
      ...project.ui,
      dismissedPresetUpdateKey: undefined
    }
  };
};

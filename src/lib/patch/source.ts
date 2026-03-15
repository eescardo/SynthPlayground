import { presetPatches } from "@/lib/patch/presets";
import { Patch } from "@/types/patch";

export type PatchSource = Patch["meta"]["source"];
export type PatchPresetStatus = "preset" | "preset_update_available" | "legacy_preset" | "custom";

interface BundledPresetLineage {
  presetId: string;
  presetVersion: number;
}

const bundledPresetLineageById = new Map<string, BundledPresetLineage>();

for (const patch of presetPatches) {
  if (patch.meta.source === "preset" && patch.meta.presetId && Number.isFinite(patch.meta.presetVersion)) {
    bundledPresetLineageById.set(patch.meta.presetId, {
      presetId: patch.meta.presetId,
      presetVersion: patch.meta.presetVersion ?? 1
    });
  }
}

export const resolvePatchSource = (patch: Pick<Patch, "id"> & { meta?: { source?: PatchSource } | null }): PatchSource => {
  if (patch.meta?.source === "preset" || patch.meta?.source === "custom") {
    return patch.meta.source;
  }
  return patch.id.startsWith("preset_") ? "preset" : "custom";
};

export const getBundledPresetLineage = (presetId: string | undefined): BundledPresetLineage | undefined =>
  presetId ? bundledPresetLineageById.get(presetId) : undefined;

export const resolvePatchPresetStatus = (
  patch: Pick<Patch, "id"> & { meta?: { source?: PatchSource; presetId?: string; presetVersion?: number } | null }
): PatchPresetStatus => {
  const source = resolvePatchSource(patch);
  if (source === "custom") {
    return "custom";
  }

  const presetId = patch.meta?.presetId ?? patch.id;
  const bundled = getBundledPresetLineage(presetId);
  if (!bundled) {
    return "legacy_preset";
  }

  const storedVersion = patch.meta?.presetVersion ?? bundled.presetVersion;
  return bundled.presetVersion > storedVersion ? "preset_update_available" : "preset";
};

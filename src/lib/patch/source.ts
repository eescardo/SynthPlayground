import { presetPatches } from "@/lib/patch/presets";
import { Patch, PatchMeta } from "@/types/patch";

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

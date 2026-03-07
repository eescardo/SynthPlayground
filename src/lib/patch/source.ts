import { Patch } from "@/types/patch";

export type PatchSource = Patch["meta"]["source"];

export const resolvePatchSource = (patch: Pick<Patch, "id"> & { meta?: { source?: PatchSource } | null }): PatchSource => {
  if (patch.meta?.source === "preset" || patch.meta?.source === "custom") {
    return patch.meta.source;
  }
  return patch.id.startsWith("preset_") ? "preset" : "custom";
};

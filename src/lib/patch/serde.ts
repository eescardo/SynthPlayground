import { normalizePatch } from "@/lib/patch/codec";
import { createEmptyProjectAssetLibrary, normalizeProjectAssetLibrary, pickReferencedPatchAssets } from "@/lib/sampleAssetLibrary";
import { ProjectAssetLibrary } from "@/types/assets";
import { Patch } from "@/types/patch";

export const PATCH_BUNDLE_KIND = "synth-playground-patch";
export const PATCH_BUNDLE_VERSION = 1;

interface SerializedPatchBundleV1 {
  kind: typeof PATCH_BUNDLE_KIND;
  version: typeof PATCH_BUNDLE_VERSION;
  patch: Patch;
  assets: ProjectAssetLibrary;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isSerializedPatchBundleV1 = (value: unknown): value is SerializedPatchBundleV1 =>
  isObject(value) &&
  value.kind === PATCH_BUNDLE_KIND &&
  value.version === PATCH_BUNDLE_VERSION &&
  isObject(value.patch) &&
  isObject(value.assets);

export const exportPatchToJson = (
  patch: Patch,
  assets: ProjectAssetLibrary = createEmptyProjectAssetLibrary()
): string =>
  JSON.stringify(
    {
      kind: PATCH_BUNDLE_KIND,
      version: PATCH_BUNDLE_VERSION,
      patch,
      assets: pickReferencedPatchAssets(patch, assets)
    } satisfies SerializedPatchBundleV1,
    null,
    2
  );

export const importPatchBundleFromJson = (json: string): { patch: Patch; assets: ProjectAssetLibrary } => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("Invalid JSON");
  }

  if (!isObject(parsed)) {
    throw new Error("Patch JSON root must be an object");
  }

  if (isSerializedPatchBundleV1(parsed)) {
    return {
      patch: normalizePatch(parsed.patch, { fallbackId: "imported_patch", fallbackName: "Imported Patch" }),
      assets: normalizeProjectAssetLibrary(parsed.assets)
    };
  }

  return {
    patch: normalizePatch(parsed, { fallbackId: "imported_patch", fallbackName: "Imported Patch" }),
    assets: createEmptyProjectAssetLibrary()
  };
};

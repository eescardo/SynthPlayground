import { describe, expect, it } from "vitest";
import {
  exportPatchToJson,
  importPatchBundleFromJson,
  PATCH_BUNDLE_KIND,
  PATCH_BUNDLE_VERSION
} from "@/lib/patch/serde";
import { createClearPatch } from "@/lib/patch/presets";
import { normalizeProjectAssetLibrary } from "@/lib/sampleAssetLibrary";

describe("patch serde", () => {
  it("exports a versioned patch bundle with referenced sample assets only", () => {
    const patch = createClearPatch({ id: "patch_sample", name: "Sampler" });
    patch.nodes.unshift({
      id: "sample1",
      typeId: "SamplePlayer",
      params: {
        mode: "oneshot",
        start: 0,
        end: 1,
        gain: 1,
        pitchSemis: 0,
        sampleAssetId: "asset_used"
      }
    });

    const parsed = JSON.parse(
      exportPatchToJson(
        patch,
        normalizeProjectAssetLibrary({
          samplePlayerById: {
            asset_used: '{"version":1,"name":"used.wav","sampleRate":48000,"samples":[0,0.2]}',
            asset_unused: '{"version":1,"name":"unused.wav","sampleRate":48000,"samples":[0]}'
          }
        })
      )
    ) as {
      kind: string;
      version: number;
      assets: { samplePlayerById: Record<string, { version: number; name: string }> };
    };

    expect(parsed.kind).toBe(PATCH_BUNDLE_KIND);
    expect(parsed.version).toBe(PATCH_BUNDLE_VERSION);
    expect(parsed.assets.samplePlayerById.asset_used?.version).toBe(2);
    expect(parsed.assets.samplePlayerById.asset_used?.name).toBe("used.wav");
    expect(parsed.assets.samplePlayerById.asset_unused).toBeUndefined();
  });

  it("imports versioned patch bundles as regular custom patches", () => {
    const patch = createClearPatch({
      id: "patch_clone",
      name: "Bass Copy"
    });

    const imported = importPatchBundleFromJson(exportPatchToJson(patch));

    expect(imported.patch.meta).toEqual({ source: "custom" });
  });

  it("rejects raw patch objects without a versioned bundle wrapper", () => {
    const patch = createClearPatch({
      id: "patch_raw",
      name: "Raw Patch"
    });

    expect(() => importPatchBundleFromJson(JSON.stringify(patch))).toThrow(
      "Patch JSON must be a versioned Synth Playground patch bundle"
    );
  });
});

import { describe, expect, it } from "vitest";
import { exportPatchToJson, importPatchBundleFromJson, PATCH_BUNDLE_KIND, PATCH_BUNDLE_VERSION } from "@/lib/patch/serde";
import { createClearPatch } from "@/lib/patch/presets";

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

    const parsed = JSON.parse(exportPatchToJson(patch, {
      samplePlayerById: {
        asset_used: "{\"version\":1,\"name\":\"used.wav\",\"sampleRate\":48000,\"samples\":[0,0.2]}",
        asset_unused: "{\"version\":1,\"name\":\"unused.wav\",\"sampleRate\":48000,\"samples\":[0]}"
      }
    })) as {
      kind: string;
      version: number;
      assets: { samplePlayerById: Record<string, string> };
    };

    expect(parsed.kind).toBe(PATCH_BUNDLE_KIND);
    expect(parsed.version).toBe(PATCH_BUNDLE_VERSION);
    expect(parsed.assets.samplePlayerById.asset_used).toContain("\"used.wav\"");
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
});

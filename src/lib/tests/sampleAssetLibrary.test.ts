import { describe, expect, it } from "vitest";
import {
  buildMissingSampleAssetIssues,
  createEmptyProjectAssetLibrary,
  mergeImportedPatchAssets,
  normalizeProjectAssetLibrary
} from "@/lib/sampleAssetLibrary";
import { createClearPatch, createDefaultProject } from "@/lib/patch/presets";

describe("sampleAssetLibrary", () => {
  it("reports missing referenced sample assets", () => {
    const project = createDefaultProject();
    const patch = {
      ...project.patches[0],
      nodes: [
        {
          id: "sample1",
          typeId: "SamplePlayer",
          params: {
            mode: "oneshot",
            start: 0,
            end: 1,
            gain: 1,
            pitchSemis: 0,
            sampleAssetId: "missing_asset"
          }
        }
      ]
    };

    const issues = buildMissingSampleAssetIssues(patch, createEmptyProjectAssetLibrary());

    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe("sample-asset-missing");
  });

  it("remaps imported sample assets when ids collide with different data", () => {
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
        sampleAssetId: "asset_1"
      }
    });

    const merged = mergeImportedPatchAssets(
      patch,
      normalizeProjectAssetLibrary({
        samplePlayerById: {
          asset_1: {
            version: 2,
            name: "imported.wav",
            sampleRate: 48000,
            samples: new Float32Array([0, 0.2])
          }
        }
      }),
      normalizeProjectAssetLibrary({
        samplePlayerById: {
          asset_1: {
            version: 2,
            name: "existing.wav",
            sampleRate: 48000,
            samples: new Float32Array([0, 0.1])
          }
        }
      })
    );

    const remappedAssetId = String(merged.patch.nodes[0]?.params.sampleAssetId);

    expect(remappedAssetId).not.toBe("asset_1");
    expect(merged.assets.samplePlayerById.asset_1?.name).toBe("existing.wav");
    expect(merged.assets.samplePlayerById[remappedAssetId]?.name).toBe("imported.wav");
  });
});

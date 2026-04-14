import { describe, expect, it } from "vitest";
import {
  buildMissingSampleAssetIssues,
  createEmptyProjectAssetLibrary,
  extractInlineSamplePlayerAssets
} from "@/lib/sampleAssetLibrary";
import { createDefaultProject } from "@/lib/patch/presets";

describe("sampleAssetLibrary", () => {
  it("migrates inline sample player data into the external asset library", () => {
    const project = createDefaultProject();
    project.patches = [
      {
        ...project.patches[0],
        id: "patch_sample",
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
              sampleData: "{\"version\":1,\"name\":\"tone.wav\",\"sampleRate\":48000,\"samples\":[0,0.1,-0.1]}"
            }
          }
        ]
      }
    ];

    const migrated = extractInlineSamplePlayerAssets(project, createEmptyProjectAssetLibrary());
    const migratedNode = migrated.project.patches[0].nodes[0];
    const migratedAssetId = String(migratedNode.params.sampleAssetId);

    expect(migrated.migrated).toBe(true);
    expect(typeof migratedNode.params.sampleAssetId).toBe("string");
    expect(migratedNode.params.sampleData).toBeUndefined();
    expect(migrated.assets.samplePlayerById[migratedAssetId]).toContain("\"tone.wav\"");
  });

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
});

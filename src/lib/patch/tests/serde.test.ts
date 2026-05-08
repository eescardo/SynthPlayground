import { describe, expect, it } from "vitest";
import { exportPatchToJson, importPatchBundleFromJson, PATCH_BUNDLE_KIND, PATCH_BUNDLE_VERSION } from "@/lib/patch/serde";
import { createClearPatch } from "@/lib/patch/presets";
import { validatePatch } from "@/lib/patch/validation";
import { Patch } from "@/types/patch";

const schemaShapeIssueCodes = new Set([
  "node-param-missing",
  "node-param-unknown",
  "node-param-type-mismatch",
  "node-param-invalid-option",
  "macro-binding-invalid-param",
  "param-range-invalid-param"
]);

function expectNoSchemaShapeIssues(patch: Patch) {
  expect(validatePatch(patch).issues.filter((issue) => schemaShapeIssueCodes.has(issue.code ?? ""))).toEqual([]);
}

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

  it("migrates legacy ADSR timing values from seconds to milliseconds", () => {
    const legacyPatch = createClearPatch({
      id: "patch_legacy_adsr",
      name: "Legacy ADSR"
    });
    legacyPatch.schemaVersion = 1;
    legacyPatch.nodes = [
      {
        id: "env1",
        typeId: "ADSR",
        params: {
          attack: 0.01,
          decay: 0.2,
          sustain: 0.7,
          release: 0.25
        }
      }
    ];
    legacyPatch.ui.paramRanges = {
      "env1:attack": { min: 0, max: 1 },
      "env1:decay": { min: 0, max: 10 }
    };
    legacyPatch.ui.macros = [
      {
        id: "macro_env",
        name: "Env",
        keyframeCount: 3,
        bindings: [
          {
            id: "legacy_attack",
            nodeId: "env1",
            paramId: "attack",
            map: "piecewise",
            min: 0.003,
            max: 0.25,
            points: [
              { x: 0, y: 0.003 },
              { x: 0.5, y: 0.01 },
              { x: 1, y: 0.25 }
            ]
          }
        ]
      }
    ];

    const imported = importPatchBundleFromJson(exportPatchToJson(legacyPatch));

    expect(imported.patch.schemaVersion).toBe(4);
    expect(imported.patch.nodes[0]?.params).toEqual({
      attack: 10,
      decay: 200,
      sustain: 0.7,
      release: 250,
      curve: 0,
      mode: "retrigger_from_current"
    });
    expectNoSchemaShapeIssues(imported.patch);
    expect(imported.patch.ui.paramRanges).toEqual({
      "env1:attack": { min: 0, max: 1000 },
      "env1:decay": { min: 0, max: 10000 }
    });
    expect(imported.patch.ui.macros[0]?.bindings[0]).toMatchObject({
      min: 3,
      max: 250,
      points: [
        { x: 0, y: 3 },
        { x: 0.5, y: 10 },
        { x: 1, y: 250 }
      ]
    });
  });

  it("migrates legacy Overdrive gain and removes local mix", () => {
    const legacyPatch = createClearPatch({
      id: "patch_legacy_overdrive",
      name: "Legacy Overdrive"
    });
    legacyPatch.schemaVersion = 2;
    legacyPatch.nodes = [
      {
        id: "drive1",
        typeId: "Overdrive",
        params: {
          gainDb: 18,
          tone: 0.7,
          mix: 0.5,
          mode: "fuzz"
        }
      }
    ];
    legacyPatch.ui.paramRanges = {
      "drive1:gainDb": { min: 0, max: 36 },
      "drive1:mix": { min: 0, max: 1 }
    };
    legacyPatch.ui.macros = [
      {
        id: "macro_drive",
        name: "Drive",
        keyframeCount: 2,
        bindings: [
          {
            id: "legacy_drive",
            nodeId: "drive1",
            paramId: "gainDb",
            map: "linear",
            min: 3,
            max: 24
          },
          {
            id: "legacy_mix",
            nodeId: "drive1",
            paramId: "mix",
            map: "linear",
            min: 0.1,
            max: 0.8
          }
        ]
      }
    ];

    const imported = importPatchBundleFromJson(exportPatchToJson(legacyPatch));

    expect(imported.patch.schemaVersion).toBe(4);
    expect(imported.patch.nodes[0]?.params).toEqual({
      driveDb: 18,
      tone: 0.7,
      mode: "fuzz"
    });
    expect(imported.patch.ui.paramRanges).toEqual({
      "drive1:driveDb": { min: 0, max: 36 }
    });
    expect(imported.patch.ui.macros[0]?.bindings).toHaveLength(1);
    expect(imported.patch.ui.macros[0]?.bindings[0]).toMatchObject({
      nodeId: "drive1",
      paramId: "driveDb",
      min: 3,
      max: 24
    });
    expectNoSchemaShapeIssues(imported.patch);
  });

  it("migrates legacy Compressor controls to squash and drops derived params", () => {
    const legacyPatch = createClearPatch({
      id: "patch_legacy_compressor",
      name: "Legacy Compressor"
    });
    legacyPatch.schemaVersion = 3;
    legacyPatch.nodes = [
      {
        id: "comp1",
        typeId: "Compressor",
        params: {
          thresholdDb: -24,
          ratio: 4,
          attackMs: 8,
          releaseMs: 200,
          makeupDb: 4,
          mix: 0.8
        }
      }
    ];
    legacyPatch.ui.paramRanges = {
      "comp1:thresholdDb": { min: -48, max: -12 },
      "comp1:makeupDb": { min: 0, max: 12 }
    };
    legacyPatch.ui.macros = [
      {
        id: "macro_comp",
        name: "Comp",
        keyframeCount: 3,
        bindings: [
          {
            id: "legacy_threshold",
            nodeId: "comp1",
            paramId: "thresholdDb",
            map: "piecewise",
            min: -12,
            max: -48,
            points: [
              { x: 0, y: -12 },
              { x: 0.5, y: -24 },
              { x: 1, y: -48 }
            ]
          },
          {
            id: "legacy_makeup",
            nodeId: "comp1",
            paramId: "makeupDb",
            map: "linear",
            min: 0,
            max: 12
          }
        ]
      }
    ];

    const imported = importPatchBundleFromJson(exportPatchToJson(legacyPatch));
    const params = imported.patch.nodes[0]?.params;

    expect(imported.patch.schemaVersion).toBe(4);
    expect(params?.thresholdDb).toBeUndefined();
    expect(params?.ratio).toBeUndefined();
    expect(params?.releaseMs).toBeUndefined();
    expect(params?.makeupDb).toBeUndefined();
    expect(params?.squash).toBeCloseTo(0.374706759);
    expect(params?.attackMs).toBe(10);
    expect(params?.mix).toBe(0.8);
    expect(imported.patch.ui.paramRanges?.["comp1:squash"]).toEqual({
      min: expect.closeTo(0.186220459),
      max: 1
    });
    expect(imported.patch.ui.paramRanges?.["comp1:makeupDb"]).toBeUndefined();
    expect(imported.patch.ui.macros[0]?.bindings).toHaveLength(1);
    expect(imported.patch.ui.macros[0]?.bindings[0]).toMatchObject({
      nodeId: "comp1",
      paramId: "squash",
      min: expect.closeTo(0.186220459),
      max: 1,
      points: [
        { x: 0, y: expect.closeTo(0.186220459) },
        { x: 0.5, y: expect.closeTo(0.469418628) },
        { x: 1, y: 1 }
      ]
    });
    expectNoSchemaShapeIssues(imported.patch);
  });

  it("migrates legacy output nodes into ports while preserving params", () => {
    const legacyPatch = createClearPatch({
      id: "patch_legacy",
      name: "Legacy"
    });
    legacyPatch.nodes = [
      {
        id: "vca1",
        typeId: "VCA",
        params: {
          bias: 0,
          gain: 1
        }
      },
      {
        id: "legacy_output",
        typeId: "Output",
        params: {
          gainDb: -9,
          limiter: false
        }
      }
    ];
    legacyPatch.connections = [
      {
        id: "conn_output",
        from: { nodeId: "vca1", portId: "out" },
        to: { nodeId: "legacy_output", portId: "in" }
      }
    ];
    legacyPatch.ports = undefined;
    legacyPatch.layout.nodes = [{ nodeId: "legacy_output", x: 18, y: 6 }];
    (legacyPatch as Patch & { io: { audioOutNodeId: string } }).io = {
      audioOutNodeId: "legacy_output"
    };
    legacyPatch.ui.paramRanges = {
      "legacy_output:gainDb": { min: -24, max: 0 }
    };
    legacyPatch.ui.macros = [
      {
        id: "macro_output",
        name: "Output",
        keyframeCount: 2,
        bindings: [
          {
            id: "old_output_binding",
            nodeId: "legacy_output",
            paramId: "gainDb",
            map: "linear",
            min: -18,
            max: 0
          }
        ]
      }
    ];

    const imported = importPatchBundleFromJson(exportPatchToJson(legacyPatch));

    expect(imported.patch.nodes).toEqual([
      {
        id: "vca1",
        typeId: "VCA",
        params: {
          bias: 0,
          gain: 1
        }
      }
    ]);
    expect(imported.patch.layout.nodes).toEqual([{ nodeId: "vca1", x: 4, y: 2 }]);
    expect(imported.patch.connections).toEqual([
      {
        id: "conn_output",
        from: { nodeId: "vca1", portId: "out" },
        to: { nodeId: "output", portId: "in" }
      }
    ]);
    expect(imported.patch).not.toHaveProperty("io");
    expect(imported.patch.ui.paramRanges).toEqual({
      "output:gainDb": { min: -24, max: 0 }
    });
    expect(imported.patch.ui.macros[0]?.bindings[0]?.nodeId).toBe("output");
    expect(imported.patch.ports).toEqual([
      {
        id: "output",
        typeId: "Output",
        label: "output",
        direction: "sink",
        params: {
          gainDb: -9,
          limiter: false
        }
      }
    ]);
  });
});

import { describe, expect, it } from "vitest";

import { buildPatchDiff } from "@/lib/patch/diff";
import { createClearPatch } from "@/lib/patch/presets";
import { PATCH_OUTPUT_PORT_ID } from "@/lib/patch/ports";

describe("patch diff", () => {
  it("tracks added, changed, and removed patch structure against a baseline snapshot", () => {
    const baseline = createClearPatch({
      id: "patch_a",
      name: "Lead"
    });
    baseline.nodes.unshift({
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
    baseline.layout.nodes.unshift({ nodeId: "sample1", x: 4, y: 4 });
    baseline.connections.unshift({
      id: "conn_sample1_out",
      from: { nodeId: "sample1", portId: "out" },
      to: { nodeId: PATCH_OUTPUT_PORT_ID, portId: "in" }
    });
    baseline.ui.macros.push(
      {
        id: "macro_pitch",
        name: "Pitch",
        keyframeCount: 2,
        bindings: [
          {
            id: "binding_pitch",
            nodeId: "sample1",
            paramId: "pitchSemis",
            map: "linear",
            min: -12,
            max: 12
          }
        ]
      },
      {
        id: "macro_gain",
        name: "Gain",
        keyframeCount: 2,
        bindings: [
          {
            id: "binding_gain",
            nodeId: "sample1",
            paramId: "gain",
            map: "linear",
            min: 0.4,
            max: 1.2
          }
        ]
      }
    );

    const current = structuredClone(baseline);
    const currentSample = current.nodes.find((node) => node.id === "sample1");
    if (!currentSample) {
      throw new Error("Expected sample1 node in current patch");
    }
    currentSample.params.gain = 0.7;

    const pitchMacro = current.ui.macros.find((macro) => macro.id === "macro_pitch");
    if (!pitchMacro) {
      throw new Error("Expected macro_pitch in current patch");
    }
    pitchMacro.name = "Pitch Sweep";
    pitchMacro.bindings[0].max = 7;

    current.ui.macros = current.ui.macros.filter((macro) => macro.id !== "macro_gain");
    current.nodes.push({
      id: "sample2",
      typeId: "SamplePlayer",
      params: {
        mode: "loop",
        start: 0.1,
        end: 0.9,
        gain: 0.6,
        pitchSemis: 7,
        sampleAssetId: "asset_2"
      }
    });
    current.layout.nodes.push({ nodeId: "sample2", x: 10, y: 4 });
    current.connections = [
      {
        id: "conn_sample2_out",
        from: { nodeId: "sample2", portId: "out" },
        to: { nodeId: PATCH_OUTPUT_PORT_ID, portId: "in" }
      }
    ];
    current.ui.macros.push({
      id: "macro_texture",
      name: "Texture",
      keyframeCount: 3,
      bindings: []
    });

    const diff = buildPatchDiff(current, baseline);

    expect(diff.hasBaseline).toBe(true);
    expect(diff.hasChanges).toBe(true);
    expect(diff.nodeDiffById.get("sample1")?.status).toBe("modified");
    expect(diff.nodeDiffById.get("sample1")?.changedParamIds.has("gain")).toBe(true);
    expect(diff.nodeDiffById.get("sample1")?.changedBindingKeys.has("macro_pitch:sample1:pitchSemis")).toBe(true);
    expect(diff.nodeDiffById.get("sample1")?.removedBindingKeys.has("macro_gain:sample1:gain")).toBe(true);
    expect(diff.nodeDiffById.get("sample1")?.hasConnectionChanges).toBe(true);
    expect(diff.nodeDiffById.get("sample2")?.status).toBe("added");
    expect(diff.macroDiffById.get("macro_pitch")?.status).toBe("modified");
    expect(diff.macroDiffById.get("macro_texture")?.status).toBe("added");
    expect(diff.removedMacros.map((macro) => macro.id)).toEqual(["macro_gain"]);
    expect(diff.currentBindingDiffByKey.get("macro_pitch:sample1:pitchSemis")?.status).toBe("modified");
    expect(diff.removedBindingDiffs.map((bindingDiff) => bindingDiff.key)).toEqual(["macro_gain:sample1:gain"]);
    expect(diff.addedConnections.map((connection) => connection.id)).toEqual(["conn_sample2_out"]);
    expect(diff.removedConnections.map((connection) => connection.id)).toEqual(["conn_sample1_out"]);
    expect(diff.summary).toMatchObject({
      addedNodeCount: 1,
      modifiedNodeCount: 2,
      removedNodeCount: 0,
      addedMacroCount: 1,
      modifiedMacroCount: 1,
      removedMacroCount: 1,
      addedConnectionCount: 1,
      removedConnectionCount: 1,
      changedBindingCount: 1,
      removedBindingCount: 1
    });
  });

  it("tracks parameter slider range-only changes as module modifications", () => {
    const baseline = createClearPatch({ id: "patch_a", name: "Lead" });
    baseline.ui.paramRanges = {
      "output:gain": { min: 0, max: 1 }
    };
    const current = structuredClone(baseline);
    current.ui.paramRanges = {
      "output:gain": { min: 0.25, max: 0.9 }
    };

    const diff = buildPatchDiff(current, baseline);

    expect(diff.nodeDiffById.get("output")?.status).toBe("modified");
    expect(diff.nodeDiffById.get("output")?.changedParamIds.has("gain")).toBe(true);
    expect(diff.nodeDiffById.get("output")?.changedParamRangeIds.has("gain")).toBe(true);
    expect(diff.summary.modifiedNodeCount).toBe(1);
  });

  it("tracks a removed macro binding on an otherwise unchanged module", () => {
    const baseline = createClearPatch({ id: "patch_a", name: "Lead" });
    baseline.ui.macros = [
      {
        id: "macro_gain",
        name: "Gain",
        keyframeCount: 2,
        bindings: [
          {
            id: "binding_gain",
            nodeId: "output",
            paramId: "gain",
            map: "linear",
            min: 0.2,
            max: 1
          }
        ]
      }
    ];
    const current = structuredClone(baseline);
    current.ui.macros[0].bindings = [];

    const diff = buildPatchDiff(current, baseline);

    expect(diff.nodeDiffById.get("output")?.status).toBe("modified");
    expect(diff.nodeDiffById.get("output")?.removedBindingKeys.has("macro_gain:output:gain")).toBe(true);
    expect(diff.macroDiffById.get("macro_gain")?.status).toBe("modified");
    expect(diff.removedBindingDiffs.map((bindingDiff) => bindingDiff.key)).toEqual(["macro_gain:output:gain"]);
    expect(diff.removedBindingDiffsByNodeParamKey.get("output:gain")?.map((bindingDiff) => bindingDiff.key)).toEqual([
      "macro_gain:output:gain"
    ]);
  });

  it("treats remove and re-add of the same macro target as the same binding", () => {
    const baseline = createClearPatch({ id: "patch_a", name: "Lead" });
    baseline.nodes.unshift({
      id: "vcf1",
      typeId: "VCF",
      params: {
        type: "lowpass",
        cutoffHz: 600,
        resonance: 0.3,
        cutoffModAmountOct: 0
      }
    });
    baseline.ui.macros = [
      {
        id: "macro_cutoff",
        name: "Cutoff",
        keyframeCount: 2,
        bindings: [
          {
            id: "macro_cutoff:vcf1:cutoffHz",
            nodeId: "vcf1",
            paramId: "cutoffHz",
            map: "linear",
            min: 120,
            max: 4200
          }
        ]
      }
    ];
    const current = structuredClone(baseline);
    current.ui.macros[0].bindings = [
      {
        id: "some_new_bind_id",
        nodeId: "vcf1",
        paramId: "cutoffHz",
        map: "linear",
        min: 120,
        max: 4200
      }
    ];

    const diff = buildPatchDiff(current, baseline);

    expect(diff.hasChanges).toBe(false);
    expect(diff.currentBindingDiffByKey.size).toBe(0);
    expect(diff.removedBindingDiffs).toEqual([]);
    expect(diff.nodeDiffById.get("vcf1")?.status).toBe("unchanged");
  });

  it("treats remove and re-add of the same output port macro target as the same binding", () => {
    const baseline = createClearPatch({ id: "patch_a", name: "Lead" });
    baseline.ui.macros = [
      {
        id: "macro_output",
        name: "Output",
        keyframeCount: 2,
        bindings: [
          {
            id: "old_random_binding",
            nodeId: PATCH_OUTPUT_PORT_ID,
            paramId: "gainDb",
            map: "linear",
            min: -18,
            max: 0
          }
        ]
      }
    ];
    const current = structuredClone(baseline);
    current.ui.macros[0].bindings = [
      {
        id: "new_random_binding",
        nodeId: PATCH_OUTPUT_PORT_ID,
        paramId: "gainDb",
        map: "linear",
        min: -18,
        max: 0
      }
    ];

    const diff = buildPatchDiff(current, baseline);

    expect(diff.hasChanges).toBe(false);
    expect(diff.currentBindingDiffByKey.size).toBe(0);
    expect(diff.removedBindingDiffs).toEqual([]);
    expect(diff.nodeDiffById.get(PATCH_OUTPUT_PORT_ID)?.status).toBe("unchanged");
  });

  it("ignores raw parameter value changes for unchanged macro-bound parameters", () => {
    const baseline = createClearPatch({ id: "patch_a", name: "Lead" });
    baseline.nodes.unshift({
      id: "vcf1",
      typeId: "VCF",
      params: {
        type: "lowpass",
        cutoffHz: 600,
        resonance: 0.06,
        cutoffModAmountOct: 0
      }
    });
    baseline.ui.macros = [
      {
        id: "macro_decay",
        name: "Pop/Slap",
        keyframeCount: 3,
        bindings: [
          {
            id: "macro_decay:vcf1:resonance",
            nodeId: "vcf1",
            paramId: "resonance",
            map: "linear",
            points: [
              { x: 0, y: 0.06 },
              { x: 0.5, y: 0.16 },
              { x: 1, y: 0.28 }
            ]
          }
        ]
      }
    ];
    const current = structuredClone(baseline);
    current.nodes[0].params.resonance = 0.16;

    const diff = buildPatchDiff(current, baseline);

    expect(diff.hasChanges).toBe(false);
    expect(diff.nodeDiffById.get("vcf1")?.status).toBe("unchanged");
    expect(diff.nodeDiffById.get("vcf1")?.changedParamIds.has("resonance")).toBe(false);
  });

  it("marks both endpoint modules modified when connections are added or removed", () => {
    const baseline = createClearPatch({ id: "patch_a", name: "Lead" });
    baseline.nodes.unshift(
      { id: "osc1", typeId: "Oscillator", params: {} },
      { id: "filter1", typeId: "Filter", params: {} }
    );
    baseline.connections = [
      {
        id: "conn_osc_filter",
        from: { nodeId: "osc1", portId: "out" },
        to: { nodeId: "filter1", portId: "in" }
      }
    ];

    const current = structuredClone(baseline);
    current.connections = [
      {
        id: "conn_osc_out",
        from: { nodeId: "osc1", portId: "out" },
        to: { nodeId: PATCH_OUTPUT_PORT_ID, portId: "in" }
      }
    ];

    const diff = buildPatchDiff(current, baseline);

    expect(diff.nodeDiffById.get("osc1")?.hasConnectionChanges).toBe(true);
    expect(diff.nodeDiffById.get("filter1")?.hasConnectionChanges).toBe(true);
    expect(diff.nodeDiffById.get(PATCH_OUTPUT_PORT_ID)?.hasConnectionChanges).toBe(true);
    expect(diff.nodeDiffById.get("osc1")?.status).toBe("modified");
    expect(diff.nodeDiffById.get("filter1")?.status).toBe("modified");
    expect(diff.nodeDiffById.get(PATCH_OUTPUT_PORT_ID)?.status).toBe("modified");
    expect(diff.addedConnections.map((connection) => connection.id)).toEqual(["conn_osc_out"]);
    expect(diff.removedConnections.map((connection) => connection.id)).toEqual(["conn_osc_filter"]);
  });

  it("treats remove and re-add of the same output connection as unchanged", () => {
    const baseline = createClearPatch({ id: "patch_a", name: "Lead" });
    baseline.nodes.unshift({ id: "sat1", typeId: "Saturation", params: {} });
    baseline.connections = [
      {
        id: "old_sat_output_connection",
        from: { nodeId: "sat1", portId: "out" },
        to: { nodeId: PATCH_OUTPUT_PORT_ID, portId: "in" }
      }
    ];

    const current = structuredClone(baseline);
    current.connections = [
      {
        id: "new_sat_output_connection",
        from: { nodeId: "sat1", portId: "out" },
        to: { nodeId: PATCH_OUTPUT_PORT_ID, portId: "in" }
      }
    ];

    const diff = buildPatchDiff(current, baseline);

    expect(diff.hasChanges).toBe(false);
    expect(diff.currentConnectionStatusById.get("new_sat_output_connection")).toBe("unchanged");
    expect(diff.addedConnections).toEqual([]);
    expect(diff.removedConnections).toEqual([]);
    expect(diff.nodeDiffById.get("sat1")?.status).toBe("unchanged");
    expect(diff.nodeDiffById.get(PATCH_OUTPUT_PORT_ID)?.status).toBe("unchanged");
  });
});

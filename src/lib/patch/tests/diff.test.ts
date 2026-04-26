import { describe, expect, it } from "vitest";

import { buildPatchDiff } from "@/lib/patch/diff";
import { createClearPatch } from "@/lib/patch/presets";

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
      to: { nodeId: baseline.io.audioOutNodeId, portId: baseline.io.audioOutPortId }
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
        to: { nodeId: current.io.audioOutNodeId, portId: current.io.audioOutPortId }
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
    expect(diff.nodeDiffById.get("sample1")?.changedBindingKeys.has("macro_pitch:binding_pitch")).toBe(true);
    expect(diff.nodeDiffById.get("sample1")?.removedBindingKeys.has("macro_gain:binding_gain")).toBe(true);
    expect(diff.nodeDiffById.get("sample1")?.hasConnectionChanges).toBe(true);
    expect(diff.nodeDiffById.get("sample2")?.status).toBe("added");
    expect(diff.macroDiffById.get("macro_pitch")?.status).toBe("modified");
    expect(diff.macroDiffById.get("macro_texture")?.status).toBe("added");
    expect(diff.removedMacros.map((macro) => macro.id)).toEqual(["macro_gain"]);
    expect(diff.currentBindingDiffByKey.get("macro_pitch:binding_pitch")?.status).toBe("modified");
    expect(diff.removedBindingDiffs.map((bindingDiff) => bindingDiff.key)).toEqual(["macro_gain:binding_gain"]);
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
});

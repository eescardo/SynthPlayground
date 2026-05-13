import { describe, expect, it } from "vitest";

import { applyMacroValue, applyPatchOp } from "@/lib/patch/ops";
import { createDefaultParamsForType } from "@/lib/patch/moduleRegistry";
import { getMacroBindingKeyframeCount, resolveMacroBindingValue } from "@/lib/patch/macroKeyframes";
import { createClearPatch, guitarStringPatch } from "@/lib/patch/presets";
import { ensurePatchLayout } from "@/lib/patch/autoLayout";

describe("patch ops", () => {
  it("rejects adding nodes with ids reserved for patch boundary ports", () => {
    const patch = createClearPatch({ id: "reserved_ids", name: "Reserved IDs" });

    expect(() =>
      applyPatchOp(patch, {
        type: "addNode",
        nodeId: "pitch",
        typeId: "CVTranspose",
        layoutPos: { x: 0, y: 0 }
      })
    ).toThrow("Node id is reserved for a patch boundary port: pitch");
  });

  it("replaces a connection atomically", () => {
    const patch = createClearPatch({ id: "replace_connection", name: "Replace Connection" });
    patch.connections = [
      { id: "old", from: { nodeId: "env1", portId: "out" }, to: { nodeId: "vca1", portId: "gainCV" } }
    ];

    const nextPatch = applyPatchOp(patch, {
      type: "replaceConnection",
      disconnectConnectionId: "old",
      connectionId: "new",
      fromNodeId: "env2",
      fromPortId: "out",
      toNodeId: "vca1",
      toPortId: "gainCV"
    });

    expect(nextPatch.connections).toEqual([
      { id: "new", from: { nodeId: "env2", portId: "out" }, to: { nodeId: "vca1", portId: "gainCV" } }
    ]);
    expect(patch.connections).toEqual([
      { id: "old", from: { nodeId: "env1", portId: "out" }, to: { nodeId: "vca1", portId: "gainCV" } }
    ]);
  });

  it("renames a node across graph references and UI bindings", () => {
    const patch = ensurePatchLayout(guitarStringPatch());
    patch.ui.paramRanges = {
      "vcf1:cutoffHz": { min: 100, max: 5000 }
    };

    const nextPatch = applyPatchOp(patch, {
      type: "renameNode",
      nodeId: "vcf1",
      newNodeId: "soft_beater_halo"
    });

    expect(nextPatch.nodes.some((node) => node.id === "vcf1")).toBe(false);
    expect(nextPatch.nodes.some((node) => node.id === "soft_beater_halo")).toBe(true);
    expect(
      nextPatch.connections.some(
        (connection) => connection.from.nodeId === "soft_beater_halo" || connection.to.nodeId === "soft_beater_halo"
      )
    ).toBe(true);
    expect(nextPatch.layout.nodes.some((node) => node.nodeId === "soft_beater_halo")).toBe(true);
    expect(nextPatch.ui.paramRanges?.["soft_beater_halo:cutoffHz"]).toEqual({ min: 100, max: 5000 });
    expect(nextPatch.ui.paramRanges?.["vcf1:cutoffHz"]).toBeUndefined();
    expect(
      nextPatch.ui.macros.some((macro) =>
        macro.bindings.some(
          (binding) =>
            binding.nodeId === "soft_beater_halo" && binding.id === `${macro.id}:soft_beater_halo:${binding.paramId}`
        )
      )
    ).toBe(true);
  });

  it("applies macro slider moves to bound params without mutating defaults", () => {
    const patch = guitarStringPatch();
    const macro = patch.ui.macros[0];
    const binding = macro.bindings[0];
    expect(macro).toBeDefined();
    expect(binding).toBeDefined();

    const nextPatch = applyMacroValue(patch, macro.id, 0.75);

    const nextMacro = nextPatch.ui.macros.find((entry) => entry.id === macro.id);
    const boundNode = nextPatch.nodes.find((node) => node.id === binding.nodeId);
    expect(nextMacro?.defaultNormalized).toBe(macro.defaultNormalized);
    expect(boundNode?.params[binding.paramId]).toBeCloseTo(resolveMacroBindingValue(binding, 0.75));
  });

  it("skips stale macro bindings without writing removed params back onto modules", () => {
    const patch = guitarStringPatch();
    const macro = patch.ui.macros[0];
    const node = patch.nodes.find((entry) => entry.id === "karplus1");
    expect(node).toBeDefined();
    patch.ui.macros = [
      {
        ...macro,
        bindings: [
          {
            id: "binding_removed_param",
            nodeId: "karplus1",
            paramId: "oldParam",
            map: "linear",
            min: 0,
            max: 1
          }
        ]
      }
    ];

    const nextPatch = applyMacroValue(patch, macro.id, 1);
    const nextNode = nextPatch.nodes.find((entry) => entry.id === "karplus1");

    expect(nextNode?.params.oldParam).toBeUndefined();
  });

  it("updates all macro bindings when the macro keyframe count changes", () => {
    const patch = guitarStringPatch();
    const macro = patch.ui.macros.find((entry) => entry.keyframeCount === 3) ?? patch.ui.macros[0];
    expect(macro).toBeDefined();

    const nextPatch = applyPatchOp(patch, {
      type: "setMacroKeyframeCount",
      macroId: macro.id,
      keyframeCount: 2
    });

    const nextMacro = nextPatch.ui.macros.find((entry) => entry.id === macro.id);
    expect(nextMacro?.keyframeCount).toBe(2);
    expect(nextMacro?.bindings.every((binding) => getMacroBindingKeyframeCount(binding) === 2)).toBe(true);
  });

  it("updates the active macro binding keyframe value", () => {
    const patch = guitarStringPatch();
    const macro = patch.ui.macros.find((entry) => entry.keyframeCount === 3) ?? patch.ui.macros[0];
    const binding = macro.bindings[0];
    expect(binding).toBeDefined();

    const nextPatch = applyPatchOp(patch, {
      type: "setMacroBindingKeyframeValue",
      macroId: macro.id,
      nodeId: binding.nodeId,
      paramId: binding.paramId,
      normalized: 0.5,
      value: 432
    });

    const nextBinding = nextPatch.ui.macros
      .find((entry) => entry.id === macro.id)
      ?.bindings.find((entry) => entry.nodeId === binding.nodeId && entry.paramId === binding.paramId);
    expect(nextBinding?.points?.[1]?.y).toBe(432);
  });

  it("preserves keyframed points when binding a macro", () => {
    const patch = guitarStringPatch();
    const macro = patch.ui.macros.find((entry) => entry.keyframeCount === 3) ?? patch.ui.macros[0];

    const nextPatch = applyPatchOp(patch, {
      type: "bindMacro",
      macroId: macro.id,
      bindingId: "binding_keyframed_test",
      nodeId: "output",
      paramId: "gainDb",
      map: "piecewise",
      points: [
        { x: 0, y: 120 },
        { x: 0.5, y: 980 },
        { x: 1, y: 5000 }
      ]
    });

    const binding = nextPatch.ui.macros
      .find((entry) => entry.id === macro.id)
      ?.bindings.find((entry) => entry.id === `${macro.id}:output:gainDb`);
    expect(binding?.points).toHaveLength(3);
  });

  it("does not bind compressor internal auto gain to a macro", () => {
    const patch = createClearPatch({ id: "compressor_auto_gain_bind", name: "Compressor" });
    patch.nodes.push({
      id: "comp1",
      typeId: "Compressor",
      params: createDefaultParamsForType("Compressor")
    });
    patch.ui.macros.push({ id: "macro1", name: "Macro", keyframeCount: 2, bindings: [] });

    const nextPatch = applyPatchOp(patch, {
      type: "bindMacro",
      macroId: "macro1",
      bindingId: "macro1:comp1:makeupDb",
      nodeId: "comp1",
      paramId: "makeupDb",
      map: "linear",
      min: 0,
      max: 12
    });

    expect(nextPatch.ui.macros[0].bindings).toHaveLength(0);
  });

  it("ignores legacy compressor auto gain parameter edits", () => {
    const patch = createClearPatch({ id: "compressor_auto_gain_legacy", name: "Compressor" });
    patch.nodes.push({
      id: "comp1",
      typeId: "Compressor",
      params: createDefaultParamsForType("Compressor")
    });

    const nextPatch = applyPatchOp(patch, {
      type: "setParam",
      nodeId: "comp1",
      paramId: "makeupDb",
      value: 12
    });

    const node = nextPatch.nodes.find((entry) => entry.id === "comp1");
    expect(node?.params.makeupDb).toBeUndefined();
  });

  it("ignores legacy compressor makeup macro bindings", () => {
    const patch = createClearPatch({ id: "compressor_auto_gain_apply", name: "Compressor" });
    patch.nodes.push({
      id: "comp1",
      typeId: "Compressor",
      params: createDefaultParamsForType("Compressor")
    });
    patch.ui.macros.push({
      id: "macro1",
      name: "Macro",
      keyframeCount: 2,
      bindings: [
        {
          id: "macro1:comp1:makeupDb",
          nodeId: "comp1",
          paramId: "makeupDb",
          map: "linear",
          min: 0,
          max: 12
        }
      ]
    });

    const nextPatch = applyMacroValue(patch, "macro1", 0.5);
    const node = nextPatch.nodes.find((entry) => entry.id === "comp1");

    expect(node?.params.makeupDb).toBeUndefined();
  });

  it("updates the macro binding interpolation map without changing its range", () => {
    const patch = guitarStringPatch();
    patch.ui.macros = [
      {
        id: "macro_filter",
        name: "Filter",
        keyframeCount: 2,
        bindings: [
          {
            id: "macro_filter:vcf1:cutoffHz",
            nodeId: "vcf1",
            paramId: "cutoffHz",
            map: "linear",
            min: 120,
            max: 5000
          }
        ]
      }
    ];
    const macro = patch.ui.macros[0];
    const binding = macro.bindings[0];

    const nextPatch = applyPatchOp(patch, {
      type: "setMacroBindingMap",
      macroId: macro.id,
      bindingId: binding.id,
      map: "exp"
    });

    const nextBinding = nextPatch.ui.macros
      .find((entry) => entry.id === macro.id)
      ?.bindings.find((entry) => entry.id === binding.id);
    expect(nextBinding?.map).toBe("exp");
    expect(nextBinding?.min).toBe(binding.min);
    expect(nextBinding?.max).toBe(binding.max);
  });

  it("updates keyframed macro binding interpolation without removing keyframe points", () => {
    const patch = guitarStringPatch();
    const macro = patch.ui.macros.find((entry) => entry.keyframeCount === 3) ?? patch.ui.macros[0];
    const binding = macro.bindings.find((entry) => entry.points && entry.points.length === 3) ?? macro.bindings[0];

    const nextPatch = applyPatchOp(patch, {
      type: "setMacroBindingMap",
      macroId: macro.id,
      bindingId: binding.id,
      map: "exp"
    });

    const nextBinding = nextPatch.ui.macros
      .find((entry) => entry.id === macro.id)
      ?.bindings.find((entry) => entry.id === binding.id);
    expect(nextBinding?.map).toBe("exp");
    expect(nextBinding?.points).toEqual(binding.points);
    expect(getMacroBindingKeyframeCount(nextBinding!)).toBe(3);

    const roundTrippedPatch = applyPatchOp(nextPatch, {
      type: "setMacroBindingMap",
      macroId: macro.id,
      bindingId: binding.id,
      map: "linear"
    });
    const roundTrippedBinding = roundTrippedPatch.ui.macros
      .find((entry) => entry.id === macro.id)
      ?.bindings.find((entry) => entry.id === binding.id);
    expect(roundTrippedBinding?.map).toBe("linear");
    expect(roundTrippedBinding?.points).toEqual(binding.points);
  });

  it("resolves exponential interpolation between keyframed macro points", () => {
    const linearValue = resolveMacroBindingValue(
      {
        id: "binding_linear_points",
        nodeId: "vcf1",
        paramId: "cutoffHz",
        map: "linear",
        points: [
          { x: 0, y: 100 },
          { x: 0.5, y: 1000 },
          { x: 1, y: 10000 }
        ]
      },
      0.25
    );
    const expValue = resolveMacroBindingValue(
      {
        id: "binding_exp_points",
        nodeId: "vcf1",
        paramId: "cutoffHz",
        map: "exp",
        points: [
          { x: 0, y: 100 },
          { x: 0.5, y: 1000 },
          { x: 1, y: 10000 }
        ]
      },
      0.25
    );

    expect(linearValue).toBeCloseTo(550);
    expect(expValue).toBeCloseTo(Math.sqrt(100 * 1000));
  });

  it("treats legacy piecewise and linear keyframed bindings identically", () => {
    const points = [
      { x: 0, y: 100 },
      { x: 0.5, y: 1000 },
      { x: 1, y: 10000 }
    ];
    const legacyPiecewiseValue = resolveMacroBindingValue(
      {
        id: "binding_piecewise_points",
        nodeId: "vcf1",
        paramId: "cutoffHz",
        map: "piecewise",
        points
      },
      0.25
    );
    const linearValue = resolveMacroBindingValue(
      {
        id: "binding_linear_points",
        nodeId: "vcf1",
        paramId: "cutoffHz",
        map: "linear",
        points
      },
      0.25
    );

    expect(linearValue).toBeCloseTo(legacyPiecewiseValue);
    expect(linearValue).toBeCloseTo(550);
  });

  it("updates two-point linear keyframed bindings by editing their points", () => {
    const patch = guitarStringPatch();
    const macro = patch.ui.macros[0];
    patch.ui.macros = [
      {
        ...macro,
        keyframeCount: 2,
        bindings: [
          {
            id: "binding_linear_two_point",
            nodeId: "vcf1",
            paramId: "cutoffHz",
            map: "linear",
            points: [
              { x: 0, y: 120 },
              { x: 1, y: 5000 }
            ]
          }
        ]
      }
    ];

    const nextPatch = applyPatchOp(patch, {
      type: "setMacroBindingKeyframeValue",
      macroId: macro.id,
      nodeId: "vcf1",
      paramId: "cutoffHz",
      normalized: 1,
      value: 7000
    });

    const binding = nextPatch.ui.macros[0].bindings[0];
    expect(binding.points).toEqual([
      { x: 0, y: 120 },
      { x: 1, y: 7000 }
    ]);
    expect(binding.max).toBeUndefined();
  });

  it("sets a parameter slider range without changing in-range macro binding values", () => {
    const patch = guitarStringPatch();
    const macro = patch.ui.macros.find((entry) => entry.keyframeCount === 3) ?? patch.ui.macros[0];
    patch.ui.macros = [
      {
        ...macro,
        bindings: [
          {
            id: "binding_slider_focus",
            nodeId: "vcf1",
            paramId: "cutoffHz",
            map: "piecewise",
            points: [
              { x: 0, y: 120 },
              { x: 0.5, y: 980 },
              { x: 1, y: 5000 }
            ]
          }
        ]
      }
    ];

    const nextPatch = applyPatchOp(patch, {
      type: "setParamSliderRange",
      nodeId: "vcf1",
      paramId: "cutoffHz",
      min: 80,
      max: 6000
    });

    const binding = nextPatch.ui.macros[0].bindings[0];
    expect(nextPatch.ui.paramRanges?.["vcf1:cutoffHz"]).toEqual({ min: 80, max: 6000 });
    expect(binding.points?.map((point) => point.y)).toEqual([120, 980, 5000]);
  });

  it("clamps parameter and macro binding values when tightening a slider range", () => {
    const patch = guitarStringPatch();
    const macro = patch.ui.macros.find((entry) => entry.keyframeCount === 3) ?? patch.ui.macros[0];
    const node = patch.nodes.find((entry) => entry.id === "vcf1");
    if (node) {
      node.params.cutoffHz = 12000;
    }
    patch.ui.macros = [
      {
        ...macro,
        bindings: [
          {
            id: "binding_slider_focus_clamp",
            nodeId: "vcf1",
            paramId: "cutoffHz",
            map: "piecewise",
            points: [
              { x: 0, y: 40 },
              { x: 0.5, y: 980 },
              { x: 1, y: 12000 }
            ]
          }
        ]
      }
    ];

    const nextPatch = applyPatchOp(patch, {
      type: "setParamSliderRange",
      nodeId: "vcf1",
      paramId: "cutoffHz",
      min: 120,
      max: 5000
    });

    const nextNode = nextPatch.nodes.find((entry) => entry.id === "vcf1");
    const binding = nextPatch.ui.macros[0].bindings[0];
    expect(nextNode?.params.cutoffHz).toBe(5000);
    expect(binding.points?.map((point) => point.y)).toEqual([120, 980, 5000]);
  });
});

import { describe, expect, it } from "vitest";

import { applyMacroValue, applyPatchOp } from "@/lib/patch/ops";
import { getMacroBindingKeyframeCount, resolveMacroBindingValue } from "@/lib/patch/macroKeyframes";
import { pluckPatch } from "@/lib/patch/presets";

describe("patch ops", () => {
  it("applies macro slider moves to bound params without mutating defaults", () => {
    const patch = pluckPatch();
    const macro = patch.ui.macros[0];
    const binding = macro.bindings[0];
    expect(macro).toBeDefined();
    expect(binding).toBeDefined();

    const nextPatch = applyMacroValue(patch, macro.id, 0.75);

    const nextMacro = nextPatch.ui.macros.find((entry) => entry.id === macro.id);
    const boundNode = nextPatch.nodes.find((node) => node.id === binding.nodeId);
    expect(nextMacro?.defaultNormalized).toBeCloseTo(macro.defaultNormalized ?? 0.5);
    expect(boundNode?.params[binding.paramId]).toBeCloseTo(resolveMacroBindingValue(binding, 0.75));
  });

  it("updates all macro bindings when the macro keyframe count changes", () => {
    const patch = pluckPatch();
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
    const patch = pluckPatch();
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
    const patch = pluckPatch();
    const macro = patch.ui.macros.find((entry) => entry.keyframeCount === 3) ?? patch.ui.macros[0];

    const nextPatch = applyPatchOp(patch, {
      type: "bindMacro",
      macroId: macro.id,
      bindingId: "binding_keyframed_test",
      nodeId: "vcf1",
      paramId: "cutoffHz",
      map: "piecewise",
      points: [
        { x: 0, y: 120 },
        { x: 0.5, y: 980 },
        { x: 1, y: 5000 }
      ]
    });

    const binding = nextPatch.ui.macros.find((entry) => entry.id === macro.id)?.bindings.find((entry) => entry.id === "binding_keyframed_test");
    expect(binding?.points).toHaveLength(3);
  });

  it("updates the macro binding interpolation map without changing its range", () => {
    const patch = pluckPatch();
    const macro = patch.ui.macros.find((entry) => entry.bindings.some((binding) => binding.map === "linear")) ?? patch.ui.macros[0];
    const binding = macro.bindings.find((entry) => entry.map === "linear") ?? macro.bindings[0];

    const nextPatch = applyPatchOp(patch, {
      type: "setMacroBindingMap",
      macroId: macro.id,
      bindingId: binding.id,
      map: "exp"
    });

    const nextBinding = nextPatch.ui.macros.find((entry) => entry.id === macro.id)?.bindings.find((entry) => entry.id === binding.id);
    expect(nextBinding?.map).toBe("exp");
    expect(nextBinding?.min).toBe(binding.min);
    expect(nextBinding?.max).toBe(binding.max);
  });

  it("updates keyframed macro binding interpolation without removing keyframe points", () => {
    const patch = pluckPatch();
    const macro = patch.ui.macros.find((entry) => entry.keyframeCount === 3) ?? patch.ui.macros[0];
    const binding = macro.bindings.find((entry) => entry.points && entry.points.length === 3) ?? macro.bindings[0];

    const nextPatch = applyPatchOp(patch, {
      type: "setMacroBindingMap",
      macroId: macro.id,
      bindingId: binding.id,
      map: "exp"
    });

    const nextBinding = nextPatch.ui.macros.find((entry) => entry.id === macro.id)?.bindings.find((entry) => entry.id === binding.id);
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
    const patch = pluckPatch();
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
    const patch = pluckPatch();
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
    const patch = pluckPatch();
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

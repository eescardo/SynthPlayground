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
      nodeId: "vco1",
      paramId: "detune",
      map: "piecewise",
      points: [
        { x: 0, y: -12 },
        { x: 0.5, y: 0 },
        { x: 1, y: 12 }
      ]
    });

    const binding = nextPatch.ui.macros.find((entry) => entry.id === macro.id)?.bindings.find((entry) => entry.id === "binding_keyframed_test");
    expect(binding?.points).toHaveLength(3);
  });
});

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
});
